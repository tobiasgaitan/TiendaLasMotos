'use server';

import { getDb, getFieldPath } from '@/lib/firebase-admin';
import { requirePermiso } from '@/lib/auth/require-permiso';
import {
    requireActorInventario,
    validarActor,
} from '@/lib/actions/inventario-actor';
import { listarRepuestosSchema } from '@/lib/actions/inventario-repuestos-schemas';
import type {
    CursorRepuestos,
    ListarRepuestosResult,
    RepuestoInventarioDTO,
} from '@/types/inventario-repuestos';

function texto(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function numero(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function unidadMedida(value: unknown): 'unidad' | 'litro' {
    return texto(value).trim().toLowerCase() === 'litro' ? 'litro' : 'unidad';
}

function arregloTexto(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
}

function nombreSede(
    sedeId: string,
    documentoId: string,
    nombres: Map<string, string>,
    sedesCargadas: boolean
): string {
    if (!sedeId) return 'Sin sede';

    const nombre = nombres.get(sedeId);
    if (nombre) return nombre;

    if (sedesCargadas) {
        console.warn('[inventario-repuestos] Sede no resuelta:', {
            sedeId,
            documentoId,
        });
    }
    return 'Sede no disponible';
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
                console.error(
                    '[inventario-repuestos] aISO falló:',
                    error
                );
                return null;
            }
        }
    }

    return null;
}

/**
 * Lista una página de inventario_repuestos para la ruta administrativa.
 *
 * - Orden estable: referencia ASC + documentId ASC.
 * - Cursor: startAfter(referencia, documento_id).
 * - Filtros server-side: categoría/fabricante exactos y referencia por prefijo.
 * - Se pide limite + 1 para saber si existe página siguiente.
 */
export async function listarRepuestos(
    input: unknown,
    actor: unknown
): Promise<ListarRepuestosResult> {
    const a = validarActor(actor);
    if (!a) {
        return {
            success: false,
            message: 'No autorizado. Sesión inválida.',
            repuestos: [],
            siguienteCursor: null,
        };
    }

    const parsed = listarRepuestosSchema.safeParse(input ?? {});
    if (!parsed.success) {
        return {
            success: false,
            message: 'Filtro de repuestos inválido.',
            repuestos: [],
            siguienteCursor: null,
        };
    }

    try {
        const me = await requireActorInventario(a.idToken);
        const permiso = await requirePermiso(
            me,
            'inventario_repuestos',
            'read'
        );
        if (permiso.rol !== 'admin' && permiso.rol !== 'superadmin') {
            return {
                success: false,
                message: 'Solo un administrador puede ver el inventario de repuestos.',
                repuestos: [],
                siguienteCursor: null,
            };
        }

        const filtros = parsed.data;
        const adminDb = getDb();
        const FieldPath = getFieldPath();
        const coleccion = adminDb.collection('inventario_repuestos');

        let query = coleccion;
        if (filtros.categoria) {
            query = query.where('categoria', '==', filtros.categoria);
        }
        if (filtros.fabricante) {
            query = query.where('fabricante', '==', filtros.fabricante);
        }
        if (filtros.referencia) {
            query = query
                .where('referencia', '>=', filtros.referencia)
                .where('referencia', '<=', `${filtros.referencia}\uf8ff`);
        }
        if (filtros.referencia_alternativa) {
            query = query.where(
                'referencias_alternativas',
                'array-contains',
                filtros.referencia_alternativa
            );
        }

        query = query
            .orderBy('referencia')
            .orderBy(FieldPath.documentId());

        if (filtros.cursor) {
            query = query.startAfter(
                filtros.cursor.referencia,
                filtros.cursor.documento_id
            );
        }

        const snap = await query.limit(filtros.limite + 1).get();
        const hayMas = snap.docs.length > filtros.limite;
        const docsPagina = snap.docs.slice(0, filtros.limite);
        const nombresSedes = new Map<string, string>();
        let sedesCargadas = true;

        try {
            const sedesSnap = await adminDb
                .collection('configuracion/general/sedes')
                .get();
            for (const sedeDoc of sedesSnap.docs) {
                const sedeData = sedeDoc.data() as Record<string, unknown>;
                const nombre = texto(sedeData.name).trim();
                if (nombre) {
                    nombresSedes.set(sedeDoc.id, nombre);
                }
            }
        } catch (errorSedes) {
            sedesCargadas = false;
            console.warn(
                '[inventario-repuestos] No se pudieron cargar las sedes; se usará fallback:',
                errorSedes
            );
        }

        const repuestos: RepuestoInventarioDTO[] = [];

        for (const doc of docsPagina) {
            const data = doc.data() as Record<string, unknown>;
            const referenciaDocumento =
                texto(data.referencia).trim() || doc.id;

            const creadoEn = aISO(data.creado_en);
            if (!creadoEn) {
                console.error(
                    '[inventario-repuestos] creado_en inválido:',
                    { docId: doc.id }
                );
            }

            repuestos.push({
                documento_id: doc.id,
                referencia: referenciaDocumento,
                sede_id: texto(data.sede_id),
                sede_nombre: nombreSede(
                    texto(data.sede_id),
                    doc.id,
                    nombresSedes,
                    sedesCargadas
                ),
                descripcion: texto(data.descripcion),
                fabricante: texto(data.fabricante),
                aplica_a: arregloTexto(data.aplica_a),
                categoria: texto(data.categoria),
                unidad_medida: unidadMedida(data.unidad_medida),
                precio: numero(data.precio),
                ubicacion: texto(data.ubicacion),
                stock: numero(data.stock),
                stock_minimo: numero(data.stock_minimo),
                referencias_alternativas: arregloTexto(
                    data.referencias_alternativas
                ),
                imagen_url: texto(data.imagen_url),
                imagenes_referencia: arregloTexto(
                    data.imagenes_referencia
                ),
                creado_por: texto(data.creado_por),
                creado_en: creadoEn,
                actualizado_por: texto(data.actualizado_por),
                actualizado_en: aISO(data.actualizado_en),
            });
        }

        let siguienteCursor: CursorRepuestos | null = null;
        if (hayMas && docsPagina.length > 0) {
            const ultimo = docsPagina[docsPagina.length - 1];
            const ultimoData = ultimo.data() as Record<string, unknown>;
            siguienteCursor = {
                referencia: texto(ultimoData.referencia) || ultimo.id,
                documento_id: ultimo.id,
            };
        }

        return { success: true, repuestos, siguienteCursor };
    } catch (error) {
        console.error('[inventario-repuestos] listarRepuestos falló:', error);
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `Error al listar los repuestos: ${msg}`,
            repuestos: [],
            siguienteCursor: null,
        };
    }
}
