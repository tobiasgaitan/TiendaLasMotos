import { Moto, City, SoatRate, FinancialEntity, FinancialMatrix } from "@/types";

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
    downPaymentInput: number = 0,
    financialMatrix?: FinancialMatrix
): QuoteResult => {
    // 1. Fallback Rule: If no displacement, use 150cc
    const displacement = moto.displacement || 150;
    const price = moto.precio;
    const specialAdjustment = moto.specialAdjustment || 0;

    // --- NEW MATRIX LOGIC ---
    // If matrix is missing, return 0 costs (safety fallback)
    let soatPrice = 0;
    let registrationPrice = 0; // "Matrícula" value
    let isElectric = moto.category === 'electrica';
    let isMotocarro = moto.category === 'motocarro';

    if (financialMatrix) {
        // Priority: Category > Displacement
        let rowId = '';

        if (isElectric) {
            rowId = 'electrical';
        } else if (isMotocarro) {
            rowId = 'motocarro';
        } else {
            // Displacement Logic
            if (displacement < 100) rowId = '0-99';
            else if (displacement < 125) rowId = '100-124';
            else if (displacement <= 200) rowId = '125-200';
            else rowId = 'gt-200';
        }

        const row = financialMatrix.rows.find(r => r.id === rowId);

        if (row) {
            soatPrice = row.soatPrice;

            // Determine Registration Cost based on City Context + Payment Method
            // For now, logic is tricky: Frontend passes 'city' object, but matrix has specific columns.
            // Requirement says: "Categoría/Cilindrada" rows have values for:
            // "Crédito (General)", "Crédito Santa Marta", "Contado Envigado", etc.

            // Heuristic for City Context based on City Name (normalization needed)
            const cityName = city.name.toLowerCase().trim();
            const isSantaMarta = cityName.includes('santa marta');
            const isEnvigado = cityName.includes('envigado');
            const isCienaga = cityName.includes('ciénaga') || cityName.includes('cienaga');
            const isZonaBananera = cityName.includes('zona bananera');

            if (paymentMethod === 'credit') {
                if (isSantaMarta) {
                    registrationPrice = row.registrationCreditSantaMarta;
                } else {
                    registrationPrice = row.registrationCreditGeneral;
                }
            } else {
                // CASH
                if (isEnvigado) registrationPrice = row.registrationCashEnvigado;
                else if (isCienaga) registrationPrice = row.registrationCashCienaga;
                else if (isZonaBananera) registrationPrice = row.registrationCashZonaBananera;
                else if (isSantaMarta) registrationPrice = row.registrationCashSantaMarta;
                else {
                    // Fallback for unknown city in Cash mode? 
                    // Probably use General Credit or standard fallback?
                    // User requirements only listed those specific columns. 
                    // Let's assume General Credit value as a safety baseline or 0 if strictly strict.
                    // Let's use Envigado (often cheapest/standard) or just CreditGeneral?
                    // Let's use CreditGeneral as safe fallback if no column matches.
                    registrationPrice = row.registrationCreditGeneral;
                }
            }
        }
    } else {
        // Legacy fallback calculation (if matrix not loaded yet)
        soatPrice = calculateSoat(displacement, soatRates);
        registrationPrice = city.registrationCost?.credit || 0;
    }

    // --- IMPUESTO DE TIMBRE (MOTOCARROS > 125cc) ---
    // Formula: (Precio * 1.5% / 12) * Math.ceil(meses_restantes) + 40000
    // "Meses restantes" usually refers to current year remaining months? 
    // Or is it related to SOAT logic? 
    // Stamp tax is usually annual. 
    // "meses_restantes": Assuming months remaining in current year + 1? 
    // Let's standardly assume months remaining in the current year.
    // e.g., if today is Jan 4, months remaining approx 12?
    // Let's calculate real remaining months.
    let stampTax = 0;
    if (isMotocarro && displacement > 125) {
        const now = new Date();
        const endOfYear = new Date(now.getFullYear(), 11, 31);
        // Calculate months diff
        // Month is 0-indexed. Jan=0. Dec=11.
        // Remainder = 11 - currentMonth + fraction? 
        // Logic says "meses_restantes".
        // Usually, if Jan: 12 months? or 11? 
        // Standard transit logic is pro-rated.
        // Let's use: (12 - currentMonth). e.g. Jan(0) => 12. Feb(1) => 11.
        const remainingMonths = 12 - now.getMonth();
        const roundedMonths = Math.ceil(remainingMonths);

        stampTax = ((price * 0.015) / 12) * roundedMonths + 40000;

        // Add to Registration Price? Or separate? 
        // "Gestor de Matrículas y SOAT" ... "Impuesto de Timbre" is usually part of "Matrícula/Gastos".
        // Let's add it to registrationPrice.
        registrationPrice += stampTax;
    }

    const documentationFee = city.documentationFee || 0;

    // 3. Subtotal (Value of the deal before credit logic)
    const subtotal = price + soatPrice + registrationPrice + documentationFee + specialAdjustment;

    // Credit Logic
    let fngCost = 0;
    let total = subtotal;
    let loanAmount = 0;
    let monthlyPayment = 0;
    let lifeInsuranceValue = 0;
    // ... rest of logic unchanged ... (re-pasting strictly what follows)

    // ... (rest of function body) - wait, I need to match the replacement properly.
    // I will replace the wrapper and initial logic, trusting I can reuse the rest.
    // Actually, to be safe, I should try to replace the whole body or just the top part
    // The previous tool output showed lines 1-144. I want to replace from line 49 to line 66 (approx) 
    // and inject the new logic.

    // Credit Logic Variables

    // Actual Down Payment
    const downPayment = downPaymentInput;
    let movableGuaranteeCost = 0;

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

            // Life Insurance
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
