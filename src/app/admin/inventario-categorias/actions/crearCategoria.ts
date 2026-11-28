'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import { crearCategoriaRepuestoSchema } from '@/lib/actions/categorias-repuestos-schemas';
import { claveCategoria } from '@/lib/inventario/categorias';
import type { InventarioActionResult } from '@/types/inventario';

/**
 * WEB-INV-053 — Alta de categoría canónica.
 *
 * Faraday Cage completo + transacción atómica con asiento append-only en
 * historial_auditoria_inventario. El nombre es inmutable una vez creado.
 */
export async function crearCategoriaRepuesto(
    input: unknown,
    actor: unknown
): Promise<InventarioActionResult> {
    const a = validarActor(actor);
    if (!a) {
        return { success: false, message: 'No autorizado. Sesión inválida.' };
    }

    const parsed = crearCategoriaRepuestoSchema.safeParse(input);
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
            'create'
        );
        if (permiso.rol !== 'admin' && permiso.rol !== 'superadmin') {
            return {
                success: false,
                message: 'Solo un administrador puede crear categorías.',
            };
        }

        const data = parsed.data;
        const clave = claveCategoria(data.nombre);
        if (!clave) {
            return {
                success: false,
                message: 'La categoría debe contener letras o números.',
            };
        }

        const adminDb = getDb();
        const categoriaRef = adminDb
            .collection('categorias_repuestos')
            .doc(clave);
        const ledgerRef = adminDb
            .collection('historial_auditoria_inventario')
            .doc();

        await adminDb.runTransaction(async (tx: any) => {
            const snap = await tx.get(categoriaRef);
            if (snap.exists) {
                throw new Error('La categoría ya existe.');
            }

            const ahora = new Date();
            const payload: Record<string, unknown> = {
                clave,
                nombre: data.nombre,
                descripcion: data.descripcion,
                orden: data.orden,
                activo: true,
                creado_por: me.email,
                creado_en: ahora,
                actualizado_por: me.email,
                actualizado_en: ahora,
                version: 1,
            };

            tx.create(categoriaRef, payload);

            tx.create(ledgerRef, {
                coleccion_afectada: 'categorias_repuestos',
                documento_id: clave,
                referencia: null,
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

        revalidatePath('/admin/inventario-categorias');
        revalidatePath('/admin/inventario-repuestos');

        return {
            success: true,
            id: clave,
            idempotente: false,
        };
    } catch (error) {
        console.error(
            '[inventario-categorias] crearCategoriaRepuesto falló:',
            {
                nombre: parsed.data.nombre,
                error,
            }
        );
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al crear la categoría: ${msg}`,
        };
    }
}
