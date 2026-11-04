/**
 * WEB-038 — Contrato puro del ledger de inventario.
 *
 * NAMING LOCK: el estado del conteo dentro de `datos_nuevos` usa la clave
 * canónica `estado`. `estado_conteo` queda solo como evidencia histórica en
 * asientos antiguos y se corrige mediante reconciliación append-only.
 */
import { esEstadoConteo } from './inventario-schemas';

/**
 * Construye el `datos_nuevos` del asiento de aprobación conservando el spread
 * literal de `inventario_repuestos` y añadiendo la clave canónica de estado.
 */
export function datosNuevosAprobacion(
    inventarioDespues: Record<string, unknown>,
    conteoId: string
): Record<string, unknown> {
    return {
        ...inventarioDespues,
        conteo_id: conteoId,
        estado: 'aprobado',
    };
}

/**
 * Convierte un `datos_nuevos` legado con `estado_conteo` a la clave canónica.
 *
 * - Solo `estado` => ya canónico, devuelve null (no duplicar).
 * - Solo `estado_conteo` válido => copia sin `estado_conteo` y con `estado`.
 * - Ambas claves => error de ambigüedad.
 * - Ninguna clave => error.
 * - `estado_conteo` inválido => error.
 */
export function reconciliarDatosNuevosLegado(
    datos: Record<string, unknown>
): Record<string, unknown> | null {
    const tieneEstado = Object.prototype.hasOwnProperty.call(datos, 'estado');
    const tieneEstadoConteo = Object.prototype.hasOwnProperty.call(
        datos,
        'estado_conteo'
    );

    if (!tieneEstadoConteo) {
        if (tieneEstado) {
            return null;
        }
        throw new Error('Asiento de ledger sin clave de estado.');
    }

    if (tieneEstado) {
        throw new Error(
            'Asiento de ledger ambiguo: contiene estado y estado_conteo.'
        );
    }

    const estado = datos.estado_conteo;
    if (!esEstadoConteo(estado)) {
        throw new Error('estado_conteo inválido para reconciliación.');
    }

    const resto = Object.fromEntries(
        Object.entries(datos).filter(
            ([clave]) => clave !== 'estado_conteo'
        )
    );

    return {
        ...resto,
        estado,
    };
}
