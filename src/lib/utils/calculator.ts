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
    let fngCost = 0; // Fondo Nacional de Garantías
    let unemploymentInsuranceCost = 0; // Seguro Desempleo
    let vGestion = 0; // [NEW] Valor Gestión (Brilla)
    let vCobertura = 0; // [NEW] Valor Cobertura (Brilla)

    if (paymentMethod === 'credit') {
        const entity = financialEntity;

        // --- 1. Base Logic & Variables ---
        // 'subtotal' currently includes registrationPrice.
        const assetPrice = price + specialAdjustment;
        const docsTotal = registrationPrice + documentationFee;

        // "Financiar Trámites": If true, we add docsTotal to the Base Capital
        const includeDocs = entity?.includeDocsInCapital ?? true; // Default true if legacy

        // --- 2. Calculate BASE Capital (P_base) ---
        // P_base = (Moto - CuotaInicial) + [Docs] + [FixedCharges]
        let capitalBase = assetPrice - downPaymentInput;

        if (includeDocs) {
            capitalBase += docsTotal;
        }

        // Movable Guarantee ($120,000 fixed)
        const MOVABLE_GUARANTEE_COST = 120000;
        movableGuaranteeCost = MOVABLE_GUARANTEE_COST;

        capitalBase += movableGuaranteeCost;

        // --- 3. Calculate FNG (Fondo Nacional de Garantías) ---
        // FNG is usually % of the financed amount.
        // Assuming FNG is part of the Base before Admin Fees or calculated on this base.
        // Standard: FNG adds to the capital.
        if (entity?.fngRate && entity.fngRate > 0) {
            fngCost = Math.round(capitalBase * (entity.fngRate / 100));
            capitalBase += fngCost;
        }

        // --- 4. Special "Administrative" Layers (Brilla Model) ---

        // A. Gestión Crédito (V_gestion)
        // Formula: (Precio Moto + Trámites Matriz) * Factor Gestión
        // Note: Trámites Matriz is 'registrationPrice'. 'documentationFee' is extra?
        // Let's use (assetPrice + docsTotal) as the base for this, as per "Precio Moto + Trámites Matriz"
        // If brillaManagementRate is 0, this is 0.
        // let vGestion = 0; // Already declared above
        if (entity?.brillaManagementRate && entity.brillaManagementRate > 0) {
            const baseForGestion = assetPrice + docsTotal;
            vGestion = Math.round(baseForGestion * (entity.brillaManagementRate / 100));
        }

        // B. Cobertura de Acceso (V_cobertura)
        // Formula: Precio Moto * Factor Cobertura
        // let vCobertura = 0; // Already declared above
        if (entity?.coverageRate && entity.coverageRate > 0) {
            vCobertura = Math.round(assetPrice * (entity.coverageRate / 100));
        }

        // --- 5. Final Capital (P_final) ---
        // P_final = P_base + V_gestion + V_cobertura
        const pFinal = capitalBase + vGestion + vCobertura;

        // Loan Amount is P_final
        loanAmount = pFinal;

        // --- 6. Life Insurance ---
        // Calculated on the GRAND TOTAL (loanAmount / P_final).
        const insuranceType = entity?.lifeInsuranceType || 'percentage';
        const insuranceVal = entity?.lifeInsuranceValue ?? 0.1126;

        if (insuranceType === 'fixed_per_million') {
            // Factor/Million (e.g. 800 per M)
            const millions = loanAmount / 1000000;
            lifeInsuranceValue = Math.ceil(millions * insuranceVal);
        } else {
            // Percentage (e.g. 0.1126%)
            const rate = insuranceVal / 100;
            lifeInsuranceValue = Math.round(loanAmount * rate);
        }

        // --- 7. Unemployment Insurance (Mensual) ---
        if (entity?.unemploymentInsuranceValue && entity.unemploymentInsuranceValue > 0) {
            if (entity.unemploymentInsuranceType === 'percentage_monthly') {
                const uRate = entity.unemploymentInsuranceValue / 100;
                unemploymentInsuranceCost = Math.round(loanAmount * uRate);
            } else {
                // Fixed Value
                unemploymentInsuranceCost = entity.unemploymentInsuranceValue;
            }
        }

        // --- 6. Amortization (PMT) ---
        const effectiveRate = entity?.interestRate || entity?.monthlyRate || 2.5;
        const r = effectiveRate / 100;
        const n = months;

        if (loanAmount > 0 && n > 0) {
            let basePmt = 0;
            if (r > 0) {
                basePmt = (loanAmount * r) / (1 - Math.pow(1 + r, -n));
            } else {
                basePmt = loanAmount / n;
            }

            // Total Monthly Payment = Amortization + Life Insurance + Unemployment
            monthlyPayment = Math.round(basePmt + lifeInsuranceValue + unemploymentInsuranceCost);
        }

        // Total Cost for User
        total = downPaymentInput + (monthlyPayment * n);

        // If Docs NOT financed, user implies paying them upfront?
        // Standard logic: Total = DownPayment + (Installments).
        // If docs are separate (Cash), they should be added to the "Upfront Payment".
        // But 'total' usually reflects the Credit Projection.
        // We will leave 'total' as the Financed Deal Total.
        // However, 'QuoteResult.subtotal' remains the Project Cost.
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
        lifeInsuranceValue, // Now correctly calculated based on type
        movableGuaranteeCost,
        unemploymentInsuranceCost, // NEW
        vGestion: paymentMethod === 'credit' ? vGestion : 0,
        vCobertura: paymentMethod === 'credit' ? vCobertura : 0,
        monthlyPayment: paymentMethod === 'credit' ? monthlyPayment : 0,

        months: paymentMethod === 'credit' ? months : 0,
        interestRate: paymentMethod === 'credit' ? (financialEntity?.interestRate || 0) : 0,
        financialEntity: financialEntity?.name,
        isCredit: paymentMethod === 'credit'
    };
};
