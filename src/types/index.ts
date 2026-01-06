import { Timestamp } from "firebase/firestore";

export * from './financial';

export interface Lead {
    // Core Fields
    nombre: string;
    celular: string;
    motoInteres: string;
    fecha: Timestamp;

    // New Field - MANDATORY
    motivo_inscripcion: 'Solicitud de Crédito' | 'Pago de Contado' | 'Asesoría General' | 'Repuestos/Accesorios';

    // Inferred Fields
    origen?: "WEB_BETA";
    estado?: string;

    // Intelligent Routing / Profiling
    edad?: number;
    ingresos_mensuales?: string; // Range e.g. "1-2 SMMLV"
    actividad_economica?: string; // "Empleado", "Independiente"
    reportado_datacredito?: boolean;
    eligibility_status?: 'Eligible' | 'Rejected' | 'Conditional';

    // Future AI Integration
    informe_ia?: {
        resumen: string;        // Detailed explanation
        categoria_breve: string; // e.g., "High Potential" or "Spam"
        score: number;          // 0-100 probability of conversion
        accion_sugerida?: string; // e.g., "Call immediately"
    };
}

export interface Bono {
    titulo: string;
    monto: number;
    activo: boolean;
    fecha_limite: string; // ISO string
    tipo: string;
}

export interface Moto {
    id: string;
    referencia: string;
    precio: number;
    marca: string;
    imagen: string;
    frenosABS: boolean;
    external_url?: string;
    last_checked?: any;
    bono?: Bono;
    displacement?: number; // Cilindraje en CC (Fallback 150cc if null)
    category?: string; // @deprecated use categories
    categories?: string[]; // New multi-category support // New Classification
    specialAdjustment?: number; // Ajuste especial (bono o cargo extra)
}

export interface CreditSimulation {
    id?: string;
    ticketNumber: number; // Auto-incremental
    createdAt: Timestamp;
    motoId: string;
    cityId: string;
    financialEntityId?: string;
    snapshot: {
        motoPrice: number;
        registrationPrice: number;
        soatPrice: number;
        interestRate: number;
        lifeInsuranceRate: number;
        movableGuaranteePrice: number;
        specialAdjustment: number;
    };
    results: {
        totalValue: number;
        downPayment: number;
        loanAmount: number;
        monthlyPayment: number;
        months: number;
    };
}
