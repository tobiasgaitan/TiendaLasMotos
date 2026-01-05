
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
    requiresProceduresInCredit: boolean; // Includes procedures in credit?

    // Legacy/Optional fields
    monthlyRate?: number;
    minMonths?: number;
    maxMonths?: number;
    requiresPledge?: boolean;
    logoUrl?: string;
    active?: boolean;
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
    soatPrice: number;
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
