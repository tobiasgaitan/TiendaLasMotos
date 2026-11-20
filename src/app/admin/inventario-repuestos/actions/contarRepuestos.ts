'use server';

import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import { contarRepuestosSchema } from '@/lib/actions/inventario-repuestos-schemas';
import type { ContarRepuestosResult } from '@/types/inventario-repuestos';

/**
 * WEB-INV-COMPANIONS-ABC-001 — Conteo desacoplado del listado.
 *
 * Usa agregación count() con los mismos filtros server-side del listado.
 * No devuelve documentos, no usa cursor y no escribe.
 */
export async function contarRepuestos(
    input: unknown,
    actor: unknown
): Promise<ContarRepuestosResult> {
    const a = validarActor(actor);
    if (!a) {
        return {
            success: false,
            message: 'No autorizado. Sesión inválida.',
            total: 0,
        };
    }

    const parsed = contarRepuestosSchema.safeParse(input ?? {});
    if (!parsed.success) {
        return {
            success: false,
            message: 'Filtro de repuestos inválido.',
            total: 0,
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
                total: 0,
            };
        }

        const data = parsed.data;
        const adminDb = getDb();
        let query = adminDb.collection('inventario_repuestos');

        if (data.categoria) {
            query = query.where('categoria', '==', data.categoria);
        }
        if (data.fabricante) {
            query = query.where('fabricante', '==', data.fabricante);
        }
        if (data.referencia) {
            query = query
                .where('referencia', '>=', data.referencia)
                .where('referencia', '<=', `${data.referencia}\uf8ff`);
        }
        if (data.referencia_alternativa) {
            query = query.where(
                'referencias_alternativas',
                'array-contains',
                data.referencia_alternativa
            );
        }

        const snap = await query.count().get();
        return { success: true, total: snap.data().count };
    } catch (error) {
        console.error('[inventario-repuestos] contarRepuestos falló:', error);
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al contar los repuestos: ${msg}`,
            total: 0,
        };
    }
}
