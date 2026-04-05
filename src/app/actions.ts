'use server';

import { z } from "zod";
import { getDb } from "@/lib/firebase-admin";
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
    moto_interest: z.string(), // [FIXED] Standardized
    motivo_inscripcion: z.enum([
        'Solicitud de Crédito',
        'Pago de Contado',
        'Asesoría General',
        'Repuestos/Accesorios'
    ], { message: "Por favor selecciona un motivo válido" }),
    origen: z.literal("WEB_BETA").default("WEB_BETA"),
    habeas_data_accepted: z.boolean().refine(val => val === true, {
        message: "Debes aceptar la política de tratamiento de datos."
    }),
});

export type LeadState = {
    success?: boolean;
    errors?: {
        nombre?: string[];
        celular?: string[];
        moto_interest?: string[];
        motivo_inscripcion?: string[];
        habeas_data_accepted?: string[];
        general?: string[];
    };
    message?: string;
}

export async function submitLead(prevState: LeadState, formData: FormData): Promise<LeadState> {
    const rawData = {
        nombre: formData.get("nombre") as string,
        celular: formData.get("celular") as string,
        moto_interest: formData.get("moto_interest") as string || "General",
        motivo_inscripcion: formData.get("motivo_inscripcion") as any,
        habeas_data_accepted: formData.get("habeas_data_accepted") === "true", // [LEGAL] Check for true
        origen: "WEB_BETA",
    };

    const validated = leadSchema.safeParse(rawData);
    if (!validated.success) {
        return {
            success: false,
            errors: validated.error.flatten().fieldErrors as any,
            message: "Por favor corrige los errores del formulario."
        };
    }

    try {
        const adminDb = getDb();
        // [ADMIN SDK] Server-side trusted write
        await adminDb.collection("leads").add({
            ...validated.data,
            created_at: new Date(), // Admin SDK accepts JS Date
            status: "nuevo"
        });

        return { success: true, message: "¡Gracias! Un asesor te contactará pronto." };
    } catch (error: any) {
        console.error("Error saving lead:", error);
        return {
            success: false,
            message: `Error al enviar los datos: ${error.message || 'Excepción desconocida'}`
        };
    }
}

// ==========================================
// 2. GESTIÓN DE INVENTARIO (Admin V2)
// ==========================================

// Schema completo para la edición del producto
// Incluye la CORRECCIÓN DE IMAGEN (Estándar: imagen_url)
const productSchema = z.object({
    motoId: z.string(),
    // ESTÁNDAR: imagen_url (snake_case)
    imagen_url: z.string().optional(),
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
 * AHORA: Usa exclusivamente imagen_url
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
        const adminDb = getDb();
        const { motoId, precio, imagen_url, marca, modelo, anio, isVisible, bono } = validated.data;

        // Configuración de fecha para last_updated (Zona horaria Colombia aprox)
        const offset = 5 * 60 * 60 * 1000; //-5 UTC
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const colTime = new Date(utc - offset);

        const docRef = adminDb.collection("pagina").doc("catalogo").collection("items").doc(motoId);

        // Objeto de actualización base
        const updatePayload: any = {
            precio: precio,
            last_updated: colTime
        };

        // --- ESTANDARIZACIÓN ---
        // Guardamos 'imagen_url' explícitamente
        if (imagen_url && imagen_url.length > 0) {
            updatePayload.imagen_url = imagen_url;
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
            // El Admin SDK no requiere Timestamp.fromDate, acepta Date directamente o string ISO si se guarda así
            updatePayload["bono.fecha_limite"] = new Date(bono.fecha_limite);
        }

        // 3. Escribir en Firestore (Admin SDK update)
        await docRef.update(updatePayload);

        // 4. Limpiar Caché (Para que se vea la remolacha al instante)
        revalidatePath('/pagina/catalogo');
        revalidatePath('/');
        revalidatePath('/admin/inventory');

        return { success: true, message: "Producto actualizado correctamente" };

    } catch (error: any) {
        console.error("Error saving product:", error);
        return { success: false, message: `Error al guardar producto: ${error.message || 'Excepción desconocida'}` };
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
// ==========================================
// 4. CONFIGURACIÓN FINANCIERA (Matrículas)
// ==========================================

const matrixRowSchema = z.object({
    id: z.string(),
    label: z.string(),
    category: z.string().optional(),
    minCC: z.coerce.number().optional(),
    maxCC: z.coerce.number().optional(),
    registrationCredit: z.coerce.number().min(0),
    registrationCash: z.coerce.number().min(0),
});

const financialMatrixSchema = z.object({
    rows: z.array(matrixRowSchema),
    lastUpdated: z.string().optional(),
});

/**
 * saveFinancialParams
 * Acción de servidor para guardar la matriz de parámetros financieros.
 * Implementa validación estructural mediante Zod y reporte de errores detallado.
 */
export async function saveFinancialParams(data: any) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('__session');

        if (!sessionCookie) {
            return { success: false, message: "No autorizado (Session Cookie Missing)" };
        }

        const validated = financialMatrixSchema.safeParse(data);
        if (!validated.success) {
            const errorDetails = validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
            return { success: false, message: `Datos de matriz inválidos: ${errorDetails}` };
        }

        // [ADMIN SDK LOCK] Bypassing security rules for trusted config mutation
        const adminDb = getDb();
        const docRef = adminDb.collection('financial_config').doc('general').collection('global_params').doc('global_params');
        
        await docRef.set({ rows: validated.data.rows }, { merge: true });

        revalidatePath('/admin/financial-parameters');
        return { success: true, message: "Parámetros actualizados correctamente" };
    } catch (error: any) {
        console.error("🔥 Error crítico absoluto en Server Action:", error);
        return { 
            success: false, 
            message: `Fallo de servidor (Handled): ${error.message || 'Excepción desconocida'}` 
        };
    }
}
// ==========================================
// 5. GESTIÓN DE PROSPECTOS (UNE v7.0.0)
// ==========================================

