'use server';

import { z } from "zod";
import { db } from "@/lib/firestore";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

import { Lead } from "@/types";

// Schema Validation
const leadSchema = z.object({
    nombre: z.string().min(3, { message: "El nombre debe tener al menos 3 caracteres" }),
    celular: z.string().regex(/^(3\d{9}|(\+57)?3\d{9})$/, { message: "El celular debe ser válido (10 dígitos)" }), // Basic CO mobile validation
    motoInteres: z.string(),
    motivo_inscripcion: z.enum([
        'Solicitud de Crédito',
        'Pago de Contado',
        'Asesoría General',
        'Repuestos/Accesorios'
    ], { message: "Por favor selecciona un motivo válido" }),
    origen: z.literal("WEB_BETA").default("WEB_BETA"),
});

export type LeadState = {
    success?: boolean;
    errors?: {
        nombre?: string[];
        celular?: string[];
        motoInteres?: string[];
        motivo_inscripcion?: string[];
        general?: string[];
    };
    message?: string;
}

export async function submitLead(prevState: LeadState, formData: FormData): Promise<LeadState> {

    const rawData = {
        nombre: formData.get("nombre") as string,
        celular: formData.get("celular") as string,
        motoInteres: formData.get("motoInteres") as string || "General",
        motivo_inscripcion: formData.get("motivo_inscripcion") as any,
        origen: "WEB_BETA",
    };

    // Validate using Zod
    const validatedFields = leadSchema.safeParse(rawData);

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "Por favor corrige los errores en el formulario."
        };
    }

    try {
        const leadData: Omit<Lead, 'fecha'> & { fecha: any } = {
            ...validatedFields.data,
            fecha: serverTimestamp(),
            estado: "NUEVO"
        };

        await addDoc(collection(db, "leads"), leadData);

        return { success: true, message: "¡Gracias! Un asesor te contactará pronto." };
    } catch (error) {
        console.error("Error saving lead:", error);
        return {
            message: "Hubo un error al enviar tus datos. Inténtalo de nuevo."
        };
    }
}
