'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import { editarCategoriaRepuestoSchema } from '@/lib/actions/categorias-repuestos-schemas';
import type { InventarioActionResult } from '@/types/inventario';

/**
 * WEB-INV-053 — Edición de categoría canónica.
 *
 * El nombre es inmutable en v1. Solo se actualizan descripción, orden y
 * `activo`. Cada cambio real appende un asiento en el ledger dentro de la
 * misma transacción; un no-op es idempotente y no genera asiento.
 */
export async function editarCategoriaRepuesto(
    input: unknown,
    actor: unknown
): Promise<InventarioActionResult> {
    const a = validarActor(actor);
    if (!a) {
        return { success: false, message: 'No autorizado. Sesión inválida.' };
    }

    const parsed = editarCategoriaRepuestoSchema.safeParse(input);
    if (!parsed.success) {
        return {
            success: false,
            message: 'Datos de la categoría inválidos. Revisa los campos.',
        };
    }

    try {
        const me = await requireActorInventario(a.idToken);
        const permiso = await requirePermiso(
            me,
            'inventario_repuestos',
            'update'
        );
        if (permiso.rol !== 'admin' && permiso.rol !== 'superadmin') {
            return {
                success: false,
                message: 'Solo un administrador puede editar categorías.',
            };
        }

        const data = parsed.data;
        const adminDb = getDb();
        const categoriaRef = adminDb
            .collection('categorias_repuestos')
            .doc(data.clave);
        const ledgerRef = adminDb
            .collection('historial_auditoria_inventario')
            .doc();

        const resultado = await adminDb.runTransaction(async (tx: any) => {
            const snap = await tx.get(categoriaRef);
            if (!snap.exists) {
                throw new Error('La categoría no existe.');
            }

            const antes = (snap.data() ?? {}) as Record<string, unknown>;
            const nombreAntes =
                typeof antes.nombre === 'string'
                    ? antes.nombre.trim().toUpperCase()
                    : '';
            if (nombreAntes !== data.nombre) {
                throw new Error(
                    'La categoría no coincide con el documento seleccionado.'
                );
            }

            const updates: Record<string, unknown> = {};

            if (data.cambios.descripcion !== undefined) {
                const actual =
                    typeof antes.descripcion === 'string'
                        ? antes.descripcion
                        : '';
                if (actual !== data.cambios.descripcion) {
                    updates.descripcion = data.cambios.descripcion;
                }
            }

            if (data.cambios.orden !== undefined) {
                const actual =
                    typeof antes.orden === 'number' &&
                    Number.isFinite(antes.orden)
                        ? antes.orden
                        : 100;
                if (actual !== data.cambios.orden) {
                    updates.orden = data.cambios.orden;
                }
            }

            if (data.cambios.activo !== undefined) {
                const actual = antes.activo === true;
                if (actual !== data.cambios.activo) {
                    updates.activo = data.cambios.activo;
                }
            }

            if (Object.keys(updates).length === 0) {
                return { idempotente: true };
            }

            const ahora = new Date();
            updates.actualizado_por = me.email;
            updates.actualizado_en = ahora;
            const despues = { ...antes, ...updates };

            tx.update(categoriaRef, updates);

            tx.create(ledgerRef, {
                coleccion_afectada: 'categorias_repuestos',
                documento_id: data.clave,
                referencia: null,
                conteo_id: null,
                operacion: 'UPDATE',
                datos_anteriores: antes,
                datos_nuevos: despues,
                campos_modificados: Object.keys(updates),
                registrado_por: me.uid,
                registrado_por_email: me.email,
                creado_en: ahora,
                version: 1,
            });

            return { idempotente: false };
        });

        revalidatePath('/admin/inventario-categorias');
        revalidatePath('/admin/inventario-repuestos');

        return {
            success: true,
            id: data.clave,
            idempotente: resultado.idempotente,
        };
    } catch (error) {
        console.error(
            '[inventario-categorias] editarCategoriaRepuesto falló:',
            {
                clave: parsed.data.clave,
                error,
            }
        );
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al editar la categoría: ${msg}`,
        };
    }
}
