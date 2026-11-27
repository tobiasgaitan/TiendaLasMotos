import {
    normalizarReferenciasAlternativas,
    referenciasAlternativasSchema,
} from '@/lib/actions/inventario-schemas';
import { imagenesReferenciaSchema } from '@/lib/actions/inventario-repuestos-schemas';
import { UNIDADES_MEDIDA } from '@/types/inventario';
import type {
    BorradorRepuesto,
    CambiosRepuesto,
    FiltrosRepuesto,
    RepuestoInventarioDTO,
} from '@/types/inventario-repuestos';

/**
 * WEB-038 — Helpers puros de la pantalla de inventario de repuestos.
 * Sin Firestore, sin React y sin IndexedDB.
 */

function normalizar(valor: string): string {
    return valor.trim().toLowerCase();
}

/**
 * Indica si hay al menos un filtro con contenido efectivo.
 * Replica la semántica `.trim()` usada al construir `filtrosInput`.
 */
export function hayFiltrosActivos(filtros: FiltrosRepuesto): boolean {
    return Boolean(
        filtros.referencia.trim() ||
            filtros.categoria.trim() ||
            filtros.fabricante.trim() ||
            filtros.referencia_alternativa.trim()
    );
}

export function filtrarRepuestos(
    repuestos: RepuestoInventarioDTO[],
    filtros: FiltrosRepuesto
): RepuestoInventarioDTO[] {
    const referencia = normalizar(filtros.referencia);
    const categoria = normalizar(filtros.categoria);
    const fabricante = normalizar(filtros.fabricante);
    const alternativa = normalizar(filtros.referencia_alternativa);

    return repuestos.filter((repuesto) => {
        if (
            referencia &&
            !normalizar(repuesto.referencia).includes(referencia)
        ) {
            return false;
        }
        if (categoria && normalizar(repuesto.categoria) !== categoria) {
            return false;
        }
        if (fabricante && normalizar(repuesto.fabricante) !== fabricante) {
            return false;
        }
        if (
            alternativa &&
            !(repuesto.referencias_alternativas ?? []).some(
                (referenciaAlternativa) =>
                    normalizar(referenciaAlternativa) === alternativa
            )
        ) {
            return false;
        }
        return true;
    });
}

function parseEntero(valor: string, campo: string): number {
    const limpio = valor.trim();
    if (!limpio) {
        throw new Error(`${campo} es obligatorio.`);
    }

    const numero = Number(limpio);
    if (!Number.isFinite(numero) || !Number.isInteger(numero) || numero < 0) {
        throw new Error(`${campo} debe ser un entero mayor o igual a cero.`);
    }
    return numero;
}

function parsePrecio(valor: string): number {
    const limpio = valor.trim();
    if (!limpio) {
        throw new Error('El precio es obligatorio.');
    }

    const numero = Number(limpio);
    if (!Number.isFinite(numero) || numero < 0) {
        throw new Error('El precio debe ser un número mayor o igual a cero.');
    }
    return numero;
}

/**
 * Devuelve únicamente los campos que cambiaron y son editables por esta
 * pantalla. No incluye referencia, categoría, fabricante ni auditoría.
 */
export function construirCambiosRepuesto(
    original: RepuestoInventarioDTO,
    borrador: BorradorRepuesto
): CambiosRepuesto {
    const cambios: CambiosRepuesto = {};

    const descripcion = borrador.descripcion.trim();
    if (descripcion !== original.descripcion) {
        if (!descripcion) {
            throw new Error('La descripción es obligatoria.');
        }
        cambios.descripcion = descripcion;
    }

    const stock = parseEntero(borrador.stock, 'El stock');
    if (stock !== original.stock) {
        cambios.stock = stock;
    }

    const stockMinimo = parseEntero(borrador.stock_minimo, 'El stock mínimo');
    if (stockMinimo !== original.stock_minimo) {
        cambios.stock_minimo = stockMinimo;
    }

    const precio = parsePrecio(borrador.precio);
    if (precio !== original.precio) {
        cambios.precio = precio;
    }

    if (!UNIDADES_MEDIDA.includes(borrador.unidad_medida)) {
        throw new Error('La unidad de medida no es válida.');
    }
    if (borrador.unidad_medida !== original.unidad_medida) {
        cambios.unidad_medida = borrador.unidad_medida;
    }

    const ubicacion = borrador.ubicacion.trim();
    if (ubicacion !== original.ubicacion) {
        if (!ubicacion) {
            throw new Error('La ubicación es obligatoria.');
        }
        cambios.ubicacion = ubicacion;
    }

    const alternativas = referenciasAlternativasSchema.safeParse(
        borrador.referencias_alternativas ?? []
    );
    if (!alternativas.success) {
        const issue = alternativas.error.issues[0];
        const indice =
            typeof issue?.path[0] === 'number' ? issue.path[0] + 1 : 1;
        throw new Error(
            `Referencia alternativa #${indice}: ${
                issue?.message ?? 'referencia inválida'
            }`
        );
    }

    const alternativasNormalizadas = normalizarReferenciasAlternativas(
        alternativas.data,
        original.referencia
    );
    const alternativasActuales = original.referencias_alternativas ?? [];
    if (
        alternativasNormalizadas.join('|') !== alternativasActuales.join('|')
    ) {
        cambios.referencias_alternativas = alternativasNormalizadas;
    }

    const imagenes = imagenesReferenciaSchema.safeParse(
        borrador.imagenes_referencia ?? []
    );
    if (!imagenes.success) {
        const issue = imagenes.error.issues[0];
        const indice =
            typeof issue?.path[0] === 'number' ? issue.path[0] + 1 : 1;
        throw new Error(
            `Imagen de referencia #${indice}: ${
                issue?.message ?? 'URL inválida'
            }`
        );
    }

    const imagenesNormalizadas = imagenes.data ?? [];
    const imagenesActuales = original.imagenes_referencia ?? [];
    if (
        imagenesNormalizadas.join('|') !== imagenesActuales.join('|')
    ) {
        cambios.imagenes_referencia = imagenesNormalizadas;
    }

    return cambios;
}
