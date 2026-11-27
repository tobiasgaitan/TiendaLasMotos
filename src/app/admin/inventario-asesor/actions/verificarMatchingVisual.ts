'use server';

import { z } from 'zod';
import { getAdminAuth, getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import { validarActor } from '@/lib/actions/inventario-actor';
import {
    FIREBASE_STORAGE_HOST,
    esStoragePathDeAsesor,
    extraerStoragePath,
} from '@/lib/actions/inventario-schemas';
import {
    MATCHING_VISUAL_MAX_CANDIDATOS,
    analizarMatchingVisual,
    seleccionarMejorMatching,
} from '@/lib/inventario/matching-visual';
import { VISION_MULTIMODAL_MODELO_REGEX } from '@/lib/vision-client';
import type {
    MatchingVisualPar,
    MatchingVisualResult,
} from '@/types/inventario';

const candidatoSchema = z
    .object({
        documento_id: z.string().trim().min(1).max(200),
        referencia: z.string().trim().max(64).default(''),
    })
    .strict();

const verificarMatchingSchema = z
    .object({
        foto_url: z.string().trim().max(2048).url(),
        candidatos: z
            .array(candidatoSchema)
            .min(1)
            .max(MATCHING_VISUAL_MAX_CANDIDATOS),
    })
    .strict();

interface EntradaCandidato {
    documento_id: string;
    referencia: string;
    urlB: string | null;
    referenciaStoragePath: string | null;
}

function texto(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function arregloTexto(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
}

function validarUrlImagen(
    value: string,
    prefijoAsesorEmail: string | null
): { ok: boolean; storagePath: string | null } {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return { ok: false, storagePath: null };
        if (url.host !== FIREBASE_STORAGE_HOST) {
            return { ok: false, storagePath: null };
        }
        if (url.username || url.password) {
            return { ok: false, storagePath: null };
        }
        const storagePath = extraerStoragePath(value);
        if (!storagePath) return { ok: false, storagePath: null };
        if (!storagePath.startsWith('inventario_repuestos/')) {
            return { ok: false, storagePath: null };
        }
        if (
            storagePath
                .split('/')
                .some((segmento) => segmento === '.' || segmento === '..')
        ) {
            return { ok: false, storagePath: null };
        }
        if (
            prefijoAsesorEmail !== null &&
            !esStoragePathDeAsesor(storagePath, prefijoAsesorEmail)
        ) {
            return { ok: false, storagePath: null };
        }
        return { ok: true, storagePath };
    } catch {
        return { ok: false, storagePath: null };
    }
}

function fallo(
    message: string,
    modelo: string | null = null
): MatchingVisualResult {
    return {
        success: false,
        disponible: false,
        modelo,
        mejor: null,
        pares: [],
        message,
        latencia_ms: 0,
    };
}

/**
 * WEB-INV-050 — Matching visual on-demand foto-vs-referencia.
 *
 * Faraday Cage:
 * - valida actor e input antes de Firebase;
 * - verifica ID token, permiso de fotos y rol asesor;
 * - exige foto A dentro del prefijo del asesor;
 * - solo lee candidatos y sus `imagenes_referencia`;
 * - nunca escribe en documentos transaccionales;
 * - la auditoría es best-effort y no puede romper la sugerencia.
 */
export async function verificarMatchingVisual(
    input: unknown,
    actor: unknown
): Promise<MatchingVisualResult> {
    const a = validarActor(actor);
    if (!a) {
        console.error('[matching-visual] actor inválido');
        return fallo('No autorizado. Sesión inválida.');
    }

    const parsed = verificarMatchingSchema.safeParse(input);
    if (!parsed.success) {
        console.error('[matching-visual] input inválido');
        return fallo('La solicitud de matching visual es inválida.');
    }

    const modelo = texto(process.env.VISION_MODEL_SLUG);
    const apiKey = texto(process.env.OPENROUTER_API_KEY);

    try {
        const decoded = await getAdminAuth().verifyIdToken(a.idToken);
        if (!decoded.uid) {
            return fallo('No autorizado. Sesión inválida.');
        }
        const email = texto(decoded.email).toLowerCase();
        if (!email) {
            return fallo('No autorizado. Sesión inválida.');
        }
        const me = { uid: decoded.uid, email };

        const permiso = await requirePermiso(
            me,
            'fotos_inventario',
            'create',
            { asesor_email: me.email }
        );
        if (permiso.rol !== 'asesor') {
            return fallo('Solo un asesor puede verificar coincidencias visuales.');
        }

        const foto = validarUrlImagen(parsed.data.foto_url, me.email);
        if (!foto.ok || !foto.storagePath) {
            return fallo('La foto no pertenece a tu carpeta de asesor.');
        }

        if (!apiKey) {
            return fallo('La visión multimodal no está configurada.');
        }
        if (!modelo || !VISION_MULTIMODAL_MODELO_REGEX.test(modelo)) {
            return fallo('El modelo de matching visual no está configurado.');
        }

        const adminDb = getDb();
        const entradas: EntradaCandidato[] = await Promise.all(
            parsed.data.candidatos.map(async (candidato) => {
                try {
                    const snap = await adminDb
                        .collection('inventario_repuestos')
                        .doc(candidato.documento_id)
                        .get();
                    if (!snap.exists) {
                        return {
                            documento_id: candidato.documento_id,
                            referencia: candidato.referencia,
                            urlB: null,
                            referenciaStoragePath: null,
                        };
                    }
                    const data = snap.data() as Record<string, unknown> | undefined;
                    const referencia =
                        texto(data ? data.referencia : '') ||
                        candidato.referencia;
                    const referencias = arregloTexto(
                        data ? data.imagenes_referencia : []
                    );
                    for (const url of referencias) {
                        const validada = validarUrlImagen(url, null);
                        if (validada.ok && validada.storagePath) {
                            return {
                                documento_id: candidato.documento_id,
                                referencia,
                                urlB: url,
                                referenciaStoragePath:
                                    validada.storagePath,
                            };
                        }
                    }
                    return {
                        documento_id: candidato.documento_id,
                        referencia,
                        urlB: null,
                        referenciaStoragePath: null,
                    };
                } catch (errorLectura) {
                    console.error(
                        '[matching-visual] lectura de candidato falló:',
                        errorLectura instanceof Error
                            ? errorLectura.message
                            : 'error desconocido'
                    );
                    return {
                        documento_id: candidato.documento_id,
                        referencia: candidato.referencia,
                        urlB: null,
                        referenciaStoragePath: null,
                    };
                }
            })
        );

        const pares: MatchingVisualPar[] = await Promise.all(
            entradas.map(async (entrada): Promise<MatchingVisualPar> => {
                if (!entrada.urlB) {
                    return {
                        documento_id: entrada.documento_id,
                        referencia: entrada.referencia,
                        estado: 'sin_referencia',
                        coincide: false,
                        confianza: 0,
                        justificacion: '',
                        latencia_ms: 0,
                    };
                }

                const resultado = await analizarMatchingVisual({
                    apiKey,
                    modelo,
                    urlA: parsed.data.foto_url,
                    urlB: entrada.urlB,
                });

                return {
                    documento_id: entrada.documento_id,
                    referencia: entrada.referencia,
                    estado: resultado.estado,
                    coincide: resultado.coincide,
                    confianza: resultado.confianza,
                    justificacion: resultado.justificacion,
                    latencia_ms: resultado.latencia_ms,
                };
            })
        );

        const disponible = pares.some(
            (par) => par.estado === 'coincide' || par.estado === 'no_coincide'
        );
        const mejor = seleccionarMejorMatching(pares);

        const auditorias = pares.map((par) => {
            const entrada = entradas.find(
                (item) => item.documento_id === par.documento_id
            );
            return adminDb.collection('auditoria_matching_visual').add({
                creado_en: new Date(),
                asesor_uid: me.uid,
                asesor_email: me.email,
                foto_storage_path: foto.storagePath,
                documento_id: par.documento_id,
                referencia: par.referencia,
                referencia_storage_path: entrada
                    ? entrada.referenciaStoragePath
                    : null,
                modelo,
                estado: par.estado,
                coincide: par.coincide,
                confianza: par.confianza,
                justificacion: par.justificacion,
                latencia_ms: par.latencia_ms,
                origen: 'on_demand',
                version: 1,
            });
        });

        try {
            const resultadosAuditoria = await Promise.allSettled(auditorias);
            const fallidas = resultadosAuditoria.filter(
                (resultado) => resultado.status === 'rejected'
            ).length;
            if (fallidas > 0) {
                console.error(
                    '[matching-visual] auditoría parcial:',
                    fallidas
                );
            }
        } catch (errorAuditoria) {
            console.error(
                '[matching-visual] auditoría best-effort falló:',
                errorAuditoria instanceof Error
                    ? errorAuditoria.message
                    : 'error desconocido'
            );
        }

        return {
            success: true,
            disponible,
            modelo,
            mejor,
            pares,
            latencia_ms: Math.max(
                0,
                Math.round(
                    pares.reduce(
                        (mayor, par) => Math.max(mayor, par.latencia_ms),
                        0
                    )
                )
            ),
            ...(disponible
                ? {}
                : {
                      message:
                          'Ninguna ficha candidata tiene una imagen de referencia evaluable.',
                  }),
        };
    } catch (error) {
        console.error(
            '[matching-visual] verificarMatchingVisual falló:',
            error instanceof Error ? error.message : 'error desconocido'
        );
        return fallo('No se pudo verificar la coincidencia visual.');
    }
}
