'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import {
    aprobarConteoSchema,
    esEstadoConteo,
    esStoragePathDeAsesor,
    extraerStoragePath,
    referenciaSchema,
    ubicacionSchema,
} from '@/lib/actions/inventario-schemas';
import { datosNuevosAprobacion } from '@/lib/actions/inventario-ledger';
import type { InventarioActionResult } from '@/types/inventario';

/**
 * Aprueba un conteo pendiente en una transacción atómica:
 *   1. Crea/actualiza inventario_repuestos.
 *   2. Marca el conteo como aprobado.
 *   3. Appende un asiento en historial_auditoria_inventario con tx.create().
 *
 * `cantidad_contada` sobrescribe `stock` (conteo físico, no incremento).
 * El ledger es append-only: nunca tx.set/tx.update/tx.delete.
 */
export async function aprobarConteo(
    input: unknown,
    actor: unknown
): Promise<InventarioActionResult> {
    const a = validarActor(actor);
    if (!a) {
        return { success: false, message: 'No autorizado. Sesión inválida.' };
    }

    const parsed = aprobarConteoSchema.safeParse(input);
    if (!parsed.success) {
        return {
            success: false,
            message: 'Datos de aprobación inválidos. Revisa los campos.',
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
                message: 'Solo un administrador puede aprobar conteos.',
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

            if (estado === 'aprobado') {
                return {
                    idempotente: true,
                    referencia: String(
                        conteo.referencia_confirmada ?? ''
                    ),
                };
            }
            if (estado === 'rechazado') {
                throw new Error('El conteo fue rechazado y no se puede aprobar.');
            }
            if (!esEstadoConteo(estado) || estado !== 'pendiente_revision') {
                throw new Error('Estado de conteo inválido.');
            }

            const referenciaParsed = referenciaSchema.safeParse(
                conteo.referencia_confirmada
            );
            if (!referenciaParsed.success) {
                throw new Error(
                    'La referencia confirmada del conteo es inválida.'
                );
            }

            const ubicacionParsed = ubicacionSchema.safeParse(conteo.ubicacion);
            if (!ubicacionParsed.success) {
                throw new Error('La ubicación del conteo es inválida.');
            }

            const cantidad = Number(conteo.cantidad_contada);
            if (!Number.isInteger(cantidad) || cantidad < 0) {
                throw new Error('La cantidad contada es inválida.');
            }

            const descripcion =
                typeof conteo.descripcion === 'string'
                    ? conteo.descripcion.trim()
                    : '';
            if (!descripcion) {
                throw new Error('El conteo no tiene descripción.');
            }

            const fotoUrl =
                typeof conteo.foto_url === 'string' ? conteo.foto_url : '';
            const fotoPath = extraerStoragePath(fotoUrl);
            if (!fotoPath) {
                throw new Error('El conteo no tiene una foto válida.');
            }

            const asesorEmail =
                typeof conteo.asesor_email === 'string'
                    ? conteo.asesor_email
                    : '';
            if (!esStoragePathDeAsesor(fotoPath, asesorEmail)) {
                throw new Error(
                    'La foto no pertenece a la carpeta del asesor del conteo.'
                );
            }

            const inventarioRef = adminDb
                .collection('inventario_repuestos')
                .doc(referenciaParsed.data);
            const inventarioSnap = await tx.get(inventarioRef);
            const inventarioExistia = inventarioSnap.exists;
            const inventarioAntes = inventarioExistia
                ? (inventarioSnap.data() as Record<string, unknown>)
                : null;

            const datosMaestro = data.datos_maestro;
            if (!inventarioExistia && !datosMaestro) {
                throw new Error(
                    'Faltan datos maestros para crear la referencia.'
                );
            }

            const ahora = new Date();
            let inventarioDespues: Record<string, unknown>;
            let camposModificados: string[];

            if (inventarioExistia) {
                const updates: Record<string, unknown> = {
                    stock: cantidad,
                    ubicacion: ubicacionParsed.data,
                    imagen_url:
                        datosMaestro && datosMaestro.imagen_url
                            ? datosMaestro.imagen_url
                            : fotoUrl,
                    actualizado_por: me.email,
                    actualizado_en: ahora,
                };

                if (datosMaestro) {
                    updates.fabricante = datosMaestro.fabricante;
                    updates.aplica_a = datosMaestro.aplica_a;
                    updates.categoria = datosMaestro.categoria;
                    updates.precio = datosMaestro.precio;
                    updates.stock_minimo = datosMaestro.stock_minimo;
                }

                tx.update(inventarioRef, updates);
                inventarioDespues = { ...inventarioAntes, ...updates };
                camposModificados = Object.keys(updates);
            } else {
                const dm = datosMaestro;
                if (!dm) {
                    throw new Error(
                        'Faltan datos maestros para crear la referencia.'
                    );
                }

                const payload: Record<string, unknown> = {
                    referencia: referenciaParsed.data,
                    descripcion,
                    fabricante: dm.fabricante,
                    aplica_a: dm.aplica_a,
                    categoria: dm.categoria,
                    precio: dm.precio,
                    ubicacion: ubicacionParsed.data,
                    stock: cantidad,
                    stock_minimo: dm.stock_minimo,
                    imagen_url: dm.imagen_url ? dm.imagen_url : fotoUrl,
                    creado_por: me.email,
                    creado_en: ahora,
                    actualizado_por: me.email,
                    actualizado_en: ahora,
                };

                tx.create(inventarioRef, payload);
                inventarioDespues = payload;
                camposModificados = Object.keys(payload);
            }

            tx.update(conteoRef, {
                estado: 'aprobado',
                revisado_por: me.uid,
                revisado_en: ahora,
                motivo_rechazo: '',
            });

            // Append-only: referencia nueva + tx.create(). Nunca set/update/delete.
            const ledgerRef = adminDb
                .collection('historial_auditoria_inventario')
                .doc();
            tx.create(ledgerRef, {
                coleccion_afectada: 'inventario_repuestos',
                documento_id: referenciaParsed.data,
                referencia: referenciaParsed.data,
                conteo_id: data.conteo_id,
                operacion: inventarioExistia ? 'UPDATE' : 'CREATE',
                datos_anteriores: inventarioAntes,
                datos_nuevos: datosNuevosAprobacion(
                    inventarioDespues,
                    data.conteo_id
                ),
                campos_modificados: camposModificados,
                registrado_por: me.uid,
                registrado_por_email: me.email,
                creado_en: ahora,
                version: 1,
            });

            return {
                idempotente: false,
                referencia: referenciaParsed.data,
            };
        });

        revalidatePath('/admin/inventory');

        return {
            success: true,
            id: resultado.referencia,
            idempotente: resultado.idempotente,
        };
    } catch (error) {
        console.error('[inventario] aprobarConteo falló:', {
            conteoId: parsed.data.conteo_id,
            error,
        });
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al aprobar el conteo: ${msg}`,
        };
    }
}
