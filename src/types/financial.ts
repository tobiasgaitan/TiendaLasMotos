
export interface City {
    id: string;
    name: string;
    department: string;
    registrationCost: {
        credit: number;
        cash: number;
    };
    documentationFee: number; // Costo gestión documental/tramites
}

export interface SoatRate {
    id: string; // e.g. "CC_0_100", "CC_100_200", "CC_200_PLUS"
    minDisplacement: number;
    maxDisplacement: number;
    price: number;
    year: number;
}

export interface FinancialEntity {
    id: string;
    name: string;
    monthlyRate: number; // e.g. 1.8 for 1.8%
    minMonths: number;
    maxMonths: number;
    requiresPledge: boolean; // Requiere prenda?
    logoUrl?: string;
    active: boolean;
}

export interface FinancialConfig {
    fngRate: number; // Fondo Nacional de Garantías % (e.g. 5.5%)
    defaultMonths: number;
    baseInterestRate: number;
}
