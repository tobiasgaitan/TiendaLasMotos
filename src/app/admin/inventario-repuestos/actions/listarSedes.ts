'use server';

import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import type { ListarSedesResult, SedeOpcion } from '@/types/inventario';

function texto(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

/**
 * Devuelve las sedes activas para el alta de repuestos.
 * Solo lectura: la colección configuracion/general/sedes no se modifica.
 */
export async function listarSedes(
    _input: unknown,
    actor: unknown
): Promise<ListarSedesResult> {
    const a = validarActor(actor);
    if (!a) {
        return {
            success: false,
            message: 'No autorizado. Sesión inválida.',
            sedes: [],
        };
    }

    try {
        const me = await requireActorInventario(a.idToken);
        await requirePermiso(me, 'inventario_repuestos', 'read');

        const snap = await getDb()
            .collection('configuracion/general/sedes')
            .get();
        const sedes: SedeOpcion[] = (
            snap.docs as Array<{
                id: string;
                data: () => Record<string, unknown>;
            }>
        )
            .map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: texto(data.name),
                    department: texto(data.department),
                    isActive: data.isActive,
                };
            })
            .filter((sede) => sede.isActive !== false)
            .map(({ id, name, department }) => ({
                id,
                name,
                department,
            }));

        sedes.sort((a, b) => a.name.localeCompare(b.name, 'es'));

        return { success: true, sedes };
    } catch (error) {
        console.error('[inventario-repuestos] listarSedes falló:', error);
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al cargar las sedes: ${msg}`,
            sedes: [],
        };
    }
}
