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
    moto_interes: z.string(), // [FIXED] Standardized
    motivo_inscripcion: z.string().min(1, { message: "Por favor selecciona un motivo válido" }),
    origen: z.string().default("WEB_BETA"),
    habeas_data: z.boolean().refine(val => val === true, {
        message: "Debes aceptar la política de tratamiento de datos."
    }),
}).passthrough();

export type LeadState = {
    success?: boolean;
    errors?: {
        nombre?: string[];
        celular?: string[];
        moto_interes?: string[];
        motivo_inscripcion?: string[];
        habeas_data?: string[];
        general?: string[];
    };
    message?: string;
}

export async function submitLead(prevState: LeadState, formData: FormData): Promise<LeadState> {
    // 1. [ESTRICTO] Extracción y Casteo de tipos para soporte dinámico (v8.0.1)
    const rawData: any = {};
    const booleanFields = ['habeas_data', 'human_help_requested', 'reportado_datacredito'];
    const numberFields = ['edad', 'ingresos_mensuales', 'monto_credito', 'precio_moto', 'cuota_mensual', 'plazo', 'cuota_inicial'];

    for (const [key, value] of formData.entries()) {
        if (typeof value === 'string') {
            const normalizedKey = key.trim();
            if (booleanFields.includes(normalizedKey)) {
                // Casteo explícito a booleano
                rawData[normalizedKey] = value.toLowerCase() === 'true';
            } else if (numberFields.includes(normalizedKey)) {
                // Casteo explícito a número
                const num = Number(value);
                rawData[normalizedKey] = isNaN(num) ? value : num;
            } else {
                rawData[normalizedKey] = value;
            }
        } else {
            rawData[key] = value;
        }
    }

    // Mapeo de alias comunes en la UI
    if (!rawData.moto_interes) rawData.moto_interes = formData.get("moto_interest") as string || "General";

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

        // 2. [ESTRICTO] Normalización Contrato 12 Dígitos (UNE v7.0.2)
        let normalizedCelular = String(validated.data.celular).replace(/\D/g, "");
        if (normalizedCelular.length === 10) {
            normalizedCelular = "57" + normalizedCelular;
        }

        // 3. [ADMIN SDK] Persistencia en Colección prospectos (ID = Celular)
        const docRef = adminDb.collection("prospectos").doc(normalizedCelular);

        const finalPayload = {
            ...validated.data, // Incluye campos extra por .passthrough()
            celular: normalizedCelular, // [V8.0.0] Forzar celular normalizado en el payload
            created_at: new Date(),
            fecha: new Date(), // Paridad con bulkImport
            status: "PENDING",
            updated_at: new Date()
        };

        await docRef.set(finalPayload, { merge: true });

        return { success: true, message: "¡Gracias! Un asesor te contactará pronto." };
    } catch (error: any) {
        console.error("Error saving lead (12-Digit Contract):", error);
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

        // revalidatePath temporalmente deshabilitado para descartar fallos de caché/renderizado post-mutación
        return { success: true, message: "Parámetros actualizados correctamente" };
    } catch (error: any) {
        // Reporte de diagnóstico crudo para forzar transparencia en el error
        const errMsg = error?.message || "Excepción sin mensaje";
        const errStack = (error?.stack || "").substring(0, 100);
        return { 
            success: false, 
            message: `CRASH_REPORT: ${errMsg} | ${errStack}` 
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
        // [WEB-OBS-1.3] Estandarización de Estados v8.1.1: DONE → CLOSED
        status: z.enum(['PENDING', 'IN_PROGRESS', 'CLOSED', 'DISCARDED']).optional(),
        chatbot_status: z.enum(['ACTIVE', 'PAUSED']).optional(),
        notes: z.any().optional(), // Allow arrayUnion or array of objects

        // [WEB-OBS-1.3] Observabilidad de Herramientas IA (Bot v9.7.0)
        active_tool: z.string().optional(),
        tool_status: z.enum(['IDLE', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
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

// ==========================================
// 6. CARGA MASIVA (Bulk Import v1.1)
// ==========================================

export async function bulkImportProspectsAction(
    prospects: any[],
    wa_config?: { template_name?: string; phone_number_id?: string }
) {
    // 1. Validar Sesión
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('__session');

    if (!sessionCookie) {
        return { success: false, message: "No autorizado." };
    }

    if (!prospects || !Array.isArray(prospects)) {
        return { success: false, message: "Datos de importación inválidos." };
    }

    // Límite de Batch de Firestore es 500
    const limitedProspects = prospects.slice(0, 500);
    const adminDb = getDb();
    const batch = adminDb.batch();

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    try {
        // 1. [ESTRICTO] Sanitizar payload asegurando document_id y descartar inválidos antes de tocar el SDK
        const validProspects = limitedProspects.map(p => {
            p.document_id = p.document_id || p.celular; // Mapeo de seguridad final
            return p;
        }).filter(p => p.document_id && typeof p.document_id === 'string' && p.document_id.trim() !== '');

        // Sumar al contador de fallos aquellos que no pasaron el filtro nulo
        failedCount += (limitedProspects.length - validProspects.length);

        // Check de finalización anticipada si no hay registros válidos
        if (validProspects.length === 0) {
             return {
                success: true,
                report: { total: limitedProspects.length, created: 0, updated: 0, failed: failedCount }
             };
        }

        // Obtener todas las referencias y verificar existencia para el reporte
        const docRefs = validProspects.map(p => adminDb.collection("prospectos").doc(p.document_id));
        const snapshots = await adminDb.getAll(...docRefs);
        
        const existenceMap = new Map<string, boolean>();
        snapshots.forEach((snap: any) => {
            existenceMap.set(snap.id, snap.exists);
        });

        for (const prospect of validProspects) {
            let { document_id, ...data } = prospect;

            if (!document_id) {
                failedCount++;
                continue;
            }

            document_id = String(document_id).replace(/\D/g, "");
            if (document_id.length === 10) {
                document_id = "57" + document_id;
            }

            // 1. Normalización y Casting (Regla Tobias & UNE v7.0.2)
            const exists = existenceMap.get(document_id);
            const updates: any = {
                updated_at: new Date(),
                // [UI-HOMOLOGACION-PENDING-001] Estándar v2.0.0: status siempre en inglés canónico
                status: data.status || data.STATUS || "PENDING",
                // [ESTÁNDAR UNE v7.0.2] Forzar mapeo de la llave principal al campo celular
                celular: document_id,
                metadata: {
                    source: 'BULK_IMPORT_V2.0',
                    imported_at: new Date().toISOString(),
                    // [ARCH-BULK-META-008] Persistir wa_config en metadata.whatsapp SOLO si fue provisto
                    // Contrato JSON Voorhees v2.0.0: never write empty object to Firestore
                    ...(wa_config && (wa_config.template_name || wa_config.phone_number_id)
                        ? {
                            whatsapp: {
                                ...(wa_config.template_name ? { template_name: wa_config.template_name } : {}),
                                ...(wa_config.phone_number_id ? { phone_number_id: wa_config.phone_number_id } : {}),
                            }
                          }
                        : {}
                    ),
                }
            };

            // Mapeo selectivo con Lógica de Preservación (No-Sobrescritura)
            // Solo incluimos campos que no estén vacíos en el CSV
            const mapField = (csvKey: string, dbKey: string, transform?: (val: any) => any) => {
                const val = data[csvKey];
                if (val !== undefined && val !== null && val !== "") {
                    updates[dbKey] = transform ? transform(val) : val;
                }
            };

            mapField('nombre', 'nombre', (v) => String(v).substring(0, 50));
            mapField('ciudad', 'ciudad', (v) => String(v).substring(0, 50));
            // Sanitización Automática (Auto-Clean): elimiar residuales de Excel/CSV
            mapField('moto_interes', 'moto_interes', (v) => String(v).replace(/;/g, '').trim());
            mapField('forma_pago', 'forma_pago');
            mapField('ocupacion', 'ocupacion');
            mapField('ingresos', 'ingresos', Number);
            mapField('gastos', 'gastos', Number);
            mapField('datacredito', 'datacredito');
            mapField('vivienda', 'vivienda');
            mapField('servicios_publicos', 'servicios_publicos'); // String "Si"/"No"
            mapField('plan_celular', 'plan_celular'); // String "Si"/"No"
            
            // [LEGAL-V8.0.0] Direct mapping of habeas_data boolean
            mapField('habeas_data', 'habeas_data', (v) => v === 'Si' || v === true);

            // Campos obligatorios para nuevos registros
            if (!exists) {
                updates.fecha = new Date();
                updates.origen = "BULK_IMPORT_V1.2";
                updates.plazo_simulado = 24;
                updates.entidad_simulada = "Crediorbe";
                createdCount++;
            } else {
                updatedCount++;
            }

            updates.updated_at = new Date();
            // [ESTRICTO] Contrato Único de Datos: Asegurar llave ancla inmediatamente antes del merge
            updates.celular = document_id;

            const docRef = adminDb.collection("prospectos").doc(document_id);
            batch.set(docRef, updates, { merge: true });
        }

        await batch.commit();
        revalidatePath('/admin/prospectos');

        return {
            success: true,
            report: {
                total: limitedProspects.length,
                created: createdCount,
                updated: updatedCount,
                failed: failedCount
            }
        };

    } catch (error: any) {
        console.error('Error en bulkImport:', error);
        return { 
            success: false, 
            message: error instanceof Error ? error.message : "Error desconocido en la carga masiva."
        };
    }
}
