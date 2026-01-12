/**
 * Reverse Calculator for "Search by Budget" feature.
 * 
 * DESIGN GOAL:
 * Determines the maximum bike price a user can afford based on a DAILY budget.
 * 
 * HARDCODED RULES (Crediorbe Default Profile):
 * - Interest Rate: 1.87% NMV (Monthly)
 * - FNG (Aval): 20.66% applied to the NET Capital (added to loan).
 * - Life Insurance: 0.1126% MV applied to the TOTAL Financed Amount.
 * - Documentation/SOAT: $0 (Not financed).
 * 
 * FORMULA DERIVATION:
 * 1. Target Monthly Payment (TP) = DailyBudget * 30
 * 2. Total Financed Amount (Pf) components in Payment:
 *    - Amortization Payment (PMT_amort) = Pf * [ i / (1 - (1+i)^-n) ]
 *    - Insurance Payment (PMT_ins) = Pf * InsuranceRate
 * 
 *    TP = Pf * (AmortFactor + InsuranceRate)
 *    Pf = TP / (AmortFactor + InsuranceRate)
 * 
 * 3. Relationship between Net Capital (Cn) and Total Financed (Pf):
 *    Pf = Cn + FNG
 *    FNG = Cn * 0.2066
 *    Pf = Cn * (1 + 0.2066)
 *    Cn = Pf / 1.2066
 * 
 * 4. Max Bike Price = Cn (since Docs are 0) + DownPayment
 */

export interface ReverseBudgetResult {
    maxLoanAmount: number; // The Net Capital the bank lends for the bike
    maxBikePrice: number;  // Max Loan + Initial
    totalFinanced: number; // The gross loan (including FNG)
    monthlyPaymentEstimated: number; // Should match target budget closely
}

export const calculateMaxLoan = (
    dailyBudget: number,
    initialPayment: number,
    months: number = 48
): ReverseBudgetResult => {

    // 1. Constants (Crediorbe)
    const INTEREST_RATE = 0.0187; // 1.87%
    const FNG_RATE = 0.2066;      // 20.66%
    const INSURANCE_RATE = 0.001126; // 0.1126%

    // 2. Determine Functional Monthly Budget
    const targetMonthlyPayment = dailyBudget * 30;

    // 3. Calculate Factors
    // Amortization Factor: The cost per $1 unit of loan
    const amortFactor = (INTEREST_RATE) / (1 - Math.pow(1 + INTEREST_RATE, -months));

    // Total Cost Factor per $1 of GROSS loan
    const totalFactor = amortFactor + INSURANCE_RATE;

    // 4. Reverse Solve for Total Financed Amount (Pf)
    // Pf = Target / Factor
    const totalFinanced = Math.floor(targetMonthlyPayment / totalFactor);

    // 5. Reverse Solve for Net Capital (Cn)
    // Pf = Cn * (1 + FNG_RATE)  =>  Cn = Pf / (1 + FNG_RATE)
    const netCapital = Math.floor(totalFinanced / (1 + FNG_RATE));

    // 6. Calculate Max Bike Price
    // Since Docs are $0: Bike Price = Net Capital + Initial
    const maxBikePrice = netCapital + initialPayment;

    return {
        maxLoanAmount: netCapital,
        maxBikePrice: maxBikePrice,
        totalFinanced: totalFinanced,
        monthlyPaymentEstimated: targetMonthlyPayment
    };
};
