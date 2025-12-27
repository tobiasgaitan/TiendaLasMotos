'use server';

import { z } from "zod";
import { db } from "@/lib/firestore";
import { collection, addDoc, serverTimestamp, doc, updateDoc, Timestamp } from "firebase/firestore";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

// Tipos básicos
import { Lead } from "@/types";

// ==========================================
// 1. GESTIÓN DE LEADS (Formulario Web)
// ==========================================

const leadSchema = z.object({
    nombre: z.string().min(3, { message: "El nombre debe tener al menos 3 caracteres" }),
    celular: z.string().regex(/^(3\d{9}|(\+57)?3\d{9})$/, { message: "El celular debe ser válido (10 dígitos)" }),
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

// ==========================================
// 2. GESTIÓN DE INVENTARIO (Admin V2)
// ==========================================

// Schema completo para la edición del producto
// Incluye la CORRECCIÓN DE IMAGEN y todos los campos del modal
const productSchema = z.object({
    motoId: z.string(),
    // IMPORTANTE: Aquí validamos la URL de la imagen (la remolacha)
    imagenUrl: z.string().optional(),
    precio: z.coerce.number().min(0),
    marca: z.string().optional(),
    modelo: z.string().optional(),
    anio: z.coerce.number().optional(),
    isVisible: z.boolean().optional(),
    bono: z.object({
        activo: z.boolean(),
        titulo: z.string(),
        monto: z.coerce.number().min(0),
        fecha_limite: z.string(),
    }).optional(),
});

/**
 * saveProduct (Antiguo updateMotoAction)
 * Función maestra para guardar cambios desde el panel de administración.
 * Soluciona el problema de mapeo de imagenUrl.
 */
export async function saveProduct(data: z.infer<typeof productSchema>) {
    // 1. Validar Sesión (Seguridad)
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('__session');

    if (!sessionCookie) {
        return { success: false, message: "No autorizado. Sesión inválida." };
    }

    // 2. Validar Datos de Entrada
    const validated = productSchema.safeParse(data);
    if (!validated.success) {
        console.error("Validation Error:", validated.error);
        return { success: false, message: "Datos inválidos. Revisa los campos." };
    }

    try {
        const { motoId, precio, imagenUrl, marca, modelo, anio, isVisible, bono } = validated.data;

        // Configuración de fecha para last_updated (Zona horaria Colombia aprox)
        const offset = 5 * 60 * 60 * 1000; //-5 UTC
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const colTime = new Date(utc - offset);

        const docRef = doc(db, "pagina", "catalogo", "items", motoId);

        // Objeto de actualización base
        const updatePayload: any = {
            precio: precio,
            last_updated: colTime
        };

        // --- LA CORRECCIÓN CLAVE ---
        // Si recibimos una URL de imagen nueva, la guardamos en 'imagenUrl' (el campo Legacy)
        if (imagenUrl && imagenUrl.length > 0) {
            updatePayload.imagenUrl = imagenUrl;
        }

        // Mapeo de campos opcionales (solo actualizamos si existen)
        if (marca) updatePayload.marca = marca;
        // Nota: A veces el ID es el modelo, pero si tienes campo modelo visual, lo guardamos:
        if (modelo) updatePayload.modelo = modelo;
        if (anio) updatePayload.anio = anio;

        // Manejo de booleano isVisible (mapeado a isVisible en BD)
        if (typeof isVisible === 'boolean') {
            updatePayload.isVisible = isVisible;
        }

        // Actualización de Bonos (si viene el objeto bono)
        if (bono) {
            updatePayload["bono.activo"] = bono.activo;
            updatePayload["bono.titulo"] = bono.titulo;
            updatePayload["bono.monto"] = bono.monto;
            // Convertimos string ISO a Timestamp de Firestore
            updatePayload["bono.fecha_limite"] = Timestamp.fromDate(new Date(bono.fecha_limite));
        }

        // 3. Escribir en Firestore
        await updateDoc(docRef, updatePayload);

        // 4. Limpiar Caché (Para que se vea la remolacha al instante)
        revalidatePath('/pagina/catalogo');
        revalidatePath('/');
        revalidatePath('/admin/inventory');

        return { success: true, message: "Producto actualizado correctamente" };

    } catch (error) {
        console.error("Error saving product:", error);
        return { success: false, message: "Error al guardar en base de datos. Verifica permisos." };
    }
}

// ==========================================
// 3. AUTENTICACIÓN (Login Beta)
// ==========================================

export async function loginAction(prevState: any, formData: FormData) {
    const email = formData.get("email");
    const password = formData.get("password");

    // Credenciales Hardcoded (Fase Beta)
    if (email === "admin@tiendalasmotos.com" && password === "admin123") {
        const cookieStore = await cookies();

        cookieStore.set('__session', 'authenticated', {
            httpOnly: true,
            secure: true,
            path: '/',
            maxAge: 60 * 60 * 24, // 1 día
            sameSite: 'lax',
        });

        return { success: true, message: "Ingreso exitoso" };
    }

    return { success: false, message: "Credenciales incorrectas. Intenta de nuevo." };
}
