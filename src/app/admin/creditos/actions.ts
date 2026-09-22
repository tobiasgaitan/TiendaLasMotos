'use server';

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb, getAdminAuth } from "@/lib/firebase-admin";
import type { OperacionAuditoria } from "@/types/creditos";
import type { Transaction, QueryDocumentSnapshot, DocumentReference } from "firebase-admin/firestore";

// ==========================================
// 0. NÚCLEO DE CONFIANZA (Plan 08-03 T1)
// ==========================================

export type ActionResult = {
    success: boolean;
    message?: string;
    errors?: Record<string, string[]>;
    id?: string;
    numero_credito?: string;
};

const actorSchema = z.object({
    uid: z.string().min(1, { message: "UID de actor requerido" }),
    idToken: z.string().min(1, { message: "ID Token requerido" }),
});

type Actor = { uid: string; email?: string };

/**
 * Verifica el Firebase ID Token y retorna el actor autenticado.
 * NUNCA aceptar un `uid` sin verificar como `registrado_por`.
 */
async function requireActor(idToken: string): Promise<Actor> {
    try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        if (!decoded.uid) {
            throw new Error("Token sin uid");
        }
        return { uid: decoded.uid, email: decoded.email };
    } catch (error) {
        console.error("[creditos] requireActor falló: token inválido o expirado", error);
        throw new Error("No autorizado");
    }
}

function diffKeys(
    antes: Record<string, unknown> | null,
    despues: Record<string, unknown> | null
): string[] {
    if (!antes) return despues ? Object.keys(despues) : [];
    if (!despues) return Object.keys(antes);
    const keys = new Set([...Object.keys(antes), ...Object.keys(despues)]);
    const changed: string[] = [];
    for (const k of keys) {
        if (JSON.stringify(antes[k]) !== JSON.stringify(despues[k])) {
            changed.push(k);
        }
    }
    return changed;
}

/**
 * Append-only al ledger `historial_auditoria`. Esta función SOLO hace `add()`.
 * PROHIBIDO emitir `update`/`delete` sobre el ledger en cualquier path de código.
 */
async function appendAuditoria(input: {
    coleccion: string;
    documentoId: string;
    operacion: OperacionAuditoria;
    antes: Record<string, unknown> | null;
    despues: Record<string, unknown> | null;
    actor: Actor;
}): Promise<void> {
    const adminDb = getDb();
    await adminDb.collection("historial_auditoria").add({
        coleccion_afectada: input.coleccion,
        documento_id: input.documentoId,
        operacion: input.operacion,
        datos_anteriores: input.antes,
        datos_nuevos: input.despues,
        campos_modificados: diffKeys(input.antes, input.despues),
        registrado_por: input.actor.uid,
        registrado_por_email: input.actor.email ?? null,
        created_at: new Date(),
        version: 1,
    });
}

function fail(message: string, errors?: Record<string, string[]>): ActionResult {
    return { success: false, message, errors };
}

// ==========================================
// 1. CRUD DE CRÉDITOS (Plan 08-03 T2)
// ==========================================

/**
 * Correlativo CRE-YYYY-XXXX vía transacción sobre `configuracion/counters`.
 * Estrictamente aditivo (creditoCount/creditoYear, merge:true). C5.
 */
async function getNextNumeroCredito(): Promise<string> {
    const adminDb = getDb();
    const year = new Date().getFullYear();
    const counterRef: DocumentReference = adminDb.collection("configuracion").doc("counters");

    return await adminDb.runTransaction(async (t: Transaction) => {
        const snap = await t.get(counterRef);
        let currentCount = 0;
        if (snap.exists) {
            const data = snap.data() as Record<string, unknown> | undefined;
            if (data && data.creditoYear === year) {
                currentCount = (data.creditoCount as number) || 0;
            }
        }
        const nextCount = currentCount + 1;
        t.set(
            counterRef,
            { creditoCount: nextCount, creditoYear: year },
            { merge: true }
        );
        return `CRE-${year}-${nextCount.toString().padStart(4, "0")}`;
    });
}

const createCreditoSchema = z.object({
    cliente_id: z.string().min(1, { message: "El cliente es obligatorio" }),
    moto_id: z.string().min(1, { message: "La moto es obligatoria" }),
    entidad_financiera_id: z.string().optional(),
    sede_id: z.string().optional(),
    valor_moto: z.coerce.number().min(0, { message: "El valor debe ser ≥ 0" }),
    cuota_inicial: z.coerce.number().min(0, { message: "La cuota inicial debe ser ≥ 0" }),
    capital_financiado: z.coerce.number().min(0, { message: "El capital debe ser ≥ 0" }),
    tasa_interes_mensual: z.coerce.number().min(0, { message: "La tasa debe ser ≥ 0" }),
    plazo_meses: z.coerce.number().int().positive({ message: "El plazo debe ser entero > 0" }),
    cuota_mensual: z.coerce.number().min(0, { message: "La cuota debe ser ≥ 0" }),
    saldo_capital: z.coerce.number().min(0).optional(),
});

