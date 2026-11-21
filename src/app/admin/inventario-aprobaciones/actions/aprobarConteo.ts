'use server';

import { revalidatePath } from 'next/cache';
import type {
    DocumentData,
    DocumentReference,
    Transaction,
} from 'firebase-admin/firestore';
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
        const conteoRef: DocumentReference<DocumentData> = adminDb
            .collection('conteos_pendientes_repuestos')
            .doc(data.conteo_id);

        const resultado = await adminDb.runTransaction(async (tx: Transaction) => {
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

            const inventarioDocumentoId =
                typeof conteo.inventario_documento_id === 'string'
                    ? conteo.inventario_documento_id.trim()
                    : '';

            let inventarioRef: DocumentReference<DocumentData>;

            if (inventarioDocumentoId) {
                inventarioRef = adminDb
                    .collection('inventario_repuestos')
                    .doc(inventarioDocumentoId);
                const inventarioSnap = await tx.get(inventarioRef);
                if (!inventarioSnap.exists) {
                    throw new Error(
                        'El repuesto seleccionado no existe en el catálogo.'
                    );
                }
            } else {
                const inventarioQuery = adminDb
                    .collection('inventario_repuestos')
                    .where('referencia', '==', referenciaParsed.data)
                    .limit(2);
                const inventarioSnap = await tx.get(inventarioQuery);
                if (inventarioSnap.size === 0) {
                    throw new Error(
                        'El repuesto seleccionado no existe en el catálogo.'
                    );
                }
                if (inventarioSnap.size > 1) {
                    throw new Error(
                        'La referencia tiene múltiples registros; no se puede determinar cuál aprobar.'
                    );
                }
                inventarioRef =
                    inventarioSnap.docs[0].ref as DocumentReference<DocumentData>;
            }

            const ahora = new Date();

            tx.update(conteoRef, {
                estado: 'aprobado',
                revisado_por: me.uid,
                revisado_en: ahora,
                motivo_rechazo: '',
            });

            // Append-only: aprobación del conteo, sin actualizar stock del catálogo.
            const ledgerRef = adminDb
                .collection('historial_auditoria_inventario')
                .doc();
            tx.create(ledgerRef, {
                coleccion_afectada: 'conteos_pendientes_repuestos',
                documento_id: data.conteo_id,
                referencia: referenciaParsed.data,
                conteo_id: data.conteo_id,
                operacion: 'UPDATE',
                datos_anteriores: { estado: 'pendiente_revision' },
                datos_nuevos: {
                    estado: 'aprobado',
                    revisado_por: me.uid,
                    revisado_en: ahora,
                    motivo_rechazo: '',
                    inventario_documento_id: inventarioRef.id,
                    descripcion,
                    cantidad_contada: cantidad,
                    ubicacion: ubicacionParsed.data,
                },
                campos_modificados: [
                    'estado',
                    'revisado_por',
                    'revisado_en',
                    'motivo_rechazo',
                ],
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
