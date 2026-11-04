'use server';

import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import {
    analizarImagenSchema,
    esStoragePathDeAsesor,
    extraerStoragePath,
} from '@/lib/actions/inventario-schemas';
import {
    esMimeVisionPermitido,
    esTamanoImagenPermitido,
    normalizarMimeVision,
    sanitizarEtiquetasVision,
    VISION_MAX_ETIQUETAS,
} from '@/lib/actions/vision-mapping';
import type { VisionResult } from '@/types/inventario';

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';
const VISION_TIMEOUT_MS = 8000;

function fallo(message = 'No se pudo analizar la imagen.'): VisionResult {
    return { success: false, message };
}

async function leerTextoError(
    response: Response,
    contexto: string
): Promise<string> {
    try {
        const texto = await response.text();
        return texto.slice(0, 2000);
    } catch (error) {
        console.error(`[vision] ${contexto}: no se pudo leer el body`, error);
        return '';
    }
}

function validarPrefijoAdmin(storagePath: string): boolean {
    const partes = storagePath.split('/');
    if (partes.length !== 3) return false;
    if (partes[0] !== 'inventario_repuestos') return false;

    const email = partes[1];
    const archivo = partes[2];
    if (!email || !archivo) return false;

    return /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email);
}

function extraerLabelsVision(payload: unknown): {
    ok: boolean;
    labels: unknown;
} {
    if (!payload || typeof payload !== 'object') {
        console.error('[vision] respuesta JSON sin objeto');
        return { ok: false, labels: [] };
    }

    const responses = (payload as { responses?: unknown }).responses;
    if (!Array.isArray(responses)) {
        console.error('[vision] respuesta JSON sin responses');
        return { ok: false, labels: [] };
    }

    if (responses.length === 0) {
        return { ok: true, labels: [] };
    }

    const first = responses[0];
    if (!first || typeof first !== 'object') {
        console.error('[vision] responses[0] inválido');
        return { ok: false, labels: [] };
    }

    const error = (first as { error?: unknown }).error;
    if (error) {
        console.error('[vision] Vision API devolvió error:', error);
        return { ok: false, labels: [] };
    }

    const labels = (first as { labelAnnotations?: unknown }).labelAnnotations;
    return { ok: true, labels: labels === undefined ? [] : labels };
}

/**
 * WEB-038 — Análisis stateless de una foto de repuesto con Google Vision.
 *
 * - Solo retorna sugerencias; NUNCA escribe en Firestore.
 * - Valida host y prefijo de Firebase Storage antes de descargar.
 * - Filtra score >= 0.60, deduplica y limita a 10 etiquetas.
 */
