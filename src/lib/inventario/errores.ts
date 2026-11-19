/**
 * WEB-INV-COMPANIONS-ABC-001 — Errores de dominio del inventario.
 *
 * Este módulo es puro: no importa Firestore, React ni APIs del servidor.
 */

export const CODIGO_FK_CONTEOS = 'FK_CONTEOS' as const;

export class RepuestoConConteosError extends Error {
    readonly codigo = CODIGO_FK_CONTEOS;

    constructor() {
        super(
            'No se puede eliminar el repuesto: existen conteos pendientes asociados.'
        );
        this.name = 'RepuestoConConteosError';
    }
}

export function esRepuestoConConteosError(
    error: unknown
): error is RepuestoConConteosError {
    if (error instanceof RepuestoConConteosError) return true;
    return (
        typeof error === 'object' &&
        error !== null &&
        (error as { codigo?: unknown }).codigo === CODIGO_FK_CONTEOS
    );
}
