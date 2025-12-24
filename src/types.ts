import { Timestamp } from "firebase/firestore";

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
}
