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

/**
 * WEB-043 — Busca candidatos existentes en inventario_repuestos.
 *
 * Faraday Cage: la acción solo responde tras verifyIdToken + requirePermiso.
 * La referencia de cada candidato es SIEMPRE el docId. `data.referencia` no
 * se usa como identidad; si difiere, se registra la inconsistencia.
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
        const snap = await adminDb.collection('inventario_repuestos').get();

        const fuentes: CandidatoFuente[] = [];

        for (const doc of snap.docs) {
            const data = doc.data() as Record<string, unknown>;
            const referencia = doc.id;
            const referenciaDocumento = texto(data.referencia).trim();

            if (!referencia) {
                console.error(
                    '[inventario-matching] docId inválido en inventario_repuestos:',
                    { docId: doc.id }
                );
                continue;
            }

            if (referenciaDocumento && referenciaDocumento !== referencia) {
                console.error(
                    '[inventario-matching] referencia no coincide con docId:',
                    {
                        docId: referencia,
                        referencia: referenciaDocumento,
                    }
                );
            }

            fuentes.push({
                referencia,
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
            candidatos: rankeados.slice(0, parsed.data.limite),
            total: rankeados.length,
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
