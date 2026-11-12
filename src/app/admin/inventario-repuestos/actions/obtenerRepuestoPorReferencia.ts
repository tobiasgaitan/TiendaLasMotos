'use server';

import { z } from 'zod';
import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import { referenciaSchema } from '@/lib/actions/inventario-schemas';
import type { ObtenerRepuestoResult } from '@/types/inventario';

const obtenerRepuestoSchema = z
    .object({
        referencia: referenciaSchema,
    })
    .strict();

/**
 * WEB-043 — Verificación server-side de una referencia existente.
 *
 * Reemplaza el `getDoc` cliente de AprobarConteoModal. El cliente no recibe
 * datos maestros completos: solo si existe al menos un documento con la
 * referencia comercial. La referencia ya no es el docId.
 */
export async function obtenerRepuestoPorReferencia(
    input: unknown,
    actor: unknown
): Promise<ObtenerRepuestoResult> {
    const a = validarActor(actor);
    if (!a) {
        return {
            success: false,
            message: 'No autorizado. Sesión inválida.',
            existe: false,
        };
    }

    const parsed = obtenerRepuestoSchema.safeParse(input);
    if (!parsed.success) {
        return {
            success: false,
            message: 'Referencia inválida.',
            existe: false,
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
                message: 'Solo un administrador puede verificar referencias.',
                existe: false,
            };
        }

        await requirePermiso(me, 'inventario_repuestos', 'read');

        const adminDb = getDb();
        const [porMaestra, porAlternativa] = await Promise.all([
            adminDb
                .collection('inventario_repuestos')
                .where('referencia', '==', parsed.data.referencia)
                .limit(1)
                .get(),
            adminDb
                .collection('inventario_repuestos')
                .where(
                    'referencias_alternativas',
                    'array-contains',
                    parsed.data.referencia
                )
                .limit(1)
                .get(),
        ]);

        return {
            success: true,
            existe: !porMaestra.empty || !porAlternativa.empty,
        };
    } catch (error) {
        console.error(
            '[inventario-repuestos] obtenerRepuestoPorReferencia falló:',
            {
                referencia: parsed.data.referencia,
                error,
            }
        );
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al verificar la referencia: ${msg}`,
            existe: false,
        };
    }
}
