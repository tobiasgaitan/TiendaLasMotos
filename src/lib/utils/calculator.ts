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
    let soatPrice = 0;
    let registrationPrice = 0;

    if (financialMatrix) {
        // Determine Context Key (Column in Matrix)
        const cityName = city.name.toLowerCase();
        let contextKey: keyof MatrixRow = 'registrationCreditGeneral'; // Default column field name

        // Map City+Method to MatrixColumn
        // Note: The MatrixRow interface has specific fields like 'registrationCreditSantaMarta', etc.
        // We need to map our inputs to one of these fields.

        if (paymentMethod === 'credit') {
            if (cityName.includes('santa marta')) contextKey = 'registrationCreditSantaMarta';
            else contextKey = 'registrationCreditGeneral';
        } else {
            // Cash
            if (cityName.includes('santa marta')) contextKey = 'registrationCashSantaMarta';
            else if (cityName.includes('envigado')) contextKey = 'registrationCashEnvigado';
            else if (cityName.includes('ciénaga') || cityName.includes('cienaga')) contextKey = 'registrationCashCienaga';
            else if (cityName.includes('zona bananera')) contextKey = 'registrationCashZonaBananera';
            else contextKey = 'registrationCreditGeneral'; // Fallback for unmatched cash cities or use Envigado as generic cash? 
            // Let's use Envigado as generic Cash base if not matched? 
            // Or stick to Credit General as baseline?
            // Given "Contado Envigado" is a specific option, likely the most common.
            // But let's fallback to Credit General to avoid under-charging if unsure?
            // Actually, if I don't match, I should probably use General.
        }

        let maxCost = -1;

        categoriesToCheck.forEach(catRaw => {
            const cat = catRaw.toUpperCase();

            // Find Matching Rows
            // 1. Exact Category Match (High Priority)
            const specificMatch = financialMatrix.rows.find(r => r.category === cat);

            // 2. Generic CC Match (If no specific category on row, or row expects displacement)
            // Note: A row like "0-99" (minCC=0, maxCC=99) applies to ANY category that fits,UNLESS the category has a specific override.
            // If we found a specific match (e.g. Electrical), we usually use it.
            // But if we want "Highest Cost", we should check generic too?
            // E.g. Electric (Cost 100) vs 0-99 (Cost 200). If logic requires Max, we scan all.
            // But Electric usually implies 0 CC or valid CC.
            // Let's check matching generic rows.

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
                // Access dynamic key safely
                const cost = (row as any)[contextKey] as number;
                if (typeof cost === 'number' && cost > maxCost) {
                    maxCost = cost;
                    selectedMatrixRow = row;
                }
            });
        });

        if (selectedMatrixRow) {
            registrationPrice = (selectedMatrixRow as any)[contextKey] || 0;
            soatPrice = selectedMatrixRow.soatPrice;
        }
    }

    // Fallback if Matrix didn't yield result (or matrix missing)
    if (!selectedMatrixRow) {
        soatPrice = calculateSoat(displacement, soatRates);
        registrationPrice = city.registrationCost?.credit || 0;
    }

    // 3. Impuesto de Timbre (Motocarros > 125cc)
    // Formula: (Precio * 1.5% / 12) * Math.ceil(meses_restantes) + 40000
    // Check if any category is 'MOTOCARRO...'
    const isMotocarro = categoriesToCheck.some(c => c && c.toUpperCase().includes("MOTOCARRO"));

    if (isMotocarro && displacement > 125 && paymentMethod === 'cash') {
        const now = new Date();
        // Calculate remaining months including current month? 
        // User formula says "meses_restantes". Typically if we are in Jan, 12 months remain?
        // Let's assume standard tax logic: months from NOW until Dec 31.
        // Jan=12, Feb=11... Dec=1.
        const remainingMonths = 12 - now.getMonth();
        const stampTax = ((price * 0.015) / 12) * remainingMonths + 40000;

        registrationPrice += stampTax;
    }

    const documentationFee = city.documentationFee || 0;

    // 4. Subtotal
    const subtotal = price + soatPrice + registrationPrice + documentationFee + specialAdjustment;

    // 5. Credit Calculations
    let total = subtotal;
    let loanAmount = 0;
    let monthlyPayment = 0;
    let lifeInsuranceValue = 0;
    let movableGuaranteeCost = 0;
    const downPayment = downPaymentInput;

    if (paymentMethod === 'credit') {
        // defined inside or globally
        const LIFE_INSURANCE_RATE = 0.1126 / 100; // 0.1126% MV
        const MOVABLE_GUARANTEE_COST = 120000;

        movableGuaranteeCost = MOVABLE_GUARANTEE_COST;
        const downPayment = downPaymentInput;
        const baseAmountToFinance = subtotal - downPayment;

        loanAmount = baseAmountToFinance + movableGuaranteeCost;

        // Fallback 2.5% if missing or if financialEntity is undefined
        const effectiveRate = financialEntity?.interestRate || financialEntity?.monthlyRate || 2.5;
        const r = effectiveRate / 100;
        const n = months;

        console.log("--- Credit Calculation Debug ---");
        console.log("Moto Price:", price);
        console.log("Registration:", registrationPrice);
        console.log("Soat:", soatPrice);
        console.log("Subtotal (Asset Value):", subtotal);
        console.log("Down Payment:", downPayment);
        console.log("Base Financed (P_base):", baseAmountToFinance);
        console.log("Movable Guarantee:", movableGuaranteeCost);
        console.log("Total Loan Amount (P):", loanAmount);
        console.log("Rate (r):", effectiveRate, "%");
        console.log("Months (n):", n);

        if (loanAmount > 0 && n > 0) {
            let basePmt = 0;
            if (r > 0) {
                basePmt = (loanAmount * r) / (1 - Math.pow(1 + r, -n));
            } else {
                basePmt = loanAmount / n;
            }

            lifeInsuranceValue = loanAmount * LIFE_INSURANCE_RATE;
            monthlyPayment = Math.round(basePmt + lifeInsuranceValue);
            console.log("Base PMT (Amort):", basePmt);
            console.log("Life Insurance:", lifeInsuranceValue);
            console.log("Total Monthly Payment:", monthlyPayment);
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
        fngCost: 0, // Not explicitly calculated here currently? Or part of something else? Keeping 0 as per previous code.
        lifeInsuranceValue,
        movableGuaranteeCost,
        monthlyPayment: paymentMethod === 'credit' ? monthlyPayment : 0,
        months: paymentMethod === 'credit' ? months : 0,
        interestRate: paymentMethod === 'credit' ? (financialEntity?.interestRate || 0) : 0,
        financialEntity: financialEntity?.name,
        isCredit: paymentMethod === 'credit'
    };
};
