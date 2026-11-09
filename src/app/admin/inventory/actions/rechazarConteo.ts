'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import {
    esEstadoConteo,
    rechazarConteoSchema,
} from '@/lib/actions/inventario-schemas';
import type { InventarioActionResult } from '@/types/inventario';

/**
 * Rechaza un conteo pendiente y appende el motivo en el ledger.
 * No escribe en inventario_repuestos.
 */
export async function rechazarConteo(
    input: unknown,
    actor: unknown
): Promise<InventarioActionResult> {
    const a = validarActor(actor);
    if (!a) {
        return { success: false, message: 'No autorizado. Sesión inválida.' };
    }

    const parsed = rechazarConteoSchema.safeParse(input);
    if (!parsed.success) {
        return {
            success: false,
            message: 'Datos de rechazo inválidos. Revisa los campos.',
        };
    }

    try {
        const me = await requireActorInventario(a.idToken);
        const permiso = await requirePermiso(
            me,
            'conteos_pendientes_repuestos',
            'update'
        );
        if (permiso.rol !== 'admin' && permiso.rol !== 'superadmin') {
            return {
                success: false,
                message: 'Solo un administrador puede rechazar conteos.',
            };
        }

        const data = parsed.data;
        const adminDb = getDb();
        const conteoRef = adminDb
            .collection('conteos_pendientes_repuestos')
            .doc(data.conteo_id);

        const resultado = await adminDb.runTransaction(async (tx: any) => {
            const conteoSnap = await tx.get(conteoRef);
            if (!conteoSnap.exists) {
                throw new Error('El conteo no existe.');
            }

            const conteo = conteoSnap.data() as Record<string, unknown>;
            const estado = conteo.estado;

            if (estado === 'rechazado') {
                return { idempotente: true };
            }
            if (estado === 'aprobado') {
                throw new Error(
                    'El conteo ya fue aprobado y no se puede rechazar.'
                );
            }
            if (!esEstadoConteo(estado) || estado !== 'pendiente_revision') {
                throw new Error('Estado de conteo inválido.');
            }

            const ahora = new Date();
            const referencia =
                typeof conteo.referencia_confirmada === 'string' &&
                conteo.referencia_confirmada.trim()
                    ? conteo.referencia_confirmada.trim().toUpperCase()
                    : null;

            tx.update(conteoRef, {
                estado: 'rechazado',
                motivo_rechazo: data.motivo_rechazo,
                revisado_por: me.uid,
                revisado_en: ahora,
            });

            // Append-only: referencia nueva + tx.create(). Nunca set/update/delete.
            const ledgerRef = adminDb
                .collection('historial_auditoria_inventario')
                .doc();
            tx.create(ledgerRef, {
                coleccion_afectada: 'conteos_pendientes_repuestos',
                documento_id: data.conteo_id,
                referencia,
                conteo_id: data.conteo_id,
                operacion: 'UPDATE',
                datos_anteriores: { estado: 'pendiente_revision' },
                datos_nuevos: {
                    estado: 'rechazado',
                    motivo_rechazo: data.motivo_rechazo,
                    revisado_por: me.uid,
                    revisado_en: ahora,
                },
                campos_modificados: [
                    'estado',
                    'motivo_rechazo',
                    'revisado_por',
                    'revisado_en',
                ],
                registrado_por: me.uid,
                registrado_por_email: me.email,
                creado_en: ahora,
                version: 1,
            });

            return { idempotente: false };
        });

        revalidatePath('/admin/inventory');

        return {
            success: true,
            id: data.conteo_id,
            idempotente: resultado.idempotente,
        };
    } catch (error) {
        console.error('[inventario] rechazarConteo falló:', {
            conteoId: parsed.data.conteo_id,
            error,
        });
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al rechazar el conteo: ${msg}`,
        };
    }
}
