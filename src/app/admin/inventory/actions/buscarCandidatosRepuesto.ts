'use server';

import { z } from 'zod';
import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import {
    rankearCandidatos,
    type CandidatoFuente,
} from '@/lib/inventario/matching';
import type { BuscarCandidatosResult } from '@/types/inventario';

const buscarCandidatosSchema = z.object({
    etiquetas: z
        .array(z.string().trim().max(80))
        .max(10)
        .default([]),
    consulta: z.string().trim().max(64).default(''),
    limite: z.coerce.number().int().min(1).max(100).default(20),
});

const LIMITE_VENTANA_ETIQUETAS = 200;

interface SnapDoc {
    id: string;
    data: () => Record<string, unknown>;
}

function texto(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function arregloTexto(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
}

function numero(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function agregarDocs(
    destino: Record<string, SnapDoc>,
    snap: { docs: SnapDoc[] }
): void {
    for (const doc of snap.docs) {
        if (!destino[doc.id]) destino[doc.id] = doc;
    }
}

/**
 * WEB-043 — Busca candidatos existentes en inventario_repuestos.
 *
 * Faraday Cage: la acción solo responde tras verifyIdToken + requirePermiso.
 * La búsqueda es acotada y server-side:
 * - consulta: igualdad y prefijo en `referencia`; igualdad exacta en
 *   `referencias_alternativas`.
 * - sin consulta: ventana acotada por referencia (o por límite si es catálogo).
 * Cero scans ilimitados: todas las lecturas de documentos llevan limit().
 * El rankeo final se hace sobre el conjunto acotado.
 */
export async function buscarCandidatosRepuesto(
    input: unknown,
    actor: unknown
): Promise<BuscarCandidatosResult> {
    const a = validarActor(actor);
    if (!a) {
        return {
            success: false,
            message: 'No autorizado. Sesión inválida.',
            candidatos: [],
        };
    }

    const parsed = buscarCandidatosSchema.safeParse(input ?? {});
    if (!parsed.success) {
        return {
            success: false,
            message: 'Búsqueda de candidatos inválida.',
            candidatos: [],
        };
    }

    try {
        const me = await requireActorInventario(a.idToken);
        await requirePermiso(me, 'inventario_repuestos', 'read');

        const adminDb = getDb();
        const coleccion = adminDb.collection('inventario_repuestos');
        const consulta = parsed.data.consulta.trim().toUpperCase();
        const limite = parsed.data.limite;
        const docsUnicos: SnapDoc[] = [];
        let total = 0;

        if (consulta) {
            const [exacta, prefijo, alternativa] = await Promise.all([
                coleccion
                    .where('referencia', '==', consulta)
                    .limit(limite)
                    .get(),
                coleccion
                    .where('referencia', '>=', consulta)
                    .where('referencia', '<=', `${consulta}\uf8ff`)
                    .limit(limite)
                    .get(),
                coleccion
                    .where(
                        'referencias_alternativas',
                        'array-contains',
                        consulta
                    )
                    .limit(limite)
                    .get(),
            ]);

            const mapa: Record<string, SnapDoc> = {};
            agregarDocs(mapa, exacta);
            agregarDocs(mapa, prefijo);
            agregarDocs(mapa, alternativa);
            docsUnicos.push(...Object.values(mapa));
            total = docsUnicos.length;
        } else {
            const ventana =
                parsed.data.etiquetas.length > 0
                    ? LIMITE_VENTANA_ETIQUETAS
                    : limite;
            const snap = await coleccion
                .orderBy('referencia')
                .limit(ventana)
                .get();
            docsUnicos.push(...snap.docs);

            if (parsed.data.etiquetas.length === 0) {
                const countSnap = await coleccion.count().get();
                total = countSnap.data().count;
            } else {
                total = docsUnicos.length;
            }
        }

        const fuentes: CandidatoFuente[] = [];

        for (const doc of docsUnicos) {
            const data = doc.data() as Record<string, unknown>;
            const referencia = texto(data.referencia).trim();

            if (!referencia) {
                console.error(
                    '[inventario-matching] referencia ausente en inventario_repuestos:',
                    { docId: doc.id }
                );
                continue;
            }

            fuentes.push({
                documento_id: doc.id,
                referencia,
                referencias_alternativas: arregloTexto(
                    data.referencias_alternativas
                ),
                descripcion: texto(data.descripcion),
                fabricante: texto(data.fabricante),
                categoria: texto(data.categoria),
                aplica_a: arregloTexto(data.aplica_a),
                stock: numero(data.stock),
            });
        }

        const rankeados = rankearCandidatos(fuentes, {
            etiquetas: parsed.data.etiquetas,
            consulta: parsed.data.consulta,
        });

        return {
            success: true,
            candidatos: rankeados.slice(0, limite),
            total,
        };
    } catch (error) {
        console.error(
            '[inventario-matching] buscarCandidatosRepuesto falló:',
            {
                uid: a.uid,
                error,
            }
        );
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al buscar candidatos: ${msg}`,
            candidatos: [],
        };
    }
}
