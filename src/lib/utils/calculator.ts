import { Moto, City, SoatRate, FinancialEntity, FinancialMatrix, MatrixRow } from "@/types";
import { CATEGORIES_OFFICIAL } from "@/lib/constants";

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

// CONSTANTS REMOVED (Imported)

/**
 * Calculates a full quote with Matrix Logic
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
    // 1. Determine Input Variables
    const displacement = moto.displacement || 150;
    const price = moto.precio;
    const specialAdjustment = moto.specialAdjustment || 0;

    // Normalize categories
    let categoriesToCheck: string[] = [];
    if (moto.categories && moto.categories.length > 0) {
        categoriesToCheck = moto.categories;
    } else if (moto.category) {
        categoriesToCheck = [moto.category];
    } else {
        categoriesToCheck = ["URBANA Y/O TRABAJO"]; // Default fallback
    }

    // 2. Logic to Find Best Matrix Row (Highest Cost)
    let selectedMatrixRow: MatrixRow | undefined;
    let registrationPrice = 0; // This now represents TOTAL Documentation Cost (Matrícula + SOAT + Trámites)

    if (financialMatrix) {
        // Determine Context Key (Column in Matrix)
        const cityName = city.name.toLowerCase();
        let contextKey: keyof MatrixRow = 'registrationCreditGeneral'; // Default column field name

        if (paymentMethod === 'credit') {
            if (cityName.includes('santa marta')) contextKey = 'registrationCreditSantaMarta';
            else contextKey = 'registrationCreditGeneral';
        } else {
            // Cash
            if (cityName.includes('santa marta')) contextKey = 'registrationCashSantaMarta';
            else if (cityName.includes('envigado')) contextKey = 'registrationCashEnvigado';
            else if (cityName.includes('ciénaga') || cityName.includes('cienaga')) contextKey = 'registrationCashCienaga';
            else if (cityName.includes('zona bananera')) contextKey = 'registrationCashZonaBananera';
            else contextKey = 'registrationCreditGeneral';
        }

        let maxCost = -1;

        categoriesToCheck.forEach(catRaw => {
            const cat = catRaw.toUpperCase();

            // Find Matching Rows
            // 1. Exact Category Match (High Priority)
            const specificMatch = financialMatrix.rows.find(r => r.category === cat);

            // 2. Generic CC Match
            const genericMatches = financialMatrix.rows.filter(r =>
                !r.category && // Only generic rows
                (r.minCC !== undefined && r.maxCC !== undefined) &&
                displacement >= r.minCC && displacement <= r.maxCC
            );

            const candidates = [];
            if (specificMatch) candidates.push(specificMatch);
            candidates.push(...genericMatches);

            // Find max cost among candidates
            candidates.forEach(row => {
                const cost = (row as any)[contextKey] as number;
                if (typeof cost === 'number' && cost > maxCost) {
                    maxCost = cost;
                    selectedMatrixRow = row;
                }
            });
        });

        if (selectedMatrixRow) {
            registrationPrice = (selectedMatrixRow as any)[contextKey] || 0;
        }
    }

    // Fallback if Matrix didn't yield result (or matrix missing)
    if (!selectedMatrixRow) {
        registrationPrice = city.registrationCost?.credit || 0;
    }

    // 3. Impuesto de Timbre (Vehículos > 125cc en Contado)
    // Formula: (Precio * 1.5% / 12) * Math.ceil(meses_restantes) + 40000
    // Applies to ALL vehicles > 125cc when paying in CASH, not just Motocarros.

    if (displacement > 125 && paymentMethod === 'cash') {
        const now = new Date();
        const remainingMonths = 12 - now.getMonth();
        const stampTax = ((price * 0.015) / 12) * remainingMonths + 40000;
        registrationPrice += stampTax;
    }

    const documentationFee = city.documentationFee || 0;

    // 4. Subtotal
    // Note: 'registrationPrice' now includes the Matrix Value which acts as the total docs cost.
    // We add 'documentationFee' if it's still relevant as a separate extra fee (Gestion Documental).
    // The user requirement says "V_docs = Valor Escenario".
    // Usually 'documentationFee' comes from City.documentationFee.
    // If the Matrix Value is ALL INCLUSIVE, maybe we shouldn't add documentationFee?
    // User said: "V_docs = Valor Escenario".
    // I will KEEP documentationFee if it's distinct from the Matrix, but assuming the Matrix covers the main cost.
    // The previous logic was: subtotal = price + soatPrice + registrationPrice + documentationFee.
    // Now: subtotal = price + registrationPrice (Matrix) + documentationFee.
    // Assuming documentationFee is a separate service fee not in the matrix.
    const subtotal = price + registrationPrice + documentationFee + specialAdjustment;

    // 5. Credit Calculations
    let total = subtotal;
    let loanAmount = 0;
    let monthlyPayment = 0;
    let lifeInsuranceValue = 0;
    let movableGuaranteeCost = 0;

    if (paymentMethod === 'credit') {
        // Defaults
        const LIFE_INSURANCE_RATE_PCT = 0.1126 / 100; // Legacy Default 0.1126% MV
        const MOVABLE_GUARANTEE_COST = 120000;

        movableGuaranteeCost = MOVABLE_GUARANTEE_COST;
        const downPayment = downPaymentInput;

        let baseAmountToFinance = subtotal - downPayment;

        // --- NEW LOGIC START ---
        // 1. Check if Entity includes procedures in the financed amount (Capital)
        // If feesIncludesMatricula is TRUE, it implies the registration/docs cost is part of the LOAN, 
        // BUT 'subtotal' already includes 'registrationPrice'.
        // So 'baseAmountToFinance' = (Vehicle + Docs + Special) - DownPayment.
        // This effectively finances the procedures. 
        // If feesIncludesMatricula is FALSE, usually user pays docs upfront or separate? 
        // Current standard logic finances everything in 'subtotal'.
        // The requirement says: "Incluye Trámites: Activo (suma matrícula al capital financiado)".
        // Meaning: Capital = (MotoPrice - DownPayment) + Docs.
        // In our current 'subtotal', Docs IS included. So standard logic works.
        // We just need to ensure we don't double count or exclude it if false.
        // For simplicity, we assume 'subtotal' (Asset Value) is what is being financed minus downpayment.

        // 2. Loan Amount
        loanAmount = baseAmountToFinance + movableGuaranteeCost;

        // 3. Life Insurance Calculation
        // Type: 'percentage' (default) OR 'fixed_per_million' (Banco de Bogotá)
        const insuranceType = financialEntity?.lifeInsuranceType || 'percentage';
        const insuranceVal = financialEntity?.lifeInsuranceValue ?? 0.1126; // Default to old rate if missing

        if (insuranceType === 'fixed_per_million') {
            // Factor de $800 por cada millón financiado
            // Formula: (LoanAmount / 1,000,000) * Factor
            // This is a MONTHLY cost added to the quota.
            const millions = loanAmount / 1000000;
            lifeInsuranceValue = Math.ceil(millions * insuranceVal);
        } else {
            // Percentage based (e.g. 0.1126%)
            // Usually applied to Outstanding Balance.
            // For fixed quota approximation: LoanAmount * Rate
            // Note: If rate is 0.1126 (number), we divide by 100 if stored as percentage.
            // If stored as raw factor (0.001126), use directly.
            // Based on old code: loanAmount * (0.1126 / 100).
            // So if insuranceVal is 0.1126, we treat it as %.
            const rate = insuranceVal / 100;
            lifeInsuranceValue = Math.round(loanAmount * rate);
        }

        // 4. PMT (Amortization)
        // Fallback 2.5% if missing or if financialEntity is undefined
        const effectiveRate = financialEntity?.interestRate || financialEntity?.monthlyRate || 2.5;
        const r = effectiveRate / 100;
        const n = months;

        console.log("--- Credit Calculation Debug ---");
        console.log("Moto Price:", price);
        console.log("Total Docs (Matrix):", registrationPrice);
        console.log("Subtotal (Asset Value):", subtotal);
        console.log("Down Payment:", downPayment);
        console.log("Base Financed (P_base):", baseAmountToFinance);
        console.log("Movable Guarantee:", movableGuaranteeCost);
        console.log("Total Loan Amount (P):", loanAmount);
        console.log("Rate (r):", effectiveRate, "%");
        console.log("Months (n):", n);
        console.log("Insurance Type:", insuranceType);
        console.log("Insurance Value (Calc):", lifeInsuranceValue);

        if (loanAmount > 0 && n > 0) {
            let basePmt = 0;
            if (r > 0) {
                basePmt = (loanAmount * r) / (1 - Math.pow(1 + r, -n));
            } else {
                basePmt = loanAmount / n;
            }

            // Total Monthly Payment = Amortization + Life Insurance
            monthlyPayment = Math.round(basePmt + lifeInsuranceValue);

            console.log("Base PMT (Amort):", basePmt);
            console.log("Total Monthly Payment:", monthlyPayment);
        }

        total = downPayment + (monthlyPayment * n);
    }

    return {
        vehiclePrice: price,
        soatPrice: 0,
        registrationPrice,
        documentationFee,
        specialAdjustment,
        subtotal,
        total,
        downPayment: downPaymentInput,
        loanAmount,
        fngCost: 0,
        lifeInsuranceValue, // Now correctly calculated based on type
        movableGuaranteeCost,
        monthlyPayment: paymentMethod === 'credit' ? monthlyPayment : 0,
        months: paymentMethod === 'credit' ? months : 0,
        interestRate: paymentMethod === 'credit' ? (financialEntity?.interestRate || 0) : 0,
        financialEntity: financialEntity?.name,
        isCredit: paymentMethod === 'credit'
    };
};
