import { Moto, City, SoatRate, FinancialEntity, FinancialMatrix, MatrixRow } from "@/types";
import { CATEGORIES_OFFICIAL } from "@/lib/constants";

export interface QuoteResult {
    vehiclePrice: number;
    soatPrice: number;
    registrationPrice: number;
    documentationFee: number;
    specialAdjustment: number;
    subtotal: number; // Total Deal Value (Price + Docs)
    total: number;
    // Credit specific
    downPayment: number;
    loanAmount: number; // Total Financed ($P$)
    // Charges Breakdown
    fngCost: number;
    lifeInsuranceValue: number;
    movableGuaranteeCost: number;
    unemploymentInsuranceCost: number; // [NEW] Seg. Desempleo
    vGestion?: number; // [NEW] Valor Gestión (Brilla)
    vCobertura?: number; // [NEW] Valor Cobertura (Brilla)
    coverageMonthlyComponent?: number; // [NEW] Portion of V_cobertura in monthly payment (1-12)

    monthlyPayment?: number;
    months?: number;
    interestRate?: number;
    financialEntity?: string;
    isCredit: boolean;
    matchIdentifier?: string; // [NEW] Traceability
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

const CREDIORBE_FACTORS: Record<number, number> = {
    12: 0.15520,
    24: 0.09628,
    36: 0.07813,
    48: 0.07005,
    60: 0.06588,
    72: 0.06356
};

/**
 * Calculates a full quote with Matrix Logic and Layered Capitalization.
 * 
 * Implements "Layered Capitalization" logic:
 * 1. Base Capital = (Price + SpecialAdj) - DownPayment + [Docs if financed] + [Movable Guarantee] + [FNG]
 * 2. Administrative Layers (Brilla):
 *    - vGestion: % on (Price + Docs)
 *    - vCobertura: % on Price
 * 3. Final Loan Amount (P_final) = Base Capital + vGestion + vCobertura
 * 
 * @param moto - Moto object containing price and displacement.
 * @param city - City object for context.
 * @param soatRates - Array of SOAT rates.
 * @param paymentMethod - 'credit' or 'cash'.
 * @param financialEntity - Configuration of the selected financial entity.
 * @param months - Term in months.
 * @param downPaymentInput - Initial down payment amount.
 * @param financialMatrix - Matrix configuration for documentation fees.
 * @returns QuoteResult object with full breakdown.
 */
export const calculateQuote = (
    moto: Moto,
    city: City,
    soatRates: SoatRate[],
    paymentMethod: 'credit' | 'cash',
    financialEntity?: FinancialEntity,
    months: number = 48,
    downPaymentInput: number = 0,
    financialMatrix?: FinancialMatrix,
    isExempt: boolean = false
): QuoteResult => {
    // 1. Determine Input Variables & Matrix Price
    let displacement = 0;
    if (moto.displacement) {
        if (typeof moto.displacement === 'number') {
            displacement = moto.displacement;
        } else {
            // Parsing Logic: "124,8 cm3" -> 124.8
            let raw = String(moto.displacement).toLowerCase();
            raw = raw.replace(/cc|cm3|cm|c\.c\.|l/g, '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
            displacement = parseFloat(raw) || 0;
        }
    }
    const price = moto.precio;
    const specialAdjustment = moto.specialAdjustment || 0;
    let registrationPrice = 0;
    let matchIdentifier = 'NO_MATRIX';

        // --- Matrix Lookup Logic (Strict & Filtered) ---
        if (financialMatrix && Array.isArray(financialMatrix.rows)) {
            let contextKey: keyof MatrixRow = 'registrationCredit';

            // Unificado: Crédito o Contado
            if (paymentMethod === 'credit') {
                contextKey = 'registrationCredit';
            } else {
                contextKey = 'registrationCash';
            }

            // Category Matching
            let categoriesToCheck = (moto.categories?.length)
                ? moto.categories
                : (moto.category ? [moto.category] : ["URBANA Y/O TRABAJO"]);

            let bestMatch: MatrixRow | undefined;
            let foundSpecific = false;

            // 1. Try to find a Specific Category Match
            // We iterate through moto categories and check if any row in matrix matches EXACTLY
            for (const catRaw of categoriesToCheck) {
                const cat = catRaw.trim().toUpperCase();
                const specificMatch = financialMatrix.rows.find(r => r.category && r.category.toUpperCase() === cat);

                if (specificMatch) {
                    bestMatch = specificMatch;
                    foundSpecific = true;
                    break; // Stop if we find a specific category match (Priority 1)
                }
            }

            // 2. Generic Displacement Match (Fallback) ONLY if no specific match found
            if (!foundSpecific) {
                // [FIX] Strict Filter: We only look for rows that DO NOT have a specific category 
                // OR have category explicitly set to 'GENERAL'.
                const validGenericRows = financialMatrix.rows.filter(r =>
                    !r.category || r.category.toUpperCase() === 'GENERAL'
                );

                // [FIX] Best Fit Algorithm:
                // Filter rows where displacement >= minCC.
                // Sort by minCC DESCENDING. Pick the first one.
                // This handles "gaps" by snapping to the closest lower bound that covers it (effectively "Floor" logic for brackets).

                const candidates = validGenericRows.filter(r => displacement >= (r.minCC || 0));
                // Sort by minCC desc
                candidates.sort((a, b) => (b.minCC || 0) - (a.minCC || 0));

                if (candidates.length > 0) {
                    bestMatch = candidates[0];
                }
            }

            // Apply Value if Match Found
            if (bestMatch) {
                matchIdentifier = bestMatch.id; // Capture ID
                const val = (bestMatch as any)[contextKey] as number;
                if (typeof val === 'number') {
                    registrationPrice = val;
                }
            }
        }

    // [Legacy Fallback REMOVED] - 
    // if (registrationPrice === 0) registrationPrice = city.registrationCost?.credit || 0; 

    // Timbre Tax
    if (displacement > 125 && paymentMethod === 'cash') {
        const now = new Date();
        const remainingMonths = 12 - now.getMonth();
        registrationPrice += ((price * 0.015) / 12) * remainingMonths + 40000;
    }

    // --- MANUAL OVERRIDE (EXEMPTION) ---
    if (isExempt) {
        registrationPrice = 0;
        matchIdentifier = 'Exento Manual (Check Activo)';
    }

    const documentationFee = city.documentationFee || 0;
    const subtotal = price + registrationPrice + documentationFee + specialAdjustment;

    // --- CREDIT CALCULATIONS (CASCADE LOGIC) ---
    let total = subtotal;
    let loanAmount = 0;
    let monthlyPayment = 0;
    let lifeInsuranceValue = 0;
    let movableGuaranteeCost = 0;
    let fngCost = 0;
    let unemploymentInsuranceCost = 0;
    let vGestion = 0;
    let vCobertura = 0;
    let coverageMonthlyComponent = 0; // Calculated if Coverage > 0

    if (paymentMethod === 'credit') {
        const entity = financialEntity;
        const assetPrice = price + specialAdjustment;
        const docsTotal = registrationPrice + documentationFee;
        const financeDocs = entity?.financeDocsAndSoat ?? entity?.includeDocsInCapital ?? true; // Support new and legacy flag

        const isCrediorbe = entity?.name?.toLowerCase().includes('crediorbe') || false;

        if (isCrediorbe) {
            // [OVERRIDE ESTATICO] Modelo de Factor Estático para Crediorbe
            // Promedio exacto derivado para alineación de matriz de riesgo.
            const netAmount = assetPrice - downPaymentInput;
            // Provide fallback factor 0 if month is not in dictionary to avoid NaN
            const factor = CREDIORBE_FACTORS[months] || 0;
            monthlyPayment = Math.round(netAmount * factor);

            // Nullify dynamic layers for strict factor logic
            fngCost = 0;
            vGestion = 0;
            vCobertura = 0;
            lifeInsuranceValue = 0;
            unemploymentInsuranceCost = 0;
            coverageMonthlyComponent = 0;
            loanAmount = netAmount;

            total = downPaymentInput + (monthlyPayment * months);

            if (!financeDocs) {
                registrationPrice = 0;
            }
        } else {
            // 1. CAPITAL BASE (P1) calculation
            // Formula: (Moto - CuotaInicial) + [Docs] + [Guarantee] + [FNG]
            let p1_base = assetPrice - downPaymentInput;
            if (financeDocs) {
                p1_base += docsTotal;
            }

            if (entity?.fngRate && entity.fngRate > 0) {
                fngCost = Math.round(p1_base * (entity.fngRate / 100));
                p1_base += fngCost;
            }

            // 2. GESTION (V_gestion)
            if (entity?.brillaManagementRate && entity.brillaManagementRate > 0) {
                vGestion = Math.round(p1_base * (entity.brillaManagementRate / 100));
            }

            // 3. CAPITAL INTERMEDIO (P2)
            const p2_intermediate = p1_base + vGestion;

            // 4. COBERTURA (V_cobertura)
            if (entity?.coverageRate && entity.coverageRate > 0) {
                vCobertura = Math.round(p2_intermediate * (entity.coverageRate / 100));
            }

            // 5. FINAL CAPITAL (P_final)
            const pFinal = p2_intermediate + vCobertura;

            let amortizationPrincipal = p2_intermediate;

            if (vCobertura > 0) {
                coverageMonthlyComponent = Math.round(vCobertura / 12);
            } else {
                amortizationPrincipal = pFinal; 
            }

            loanAmount = pFinal;

            // 6. Insurances (on P_final)
            const rootInsuranceMode = financialMatrix?.life_insurance_mode;
            const rootInsuranceVal = financialMatrix?.life_insurance_monthly;

            if (rootInsuranceMode === 'fixed') {
                lifeInsuranceValue = rootInsuranceVal ?? 15000;
            } else {
                const insuranceVal = entity?.lifeInsuranceValue ?? 0.1126;
                const insuranceMode = entity?.lifeInsuranceType || 'percentage';

                if (insuranceMode === 'fixed') {
                    lifeInsuranceValue = insuranceVal;
                } else if (insuranceMode === 'fixed_per_million') {
                    const millions = loanAmount / 1000000;
                    lifeInsuranceValue = Math.ceil(millions * insuranceVal);
                } else {
                    lifeInsuranceValue = Math.round(loanAmount * (insuranceVal / 100));
                }
            }

            if (entity?.unemploymentInsuranceValue && entity.unemploymentInsuranceValue > 0) {
                if (entity.unemploymentInsuranceType === 'percentage_monthly') {
                    unemploymentInsuranceCost = Math.round(loanAmount * (entity.unemploymentInsuranceValue / 100));
                } else {
                    unemploymentInsuranceCost = entity.unemploymentInsuranceValue;
                }
            }

            // 7. Amortization
            let effectiveRate = entity?.interestRate || 2.5;

            const r = effectiveRate / 100;
            const n = months;
            let basePmt = 0;

            if (n > 0) {
                if (r > 0) basePmt = (amortizationPrincipal * r) / (1 - Math.pow(1 + r, -n));
                else basePmt = amortizationPrincipal / n;
            }

            monthlyPayment = Math.round(basePmt + lifeInsuranceValue + unemploymentInsuranceCost + coverageMonthlyComponent);

            total = downPaymentInput + ((basePmt + lifeInsuranceValue + unemploymentInsuranceCost) * n) + vCobertura;

            if (!financeDocs) {
                registrationPrice = 0;
            }
        }
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
        fngCost,
        lifeInsuranceValue,
        movableGuaranteeCost,
        unemploymentInsuranceCost,
        vGestion: paymentMethod === 'credit' ? vGestion : 0,
        vCobertura: paymentMethod === 'credit' ? vCobertura : 0,
        coverageMonthlyComponent: paymentMethod === 'credit' ? coverageMonthlyComponent : 0,
        monthlyPayment: paymentMethod === 'credit' ? monthlyPayment : 0,
        months: paymentMethod === 'credit' ? months : 0,
        interestRate: paymentMethod === 'credit' ? (financialEntity?.interestRate || 0) : 0,
        financialEntity: financialEntity?.name,
        isCredit: paymentMethod === 'credit',
        matchIdentifier
    };
};
