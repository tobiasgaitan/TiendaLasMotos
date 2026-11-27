import type { InventarioRepuesto, UnidadMedida } from './inventario';

/**
 * WEB-038 — DTO de lectura para la ruta administrativa de repuestos.
 *
 * O-32: conserva todos los campos documentales existentes de
 * `InventarioRepuesto`, incluidos `sede_id` y
 * `referencias_alternativas`; añade `documento_id` como identidad de edición
 * y serializa los Timestamps a ISO/null para el cliente. La referencia
 * comercial ya no es el docId canónico.
 */
export type RepuestoInventarioDTO = Omit<
    InventarioRepuesto,
    'creado_en' | 'actualizado_en'
> & {
    documento_id: string;
    sede_nombre: string;
    creado_en: string | null;
    actualizado_en: string | null;
};

export interface FiltrosRepuesto {
    referencia: string;
    categoria: string;
    fabricante: string;
    referencia_alternativa: string;
}

export interface BorradorRepuesto {
    descripcion: string;
    stock: string;
    stock_minimo: string;
    precio: string;
    unidad_medida: UnidadMedida;
    ubicacion: string;
    referencias_alternativas: string[];
    imagenes_referencia?: string[];
}

export interface CambiosRepuesto {
    descripcion?: string;
    stock?: number;
    stock_minimo?: number;
    precio?: number;
    unidad_medida?: UnidadMedida;
    ubicacion?: string;
    referencias_alternativas?: string[];
    imagenes_referencia?: string[];
}

export interface CursorRepuestos {
    referencia: string;
    documento_id: string;
}

export interface ListarRepuestosResult {
    success: boolean;
    message?: string;
    repuestos: RepuestoInventarioDTO[];
    siguienteCursor: CursorRepuestos | null;
}

export interface ContarRepuestosResult {
    success: boolean;
    message?: string;
    total: number;
}
