
import { CATEGORIES_OFFICIAL } from "@/lib/constants";

// Synonym Dictionary: Popular terms -> Official Category
const SYNONYMS: Record<string, string> = {
    // Deportiva
    'pistera': 'DEPORTIVA',
    'corredora': 'DEPORTIVA',
    'carreras': 'DEPORTIVA',
    'ninja': 'DEPORTIVA',
    'sport': 'DEPORTIVA',

    // Urbana / Trabajo
    'calle': 'URBANA Y/O TRABAJO',
    'trabajo': 'URBANA Y/O TRABAJO',
    'mensajera': 'URBANA Y/O TRABAJO',
    'domicilio': 'URBANA Y/O TRABAJO',
    'economica': 'URBANA Y/O TRABAJO',
    'barata': 'URBANA Y/O TRABAJO',
    'nkd': 'URBANA Y/O TRABAJO',

    // Todoterreno
    'montaña': 'TODOTERRENO',
    'trocha': 'TODOTERRENO',
    'cross': 'TODOTERRENO',
    'enduro': 'TODOTERRENO',
    'dobleproposito': 'TODOTERRENO',

    // Automatica / Scooter
    'scooter': 'AUTOMATICA Y/O SCOOTER',
    'motoneta': 'AUTOMATICA Y/O SCOOTER',
    'automatica': 'AUTOMATICA Y/O SCOOTER',
    'nmax': 'AUTOMATICA Y/O SCOOTER',
    'pcx': 'AUTOMATICA Y/O SCOOTER',

    // Semiautomatica
    'semiautomatica': 'SEMIAUTOMATICA',
    'moped': 'SEMIAUTOMATICA',
    'señoritera': 'SEMIAUTOMATICA',
    'crypton': 'SEMIAUTOMATICA',

    // Motocarro
    'carguero': 'MOTOCARRO Y/O MOTOCARGUERO',
    'torito': 'MOTOCARRO Y/O MOTOCARGUERO',
    'carro': 'MOTOCARRO Y/O MOTOCARGUERO',
    'tresruedas': 'MOTOCARRO Y/O MOTOCARGUERO',
    'motocarro': 'MOTOCARRO Y/O MOTOCARGUERO',

    // Electrica
    'electrica': 'ELECTRICA',
    'bateria': 'ELECTRICA',
    'ecologica': 'ELECTRICA',
    'starker': 'ELECTRICA',

    // Patineta
    'patineta': 'PATINETA',
    'scooter-electrica': 'PATINETA',
    'monopatin': 'PATINETA'
};

/**
 * Calculates Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1 // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

interface MatchResult {
    category: string;
    score: number; // 0 to 1 (1 is exact)
    method: 'exact' | 'synonym' | 'fuzzy';
}

export function detectCategory(query: string): MatchResult | null {
    const normalized = query.toLowerCase().trim();

    // 1. Direct Synonym Check
    if (SYNONYMS[normalized]) {
        return { category: SYNONYMS[normalized], score: 1, method: 'synonym' };
    }

    // 2. Fuzzy Match against Synonyms and Official Names
    let bestMatch: MatchResult | null = null;
    let minDist = Infinity;

    // Check Official Categories
    for (const cat of CATEGORIES_OFFICIAL) {
        const dist = levenshteinDistance(normalized, cat.toLowerCase());
        const maxLen = Math.max(normalized.length, cat.length);
        const score = 1 - (dist / maxLen);

        if (dist === 0) return { category: cat, score: 1, method: 'exact' };

        if (dist < minDist) {
            minDist = dist;
            bestMatch = { category: cat, score, method: 'fuzzy' };
        }
    }

    // Check Synonyms (fuzzy)
    for (const [term, cat] of Object.entries(SYNONYMS)) {
        const dist = levenshteinDistance(normalized, term);
        const maxLen = Math.max(normalized.length, term.length);
        const score = 1 - (dist / maxLen);

        if (score > (bestMatch?.score || 0)) {
            bestMatch = { category: cat, score, method: 'fuzzy' };
        }
    }

    // Threshold
    if (bestMatch && bestMatch.score > 0.6) {
        return bestMatch;
    }

    return null;
}
