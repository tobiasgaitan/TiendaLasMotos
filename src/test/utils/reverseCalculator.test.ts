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
