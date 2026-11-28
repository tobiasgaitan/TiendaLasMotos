import type { CategoriaRepuestoDTO } from '@/types/categorias-repuestos';

/**
 * WEB-INV-053 — Helpers puros de categorías canónicas de repuestos.
 *
 * Sin Firestore, sin React y sin SDKs. La clave documental se deriva del
 * nombre visible para evitar `/`, acentos y variantes de espacio.
 */

export const CATEGORIA_NOMBRE_MAX = 100;
export const CATEGORIA_DESCRIPCION_MAX = 500;
export const CATEGORIA_ORDEN_DEFAULT = 100;
export const CATEGORIA_ORDEN_MAX = 9999;

/** Normaliza el nombre visible: trim, espacios simples y mayúsculas. */
export function normalizarNombreCategoria(valor: string): string {
    return valor.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Deriva la clave documental estable. Ejemplos:
 *   "  línea de cuidado " -> "LINEA_DE_CUIDADO"
 *   "Los Originales"       -> "LOS_ORIGINALES"
 *   "A/B"                  -> "A_B"
 */
export function claveCategoria(valor: string): string {
    return normalizarNombreCategoria(valor)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/** Ordena por `orden` ascendente y, en empate, por nombre en español. */
export function ordenarCategorias<T extends { orden: number; nombre: string }>(
    categorias: readonly T[]
): T[] {
    return [...categorias].sort((a, b) => {
        if (a.orden !== b.orden) return a.orden - b.orden;
        return a.nombre.localeCompare(b.nombre, 'es');
    });
}

function timestampAIso(valor: unknown): string | null {
    if (!valor) return null;
    if (typeof valor === 'string') return valor;
    if (valor instanceof Date) return valor.toISOString();

    if (
        typeof valor === 'object' &&
        valor !== null &&
        'toDate' in valor &&
        typeof (valor as { toDate?: unknown }).toDate === 'function'
    ) {
        try {
            return (valor as { toDate: () => Date }).toDate().toISOString();
        } catch (error) {
            console.error(
                '[categorias-repuestos] No se pudo convertir el timestamp:',
                error
            );
            return null;
        }
    }

    return null;
}

/** Convierte un documento de Firestore al DTO serializable de la UI. */
export function aCategoriaDTO(
    id: string,
    data: Record<string, unknown>
): CategoriaRepuestoDTO {
    const clave =
        typeof data.clave === 'string' && data.clave.trim()
            ? data.clave.trim()
            : id;
    const nombre =
        typeof data.nombre === 'string' ? data.nombre.trim().toUpperCase() : '';
    const orden =
        typeof data.orden === 'number' && Number.isFinite(data.orden)
            ? data.orden
            : CATEGORIA_ORDEN_DEFAULT;

    return {
        clave,
        nombre,
        descripcion:
            typeof data.descripcion === 'string' ? data.descripcion : '',
        orden,
        activo: data.activo === true,
        creado_por: typeof data.creado_por === 'string' ? data.creado_por : '',
        creado_en: timestampAIso(data.creado_en),
        actualizado_por:
            typeof data.actualizado_por === 'string'
                ? data.actualizado_por
                : '',
        actualizado_en: timestampAIso(data.actualizado_en),
        version: 1,
    };
}
