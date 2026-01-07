
export interface City {
    id: string;
    name: string;
    department: string;
    registrationCost?: { // @deprecated - Moved to FinancialMatrix
        credit: number;
    };
    documentationFee: number; // Costo gestión documental/tramites
    isActive?: boolean;
}

export interface SoatRate {
    id: string; // e.g. "CC_0_100", "CC_100_200", "CC_200_PLUS"
    category: string; // Descriptive name (e.g. "Ciclomotores")
    minDisplacement?: number;
    maxDisplacement?: number;
    price: number;
    year: number;
}

export interface FinancialEntity {
    id: string;
    name: string;
    interestRate: number; // Monthly interest rate %
    minDownPaymentPercentage: number; // % Cuota inicial minima


    // Legacy/Optional fields
    monthlyRate?: number;
    minMonths?: number;
    maxMonths?: number;
    requiresPledge?: boolean;
    logoUrl?: string;
    active?: boolean;

    // Security & Calculation Config (Updated)
    lifeInsuranceType: 'percentage' | 'fixed_per_million'; // 'percentage' (0.1126%) or 'fixed' ($800 per M)
    lifeInsuranceValue: number; // The rate (e.g. 0.1126) or the value (e.g. 800)

    // Unified Document Financing Flag
    includeDocsInCapital: boolean; // "Financiar Trámites (Matrícula)": If true, adds registrationPrice to Capital

    // New Financial Charges
    fngRate?: number; // % FNG (Fondo Nacional de Garantías)
    unemploymentInsuranceType?: 'percentage_monthly' | 'fixed_monthly';
    unemploymentInsuranceValue?: number; // Rate or Fix Value

    // [NEW] Global Dynamic Rates Flags
    manualOverride?: boolean; // If true, disable auto-update on 1st of month

    // [NEW] Brilla / Special Model Charges
    brillaManagementRate?: number; // % 'Gestión Crédito Brilla' (Calculated on Base + Docs)
    coverageRate?: number; // % 'Cobertura de Acceso' (Calculated on Moto Price)

    // Deprecated
    feesIncludesMatricula?: boolean;
    requiresProceduresInCredit?: boolean;
    minAge?: number;
    maxAge?: number;
}

export interface FinancialConfig {
    fngRate: number; // Fondo Nacional de Garantías % (e.g. 5.5%)
    defaultMonths: number;
    baseInterestRate: number;
}

export interface MatrixRow {
    id: string; // e.g. "0-99", "electrical"
    label: string; // "0 - 99 cc", "Eléctrica"
    category?: string; // e.g. "ELECTRICA", "MOTOCARRO" (Exact match)
    minCC?: number; // For displacement based rows
    maxCC?: number; // For displacement based rows
    // soatPrice removed as per requirement - Costs are now totalized in context columns
    // Costs per city/region context (using a record for flexibility or fixed keys if known)
    // We will use specific keys as per requirements: 
    // creditGeneral, creditSantaMarta, cashEnvigado, cashCienaga, cashZonaBananera, cashSantaMarta
    registrationCreditGeneral: number;
    registrationCashSantaMarta: number;
    registrationCreditSantaMarta: number;
    registrationCashEnvigado: number;
    registrationCashCienaga: number;
    registrationCashZonaBananera: number;
}

export interface FinancialMatrix {
    rows: MatrixRow[];
    lastUpdated: string; // ISO Date
}
