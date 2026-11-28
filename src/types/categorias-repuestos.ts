import type { Timestamp } from 'firebase/firestore';

/**
 * WEB-INV-053 — Contrato de las categorías canónicas de repuestos.
 *
 * `clave` es el ID documental normalizado (mayúsculas, sin acentos,
 * separadores `_`). `nombre` es el valor canónico visible que se guarda en
 * `inventario_repuestos.categoria`; el campo `categoria` no se renombra.
 */
export interface CategoriaRepuesto {
    clave: string;
    nombre: string;
    descripcion: string;
    orden: number;
    activo: boolean;
    creado_por: string;
    creado_en: Timestamp;
    actualizado_por: string;
    actualizado_en: Timestamp;
    version: 1;
}

export type CategoriaRepuestoDTO = Omit<
    CategoriaRepuesto,
    'creado_en' | 'actualizado_en'
> & {
    creado_en: string | null;
    actualizado_en: string | null;
};

export interface ListarCategoriasResult {
    success: boolean;
    message?: string;
    categorias: CategoriaRepuestoDTO[];
}