export async function createCredito(input: unknown, actor: unknown): Promise<ActionResult> {
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) {
        return fail("Actor inválido: se requiere uid + idToken.");
    }
    const validated = createCreditoSchema.safeParse(input);
    if (!validated.success) {
        return fail("Por favor corrige los errores del formulario.", validated.error.flatten().fieldErrors as Record<string, string[]>);
    }

    try {
        const actorData = await requireActor(parsedActor.data.idToken);
        const adminDb = getDb();
        const numero_credito = await getNextNumeroCredito();
        const now = new Date();

        const payload: Record<string, unknown> = {
            numero_credito,
            cliente_id: validated.data.cliente_id,
            moto_id: validated.data.moto_id,
            entidad_financiera_id: validated.data.entidad_financiera_id ?? null,
            sede_id: validated.data.sede_id ?? null,
            valor_moto: validated.data.valor_moto,
            cuota_inicial: validated.data.cuota_inicial,
            capital_financiado: validated.data.capital_financiado,
            tasa_interes_mensual: validated.data.tasa_interes_mensual,
            plazo_meses: validated.data.plazo_meses,
            cuota_mensual: validated.data.cuota_mensual,
            saldo_capital: validated.data.saldo_capital ?? validated.data.capital_financiado,
            estado: "SOLICITADO",
            fecha_solicitud: now,
            registrado_por: actorData.uid,
            registrado_por_email: actorData.email ?? null,
            activo: true,
            created_at: now,
            updated_at: now,
        };

        const docRef = await adminDb.collection("creditos").add(payload);
        await appendAuditoria({
            coleccion: "creditos",
            documentoId: docRef.id,
            operacion: "CREATE",
            antes: null,
            despues: payload,
            actor: actorData,
        });

        revalidatePath("/admin/creditos");
        return { success: true, message: `Crédito ${numero_credito} creado.`, id: docRef.id, numero_credito };
    } catch (error) {
        console.error("[creditos] createCredito falló:", error);
        return fail(error instanceof Error ? error.message : "Error al crear el crédito.");
    }
}

const updateCreditoSchema = createCreditoSchema.partial();

export async function updateCredito(id: string, patch: unknown, actor: unknown): Promise<ActionResult> {
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) {
        return fail("Actor inválido: se requiere uid + idToken.");
    }
    const validated = updateCreditoSchema.safeParse(patch);
    if (!validated.success) {
        return fail("Por favor corrige los errores del formulario.", validated.error.flatten().fieldErrors as Record<string, string[]>);
    }

    try {
        const actorData = await requireActor(parsedActor.data.idToken);
        const adminDb = getDb();
        const docRef = adminDb.collection("creditos").doc(id);
        const snap = await docRef.get();
        if (!snap.exists) {
            return fail("El crédito no existe.");
        }
        const antes = snap.data() as Record<string, unknown>;
        if (antes.activo === false) {
            return fail("El crédito está inactivo (baja lógica).");
        }

        // Campos protegidos: prohibido modificarlos (se descartan si vienen).
        const { ...rest } = validated.data as Record<string, unknown>;
        delete rest.numero_credito;
        delete rest.fecha_solicitud;

        const now = new Date();
        const updatePayload: Record<string, unknown> = {
            ...rest,
            actualizado_por: actorData.uid,
            updated_at: now,
        };

        await docRef.update(updatePayload);
        const despues = { ...antes, ...updatePayload };
        await appendAuditoria({
            coleccion: "creditos",
            documentoId: id,
            operacion: "UPDATE",
            antes,
            despues,
            actor: actorData,
        });

        revalidatePath("/admin/creditos");
        return { success: true, message: "Crédito actualizado.", id };
    } catch (error) {
        console.error("[creditos] updateCredito falló:", error);
        return fail(error instanceof Error ? error.message : "Error al actualizar el crédito.");
    }
}

