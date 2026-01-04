import { Moto, City, SoatRate, FinancialEntity } from "@/types";

export interface QuoteResult {
    vehiclePrice: number;
    soatPrice: number;
    registrationPrice: number;
    documentationFee: number;
    specialAdjustment: number;
    subtotal: number; // Before credit specific costs
    total: number;
    // Credit specific
    downPayment: number;
    loanAmount: number;
    fngCost: number;
    lifeInsuranceValue: number;
    movableGuaranteeCost: number;
    monthlyPayment?: number;
    months?: number;
    interestRate?: number;
    financialEntity?: string;
    isCredit: boolean;
}

/**
 * Finds the applicable SOAT rate based on displacement
 */
export const calculateSoat = (displacement: number, rates: SoatRate[]): number => {
    if (!rates || rates.length === 0) return 0;

    // Sort by min displacement to find the correct range
    const sortedRates = [...rates].sort((a, b) => (a.minDisplacement || 0) - (b.minDisplacement || 0));

    const rate = sortedRates.find(r =>
        displacement >= (r.minDisplacement || 0) &&
        displacement <= (r.maxDisplacement || 99999)
    );

    return rate ? rate.price : 0;
};

/**
 * Calculates a full quote
 */
export const calculateQuote = (
    moto: Moto,
    city: City,
    soatRates: SoatRate[],
    paymentMethod: 'credit' | 'cash',
    financialEntity?: FinancialEntity,
    months: number = 48,
    downPaymentInput: number = 0
): QuoteResult => {
    // 1. Fallback Rule: If no displacement, use 150cc
    const displacement = moto.displacement || 150;
    const price = moto.precio;
    const specialAdjustment = moto.specialAdjustment || 0;

    // 2. Core Costs
    const soatPrice = calculateSoat(displacement, soatRates);

    const registrationPrice = city.registrationCost.credit; // Defaulting to credit/standard cost as Cash field was removed

    const documentationFee = city.documentationFee || 0;

    // 3. Subtotal (Value of the deal before credit logic)
    const subtotal = price + soatPrice + registrationPrice + documentationFee + specialAdjustment;

    // Credit Logic
    let fngCost = 0;
    let total = subtotal;
    let loanAmount = 0;
    let monthlyPayment = 0;
    let lifeInsuranceValue = 0;
    let movableGuaranteeCost = 0;

    // Actual Down Payment (Default handled in UI, logic here treats input as authoritative)
    const downPayment = downPaymentInput;

    if (paymentMethod === 'credit' && financialEntity) {
        // Defined Constants
        const LIFE_INSURANCE_RATE = 0.1126 / 100; // 0.1126% Mes vencido sobre saldo
        const MOVABLE_GUARANTEE_COST = 120000; // $120.000 Fixed

        // Values to Finance
        movableGuaranteeCost = MOVABLE_GUARANTEE_COST;
        const baseAmountToFinance = subtotal - downPayment;

        // Guarantee is usually added to the loan amount or paid upfront? 
        // Prompt says: "se suma al capital inicial financiado".
        loanAmount = baseAmountToFinance + movableGuaranteeCost;

        // Monthly Payment Calculation with Life Insurance (PMT + Insurance)
        // Rate is monthly percentage
        const effectiveRate = financialEntity.interestRate || financialEntity.monthlyRate || 0;
        const r = effectiveRate / 100;
        const n = months;

        if (loanAmount > 0 && n > 0) {
            // Base Amortization Payment
            let basePmt = 0;
            if (r > 0) {
                basePmt = (loanAmount * r) / (1 - Math.pow(1 + r, -n));
            } else {
                basePmt = loanAmount / n;
            }

            // Life Insurance: Usually calculated on average balance or initial balance?
            // "Calculado sobre el saldo". Because it's a fixed quota, we usually approximate it 
            // average balance * rate OR calculate it in the amortization schedule.
            // For a simple calculator, we typically add (LoanAmount * Rate). 
            // OR (Standard method: Add to quota).
            // Let's assume standard banking approximation: Initial Balance * Rate
            // BETTER: Average Balance method -> (LoanAmount / 2) * Rate? 
            // Let's just use LoanAmount * Rate for conservative estimate (common in simplified simulators).
            lifeInsuranceValue = loanAmount * LIFE_INSURANCE_RATE;

            monthlyPayment = basePmt + lifeInsuranceValue;
        }

        total = downPayment + (monthlyPayment * n);

    }

    return {
        vehiclePrice: price,
        soatPrice,
        registrationPrice,
        documentationFee,
        specialAdjustment,
        subtotal,
        total,
        downPayment,
        loanAmount,
        fngCost,
        monthlyPayment: paymentMethod === 'credit' ? monthlyPayment : 0,
        months: paymentMethod === 'credit' ? months : 0,
        interestRate: paymentMethod === 'credit' ? (financialEntity?.interestRate || financialEntity?.monthlyRate) : 0,
        financialEntity: financialEntity?.name,
        isCredit: paymentMethod === 'credit',
        lifeInsuranceValue,
        movableGuaranteeCost
    };
};