const prospectUpdateSchema = z.object({
    document_id: z.string(),
    updates: z.object({
        // PII
        nombre: z.string().max(50).optional(),
        ciudad: z.string().max(50).optional(),

        // Compliance
        habeas_data: z.boolean().optional(),
        habeas_data_sent: z.boolean().optional(),

        // Funnel
        moto_interes: z.string().optional(),
        moto_offered: z.string().optional(),
        moto_confirmada: z.boolean().optional(),
        forma_pago: z.string().optional(),

        // Crédito
        ocupacion: z.string().optional(),
        ingresos: z.coerce.number().optional(),
        gastos: z.coerce.number().optional(),
        datacredito: z.string().optional(),
        vivienda: z.enum(['Propia', 'Familiar', 'Arrendada']).optional(),
        servicios_publicos: z.string().optional(),
        plan_celular: z.string().optional(),

        // Simulación
        cuota_simulada: z.coerce.number().optional(),
        plazo_simulado: z.literal(24).default(24),
        score_resultado: z.coerce.number().optional(),
        entidad_simulada: z.literal("Crediorbe").default("Crediorbe"),

        // Gestión
        status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'DISCARDED']).optional(),
        chatbot_status: z.enum(['ACTIVE', 'PAUSED']).optional(),
        notes: z.any().optional(), // Allow arrayUnion or array of objects
    }).passthrough(), // [PASSTHROUGH] Permitir campos inyectados por el Bot (ai_summary, etc.)
});

/**
 * updateProspectAction
 * Actualiza un prospecto siguiendo el estándar UNE v7.0.1 (Estructura document_id + updates).
 */
export async function updateProspectAction(data: any) {
    // 1. Validar Sesión
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('__session');

    if (!sessionCookie) {
        return { success: false, message: "No autorizado." };
    }

    // 2. Validar Datos (Contrato v7.0.1)
    const validated = prospectUpdateSchema.safeParse(data);
    if (!validated.success) {
        console.error("Validation Error (Prospect v7.0.1):", validated.error.format());
        return { success: false, message: "Error de contrato UNE v7.0.1 (Verificar document_id y updates)" };
    }

    try {
        const adminDb = getDb();
        const { document_id, updates } = validated.data;

        // Truncar PII (Regla de Negocio)
        if (updates.nombre) updates.nombre = updates.nombre.substring(0, 50);
        if (updates.ciudad) updates.ciudad = updates.ciudad.substring(0, 50);

        // Inyectar Metadatos Obligatorios en el Servidor
        const finalPayload = {
            ...updates,
            updated_at: new Date() // Sincronización automática con Firestore
        };

        const docRef = adminDb.collection("prospectos").doc(document_id);
        await docRef.update(finalPayload);

        revalidatePath('/admin/prospectos');
        return { success: true, message: "Prospecto actualizado correctamente" };

    } catch (error: any) {
        console.error("Error updating prospect (v7.0.1):", error);
        return { success: false, message: `Error de servidor: ${error.message || 'Excepción desconocida'}` };
    }
}
