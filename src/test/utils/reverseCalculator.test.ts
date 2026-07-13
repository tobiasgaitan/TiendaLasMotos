import { calculateMaxLoan } from '@/lib/utils/reverseCalculator';

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

describe('Reverse Calculator Mathematical Integrity', () => {
    test('A valid monthly budget returns a coherent credit quota greater than $10,000,000 COP', () => {
        // e.g. monthlyBudget = 600000 ($20,000 daily * 30), initialPayment = 0, months = 36
        // default rates: interestRate = 2.3, fngRate = 20.66, insuranceRate = 0.1126
        const result = calculateMaxLoan(600000, 0, 36);
        
        console.log(`    Monthly Budget: 600,000 COP (Months: 36)`);
        console.log(`    Calculated Max Loan Amount: ${result.maxLoanAmount} COP`);

        if (result.maxLoanAmount <= 10000000) {
            throw new Error(`Expected maxLoanAmount to be greater than 10,000,000 COP, got ${result.maxLoanAmount}`);
        }
    });

    test('Calculation works correctly when insuranceRate or fngRate are equal to 0 (Caso Banco de Bogotá)', () => {
        // Banco de Bogotá case: fngRate = 0, insuranceRate = 0
        const result = calculateMaxLoan(450000, 0, 36, 2.3, 0, 0);

        console.log(`    Banco de Bogotá Case - Monthly Budget: 450,000 COP`);
        console.log(`    Calculated Max Loan Amount: ${result.maxLoanAmount} COP`);

        if (result.maxLoanAmount <= 0) {
            throw new Error(`Expected maxLoanAmount to be greater than 0, got ${result.maxLoanAmount}`);
        }

        // PMT = Loan * [ r(1+r)^n ] / [ (1+r)^n - 1 ] -> Loan = PMT / amortFactor
        const r = 2.3 / 100;
        const n = 36;
        const amortFactor = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        const expectedLoan = 450000 / amortFactor;
        const diff = Math.abs(result.maxLoanAmount - expectedLoan);
        if (diff > 1) {
            throw new Error(`Expected maxLoanAmount to be close to ${expectedLoan}, got ${result.maxLoanAmount} (diff: ${diff})`);
        }
    });
});

class ComponentSimulation {
    private dailyBudget: number = 15000;
    private initialPayment: number = 0;
    private selectedEntity: any = null;

    setEntity(entity: any) {
        this.selectedEntity = entity;
    }

    setDailyBudget(budget: number) {
        this.dailyBudget = budget;
    }

    get calculation(): any {
        if (!this.selectedEntity) return null;

        const interest = this.selectedEntity?.interestRate ?? 2.3;
        const fng = this.selectedEntity?.fngRate ?? 0;
        const insurance = this.selectedEntity?.lifeInsuranceValue ?? 0.1126;

        return calculateMaxLoan(
            this.dailyBudget * 30,
            this.initialPayment,
            36,
            interest,
            fng,
            insurance
        );
    }
}

async function testAsync(name: string, fn: () => Promise<void>) {
    try {
        await fn();
        console.log(`  ✓ ${name} - PASSED`);
    } catch (error) {
        console.error(`  ✗ ${name} - FAILED`);
        throw error;
    }
}

describe('Dynamic UI State Hook & Firestore Async Simulation', () => {
    testAsync('Simulación de carga asíncrona de Firestore (3000ms) y recalculo sobre 36 meses', async () => {
        const sim = new ComponentSimulation();

        // 1. Estado Inicial: Simulación de carga asíncrona activa (selectedEntity = null)
        if (sim.calculation !== null) {
            throw new Error('El cálculo inicial debe ser null cuando selectedEntity es null');
        }
        console.log('    [PASO 1] Cálculo inicial verificado como null (Cargando...).');

        // 2. Simulación de retardo de red de Firestore de 3000ms
        console.log('    [PASO 2] Simulando retardo de red de Firestore (3000ms)...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 3. Fase Carga: Inyección asíncrona de Brilla
        const brillaEntity = {
            id: 'brilla',
            interestRate: 2.2,
            fngRate: 15.0,
            lifeInsuranceValue: 0.12
        };
        sim.setEntity(brillaEntity);
        sim.setDailyBudget(20000); // Presupuesto mensual: 600,000 COP

        let res = sim.calculation;
        if (!res) throw new Error('El cálculo no debería ser null tras inyectar Brilla');
        
        console.log(`    [PASO 3] Brilla - Cupo máximo calculado: ${res.maxLoanAmount} COP`);
        if (res.maxLoanAmount <= 10000000) {
            throw new Error(`Se esperaba que el cupo de Brilla superara los 10,000,000 COP, obtenido: ${res.maxLoanAmount}`);
        }

        // Validación matemática rigurosa para plazo de 36 meses (Brilla)
        const amortFactorBrilla = (0.022 * Math.pow(1.022, 36)) / (Math.pow(1.022, 36) - 1);
        const expectedTotalLoanBrilla = 600000 / (amortFactorBrilla + 0.0012);
        const expectedNetLoanBrilla = expectedTotalLoanBrilla / 1.15;
        const diffBrilla = Math.abs(res.maxLoanAmount - expectedNetLoanBrilla);
        if (diffBrilla > 1) {
            throw new Error(`Recálculo de Brilla incorrecto para plazo de 36 meses. Esperado: ${expectedNetLoanBrilla}, obtenido: ${res.maxLoanAmount}`);
        }
        console.log('    [PASO 3] Plazo de 36 meses y amortización validados con precisión para Brilla.');

        // 4. Cambio Concurrente / Ráfaga: Inyección asíncrona de Banco de Bogotá (tasas FNG e IVA en 0)
        const bogotaEntity = {
            id: 'bogota',
            interestRate: 2.3,
            fngRate: 0,
            lifeInsuranceValue: 0
        };
        sim.setEntity(bogotaEntity);
        sim.setDailyBudget(16000); // Ráfaga de cambio de presupuesto a 16000 diario -> 480000 mensual

        res = sim.calculation;
        if (!res) throw new Error('El cálculo no debería ser null tras inyectar Banco de Bogotá');
        
        console.log(`    [PASO 4] Banco de Bogotá - Cupo máximo calculado: ${res.maxLoanAmount} COP`);
        if (res.maxLoanAmount <= 10000000) {
            throw new Error(`Se esperaba que el cupo de Banco de Bogotá superara los 10,000,000 COP, obtenido: ${res.maxLoanAmount}`);
        }

        // Validación de Plazo E2E y recalculo para Banco de Bogotá (36 meses)
        const amortFactorBogota = (0.023 * Math.pow(1.023, 36)) / (Math.pow(1.023, 36) - 1);
        const expectedNetLoanBogota = 480000 / amortFactorBogota;
        const diffBogota = Math.abs(res.maxLoanAmount - expectedNetLoanBogota);
        if (diffBogota > 1) {
            throw new Error(`Recálculo de Banco de Bogotá incorrecto para plazo de 36 meses. Esperado: ${expectedNetLoanBogota}, obtenido: ${res.maxLoanAmount}`);
        }
        console.log('    [PASO 4] Plazo de 36 meses y amortización validados con precisión para Banco de Bogotá.');
    });
});
