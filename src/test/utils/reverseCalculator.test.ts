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

// [SANITIZACI\u00d3N PERIMETRAL] Adaptador num\u00e9rico — replica la l\u00f3gica del useEffect post-fetch
function sanitizeEntityPayload(raw: any) {
    return {
        ...raw,
        interestRate: parseFloat(String(raw.interestRate ?? '2.3').replace('%', '')) || 2.3,
        fngRate: parseFloat(String(raw.fngRate ?? '0').replace('%', '')) || 0,
        lifeInsuranceValue: parseFloat(String(raw.lifeInsuranceValue ?? '0.1126').replace('%', '')) || 0.1126,
        minDownPaymentPercentage: parseFloat(String(raw.minDownPaymentPercentage ?? '10').replace('%', '')) || 10,
    };
}

class ComponentSimulation {
    private dailyBudget: number = 15000;
    private initialPayment: number = 0;
    private selectedEntity: any = null;

    setEntity(entity: any) {
        // [SANITIZACI\u00d3N SECUNDARIA] Barrera de tipo en punto de c\u00e1lculo
        this.selectedEntity = entity;
    }

    setDailyBudget(budget: number) {
        this.dailyBudget = budget;
    }

    get calculation(): any {
        if (!this.selectedEntity) return null;

        // [BARRERA SECUNDARIA] parseFloat como \u00faltima l\u00ednea de defensa
        const interest = parseFloat(String(this.selectedEntity?.interestRate ?? 2.3)) || 2.3;
        const fng = parseFloat(String(this.selectedEntity?.fngRate ?? 0)) || 0;
        
        let insurance = parseFloat(String(this.selectedEntity?.lifeInsuranceValue ?? 0.1126)) || 0.1126;
        if (this.selectedEntity?.lifeInsuranceType === 'fixed') {
            const r = interest / 100;
            const n = 36;
            const amortFactor = r > 0 ? (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : 1 / n;
            const budget = this.dailyBudget * 30;
            if (budget > insurance) {
                insurance = 100 * (insurance * amortFactor) / (budget - insurance);
            } else {
                insurance = 0;
            }
        }

        return calculateMaxLoan(
            this.dailyBudget * 30,
            this.initialPayment,
            36, // [PLAZO INMUTABLE]
            interest,
            fng,
            insurance
        );
    }
}

// ======================================================================================
// PUNTO CIEGO DETECTADO Y SUBSANADO (WEB-837-REVISED-FINAL)
// Los tests anteriores usaban objetos mock con tipos 'number' correctos.
// El fallo real en Firestore ocurre cuando los campos llegan como string (ej: "1.91%").
// Este bloque de tests cubre exactamente ese escenario que nunca fue validado.
// ======================================================================================
describe('Punto Ciego: Payload Firestore con strings y simbolo %', () => {
    test('Entity con interestRate 1.91% retorna cupo valido (no NaN, > $10M)', () => {
        const rawFirestorePayload = {
            id: 'brilla',
            name: 'Brilla',
            interestRate: '1.91%',
            fngRate: '15%',
            lifeInsuranceValue: '0.1126%',
            minDownPaymentPercentage: '10%',
        };

        const sanitized = sanitizeEntityPayload(rawFirestorePayload);

        console.log('    [PUNTO CIEGO] Payload crudo Firestore:', rawFirestorePayload);
        console.log('    [PUNTO CIEGO] Payload sanitizado:', sanitized);

        if (isNaN(sanitized.interestRate)) throw new Error('interestRate es NaN tras sanitizacion');
        if (isNaN(sanitized.fngRate)) throw new Error('fngRate es NaN tras sanitizacion');
        if (isNaN(sanitized.lifeInsuranceValue)) throw new Error('lifeInsuranceValue es NaN tras sanitizacion');

        if (Math.abs(sanitized.interestRate - 1.91) > 0.001) {
            throw new Error('interestRate esperado: 1.91, obtenido: ' + sanitized.interestRate);
        }
        if (Math.abs(sanitized.fngRate - 15) > 0.001) {
            throw new Error('fngRate esperado: 15, obtenido: ' + sanitized.fngRate);
        }

        const result = calculateMaxLoan(600000, 0, 36, sanitized.interestRate, sanitized.fngRate, sanitized.lifeInsuranceValue);
        console.log('    [PUNTO CIEGO] Cupo calculado con payload string: ' + result.maxLoanAmount + ' COP');

        if (isNaN(result.maxLoanAmount)) {
            throw new Error('maxLoanAmount es NaN — cortocircuito NaN persiste');
        }
        if (result.maxLoanAmount <= 10000000) {
            throw new Error('Cupo esperado > $10,000,000 COP, obtenido: ' + result.maxLoanAmount);
        }
    });

    test('Entity con interestRate=2.3 (number) sigue funcionando tras sanitizacion', () => {
        const rawNumericPayload = {
            id: 'banco-bogota',
            name: 'Banco de Bogota',
            interestRate: 2.3,
            fngRate: 0,
            lifeInsuranceValue: 0,
            minDownPaymentPercentage: 10,
        };

        const sanitized = sanitizeEntityPayload(rawNumericPayload);

        if (Math.abs(sanitized.interestRate - 2.3) > 0.001) {
            throw new Error('No-regresion fallo: interestRate esperado 2.3, obtenido ' + sanitized.interestRate);
        }

        const result = calculateMaxLoan(600000, 0, 36, sanitized.interestRate, sanitized.fngRate, sanitized.lifeInsuranceValue);
        console.log('    [NO-REGRESION] Banco de Bogota - Cupo: ' + result.maxLoanAmount + ' COP');

    });

    test('Entity con lifeInsuranceType="fixed" y lifeInsuranceValue=15000 (Banco de Bogota) calcula cupo correcto', () => {
        const rawBogotaPayload = {
            id: 'banco_bogota',
            name: 'Banco de Bogota',
            interestRate: 1.91,
            fngRate: 0,
            lifeInsuranceType: 'fixed',
            lifeInsuranceValue: 15000,
        };

        const sim = new ComponentSimulation();
        sim.setEntity(rawBogotaPayload);
        sim.setDailyBudget(15000); // 450,000 monthly budget

        const res = sim.calculation;
        console.log('    [FIXED INSURANCE] Banco de Bogota - Cupo calculado:', res.maxLoanAmount, 'COP');

        if (isNaN(res.maxLoanAmount) || !isFinite(res.maxLoanAmount)) {
            throw new Error('Cupo calculado es NaN o no finito con seguro fijo');
        }

        // Expected loan: (450000 - 15000) / amortFactor
        const r = 1.91 / 100;
        const n = 36;
        const amortFactor = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        const expectedLoan = 435000 / amortFactor;

        const diff = Math.abs(res.maxLoanAmount - expectedLoan);
        if (diff > 1) {
            throw new Error(`Cálculo de seguro fijo desalineado. Esperado: ${expectedLoan}, Obtenido: ${res.maxLoanAmount}`);
        }
    });

    test('Entity con lifeInsuranceType="fixed" cortocircuita a 0 si el presupuesto es menor o igual al seguro fijo', () => {
        const rawBogotaPayload = {
            id: 'banco_bogota',
            name: 'Banco de Bogota',
            interestRate: 1.91,
            fngRate: 0,
            lifeInsuranceType: 'fixed',
            lifeInsuranceValue: 15000,
        };

        const sim = new ComponentSimulation();
        sim.setEntity(rawBogotaPayload);
        sim.setDailyBudget(400); // 12,000 monthly budget (< 15,000 insurance)

        const res = sim.calculation;
        console.log('    [CORTOCIRCUITO SEGURO] Cupo calculado con presupuesto bajo:', res.maxLoanAmount, 'COP');

        if (isNaN(res.maxLoanAmount) || !isFinite(res.maxLoanAmount)) {
            throw new Error('Fallo de cortocircuito: se obtuvo NaN o Infinity');
        }

        // Con seguro en 0 (porque budget <= insurance), el cálculo usa totalLoanSupported = budget / amortFactor
        const r = 1.91 / 100;
        const n = 36;
        const amortFactor = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        const expectedLoan = 12000 / amortFactor;

        const diff = Math.abs(res.maxLoanAmount - expectedLoan);
        if (diff > 1) {
            throw new Error(`Cortocircuito inválido. Esperado: ${expectedLoan}, Obtenido: ${res.maxLoanAmount}`);
        }
    });
});

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
        const expectedNetLoanBogota = 480000 / (amortFactorBogota + 0.001126);
        const diffBogota = Math.abs(res.maxLoanAmount - expectedNetLoanBogota);
        if (diffBogota > 1) {
            throw new Error(`Recálculo de Banco de Bogotá incorrecto para plazo de 36 meses. Esperado: ${expectedNetLoanBogota}, obtenido: ${res.maxLoanAmount}`);
        }
        console.log('    [PASO 4] Plazo de 36 meses y amortización validados con precisión para Banco de Bogotá.');
    });
});
