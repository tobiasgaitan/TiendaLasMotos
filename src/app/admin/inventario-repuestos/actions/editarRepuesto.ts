'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import { editarRepuestoSchema } from '@/lib/actions/inventario-repuestos-schemas';
import type { InventarioActionResult } from '@/types/inventario';

function texto(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function numero(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Edita campos permitidos de un documento existente de inventario_repuestos.
 *
 * - No crea documentos.
 * - No renombra la referencia.
 * - Actualiza solo campos realmente modificados.
 * - Appende un asiento en historial_auditoria_inventario dentro de la misma
 *   transacción; el ledger solo se crea, nunca se modifica ni se borra.
 */
export async function editarRepuesto(
    input: unknown,
    actor: unknown
): Promise<InventarioActionResult> {
    const a = validarActor(actor);
    if (!a) {
        return { success: false, message: 'No autorizado. Sesión inválida.' };
    }

    const parsed = editarRepuestoSchema.safeParse(input);
    if (!parsed.success) {
        return {
            success: false,
            message: 'Datos de edición inválidos. Revisa los campos.',
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
                message: 'Solo un administrador puede editar repuestos.',
            };
        }

        const data = parsed.data;
        const adminDb = getDb();
        const repuestoRef = adminDb
            .collection('inventario_repuestos')
            .doc(data.documento_id);

        const resultado = await adminDb.runTransaction(async (tx: any) => {
            const snap = await tx.get(repuestoRef);
            if (!snap.exists) {
                throw new Error('El repuesto no existe.');
            }

            const antes = snap.data() as Record<string, unknown>;
            const referenciaAntes = texto(antes.referencia);
            if (referenciaAntes && referenciaAntes !== data.referencia) {
                throw new Error(
                    'La referencia no coincide con el documento seleccionado.'
                );
            }

            const cambios = data.cambios;
            const updates: Record<string, unknown> = {};

            if (cambios.descripcion !== undefined) {
                const actual = texto(antes.descripcion);
                if (actual !== cambios.descripcion) {
                    updates.descripcion = cambios.descripcion;
                }
            }

            if (cambios.stock !== undefined) {
                const actual = numero(antes.stock);
                if (actual !== cambios.stock) {
                    updates.stock = cambios.stock;
                }
            }

            if (cambios.stock_minimo !== undefined) {
                const actual = numero(antes.stock_minimo);
                if (actual !== cambios.stock_minimo) {
                    updates.stock_minimo = cambios.stock_minimo;
                }
            }

            if (cambios.precio !== undefined) {
                const actual = numero(antes.precio);
                if (actual !== cambios.precio) {
                    updates.precio = cambios.precio;
                }
            }

            if (cambios.ubicacion !== undefined) {
                const actual = texto(antes.ubicacion);
                if (actual !== cambios.ubicacion) {
                    updates.ubicacion = cambios.ubicacion;
                }
            }

            if (cambios.referencias_alternativas !== undefined) {
                const actuales = Array.isArray(
                    antes.referencias_alternativas
                )
                    ? antes.referencias_alternativas.filter(
                          (item): item is string =>
                              typeof item === 'string'
                      )
                    : [];
                if (
                    actuales.join('|') !==
                    cambios.referencias_alternativas.join('|')
                ) {
                    updates.referencias_alternativas =
                        cambios.referencias_alternativas;
                }
            }

            if (Object.keys(updates).length === 0) {
                return { idempotente: true };
            }

            const ahora = new Date();
            updates.actualizado_por = me.email;
            updates.actualizado_en = ahora;
            const despues = { ...antes, ...updates };

            tx.update(repuestoRef, updates);

            // Append-only: documento nuevo + tx.create(). Nunca set/update/delete.
            const ledgerRef = adminDb
                .collection('historial_auditoria_inventario')
                .doc();
            tx.create(ledgerRef, {
                coleccion_afectada: 'inventario_repuestos',
                documento_id: data.documento_id,
                referencia: data.referencia,
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

        revalidatePath('/admin/inventario-repuestos');

        return {
            success: true,
            id: data.documento_id,
            idempotente: resultado.idempotente,
        };
    } catch (error) {
        console.error('[inventario-repuestos] editarRepuesto falló:', {
            documentoId: parsed.data.documento_id,
            referencia: parsed.data.referencia,
            error,
        });
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al editar el repuesto: ${msg}`,
        };
    }
}
