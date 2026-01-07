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
    financialMatrix?: FinancialMatrix
): QuoteResult => {
    // 1. Determine Input Variables & Matrix Price
    const displacement = moto.displacement || 150;
    const price = moto.precio;
    const specialAdjustment = moto.specialAdjustment || 0;
    let registrationPrice = 0;

    // --- Matrix Lookup Logic (Simplified for brevity as it was correct in previous view) ---
    // Assuming contextKey logic is preserved or re-implemented here. 
    // To minimize code churn, I will trust the previous context logic was okay, 
    // but I must re-implement it to ensure all variables are available.
    if (financialMatrix) {
        const cityName = city.name.toLowerCase();
        let contextKey: keyof MatrixRow = 'registrationCreditGeneral';
        if (paymentMethod === 'credit') {
            if (cityName.includes('santa marta')) contextKey = 'registrationCreditSantaMarta';
            else contextKey = 'registrationCreditGeneral';
        } else {
            if (cityName.includes('santa marta')) contextKey = 'registrationCashSantaMarta';
            else if (cityName.includes('envigado')) contextKey = 'registrationCashEnvigado';
            else if (cityName.includes('ciénaga') || cityName.includes('cienaga')) contextKey = 'registrationCashCienaga';
            else if (cityName.includes('zona bananera')) contextKey = 'registrationCashZonaBananera';
            else contextKey = 'registrationCreditGeneral';
        }

        // Category Matching
        // [FIX] Ensure valid array of categories to check.
        // Fallback to "URBANA Y/O TRABAJO" (Generic) if no category is present.
        let categoriesToCheck = (moto.categories?.length)
            ? moto.categories
            : (moto.category ? [moto.category] : ["URBANA Y/O TRABAJO"]);

        let maxCost = -1;

        categoriesToCheck.forEach(catRaw => {
            const cat = catRaw.trim().toUpperCase();

            // 1. Specific Category Match
            const specificMatch = financialMatrix.rows.find(r => r.category && r.category.toUpperCase() === cat);

            // 2. Generic Displacement Match (Fallback)
            // [FIX] Relaxed filter: If no specific category match, look for ANY row covering the CC range.
            // valid generic rows might have no category OR be labeled 'General'.
            // We prioritize rows with NO category or 'GENERAL' if multiple exist, but strictly we just want *a* match.
            const genericMatches = financialMatrix.rows.filter(r =>
                r.minCC !== undefined &&
                r.maxCC !== undefined &&
                displacement >= r.minCC &&
                displacement <= r.maxCC
            );

            // Prioritize Specific -> Then Generic
            if (specificMatch) {
                const val = (specificMatch as any)[contextKey] as number;
                if (typeof val === 'number' && val > maxCost) {
                    maxCost = val;
                    registrationPrice = val;
                }
            } else if (genericMatches.length > 0) {
                // If no specific match, verify if any generic match applies
                // We take the one with the highest cost to be safe, or just the first one.
                // let's iterate them.
                genericMatches.forEach(row => {
                    const val = (row as any)[contextKey] as number;
                    if (typeof val === 'number' && val > maxCost) {
                        maxCost = val;
                        registrationPrice = val;
                    }
                });
            }
        });
    }
    if (registrationPrice === 0) registrationPrice = city.registrationCost?.credit || 0; // Fallback

    // Timbre Tax
    if (displacement > 125 && paymentMethod === 'cash') {
        const now = new Date();
        const remainingMonths = 12 - now.getMonth();
        registrationPrice += ((price * 0.015) / 12) * remainingMonths + 40000;
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

        // 1. CAPITAL BASE (P1) calculation
        // Formula: (Moto - CuotaInicial) + [Docs] + [Guarantee] + [FNG]
        // Note: FNG is now requested as "FNG / Otros Seguros (%)" in UI and "Se suma al Capital Base".
        // It is usually a % of the BASE or financed amount. Let's assume % of (Moto + Docs - Down).

        let p1_base = assetPrice - downPaymentInput;
        // [FIX] Docs should be ADDED to base if financed. 
        // Logic: If 'financeDocs' is true, we add docsTotal to the loan principal.
        // If false, user pays docs upfront? Or it's just not part of capital?
        // Usually: P_financed = Price - Down + Docs (if financed).
        if (financeDocs) {
            p1_base += docsTotal;
        }

        // [FIX] Removed static "Phantom" Charge of 120k (MOVABLE_GUARANTEE_COST) as per user request.
        // It should ONLY be applied if explicitly configured in entity parameters if needed.
        // For now, we strictly follow the Entity configuration.

        // FNG Calculation (on the current base)
        if (entity?.fngRate && entity.fngRate > 0) {
            fngCost = Math.round(p1_base * (entity.fngRate / 100));
            p1_base += fngCost;
        }
        if (entity?.fngRate && entity.fngRate > 0) {
            fngCost = Math.round(p1_base * (entity.fngRate / 100));
            p1_base += fngCost;
        }

        // 2. GESTION (V_gestion)
        // Formula: P1 * 5% (or configured rate)
        if (entity?.brillaManagementRate && entity.brillaManagementRate > 0) {
            vGestion = Math.round(p1_base * (entity.brillaManagementRate / 100));
        }

        // 3. CAPITAL INTERMEDIO (P2)
        const p2_intermediate = p1_base + vGestion;

        // 4. COBERTURA (V_cobertura)
        // Formula: P2 * 4% (or configured rate)
        if (entity?.coverageRate && entity.coverageRate > 0) {
            vCobertura = Math.round(p2_intermediate * (entity.coverageRate / 100));
        }

        // 5. FINAL CAPITAL (P_final)
        const pFinal = p2_intermediate + vCobertura;

        // --- PAYMENT LOGIC ---
        // Requirement: Coverage is split in first 12 months.
        // If coverage exists:
        //    Amortization Capital = P2 (Coverage is paid separately)
        //    Coverage Fee = V_cobertura / 12 (max 12 months)
        // Else:
        //    Amortization Capital = P2 (which equals P_final if V_cob is 0)

        // Note: If V_cobertura > 0, we treat it as an Add-on, NOT part of the Amortized Loan Principal,
        // BUT it is part of the Risk/Insurance Base (P_final).

        let amortizationPrincipal = p2_intermediate;

        // If the entity does NOT use the split logic (standard check), then we might amortize P_final.
        // BUT the user prompt implies this is standard for "Brilla" or whenever Configured.
        // We will Apply Split Logic IF vCobertura > 0.

        if (vCobertura > 0) {
            coverageMonthlyComponent = Math.round(vCobertura / 12);
        } else {
            amortizationPrincipal = pFinal; // Should be same as p2 if vCobertura is 0
        }

        loanAmount = pFinal; // For display and insurance calc

        // 6. Insurances (on P_final)
        const insuranceVal = entity?.lifeInsuranceValue ?? 0.1126;
        if (entity?.lifeInsuranceType === 'fixed_per_million') {
            const millions = loanAmount / 1000000;
            lifeInsuranceValue = Math.ceil(millions * insuranceVal);
        } else {
            lifeInsuranceValue = Math.round(loanAmount * (insuranceVal / 100));
        }

        if (entity?.unemploymentInsuranceValue && entity.unemploymentInsuranceValue > 0) {
            if (entity.unemploymentInsuranceType === 'percentage_monthly') {
                unemploymentInsuranceCost = Math.round(loanAmount * (entity.unemploymentInsuranceValue / 100));
            } else {
                unemploymentInsuranceCost = entity.unemploymentInsuranceValue;
            }
        }

        // 7. Amortization
        const effectiveRate = entity?.interestRate || 2.5;
        const r = effectiveRate / 100;
        const n = months;
        let basePmt = 0;

        if (n > 0) {
            if (r > 0) basePmt = (amortizationPrincipal * r) / (1 - Math.pow(1 + r, -n));
            else basePmt = amortizationPrincipal / n;
        }

        // Total Monthly Payment (Month 1-12 View)
        monthlyPayment = Math.round(basePmt + lifeInsuranceValue + unemploymentInsuranceCost + coverageMonthlyComponent);

        // Total Project Cost
        // If Split Logic: DownPayment + (Base+Ins)*months + V_cobertura
        // We approximate total by (monthlyPayment * months) which overestimates if coverage stops at 12.
        // Correct Total = DownPayment + (BasePmt + Ins)*months + V_cobertura
        total = downPaymentInput + ((basePmt + lifeInsuranceValue + unemploymentInsuranceCost) * n) + vCobertura;
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
        isCredit: paymentMethod === 'credit'
    };
};
