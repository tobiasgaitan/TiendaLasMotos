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

/**
 * Reverse Calculation for Purchasing Power
 * 
 * @param dailyBudget - User's daily budget (e.g., 10000)
 * @param initialPayment - User's available down payment
 * @param months - Loan term (default 48)
 * @param interestRate - Monthly Interest Rate (NMV) e.g., 2.3
 * @param fngRate - FNG Percentage e.g., 20.66
 * @param insuranceRate - Life Insurance Rate e.g., 0.1126
 *
 * @returns Object with maxLoanAmount and maxBikePrice
 */
export const calculateMaxLoan = (
    dailyBudget: number,
    initialPayment: number,
    months: number = 48,
    interestRate: number = 2.3, // Default if not provided
    fngRate: number = 20.66,    // Default if not provided
    insuranceRate: number = 0.1126 // Default if not provided
) => {
    // 1. Monthly Budget
    const monthlyBudget = dailyBudget * 30;

    // 2. Reverse Annuity Formula
    // PMT = Loan * [ r(1+r)^n ] / [ (1+r)^n - 1 ]
    // Loan = PMT * [ (1+r)^n - 1 ] / [ r(1+r)^n ]

    // Adjust PMT to remove Life Insurance component roughly in reverse
    // Approx: TotalPMT = (Loan * AmortFactor) + (Loan * InsuranceRate)
    // TotalPMT = Loan * (AmortFactor + InsuranceRate)
    // Loan = TotalPMT / (AmortFactor + InsuranceRate)

    const r = interestRate / 100;
    const n = months;

    let amortFactor = 0;
    if (r > 0 && n > 0) {
        amortFactor = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    } else {
        amortFactor = 1 / n;
    }

    const insFactor = insuranceRate / 100;

    // Gross Loan (amount strictly for capital + fees financed)
    const totalLoanSupported = monthlyBudget / (amortFactor + insFactor);

    // 3. Remove FNG
    // TotalLoan = NetLoan + (NetLoan * FngRate)
    // TotalLoan = NetLoan * (1 + FngRate)
    // NetLoan = TotalLoan / (1 + FngRate)

    const fngMultiplier = 1 + (fngRate / 100);
    const netLoanAmount = totalLoanSupported / fngMultiplier;

    // Purchasing Power (Bike Price Capability)
    // Convention: Max Bike Price = Net Loan + Initial Payment
    // *Note: Registration costs are usually separate or part of 'Initial' in this simplified model.
    const maxBikePrice = netLoanAmount + initialPayment;

    return {
        maxLoanAmount: Math.round(netLoanAmount), // This is the bank money for the BIKE
        maxBikePrice: Math.round(maxBikePrice),
        details: {
            monthlyBudget,
            fngCost: Math.round(totalLoanSupported - netLoanAmount)
        }
    };
};
