
export interface City {
    id: string;
    name: string;
    department: string;
    registrationCost: {
        credit: number;
    };
    documentationFee: number; // Costo gestión documental/tramites
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