export async function softDeleteCredito(id: string, motivo: string, actor: unknown): Promise<ActionResult> {
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) {
        return fail("Actor inválido: se requiere uid + idToken.");
    }
    if (!motivo || motivo.trim().length === 0) {
        return fail("La baja lógica exige un motivo.");
    }

    try {
        const actorData = await requireActor(parsedActor.data.idToken);
        const adminDb = getDb();
        const docRef = adminDb.collection("creditos").doc(id);
        const snap = await docRef.get();
        if (!snap.exists) {
            return fail("El crédito no existe.");
        }
        const antes = snap.data() as Record<string, unknown>;
        if (antes.activo === false) {
            return fail("El crédito ya está inactivo.");
        }

        // Baja lógica. PROHIBIDO delete() físico.
        const now = new Date();
        const bajaPayload: Record<string, unknown> = {
            activo: false,
            motivo_baja: motivo.trim(),
            fecha_baja: now,
            baja_por: actorData.uid,
            actualizado_por: actorData.uid,
            updated_at: now,
        };

        await docRef.update(bajaPayload);
        await appendAuditoria({
            coleccion: "creditos",
            documentoId: id,
            operacion: "SOFT_DELETE",
            antes,
            despues: { ...antes, ...bajaPayload },
            actor: actorData,
        });

        revalidatePath("/admin/creditos");
        return { success: true, message: "Crédito dado de baja (lógica).", id };
    } catch (error) {
        console.error("[creditos] softDeleteCredito falló:", error);
        return fail(error instanceof Error ? error.message : "Error al dar de baja el crédito.");
    }
}

// ==========================================
// 2. CLIENTES DE CRÉDITO (Plan 08-03 T3)
// NAMING LOCK físico: cedula, nombres, celular, direccion, fecha_registro.
// ==========================================

function normalizeCelular(raw: string): string | null {
    const digits = String(raw).replace(/\D/g, "");
    if (digits.length === 10) return "57" + digits;
    if (digits.length === 12 && digits.startsWith("57")) return digits;
    return null; // No normalizable: fallo explícito, prohibido null-masking
}

const createClienteSchema = z.object({
    cedula: z.string().trim().min(1, { message: "La cédula es obligatoria" }),
    nombres: z.string().trim().min(1, { message: "Los nombres son obligatorios" }),
    celular: z.string().min(1, { message: "El celular es obligatorio" }),
    direccion: z.string().trim().min(1, { message: "La dirección es obligatoria" }),
    fecha_registro: z.string().optional(),
    tipo_documento: z.enum(["CC", "CE", "NIT", "PPT"]).optional(),
    apellidos: z.string().trim().optional(),
    email: z.string().trim().optional(),
    ciudad: z.string().trim().optional(),
});

