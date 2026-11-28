'use server';

import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import { listarCategoriasRepuestosSchema } from '@/lib/actions/categorias-repuestos-schemas';
import {
    aCategoriaDTO,
    ordenarCategorias,
} from '@/lib/inventario/categorias';
import type {
    CategoriaRepuestoDTO,
    ListarCategoriasResult,
} from '@/types/categorias-repuestos';

/**
 * WEB-INV-053 — Lista las categorías canónicas.
 *
 * Faraday Cage: actor válido → ID token → permiso read de inventario →
 * rol admin/superadmin. Solo lectura; la colección no se escribe aquí.
 */
export async function listarCategoriasRepuestos(
    input: unknown,
    actor: unknown
): Promise<ListarCategoriasResult> {
    const a = validarActor(actor);
    if (!a) {
        return {
            success: false,
            message: 'No autorizado. Sesión inválida.',
            categorias: [],
        };
    }

    const parsed = listarCategoriasRepuestosSchema.safeParse(input ?? {});
    if (!parsed.success) {
        return {
            success: false,
            message: 'Los filtros de categorías son inválidos.',
            categorias: [],
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
                message: 'Solo un administrador puede consultar categorías.',
                categorias: [],
            };
        }

        const snap = await getDb()
            .collection('categorias_repuestos')
            .get();

        const categorias = snap.docs
            .map(
                (doc: {
                    id: string;
                    data: () => Record<string, unknown> | undefined;
                }) =>
                    aCategoriaDTO(
                        doc.id,
                        doc.data() ?? {}
                    )
            )
            .filter(
                (categoria: CategoriaRepuestoDTO) =>
                    parsed.data.incluirArchivadas || categoria.activo
            );

        return {
            success: true,
            categorias: ordenarCategorias(categorias),
        };
    } catch (error) {
        console.error(
            '[inventario-categorias] listarCategoriasRepuestos falló:',
            error
        );
        return {
            success: false,
            message: 'No se pudieron cargar las categorías.',
            categorias: [],
        };
    }
}
