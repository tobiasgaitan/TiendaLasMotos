'use server';

import { revalidatePath } from 'next/cache';
import type {
    DocumentReference,
    Query,
    Transaction,
} from 'firebase-admin/firestore';
import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import { eliminarRepuestoSchema } from '@/lib/actions/inventario-repuestos-schemas';
import {
    RepuestoConConteosError,
    esRepuestoConConteosError,
} from '@/lib/inventario/errores';
import type { InventarioActionResult } from '@/types/inventario';

function texto(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

/**
 * WEB-INV-COMPANIONS-ABC-001 — Borrado físico controlado de un repuesto.
 *
 * - Faraday Cage: verifyIdToken + requirePermiso delete + rol admin/superadmin.
 * - La referencia enviada debe coincidir con la del documento.
 * - Guardia FK: aborta si existe cualquier conteo que apunte al documento por
 *   `inventario_documento_id` (decisión B-1). Los conteos legacy sin ese campo
 *   no bloquean.
 * - El documento y el asiento DELETE del ledger se escriben en la misma
 *   transacción. Si falla cualquiera de los dos, no queda escritura parcial.
 * - Documento inexistente: éxito idempotente, sin asiento ni borrado.
 */
export async function eliminarRepuesto(
    input: unknown,
    actor: unknown
): Promise<InventarioActionResult> {
    const a = validarActor(actor);
    if (!a) {
        return { success: false, message: 'No autorizado. Sesión inválida.' };
    }

    const parsed = eliminarRepuestoSchema.safeParse(input);
    if (!parsed.success) {
        return {
            success: false,
            message: 'Datos de eliminación inválidos. Revisa los campos.',
        };
    }

    try {
        const me = await requireActorInventario(a.idToken);
        const permiso = await requirePermiso(
            me,
            'inventario_repuestos',
            'delete'
        );
        if (permiso.rol !== 'admin' && permiso.rol !== 'superadmin') {
            return {
                success: false,
                message: 'Solo un administrador puede eliminar repuestos.',
            };
        }

        const data = parsed.data;
        const adminDb = getDb();
        const repuestoRef = adminDb
            .collection('inventario_repuestos')
            .doc(data.documento_id) as DocumentReference<
            Record<string, unknown>
        >;
        const conteosQuery = adminDb
            .collection('conteos_pendientes_repuestos')
            .where('inventario_documento_id', '==', data.documento_id)
            .limit(1) as Query<Record<string, unknown>>;

        const resultado = await adminDb.runTransaction(
            async (tx: Transaction) => {
                const snap = await tx.get(repuestoRef);
                if (!snap.exists) {
                    return { idempotente: true };
                }

                const antes = snap.data() as Record<string, unknown>;
                const referenciaAntes = texto(antes.referencia).trim();
                if (referenciaAntes !== data.referencia) {
                    throw new Error(
                        'La referencia no coincide con el documento seleccionado.'
                    );
                }

                const conteos = await tx.get(conteosQuery);
                if (!conteos.empty) {
                    throw new RepuestoConConteosError();
                }

                const ahora = new Date();
                const ledgerRef = adminDb
                    .collection('historial_auditoria_inventario')
                    .doc();

                // Append-only: documento nuevo + tx.create(). Nunca set/update
                // ni delete sobre el ledger.
                tx.create(ledgerRef, {
                    coleccion_afectada: 'inventario_repuestos',
                    documento_id: data.documento_id,
                    referencia: data.referencia,
                    conteo_id: null,
                    operacion: 'DELETE',
                    datos_anteriores: antes,
                    datos_nuevos: null,
                    campos_modificados: [],
                    registrado_por: me.uid,
                    registrado_por_email: me.email,
                    creado_en: ahora,
                    version: 1,
                });

                tx.delete(repuestoRef);

                return { idempotente: false };
            }
        );

        revalidatePath('/admin/inventario-repuestos');

        return {
            success: true,
            id: data.documento_id,
            idempotente: resultado.idempotente,
        };
    } catch (error) {
        if (esRepuestoConConteosError(error)) {
            return {
                success: false,
                codigo: 'FK_CONTEOS',
                message:
                    'No se puede eliminar el repuesto: existen conteos pendientes asociados.',
            };
        }

        console.error(
            '[inventario-repuestos] eliminarRepuesto falló:',
            {
                documentoId: parsed.data.documento_id,
                referencia: parsed.data.referencia,
                error,
            }
        );
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al eliminar el repuesto: ${msg}`,
        };
    }
}
