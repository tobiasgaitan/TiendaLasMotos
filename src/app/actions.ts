'use server';

import { z } from "zod";
import { db } from "@/lib/firestore";
import { collection, addDoc, serverTimestamp, doc, updateDoc, Timestamp } from "firebase/firestore";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Lead } from "@/types";

// Schema Validation
/**
 * Lead Validation Schema (Zod):
 * Defines strict rules for incoming lead data to ensure integrity and security.
 * - Sanitizes unknown fields (via z.object defaults)
 * - Enforces specific formats for sensitive fields like 'celular'
 */
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

    /**
     * Raw Data Extraction:
     * Pulls data directly from FormData. 
     * Note: We do *not* automatically trust this data until it passes Zod validation.
     */
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

// --- Inventory Management ---

const updateMotoSchema = z.object({
    motoId: z.string(),
    precio: z.number().min(0),
    bono: z.object({
        activo: z.boolean(),
        titulo: z.string(),
        monto: z.number().min(0),
        fecha_limite: z.string(), // Expecting ISO string
    }),
});

export async function updateMotoAction(data: z.infer<typeof updateMotoSchema>) {
    // 1. Validate Session (Security Baseline)
    // We strictly check for the existence of the '__session' cookie.
    // In a full Admin SDK setup, we would verify the token content.
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('__session');

    if (!sessionCookie) {
        return { success: false, message: "No autorizado. Sesión inválida." };
    }

    // 2. Validate Input
    const validated = updateMotoSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, message: "Datos inválidos." };
    }

    try {
        const { motoId, precio, bono } = validated.data;

        // 3. Update in Firestore
        // Note: This requires firestore.rules to allow writes from this context.
        // The server action uses the initialized client SDK.
        // We ensure firestore.rules allows writes for authenticated users.

        const offset = 5 * 60 * 60 * 1000; //-5 UTC
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const colTime = new Date(utc - offset);

        const docRef = doc(db, "pagina", "catalogo", "items", motoId);

        await updateDoc(docRef, {
            precio: precio,
            "bono.activo": bono.activo,
            "bono.titulo": bono.titulo,
            "bono.monto": bono.monto,
            "bono.fecha_limite": Timestamp.fromDate(new Date(bono.fecha_limite)),
            // Keep existing fields
            last_updated: colTime
        });

        // 4. Cache Invalidation (Critical)
        // Revalidate the public catalog and the home page
        revalidatePath('/pagina/catalogo');
        revalidatePath('/');

        // Also revalidate the admin inventory list itself
        revalidatePath('/admin/inventory');

        return { success: true, message: "Actualizado correctamente" };
    } catch (error) {
        console.error("Error updating moto:", error);
        return { success: false, message: "Error al guardar en base de datos. Verifica permisos." };
    }
}

// --- Auth ---

export async function loginAction(prevState: any, formData: FormData) {
    const email = formData.get("email");
    const password = formData.get("password");

    // Validation
    // Hardcoded check for Beta Phase
    if (email === "admin@tiendalasmotos.com" && password === "admin123") {
        const cookieStore = await cookies();

        cookieStore.set('__session', 'authenticated', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 24 * 5, // 5 days
        });

        redirect("/admin");
    }

    return { success: false, message: "Credenciales incorrectas. Intenta de nuevo." };
}
