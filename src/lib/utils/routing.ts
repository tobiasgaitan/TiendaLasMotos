import { FinancialEntity } from "@/types/financial";
import { Lead } from "@/types";

export interface RoutingProfile {
    age: number;
    income?: string; // e.g. "1-2 SMMLV"
    activity?: string; // e.g. "Independiente"
    reported?: boolean;
}

export interface RoutingResult {
    suitableEntities: FinancialEntity[];
    rejectedEntities: FinancialEntity[];
    reason?: string;
    status: 'Eligible' | 'Conditional' | 'Rejected';
}

/**
 * Filters financial entities based on the User Profile (Age, Income, Activity, etc.)
 * Implements the "Matriz Cuestionario" logic.
 */
export const routeFinancialEntities = (
    profile: RoutingProfile,
    availableEntities: FinancialEntity[]
): RoutingResult => {
    const { age } = profile;

    // 1. Age Validation
    // If Age < 18 or > 70, global restriction might apply (or specific to Bogotá)
    // For now, we filter individually per entity rules.

    // Check Global Eligibility (example: min 18 for everyone)
    if (age < 18) {
        return {
            suitableEntities: [],
            rejectedEntities: availableEntities,
            reason: "Menor de edad. Se requiere acudiente o pago de contado.",
            status: 'Rejected'
        };
    }

    const suitable: FinancialEntity[] = [];
    const rejected: FinancialEntity[] = [];

    availableEntities.forEach(entity => {
        let isEligible = true;

        // Check Entity Specific Age Limits
        if (entity.minAge && age < entity.minAge) isEligible = false;
        if (entity.maxAge && age > entity.maxAge) isEligible = false;

        // Check Reporting Status (Datacredito)
        // If profile is reported, only entities that accept reported users (none for now usually, or specific ones)
        if (profile.reported) {
            // Assuming general banks don't accept reported. 
            // We can update FinancialEntity schema later to include 'acceptsReported'.
            // For now, if reported, mostly rejected unless specific partner.
            // Let's assume strict for Banco de Bogotá.
            if (entity.name.includes("Bogotá") || entity.name.includes("Bogota")) {
                isEligible = false;
            }
        }

        if (isEligible) {
            suitable.push(entity);
        } else {
            rejected.push(entity);
        }
    });

    // Sort Logic (Prioritization)
    // 1. Pre-approved first (if we had that info)
    // 2. Lowest Interest Rate
    suitable.sort((a, b) => a.interestRate - b.interestRate);

    return {
        suitableEntities: suitable,
        rejectedEntities: rejected,
        status: suitable.length > 0 ? 'Eligible' : 'Rejected'
    };
};
