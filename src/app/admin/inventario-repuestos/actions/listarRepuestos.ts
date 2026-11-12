'use server';

import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import { listarRepuestosSchema } from '@/lib/actions/inventario-repuestos-schemas';
import type {
    ListarRepuestosResult,
    RepuestoInventarioDTO,
} from '@/types/inventario-repuestos';

function texto(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function numero(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function arregloTexto(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
}

function aISO(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();

    if (typeof value === 'object' && value !== null) {
        const candidato = value as { toDate?: unknown };
        if (typeof candidato.toDate === 'function') {
            try {
                const date = (candidato.toDate as () => Date).call(candidato);
                return date.toISOString();
            } catch (error) {
                console.error(
                    '[inventario-repuestos] aISO falló:',
                    error
                );
                return null;
            }
        }
    }

    return null;
}

/**
 * Lista todos los documentos de inventario_repuestos para la ruta
 * administrativa. No usa limit/orderBy: no requiere índices nuevos y los
 * filtros/orden se resuelven en el cliente.
 */
export async function listarRepuestos(
    input: unknown,
    actor: unknown
): Promise<ListarRepuestosResult> {
    const a = validarActor(actor);
    if (!a) {
        return {
            success: false,
            message: 'No autorizado. Sesión inválida.',
            repuestos: [],
        };
    }

    const parsed = listarRepuestosSchema.safeParse(input ?? {});
    if (!parsed.success) {
        return {
            success: false,
            message: 'Filtro de repuestos inválido.',
            repuestos: [],
        };
    }

    try {
        const me = await requireActorInventario(a.idToken);
        const permiso = await requirePermiso(
            me,
            'inventario_repuestos',
            'read'
        );
        if (permiso.rol !== 'admin' && permiso.rol !== 'superadmin') {
            return {
                success: false,
                message: 'Solo un administrador puede ver el inventario de repuestos.',
                repuestos: [],
            };
        }

        const adminDb = getDb();
        const snap = await adminDb.collection('inventario_repuestos').get();
        const repuestos: RepuestoInventarioDTO[] = [];

        for (const doc of snap.docs) {
            const data = doc.data() as Record<string, unknown>;
            const referenciaDocumento =
                texto(data.referencia).trim() || doc.id;

            const creadoEn = aISO(data.creado_en);
            if (!creadoEn) {
                console.error(
                    '[inventario-repuestos] creado_en inválido:',
                    { docId: doc.id }
                );
            }

            repuestos.push({
                documento_id: doc.id,
                referencia: referenciaDocumento,
                sede_id: texto(data.sede_id),
                descripcion: texto(data.descripcion),
                fabricante: texto(data.fabricante),
                aplica_a: arregloTexto(data.aplica_a),
                categoria: texto(data.categoria),
                precio: numero(data.precio),
                ubicacion: texto(data.ubicacion),
                stock: numero(data.stock),
                stock_minimo: numero(data.stock_minimo),
                imagen_url: texto(data.imagen_url),
                creado_por: texto(data.creado_por),
                creado_en: creadoEn,
                actualizado_por: texto(data.actualizado_por),
                actualizado_en: aISO(data.actualizado_en),
            });
        }

        repuestos.sort((a, b) => {
            const porReferencia = a.referencia.localeCompare(
                b.referencia,
                'es'
            );
            return porReferencia !== 0
                ? porReferencia
                : a.documento_id.localeCompare(b.documento_id, 'es');
        });

        return { success: true, repuestos };
    } catch (error) {
        console.error('[inventario-repuestos] listarRepuestos falló:', error);
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al listar los repuestos: ${msg}`,
            repuestos: [],
        };
    }
}
