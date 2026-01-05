export const CATEGORIES_OFFICIAL = [
    "URBANA Y/O TRABAJO",
    "DEPORTIVA",
    "TODOTERRENO",
    "ELECTRICA",
    "PATINETA",
    "MOTOCARRO Y/O MOTOCARGUERO",
    "SEMIAUTOMATICA",
    "AUTOMATICA Y/O SCOOTER"
];

export const FINANCIAL_SCENARIOS = [
    { id: 'credit_general', label: 'Valor documentos a crédito en cualquier ciudad excepto Santa Marta', cityName: 'General', method: 'credit' as const },
    { id: 'credit_santamarta', label: 'Valor documentos a crédito en Santa Marta', cityName: 'Santa Marta', method: 'credit' as const },
    // Cash options removed for Simulator as requested
];
