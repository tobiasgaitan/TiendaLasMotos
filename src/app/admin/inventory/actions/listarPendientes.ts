'use server';

import { getDb } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import {
    esEstadoConteo,
    listarPendientesSchema,
} from '@/lib/actions/inventario-schemas';
import type {
    ListarPendientesResult,
    PendienteDTO,
} from '@/types/inventario';

function texto(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function numero(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function aISO(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();

    if (typeof value === 'object' && value !== null) {
        const candidato = value as { toDate?: unknown };
        if (typeof candidato.toDate === 'function') {
            try {
                const date = (candidato.toDate as () => Date).call(candidato);
                return date.toISOString();
            } catch (error) {
                console.error('[inventario] aISO falló:', error);
                return null;
            }
        }
    }

    return null;
}

/**
 * Lista los conteos para el dashboard de aprobación del admin.
 * Devuelve strings ISO, no Timestamps de Firestore.
 */
export async function listarPendientes(
    input: unknown,
    actor: unknown
): Promise<ListarPendientesResult> {
    const a = validarActor(actor);
    if (!a) {
        return {
            success: false,
            message: 'No autorizado. Sesión inválida.',
            pendientes: [],
        };
    }

    const parsed = listarPendientesSchema.safeParse(input ?? {});
    if (!parsed.success) {
        return {
            success: false,
            message: 'Filtro de pendientes inválido.',
            pendientes: [],
        };
    }

    try {
        const me = await requireActorInventario(a.idToken);
        const permiso = await requirePermiso(
            me,
            'conteos_pendientes_repuestos',
            'read'
        );
        if (permiso.rol !== 'admin' && permiso.rol !== 'superadmin') {
            return {
                success: false,
                message: 'Solo un administrador puede listar los pendientes.',
                pendientes: [],
            };
        }

        const adminDb = getDb();
        const snap = await adminDb
            .collection('conteos_pendientes_repuestos')
            .where('estado', '==', parsed.data.estado)
            .orderBy('creado_en', 'desc')
            .limit(100)
            .get();

        const pendientes: PendienteDTO[] = [];

        for (const doc of snap.docs) {
            const data = doc.data() as Record<string, unknown>;
            const estado = data.estado;

            if (!esEstadoConteo(estado)) {
                console.error(
                    '[inventario] listarPendientes: estado inválido',
                    { id: doc.id, estado }
                );
                continue;
            }

            const creadoEn = aISO(data.creado_en);
            if (!creadoEn) {
                console.error(
                    '[inventario] listarPendientes: creado_en inválido',
                    { id: doc.id }
                );
            }

            pendientes.push({
                id: doc.id,
                referencia_sugerida: texto(data.referencia_sugerida),
                referencia_confirmada: texto(data.referencia_confirmada),
                inventario_documento_id: texto(
                    data.inventario_documento_id
                ),
                sede_id: texto(data.sede_id),
                descripcion: texto(data.descripcion),
                cantidad_contada: numero(data.cantidad_contada),
                ubicacion: texto(data.ubicacion),
                anotaciones: texto(data.anotaciones),
                foto_url: texto(data.foto_url),
                estado,
                motivo_rechazo: texto(data.motivo_rechazo),
                asesor_email: texto(data.asesor_email),
                asesor_uid: texto(data.asesor_uid),
                creado_en: creadoEn ?? '',
                revisado_por: texto(data.revisado_por),
                revisado_en: aISO(data.revisado_en),
            });
        }

        return { success: true, pendientes };
    } catch (error) {
        console.error('[inventario] listarPendientes falló:', {
            estado: parsed.data.estado,
            error,
        });
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al listar los pendientes: ${msg}`,
            pendientes: [],
        };
    }
}
