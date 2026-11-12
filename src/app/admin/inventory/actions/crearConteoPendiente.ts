'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import {
    crearConteoSchema,
    esStoragePathDeAsesor,
    extraerStoragePath,
} from '@/lib/actions/inventario-schemas';
import type { InventarioActionResult } from '@/types/inventario';

function texto(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

/**
 * Crea un borrador de conteo para el asesor.
 *
 * Faraday Cage: asesor_email, asesor_uid, estado, motivo_rechazo,
 * revisado_por y revisado_en se fijan en servidor.
 * El docId es `conteo_id`, generado por el cliente/outbox para idempotencia.
 */
export async function crearConteoPendiente(
    input: unknown,
    actor: unknown
): Promise<InventarioActionResult> {
    const a = validarActor(actor);
    if (!a) {
        return { success: false, message: 'No autorizado. Sesión inválida.' };
    }

    const parsed = crearConteoSchema.safeParse(input);
    if (!parsed.success) {
        return {
            success: false,
            message: 'Datos del conteo inválidos. Revisa los campos.',
        };
    }

    try {
        const me = await requireActorInventario(a.idToken);

        const permiso = await requirePermiso(
            me,
            'conteos_pendientes_repuestos',
            'create',
            { asesor_email: me.email }
        );
        if (permiso.rol !== 'asesor') {
            return {
                success: false,
                message: 'Solo un asesor puede crear conteos.',
            };
        }

        await requirePermiso(me, 'fotos_inventario', 'create', {
            asesor_email: me.email,
        });

        await requirePermiso(me, 'inventario_repuestos', 'read');

        const data = parsed.data;
        const storagePath = extraerStoragePath(data.foto_url);
        if (!storagePath) {
            return {
                success: false,
                message: 'La foto no es una URL válida de Firebase Storage.',
            };
        }
        if (storagePath !== data.storage_path) {
            return {
                success: false,
                message: 'La ruta de la foto no coincide con la URL.',
            };
        }
        if (!esStoragePathDeAsesor(storagePath, me.email)) {
            return {
                success: false,
                message: 'La foto no pertenece a tu carpeta de asesor.',
            };
        }

        const adminDb = getDb();
        const conteoRef = adminDb
            .collection('conteos_pendientes_repuestos')
            .doc(data.conteo_id);
        const fotoRef = adminDb
            .collection('fotos_inventario')
            .doc(data.conteo_id);
        const repuestoRef = adminDb
            .collection('inventario_repuestos')
            .doc(data.inventario_documento_id);

        const resultado = await adminDb.runTransaction(async (tx: any) => {
            const existente = await tx.get(conteoRef);
            if (existente.exists) {
                const prev = existente.data() as Record<string, unknown>;
                if (prev.asesor_email !== me.email) {
                    throw new Error(
                        'El identificador del conteo ya está en uso.'
                    );
                }
                return { idempotente: true };
            }

            const repuesto = await tx.get(repuestoRef);
            if (!repuesto.exists) {
                throw new Error(
                    'El repuesto seleccionado no existe en el catálogo.'
                );
            }
            const referenciaRepuesto = texto(
                repuesto.data()?.referencia
            ).trim();
            if (
                referenciaRepuesto &&
                referenciaRepuesto !== data.referencia_confirmada
            ) {
                throw new Error(
                    'La referencia no coincide con el documento seleccionado.'
                );
            }

            const ahora = new Date();

            tx.create(conteoRef, {
                referencia_sugerida: data.referencia_sugerida,
                referencia_confirmada: data.referencia_confirmada,
                inventario_documento_id: data.inventario_documento_id,
                sede_id: data.sede_id,
                descripcion: data.descripcion,
                cantidad_contada: data.cantidad_contada,
                ubicacion: data.ubicacion,
                anotaciones: data.anotaciones,
                foto_url: data.foto_url,
                estado: 'pendiente_revision',
                motivo_rechazo: '',
                asesor_email: me.email,
                asesor_uid: me.uid,
                creado_en: ahora,
                revisado_por: '',
                revisado_en: null,
            });

            tx.create(fotoRef, {
                conteo_id: data.conteo_id,
                asesor_email: me.email,
                asesor_uid: me.uid,
                foto_url: data.foto_url,
                storage_path: data.storage_path,
                nombre_archivo: data.nombre_archivo,
                mime_type: data.mime_type,
                tamano_bytes: data.tamano_bytes,
                etiquetas_vision: data.etiquetas_vision,
                creado_en: ahora,
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
        console.error('[inventario] crearConteoPendiente falló:', {
            conteoId: parsed.data.conteo_id,
            error,
        });
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al crear el conteo: ${msg}`,
        };
    }
}
