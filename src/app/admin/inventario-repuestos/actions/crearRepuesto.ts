'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import { crearRepuestoSchema } from '@/lib/actions/inventario-repuestos-schemas';
import type { InventarioActionResult } from '@/types/inventario';

/**
 * WEB-043-O1 — Alta de un repuesto existente en el catálogo maestro.
 *
 * - Faraday Cage: verifyIdToken + requirePermiso create + rol admin/superadmin.
 * - El documento usa auto-ID; la referencia comercial puede repetirse por sede.
 * - El repuesto y el asiento append-only del ledger se escriben en la misma
 *   transacción. Si falla cualquiera de los dos, no queda escritura parcial.
 */
export async function crearRepuesto(
    input: unknown,
    actor: unknown
): Promise<InventarioActionResult> {
    const a = validarActor(actor);
    if (!a) {
        return { success: false, message: 'No autorizado. Sesión inválida.' };
    }

    const parsed = crearRepuestoSchema.safeParse(input);
    if (!parsed.success) {
        return {
            success: false,
            message: 'Datos del repuesto inválidos. Revisa los campos.',
        };
    }

    try {
        const me = await requireActorInventario(a.idToken);
        const permiso = await requirePermiso(
            me,
            'inventario_repuestos',
            'create'
        );
        if (permiso.rol !== 'admin' && permiso.rol !== 'superadmin') {
            return {
                success: false,
                message: 'Solo un administrador puede crear repuestos.',
            };
        }

        const data = parsed.data;
        const adminDb = getDb();
        const repuestoRef = adminDb
            .collection('inventario_repuestos')
            .doc();
        const ledgerRef = adminDb
            .collection('historial_auditoria_inventario')
            .doc();

        await adminDb.runTransaction(async (tx: any) => {
            const ahora = new Date();
            const payload: Record<string, unknown> = {
                referencia: data.referencia,
                descripcion: data.descripcion,
                sede_id: data.sede_id ?? '',
                fabricante: data.fabricante ?? '',
                aplica_a: data.aplica_a ?? [],
                categoria: data.categoria ?? '',
                precio: data.precio ?? 0,
                ubicacion: data.ubicacion ?? '',
                stock: data.stock ?? 0,
                stock_minimo: data.stock_minimo ?? 0,
                referencias_alternativas:
                    data.referencias_alternativas ?? [],
                imagen_url: data.imagen_url ?? '',
                creado_por: me.email,
                creado_en: ahora,
                actualizado_por: me.email,
                actualizado_en: ahora,
            };

            tx.create(repuestoRef, payload);

            tx.create(ledgerRef, {
                coleccion_afectada: 'inventario_repuestos',
                documento_id: repuestoRef.id,
                referencia: data.referencia,
                conteo_id: null,
                operacion: 'CREATE',
                datos_anteriores: null,
                datos_nuevos: payload,
                campos_modificados: Object.keys(payload),
                registrado_por: me.uid,
                registrado_por_email: me.email,
                creado_en: ahora,
                version: 1,
            });
        });

        revalidatePath('/admin/inventario-repuestos');

        return {
            success: true,
            id: repuestoRef.id,
            idempotente: false,
        };
    } catch (error) {
        console.error('[inventario-repuestos] crearRepuesto falló:', {
            referencia: parsed.data.referencia,
            error,
        });
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al crear el repuesto: ${msg}`,
        };
    }
}
