import type { InventarioRepuesto } from './inventario';

/**
 * WEB-038 — DTO de lectura para la ruta administrativa de repuestos.
 *
 * O-32: conserva 1:1 todos los campos documentales existentes de
 * `InventarioRepuesto`; no añade campos de dominio y solo serializa los
 * Timestamps a ISO/null para el cliente. La referencia es el docId canónico.
 */
export type RepuestoInventarioDTO = Omit<
    InventarioRepuesto,
    'creado_en' | 'actualizado_en'
> & {
    creado_en: string | null;
    actualizado_en: string | null;
};

export interface FiltrosRepuesto {
    referencia: string;
    categoria: string;
    fabricante: string;
}

export interface BorradorRepuesto {
    descripcion: string;
    stock: string;
    stock_minimo: string;
    precio: string;
    ubicacion: string;
}

export interface CambiosRepuesto {
    descripcion?: string;
    stock?: number;
    stock_minimo?: number;
    precio?: number;
    ubicacion?: string;
}

export interface ListarRepuestosResult {
    success: boolean;
    message?: string;
    repuestos: RepuestoInventarioDTO[];
}