export async function analizarImagenRepuesto(
    input: unknown,
    actor: unknown
): Promise<VisionResult> {
    const a = validarActor(actor);
    if (!a) {
        console.error('[vision] actor inválido');
        return fallo('No autorizado. Sesión inválida.');
    }

    const parsed = analizarImagenSchema.safeParse(input);
    if (!parsed.success) {
        console.error('[vision] input inválido: foto_url ausente o ajena');
        return fallo('La foto no es una URL válida de Firebase Storage.');
    }

    try {
        const me = await requireActorInventario(a.idToken);

        const permiso = await requirePermiso(
            me,
            'fotos_inventario',
            'create',
            { asesor_email: me.email }
        );

        const esAsesor = permiso.rol === 'asesor';
        const esAdmin =
            permiso.rol === 'admin' || permiso.rol === 'superadmin';

        if (!esAsesor && !esAdmin) {
            console.error('[vision] rol no autorizado:', permiso.rol);
            return fallo('No autorizado.');
        }

        const data = parsed.data;
        let url: URL;
        try {
            url = new URL(data.foto_url);
        } catch (error) {
            console.error('[vision] URL de foto inválida:', error);
            return fallo('La foto no es una URL válida de Firebase Storage.');
        }

        if (url.protocol !== 'https:') {
            console.error('[vision] URL de foto sin HTTPS:', {
                host: url.host,
            });
            return fallo('La foto debe usar HTTPS.');
        }

        const storagePath = extraerStoragePath(data.foto_url);
        if (!storagePath) {
            console.error('[vision] URL de foto fuera de Firebase Storage:', {
                host: url.host,
            });
            return fallo('La foto no es una URL válida de Firebase Storage.');
        }

        if (esAsesor && !esStoragePathDeAsesor(storagePath, me.email)) {
            console.error('[vision] foto fuera del prefijo del asesor:', {
                uid: me.uid,
            });
            return fallo('La foto no pertenece a tu carpeta de asesor.');
        }

        if (esAdmin && !validarPrefijoAdmin(storagePath)) {
            console.error('[vision] foto fuera del prefijo de inventario:', {
                uid: me.uid,
            });
            return fallo('La foto no pertenece a una carpeta de asesor.');
        }

        const apiKey = process.env.GOOGLE_VISION_API_KEY;
        if (!apiKey || !apiKey.trim()) {
            console.error('[vision] GOOGLE_VISION_API_KEY no configurada');
            return fallo();
        }

        const fotoResponse = await fetch(data.foto_url, {
            method: 'GET',
            headers: {
                Accept: 'image/jpeg,image/png,image/webp',
            },
            redirect: 'error',
            cache: 'no-store',
            signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
        });

        if (!fotoResponse.ok) {
            const texto = await leerTextoError(
                fotoResponse,
                'fetch de foto'
            );
            console.error(
                '[vision] fetch de foto HTTP',
                fotoResponse.status,
                texto
            );
            return fallo();
        }

        const mime = normalizarMimeVision(
            fotoResponse.headers.get('content-type')
        );
        if (!esMimeVisionPermitido(mime)) {
            console.error('[vision] MIME de foto no permitido:', mime);
            return fallo('La imagen debe ser JPG, PNG o WEBP.');
        }

        const contentLengthRaw = fotoResponse.headers.get('content-length');
        if (contentLengthRaw !== null) {
            const contentLength = Number(contentLengthRaw);
            if (!esTamanoImagenPermitido(contentLength)) {
                console.error('[vision] tamaño de foto inválido (header):', {
                    contentLengthRaw,
                });
                return fallo('La imagen supera el tamaño máximo permitido.');
            }
        }

        const buffer = Buffer.from(await fotoResponse.arrayBuffer());
        if (!esTamanoImagenPermitido(buffer.byteLength)) {
            console.error('[vision] tamaño de foto inválido (buffer):', {
                bytes: buffer.byteLength,
            });
            return fallo('La imagen supera el tamaño máximo permitido.');
        }

        const visionResponse = await fetch(VISION_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey.trim(),
            },
            body: JSON.stringify({
                requests: [
                    {
                        image: {
                            content: buffer.toString('base64'),
                        },
                        features: [
                            {
                                type: 'LABEL_DETECTION',
                                maxResults: VISION_MAX_ETIQUETAS,
                            },
                        ],
                    },
                ],
            }),
            redirect: 'error',
            cache: 'no-store',
            signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
        });

        if (!visionResponse.ok) {
            const texto = await leerTextoError(
                visionResponse,
                'Vision HTTP'
            );
            console.error(
                '[vision] HTTP',
                visionResponse.status,
                texto
            );
            return fallo();
        }

        let payload: unknown;
        try {
            payload = await visionResponse.json();
        } catch (error) {
            console.error('[vision] JSON de Vision inválido:', error);
            return fallo();
        }

        const extraido = extraerLabelsVision(payload);
        if (!extraido.ok) {
            return fallo();
        }

        const sugerencias = sanitizarEtiquetasVision(extraido.labels);

        return {
            success: true,
            etiquetas: sugerencias.map((sugerencia) => sugerencia.etiqueta),
            sugerencias,
        };
    } catch (error) {
        console.error('[vision] analizarImagenRepuesto falló:', error);
        return fallo();
    }
}
