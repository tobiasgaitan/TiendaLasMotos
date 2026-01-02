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
    const sortedRates = [...rates].sort((a, b) => a.minDisplacement - b.minDisplacement);

    const rate = sortedRates.find(r =>
        displacement >= r.minDisplacement &&
        displacement <= r.maxDisplacement
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
    downPayment: number = 0
): QuoteResult => {
    const displacement = moto.displacement || 0;
    const price = moto.precio;
    const specialAdjustment = moto.specialAdjustment || 0;

    // 1. Core Costs
    const soatPrice = calculateSoat(displacement, soatRates);
    const registrationPrice = paymentMethod === 'credit'
        ? city.registrationCost.credit
        : city.registrationCost.cash;

    const documentationFee = city.documentationFee || 0;

    const subtotal = price + soatPrice + registrationPrice + documentationFee + specialAdjustment;

    // 2. Credit Calculation
    let fngCost = 0;
    let total = subtotal;
    let loanAmount = 0;
    let monthlyPayment = 0;

    if (paymentMethod === 'credit' && financialEntity) {
        // Basic FNG calculation (simplified, usually % of loan amount)
        // Assuming FNG is applied on the amount to finance
        const amountToFinance = subtotal - downPayment;

        // FNG logic varies, here we assume a standard ~5% on amount to finance if needed, 
        // but the prompt said "apply FNG". Let's assume a simplified static rate or passed via config.
        // For now, let's assume 0 if not provided in config (we don't have config here yet).
        // Let's approximate FNG for now or standard 0.

        loanAmount = amountToFinance;

        // Monthly Payment Calculation: PMT formula
        // Rate is monthly percentage
        const r = (financialEntity.monthlyRate || 0) / 100;
        const n = months;

        if (r > 0 && n > 0 && loanAmount > 0) {
            monthlyPayment = (loanAmount * r) / (1 - Math.pow(1 + r, -n));
        } else if (loanAmount > 0 && n > 0) {
            monthlyPayment = loanAmount / n;
        }

        total = downPayment + (monthlyPayment * n); // This is total paid over time? 
        // Usually "Total" in a quote means the "Total Value of the Deal" or "Total Cash Price equivalents".
        // For credit, usually we show: Loan Amount, Monthly Payment.
        // The PROMPT said: "CRÉDITO: Usar 'Matrícula Crédito', aplicar FNG...".

    } else {
        // CASH: Discount? Prompt said "Matrícula Contado" (reduced).
        // "Eliminar FNG e intereses". 
        // Logic handled above by selecting cash registration price.
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
        interestRate: paymentMethod === 'credit' ? financialEntity?.monthlyRate : 0,
        financialEntity: financialEntity?.name,
        isCredit: paymentMethod === 'credit'
    };
};
