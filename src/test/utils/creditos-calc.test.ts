import {
    calcularComision,
    calcularDiasCobrables,
    calcularMoraRenting,
    normalizarPorcentaje,
} from '@/lib/actions/creditos-calc';
import type { CreditoCondiciones } from '@/types/creditos';

// Custom lightweight test runner (repo convention — see reverseCalculator.test.ts)
function describe(name: string, fn: () => void) {
    console.log(`\nSuite: ${name}`);
    fn();
}

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`  ✓ ${name} - PASSED`);
    } catch (error) {
        console.error(`  ✗ ${name} - FAILED`);
        throw error;
    }
}

function expectEqual(actual: unknown, expected: unknown, label: string) {
    if (actual !== expected) {
        throw new Error(`${label}: esperado ${expected}, obtenido ${actual}`);
    }
}

const condBase: CreditoCondiciones = {
    porcentaje_comision: 0.1,
    valor_cuota: 10000,
    excluir_domingos: true,
    modalidad_credito: 'renting',
};

// Sábado calendario real (independiente del calendario: se busca por getDay)
function proximoSabado(): Date {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    return d;
}
function masDias(base: Date, n: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
}

describe('Regla A — cálculo de comisiones', () => {
    test('pago_cuota con porcentaje como fracción (0.10)', () => {
        const r = calcularComision(50000, 'pago_cuota', condBase);
        expectEqual(r.valor_comision, 5000, 'valor_comision');
        expectEqual(r.valor_neto_empresa, 45000, 'valor_neto_empresa');
    });

    test('pago_cuota con porcentaje > 1 se trata como porcentaje (10 → 10%)', () => {
        const r = calcularComision(50000, 'pago_cuota', { ...condBase, porcentaje_comision: 10 });
        expectEqual(r.valor_comision, 5000, 'valor_comision');
        expectEqual(r.valor_neto_empresa, 45000, 'valor_neto_empresa');
    });

    test('multa: comisión 0 y neto = valor pagado', () => {
        const r = calcularComision(20000, 'multa', condBase);
        expectEqual(r.valor_comision, 0, 'valor_comision');
        expectEqual(r.valor_neto_empresa, 20000, 'valor_neto_empresa');
    });

    test('nota_credito negativa: comisión 0 y neto negativo', () => {
        const r = calcularComision(-15000, 'nota_credito', condBase);
        expectEqual(r.valor_comision, 0, 'valor_comision');
        expectEqual(r.valor_neto_empresa, -15000, 'valor_neto_empresa');
    });

    test('normalizarPorcentaje rechaza negativos, NaN e Infinity', () => {
        for (const v of [-1, NaN, Infinity, -Infinity]) {
            let lanzo = false;
            try { normalizarPorcentaje(v); } catch { lanzo = true; }
            if (!lanzo) throw new Error(`normalizarPorcentaje(${v}) debió lanzar`);
        }
    });
});

describe('Regla B — mora renting excluyendo domingos', () => {
    test('sábado → domingo: el único día es domingo → 0 cobrables', () => {
        const sab = proximoSabado();
        expectEqual(calcularDiasCobrables(sab, masDias(sab, 1)), 0, 'dias cobrables');
    });

    test('sábado → lunes: {domingo, lunes} → 1 cobrable', () => {
        const sab = proximoSabado();
        expectEqual(calcularDiasCobrables(sab, masDias(sab, 2)), 1, 'dias cobrables');
    });

    test('hoy <= fecha_registro → 0 cobrables', () => {
        const sab = proximoSabado();
        expectEqual(calcularDiasCobrables(sab, sab), 0, 'mismo día');
        expectEqual(calcularDiasCobrables(sab, masDias(sab, -3)), 0, 'hoy anterior');
    });

    test('renting con mora: exigible = días × cuota, estado en_mora', () => {
        const sab = proximoSabado();
        const r = calcularMoraRenting(condBase, sab, 0, masDias(sab, 2));
        expectEqual(r.dias_cobrables, 1, 'dias_cobrables');
        expectEqual(r.valor_exigible, 10000, 'valor_exigible');
        expectEqual(r.saldo_mora, 10000, 'saldo_mora');
        expectEqual(r.estado, 'en_mora', 'estado');
    });

    test('pago exacto del exigible → estado activo con saldo 0', () => {
        const sab = proximoSabado();
        const r = calcularMoraRenting(condBase, sab, 10000, masDias(sab, 2));
        expectEqual(r.saldo_mora, 0, 'saldo_mora');
        expectEqual(r.estado, 'activo', 'estado');
    });

    test('modalidad no renting → activo con ceros (Regla B no aplica)', () => {
        const sab = proximoSabado();
        const r = calcularMoraRenting(
            { ...condBase, modalidad_credito: 'credito' }, sab, 0, masDias(sab, 9)
        );
        expectEqual(r.dias_cobrables, 0, 'dias_cobrables');
        expectEqual(r.valor_exigible, 0, 'valor_exigible');
        expectEqual(r.estado, 'activo', 'estado');
    });

    test('renting sin excluir_domingos → activo con ceros', () => {
        const sab = proximoSabado();
        const r = calcularMoraRenting(
            { ...condBase, excluir_domingos: false }, sab, 0, masDias(sab, 9)
        );
        expectEqual(r.dias_cobrables, 0, 'dias_cobrables');
        expectEqual(r.estado, 'activo', 'estado');
    });
});
