import type { CreditoCondiciones, TipoTransaccion } from "@/types/creditos";

/**
 * Cálculos puros del Módulo de Créditos y Renting (Fase 9).
 * Módulo SIN side effects: prohibido importar getDb/getAdminAuth aquí.
 * Regla A (comisión) y Regla B (mora renting) del Documento de Negocio.
 */

export function redondear2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * Normaliza porcentaje_comision: fracción [0,1] se usa directa;
 * valor > 1 se interpreta como porcentaje y se divide entre 100.
 * Lanza si el valor no es finito o es negativo.
 */
export function normalizarPorcentaje(valor: number): number {
    if (!Number.isFinite(valor) || valor < 0) {
        throw new Error('porcentaje_comision inválido');
    }
    return valor > 1 ? valor / 100 : valor;
}

/**
 * Regla A — Cálculo de comisiones.
 * - pago_cuota: comision = valor_pagado_cliente × porcentaje_comision;
 *   neto = valor_pagado_cliente - comision.
 * - multa / nota_credito: comision = 0; neto = valor_pagado_cliente.
 */
export function calcularComision(
    valorPagadoCliente: number,
    tipoTransaccion: TipoTransaccion,
    condiciones: CreditoCondiciones
): { valor_comision: number; valor_neto_empresa: number } {
    if (tipoTransaccion === 'pago_cuota') {
        const pct = normalizarPorcentaje(condiciones.porcentaje_comision);
        const valor_comision = redondear2(valorPagadoCliente * pct);
        return {
            valor_comision,
            valor_neto_empresa: redondear2(valorPagadoCliente - valor_comision),
        };
    }
    return { valor_comision: 0, valor_neto_empresa: valorPagadoCliente };
}

/**
 * Días Transcurridos Cobrables: días calendario estrictamente posteriores a
 * fechaRegistro hasta `hoy` inclusive, EXCLUYENDO domingos.
 * Aritmética en fechas locales (no UTC) para estabilidad en America/Bogota.
 */
export function calcularDiasCobrables(fechaRegistro: Date, hoy: Date): number {
    const inicio = new Date(fechaRegistro.getFullYear(), fechaRegistro.getMonth(), fechaRegistro.getDate());
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (fin <= inicio) return 0;
    let dias = 0;
    const cursor = new Date(inicio);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor <= fin) {
        if (cursor.getDay() !== 0) dias += 1; // 0 = domingo
        cursor.setDate(cursor.getDate() + 1);
    }
    return dias;
}

export type EstadoRenting = 'activo' | 'en_mora';

/**
 * Regla B — Estado de deuda y mora (renting).
 * Solo aplica si modalidad_credito === 'renting' y excluir_domingos === true.
 * Valor Exigible = días cobrables × condiciones.valor_cuota.
 * Saldo en Mora = Exigible - Total Recibido. Mora > 0 → 'en_mora', si no 'activo'.
 */
export function calcularMoraRenting(
    condiciones: CreditoCondiciones,
    fechaRegistro: Date,
    totalRecibido: number,
    hoy: Date = new Date()
): { dias_cobrables: number; valor_exigible: number; saldo_mora: number; estado: EstadoRenting } {
    if (condiciones.modalidad_credito !== 'renting' || condiciones.excluir_domingos !== true) {
        return { dias_cobrables: 0, valor_exigible: 0, saldo_mora: 0, estado: 'activo' };
    }
    const dias_cobrables = calcularDiasCobrables(fechaRegistro, hoy);
    const valor_exigible = redondear2(dias_cobrables * condiciones.valor_cuota);
    const saldo_mora = redondear2(valor_exigible - totalRecibido);
    return {
        dias_cobrables,
        valor_exigible,
        saldo_mora,
        estado: saldo_mora > 0 ? 'en_mora' : 'activo',
    };
}
