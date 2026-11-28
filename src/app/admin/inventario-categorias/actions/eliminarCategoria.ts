'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import { eliminarCategoriaRepuestoSchema } from '@/lib/actions/categorias-repuestos-schemas';
import type { InventarioActionResult } from '@/types/inventario';

/**
 * WEB-INV-053 — Borrado físico de categoría canónica.
 *
 * Solo se permite si ningún documento de `inventario_repuestos` referencia el
 * nombre. Si está en uso, el llamador debe archivarla. La comprobación y el
 * borrado ocurren en la misma transacción; el ledger es append-only.
 */
export async function eliminarCategoriaRepuesto(
    input: unknown,
    actor: unknown
): Promise<InventarioActionResult> {
    const a = validarActor(actor);
    if (!a) {
        return { success: false, message: 'No autorizado. Sesión inválida.' };
    }

    const parsed = eliminarCategoriaRepuestoSchema.safeParse(input);
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
            'delete'
        );
        if (permiso.rol !== 'admin' && permiso.rol !== 'superadmin') {
            return {
                success: false,
                message: 'Solo un administrador puede eliminar categorías.',
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
                return { idempotente: true };
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

            const enUso = await tx.get(
                adminDb
                    .collection('inventario_repuestos')
                    .where('categoria', '==', data.nombre)
                    .limit(1)
            );
            if (enUso.size > 0) {
                throw new Error(
                    'La categoría está en uso. Archívala en lugar de eliminarla.'
                );
            }

            const ahora = new Date();
            tx.delete(categoriaRef);

            tx.create(ledgerRef, {
                coleccion_afectada: 'categorias_repuestos',
                documento_id: data.clave,
                referencia: null,
                conteo_id: null,
                operacion: 'DELETE',
                datos_anteriores: antes,
                datos_nuevos: null,
                campos_modificados: Object.keys(antes),
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
            '[inventario-categorias] eliminarCategoriaRepuesto falló:',
            {
                clave: parsed.data.clave,
                error,
            }
        );
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al eliminar la categoría: ${msg}`,
        };
    }
}
