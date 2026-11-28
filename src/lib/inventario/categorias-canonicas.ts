/**
 * WEB-INV-053 — Semilla canónica v1 (opción A).
 *
 * Los seis valores existentes en `inventario_repuestos` se declaran canónicos
 * sin reescribir documentos. El seed es idempotente y el orden es editable
 * desde la UI; estos valores solo son el bootstrap inicial.
 */
export interface CategoriaCanonicaSeed {
    nombre: string;
    orden: number;
    descripcion: string;
}

export const CATEGORIAS_CANONICAS_V1: readonly CategoriaCanonicaSeed[] =
    Object.freeze([
        {
            nombre: 'REPUESTOS',
            orden: 10,
            descripcion: 'Repuestos generales del catálogo.',
        },
        {
            nombre: 'LOS ORIGINALES',
            orden: 20,
            descripcion: 'Repuestos originales de fábrica.',
        },
        {
            nombre: 'ACCESORIOS',
            orden: 30,
            descripcion: 'Accesorios para motocicletas.',
        },
        {
            nombre: 'LUBRICANTES',
            orden: 40,
            descripcion: 'Aceites y lubricantes.',
        },
        {
            nombre: 'GENERICOS',
            orden: 50,
            descripcion: 'Repuestos genéricos.',
        },
        {
            nombre: 'LINEA DE CUIDADO',
            orden: 60,
            descripcion: 'Productos de cuidado y limpieza.',
        },
    ]);

export const NOMBRES_CANONICOS_V1: readonly string[] = Object.freeze(
    CATEGORIAS_CANONICAS_V1.map((categoria) => categoria.nombre)
);

export function esNombreCanonicoV1(nombre: string): boolean {
    return NOMBRES_CANONICOS_V1.includes(nombre);
}