export async function createClienteCredito(input: unknown, actor: unknown): Promise<ActionResult> {
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) {
        return fail("Actor inválido: se requiere uid + idToken.");
    }
    const validated = createClienteSchema.safeParse(input);
    if (!validated.success) {
        return fail("Por favor corrige los errores del formulario.", validated.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const celular = normalizeCelular(validated.data.celular);
    if (!celular) {
        return fail("Celular inválido: debe tener 10 dígitos (nacional) o 12 con prefijo 57.", {
            celular: ["Formato de celular no normalizable"],
        });
    }
    if (validated.data.email && validated.data.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(validated.data.email)) {
        return fail("Correo electrónico inválido.", { email: ["Formato de email inválido"] });
    }

    try {
        const actorData = await requireActor(parsedActor.data.idToken);
        const adminDb = getDb();

        const dup = await adminDb
            .collection("clientes_credito")
            .where("cedula", "==", validated.data.cedula)
            .limit(1)
            .get();
        if (!dup.empty) {
            const existing = dup.docs[0].data() as Record<string, unknown>;
            if (existing.activo !== false) {
                return fail("Ya existe un cliente con esa cédula.");
            }
        }

        const now = new Date();
        const fechaRegistro = validated.data.fecha_registro
            ? new Date(validated.data.fecha_registro)
            : now;
        if (isNaN(fechaRegistro.getTime())) {
            return fail("Fecha de registro inválida.", { fecha_registro: ["Fecha inválida"] });
        }

        const payload: Record<string, unknown> = {
            cedula: validated.data.cedula,
            nombres: validated.data.nombres,
            celular,
            direccion: validated.data.direccion,
            fecha_registro: fechaRegistro,
            tipo_documento: validated.data.tipo_documento ?? null,
            apellidos: validated.data.apellidos ?? null,
            email: validated.data.email ?? null,
            ciudad: validated.data.ciudad ?? null,
            registrado_por: actorData.uid,
            registrado_por_email: actorData.email ?? null,
            activo: true,
            updated_at: now,
        };

        const docRef = await adminDb.collection("clientes_credito").add(payload);
        await appendAuditoria({
            coleccion: "clientes_credito",
            documentoId: docRef.id,
            operacion: "CREATE",
            antes: null,
            despues: payload,
            actor: actorData,
        });

        revalidatePath("/admin/creditos/clientes");
        return { success: true, message: "Cliente creado.", id: docRef.id };
    } catch (error) {
        console.error("[creditos] createClienteCredito falló:", error);
        return fail(error instanceof Error ? error.message : "Error al crear el cliente.");
    }
}

const updateClienteSchema = createClienteSchema.partial();

export async function updateClienteCredito(id: string, patch: unknown, actor: unknown): Promise<ActionResult> {
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) {
        return fail("Actor inválido: se requiere uid + idToken.");
    }
    const validated = updateClienteSchema.safeParse(patch);
    if (!validated.success) {
        return fail("Por favor corrige los errores del formulario.", validated.error.flatten().fieldErrors as Record<string, string[]>);
    }

    try {
        const actorData = await requireActor(parsedActor.data.idToken);
        const adminDb = getDb();
        const docRef = adminDb.collection("clientes_credito").doc(id);
        const snap = await docRef.get();
        if (!snap.exists) {
            return fail("El cliente no existe.");
        }
        const antes = snap.data() as Record<string, unknown>;
        if (antes.activo === false) {
            return fail("El cliente está inactivo (baja lógica).");
        }

        const patchData = { ...validated.data } as Record<string, unknown>;

        // fecha_registro: SSOT preservado. Si viene en el patch, se descarta y se loguea.
        if ("fecha_registro" in patchData) {
            console.warn("[creditos] updateClienteCredito: fecha_registro descartada (SSOT preservado)", { id });
            delete patchData.fecha_registro;
        }

        if (typeof patchData.celular === "string") {
            const normalized = normalizeCelular(patchData.celular);
            if (!normalized) {
                return fail("Celular inválido: debe tener 10 dígitos o 12 con prefijo 57.", {
                    celular: ["Formato de celular no normalizable"],
                });
            }
            patchData.celular = normalized;
        }

        if (typeof patchData.cedula === "string" && patchData.cedula !== antes.cedula) {
            const dup = await adminDb
                .collection("clientes_credito")
                .where("cedula", "==", patchData.cedula)
                .limit(2)
                .get();
            const collision = dup.docs.some(
                (d: QueryDocumentSnapshot) => d.id !== id && (d.data() as Record<string, unknown>).activo !== false
            );
            if (collision) {
                return fail("Ya existe otro cliente activo con esa cédula.");
            }
        }

        if (typeof patchData.email === "string" && patchData.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patchData.email)) {
            return fail("Correo electrónico inválido.", { email: ["Formato de email inválido"] });
        }

        const now = new Date();
        const updatePayload: Record<string, unknown> = {
            ...patchData,
            actualizado_por: actorData.uid,
            updated_at: now,
        };

        await docRef.update(updatePayload);
        const despues = { ...antes, ...updatePayload };
        await appendAuditoria({
            coleccion: "clientes_credito",
            documentoId: id,
            operacion: "UPDATE",
            antes,
            despues,
            actor: actorData,
        });

        revalidatePath("/admin/creditos/clientes");
        return { success: true, message: "Cliente actualizado.", id };
    } catch (error) {
        console.error("[creditos] updateClienteCredito falló:", error);
        return fail(error instanceof Error ? error.message : "Error al actualizar el cliente.");
    }
}

export async function softDeleteClienteCredito(id: string, motivo: string, actor: unknown): Promise<ActionResult> {
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) {
        return fail("Actor inválido: se requiere uid + idToken.");
    }
    if (!motivo || motivo.trim().length === 0) {
        return fail("La baja lógica exige un motivo.");
    }

    try {
        const actorData = await requireActor(parsedActor.data.idToken);
        const adminDb = getDb();
        const docRef = adminDb.collection("clientes_credito").doc(id);
        const snap = await docRef.get();
        if (!snap.exists) {
            return fail("El cliente no existe.");
        }
        const antes = snap.data() as Record<string, unknown>;
        if (antes.activo === false) {
            return fail("El cliente ya está inactivo.");
        }

        // Baja lógica. PROHIBIDO delete() físico.
        const now = new Date();
        const bajaPayload: Record<string, unknown> = {
            activo: false,
            motivo_baja: motivo.trim(),
            fecha_baja: now,
            baja_por: actorData.uid,
            actualizado_por: actorData.uid,
            updated_at: now,
        };

        await docRef.update(bajaPayload);
        await appendAuditoria({
            coleccion: "clientes_credito",
            documentoId: id,
            operacion: "SOFT_DELETE",
            antes,
            despues: { ...antes, ...bajaPayload },
            actor: actorData,
        });

        revalidatePath("/admin/creditos/clientes");
        return { success: true, message: "Cliente dado de baja (lógica).", id };
    } catch (error) {
        console.error("[creditos] softDeleteClienteCredito falló:", error);
        return fail(error instanceof Error ? error.message : "Error al dar de baja el cliente.");
    }
}
