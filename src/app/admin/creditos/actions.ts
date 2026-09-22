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

// ==========================================
// 3. PAGOS A INVERSORES (Plan 08-04 T1)
// ==========================================

/** Verifica que el crédito exista y esté activo. Rechaza huérfanos silenciosos. */
async function assertCreditoActivo(credito_id: string): Promise<{ ok: boolean; message?: string }> {
    const adminDb = getDb();
    const snap = await adminDb.collection("creditos").doc(credito_id).get();
    if (!snap.exists) {
        return { ok: false, message: "El crédito no existe." };
    }
    const data = snap.data() as Record<string, unknown>;
    if (data.activo === false) {
        return { ok: false, message: "El crédito no existe o está inactivo." };
    }
    return { ok: true };
}

const createPagoInversorSchema = z.object({
    credito_id: z.string().min(1, { message: "El crédito es obligatorio" }),
    inversionista_id: z.string().min(1, { message: "El inversionista es obligatorio" }),
    monto: z.coerce.number().min(0, { message: "El monto debe ser ≥ 0" }),
    fecha_pago: z.string().min(1, { message: "La fecha de pago es obligatoria" }),
    metodo_pago: z.enum(["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "OTRO"]),
    referencia: z.string().trim().optional(),
});

export async function createPagoInversor(input: unknown, actor: unknown): Promise<ActionResult> {
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) {
        return fail("Actor inválido: se requiere uid + idToken.");
    }
    const validated = createPagoInversorSchema.safeParse(input);
    if (!validated.success) {
        return fail("Por favor corrige los errores del formulario.", validated.error.flatten().fieldErrors as Record<string, string[]>);
    }
    const fechaPago = new Date(validated.data.fecha_pago);
    if (isNaN(fechaPago.getTime())) {
        return fail("Fecha de pago inválida.", { fecha_pago: ["Fecha inválida"] });
    }

    try {
        const actorData = await requireActor(parsedActor.data.idToken);
        const check = await assertCreditoActivo(validated.data.credito_id);
        if (!check.ok) {
            return fail(check.message as string);
        }
        const adminDb = getDb();
        const now = new Date();

        const payload: Record<string, unknown> = {
            credito_id: validated.data.credito_id,
            inversionista_id: validated.data.inversionista_id,
            monto: validated.data.monto,
            fecha_pago: fechaPago,
            metodo_pago: validated.data.metodo_pago,
            referencia: validated.data.referencia ?? null,
            estado: "PENDIENTE",
            registrado_por: actorData.uid,
            registrado_por_email: actorData.email ?? null,
            activo: true,
            created_at: now,
            updated_at: now,
        };

        const docRef = await adminDb.collection("pagos_inversores").add(payload);
        await appendAuditoria({
            coleccion: "pagos_inversores",
            documentoId: docRef.id,
            operacion: "CREATE",
            antes: null,
            despues: payload,
            actor: actorData,
        });

        revalidatePath("/admin/creditos/pagos-inversores");
        return { success: true, message: "Pago a inversor registrado.", id: docRef.id };
    } catch (error) {
        console.error("[creditos] createPagoInversor falló:", error);
        return fail(error instanceof Error ? error.message : "Error al registrar el pago.");
    }
}

const updatePagoInversorSchema = createPagoInversorSchema.partial();

export async function updatePagoInversor(id: string, patch: unknown, actor: unknown): Promise<ActionResult> {
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) {
        return fail("Actor inválido: se requiere uid + idToken.");
    }
    const validated = updatePagoInversorSchema.safeParse(patch);
    if (!validated.success) {
        return fail("Por favor corrige los errores del formulario.", validated.error.flatten().fieldErrors as Record<string, string[]>);
    }

    try {
        const actorData = await requireActor(parsedActor.data.idToken);
        const adminDb = getDb();
        const docRef = adminDb.collection("pagos_inversores").doc(id);
        const snap = await docRef.get();
        if (!snap.exists) {
            return fail("El pago no existe.");
        }
        const antes = snap.data() as Record<string, unknown>;
        if (antes.activo === false) {
            return fail("El pago está inactivo (baja lógica).");
        }

        const patchData = { ...validated.data } as Record<string, unknown>;
        // Reasignación prohibida: se descartan si vienen.
        delete patchData.credito_id;
        delete patchData.inversionista_id;
        if (typeof patchData.fecha_pago === "string") {
            const f = new Date(patchData.fecha_pago);
            if (isNaN(f.getTime())) {
                return fail("Fecha de pago inválida.", { fecha_pago: ["Fecha inválida"] });
            }
            patchData.fecha_pago = f;
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
            coleccion: "pagos_inversores",
            documentoId: id,
            operacion: "UPDATE",
            antes,
            despues,
            actor: actorData,
        });

        revalidatePath("/admin/creditos/pagos-inversores");
        return { success: true, message: "Pago a inversor actualizado.", id };
    } catch (error) {
        console.error("[creditos] updatePagoInversor falló:", error);
        return fail(error instanceof Error ? error.message : "Error al actualizar el pago.");
    }
}

export async function softDeletePagoInversor(id: string, motivo: string, actor: unknown): Promise<ActionResult> {
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
        const docRef = adminDb.collection("pagos_inversores").doc(id);
        const snap = await docRef.get();
        if (!snap.exists) {
            return fail("El pago no existe.");
        }
        const antes = snap.data() as Record<string, unknown>;
        if (antes.activo === false) {
            return fail("El pago ya está inactivo.");
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
            coleccion: "pagos_inversores",
            documentoId: id,
            operacion: "SOFT_DELETE",
            antes,
            despues: { ...antes, ...bajaPayload },
            actor: actorData,
        });

        revalidatePath("/admin/creditos/pagos-inversores");
        return { success: true, message: "Pago dado de baja (lógica).", id };
    } catch (error) {
        console.error("[creditos] softDeletePagoInversor falló:", error);
        return fail(error instanceof Error ? error.message : "Error al dar de baja el pago.");
    }
}

// ==========================================
// 4. PAGOS Y MULTAS (Plan 08-04 T2)
// Regla: motivo obligatorio cuando tipo === 'MULTA'.
// ==========================================

const pagoYMultaBase = z.object({
    credito_id: z.string().min(1, { message: "El crédito es obligatorio" }),
    tipo: z.enum(["PAGO", "MULTA"]),
    monto: z.coerce.number().min(0, { message: "El monto debe ser ≥ 0" }),
    fecha: z.string().min(1, { message: "La fecha es obligatoria" }),
    metodo_pago: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA", "PSE"]).optional(),
    motivo: z.string().trim().optional(),
    referencia: z.string().trim().optional(),
});

const createPagoYMultaSchema = pagoYMultaBase.refine(
    (data) => data.tipo !== "MULTA" || (data.motivo ?? "").trim().length > 0,
    {
        message: "La multa exige motivo",
        path: ["motivo"],
    }
);

export async function createPagoYMulta(input: unknown, actor: unknown): Promise<ActionResult> {
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) {
        return fail("Actor inválido: se requiere uid + idToken.");
    }
    const validated = createPagoYMultaSchema.safeParse(input);
    if (!validated.success) {
        return fail("Por favor corrige los errores del formulario.", validated.error.flatten().fieldErrors as Record<string, string[]>);
    }
    const fecha = new Date(validated.data.fecha);
    if (isNaN(fecha.getTime())) {
        return fail("Fecha inválida.", { fecha: ["Fecha inválida"] });
    }

    try {
        const actorData = await requireActor(parsedActor.data.idToken);
        const check = await assertCreditoActivo(validated.data.credito_id);
        if (!check.ok) {
            return fail(check.message as string);
        }
        const adminDb = getDb();
        const now = new Date();

        const payload: Record<string, unknown> = {
            credito_id: validated.data.credito_id,
            tipo: validated.data.tipo,
            monto: validated.data.monto,
            fecha,
            metodo_pago: validated.data.metodo_pago ?? null,
            motivo: validated.data.motivo?.trim() ?? null,
            referencia: validated.data.referencia ?? null,
            estado: "PENDIENTE",
            registrado_por: actorData.uid,
            registrado_por_email: actorData.email ?? null,
            activo: true,
            created_at: now,
            updated_at: now,
        };

        const docRef = await adminDb.collection("pagos_y_multas").add(payload);
        await appendAuditoria({
            coleccion: "pagos_y_multas",
            documentoId: docRef.id,
            operacion: "CREATE",
            antes: null,
            despues: payload,
            actor: actorData,
        });

        revalidatePath("/admin/creditos/pagos-multas");
        return { success: true, message: validated.data.tipo === "MULTA" ? "Multa registrada." : "Pago registrado.", id: docRef.id };
    } catch (error) {
        console.error("[creditos] createPagoYMulta falló:", error);
        return fail(error instanceof Error ? error.message : "Error al registrar.");
    }
}

const updatePagoYMultaSchema = pagoYMultaBase.partial();

export async function updatePagoYMulta(id: string, patch: unknown, actor: unknown): Promise<ActionResult> {
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) {
        return fail("Actor inválido: se requiere uid + idToken.");
    }
    const validated = updatePagoYMultaSchema.safeParse(patch);
    if (!validated.success) {
        return fail("Por favor corrige los errores del formulario.", validated.error.flatten().fieldErrors as Record<string, string[]>);
    }

    try {
        const actorData = await requireActor(parsedActor.data.idToken);
        const adminDb = getDb();
        const docRef = adminDb.collection("pagos_y_multas").doc(id);
        const snap = await docRef.get();
        if (!snap.exists) {
            return fail("El registro no existe.");
        }
        const antes = snap.data() as Record<string, unknown>;
        if (antes.activo === false) {
            return fail("El registro está inactivo (baja lógica).");
        }

        const patchData = { ...validated.data } as Record<string, unknown>;
        // Conversión PAGO↔MULTA y reasignación prohibidas: se descartan si vienen.
        delete patchData.credito_id;
        delete patchData.tipo;
        if (typeof patchData.fecha === "string") {
            const f = new Date(patchData.fecha);
            if (isNaN(f.getTime())) {
                return fail("Fecha inválida.", { fecha: ["Fecha inválida"] });
            }
            patchData.fecha = f;
        }
        // Si el doc es MULTA, el patch no puede vaciar el motivo.
        if (antes.tipo === "MULTA" && "motivo" in patchData) {
            const m = patchData.motivo;
            if (typeof m !== "string" || m.trim().length === 0) {
                return fail("La multa exige motivo.", { motivo: ["La multa exige motivo"] });
            }
            patchData.motivo = m.trim();
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
            coleccion: "pagos_y_multas",
            documentoId: id,
            operacion: "UPDATE",
            antes,
            despues,
            actor: actorData,
        });

        revalidatePath("/admin/creditos/pagos-multas");
        return { success: true, message: "Registro actualizado.", id };
    } catch (error) {
        console.error("[creditos] updatePagoYMulta falló:", error);
        return fail(error instanceof Error ? error.message : "Error al actualizar.");
    }
}

export async function softDeletePagoYMulta(id: string, motivo: string, actor: unknown): Promise<ActionResult> {
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
        const docRef = adminDb.collection("pagos_y_multas").doc(id);
        const snap = await docRef.get();
        if (!snap.exists) {
            return fail("El registro no existe.");
        }
        const antes = snap.data() as Record<string, unknown>;
        if (antes.activo === false) {
            return fail("El registro ya está inactivo.");
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
            coleccion: "pagos_y_multas",
            documentoId: id,
            operacion: "SOFT_DELETE",
            antes,
            despues: { ...antes, ...bajaPayload },
            actor: actorData,
        });

        revalidatePath("/admin/creditos/pagos-multas");
        return { success: true, message: "Registro dado de baja (lógica).", id };
    } catch (error) {
        console.error("[creditos] softDeletePagoYMulta falló:", error);
        return fail(error instanceof Error ? error.message : "Error al dar de baja.");
    }
}

// ==========================================
// 5. REMISIONES DE DINERO (Plan 08-04 T3)
// Reglas: origen !== destino; estados PENDIENTE→ENVIADO→RECIBIDO o ANULADO.
// ==========================================

const ORDEN_ESTADOS_REMISION = ["PENDIENTE", "ENVIADO", "RECIBIDO"] as const;

const remisionBase = z.object({
    origen: z.string().trim().min(1, { message: "El origen es obligatorio" }),
    destino: z.string().trim().min(1, { message: "El destino es obligatorio" }),
    monto: z.coerce.number().min(0, { message: "El monto debe ser ≥ 0" }),
    fecha_remision: z.string().min(1, { message: "La fecha es obligatoria" }),
    metodo: z.enum(["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "OTRO"]),
    comprobante_url: z.string().trim().optional(),
    responsable_recepcion: z.string().trim().optional(),
});

const createRemisionSchema = remisionBase.refine((data) => data.origen !== data.destino, {
    message: "Origen y destino deben diferir",
    path: ["destino"],
});

export async function createRemisionDinero(input: unknown, actor: unknown): Promise<ActionResult> {
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) {
        return fail("Actor inválido: se requiere uid + idToken.");
    }
    const validated = createRemisionSchema.safeParse(input);
    if (!validated.success) {
        return fail("Por favor corrige los errores del formulario.", validated.error.flatten().fieldErrors as Record<string, string[]>);
    }
    const fecha = new Date(validated.data.fecha_remision);
    if (isNaN(fecha.getTime())) {
        return fail("Fecha de remisión inválida.", { fecha_remision: ["Fecha inválida"] });
    }
    if (validated.data.comprobante_url && !/^https?:\/\/.+/.test(validated.data.comprobante_url)) {
        return fail("URL de comprobante inválida.", { comprobante_url: ["Debe ser una URL válida"] });
    }

    try {
        const actorData = await requireActor(parsedActor.data.idToken);
        const adminDb = getDb();
        const now = new Date();

        const payload: Record<string, unknown> = {
            origen: validated.data.origen,
            destino: validated.data.destino,
            monto: validated.data.monto,
            fecha_remision: fecha,
            metodo: validated.data.metodo,
            comprobante_url: validated.data.comprobante_url ?? null,
            responsable_recepcion: validated.data.responsable_recepcion ?? null,
            estado: "PENDIENTE",
            registrado_por: actorData.uid,
            registrado_por_email: actorData.email ?? null,
            activo: true,
            created_at: now,
            updated_at: now,
        };

        const docRef = await adminDb.collection("remisiones_dinero").add(payload);
        await appendAuditoria({
            coleccion: "remisiones_dinero",
            documentoId: docRef.id,
            operacion: "CREATE",
            antes: null,
            despues: payload,
            actor: actorData,
        });

        revalidatePath("/admin/creditos/remisiones");
        return { success: true, message: "Remisión registrada.", id: docRef.id };
    } catch (error) {
        console.error("[creditos] createRemisionDinero falló:", error);
        return fail(error instanceof Error ? error.message : "Error al registrar la remisión.");
    }
}

const updateRemisionSchema = remisionBase.partial().extend({
    estado: z.enum(["PENDIENTE", "ENVIADO", "RECIBIDO", "ANULADO"]).optional(),
});

export async function updateRemisionDinero(id: string, patch: unknown, actor: unknown): Promise<ActionResult> {
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) {
        return fail("Actor inválido: se requiere uid + idToken.");
    }
    const validated = updateRemisionSchema.safeParse(patch);
    if (!validated.success) {
        return fail("Por favor corrige los errores del formulario.", validated.error.flatten().fieldErrors as Record<string, string[]>);
    }

    try {
        const actorData = await requireActor(parsedActor.data.idToken);
        const adminDb = getDb();
        const docRef = adminDb.collection("remisiones_dinero").doc(id);
        const snap = await docRef.get();
        if (!snap.exists) {
            return fail("La remisión no existe.");
        }
        const antes = snap.data() as Record<string, unknown>;
        if (antes.activo === false) {
            return fail("La remisión está inactiva (baja lógica).");
        }

        const patchData = { ...validated.data } as Record<string, unknown>;
        if (typeof patchData.fecha_remision === "string") {
            const f = new Date(patchData.fecha_remision);
            if (isNaN(f.getTime())) {
                return fail("Fecha de remisión inválida.", { fecha_remision: ["Fecha inválida"] });
            }
            patchData.fecha_remision = f;
        }
        if (typeof patchData.comprobante_url === "string" && patchData.comprobante_url.length > 0 && !/^https?:\/\/.+/.test(patchData.comprobante_url)) {
            return fail("URL de comprobante inválida.", { comprobante_url: ["Debe ser una URL válida"] });
        }

        // Máquina de estados: PENDIENTE→ENVIADO→RECIBIDO, o ANULADO desde cualquiera.
        // El servidor es la autoridad final (el cliente solo asiste).
        if (typeof patchData.estado === "string" && patchData.estado !== antes.estado) {
            const next = patchData.estado as string;
            if (next !== "ANULADO") {
                const curIdx = (ORDEN_ESTADOS_REMISION as readonly string[]).indexOf(antes.estado as string);
                const nextIdx = (ORDEN_ESTADOS_REMISION as readonly string[]).indexOf(next);
                if (curIdx === -1 || nextIdx !== curIdx + 1) {
                    return fail(`Transición de estado inválida: ${String(antes.estado)} → ${next}.`, {
                        estado: ["Transición no permitida"],
                    });
                }
            }
        }
        // Origen y destino resultantes deben seguir difiriendo.
        const origenFinal = (patchData.origen as string | undefined) ?? antes.origen;
        const destinoFinal = (patchData.destino as string | undefined) ?? antes.destino;
        if (origenFinal === destinoFinal) {
            return fail("Origen y destino deben diferir.", { destino: ["Origen y destino deben diferir"] });
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
            coleccion: "remisiones_dinero",
            documentoId: id,
            operacion: "UPDATE",
            antes,
            despues,
            actor: actorData,
        });

        revalidatePath("/admin/creditos/remisiones");
        return { success: true, message: "Remisión actualizada.", id };
    } catch (error) {
        console.error("[creditos] updateRemisionDinero falló:", error);
        return fail(error instanceof Error ? error.message : "Error al actualizar la remisión.");
    }
}

export async function softDeleteRemisionDinero(id: string, motivo: string, actor: unknown): Promise<ActionResult> {
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
        const docRef = adminDb.collection("remisiones_dinero").doc(id);
        const snap = await docRef.get();
        if (!snap.exists) {
            return fail("La remisión no existe.");
        }
        const antes = snap.data() as Record<string, unknown>;
        if (antes.activo === false) {
            return fail("La remisión ya está inactiva.");
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
            coleccion: "remisiones_dinero",
            documentoId: id,
            operacion: "SOFT_DELETE",
            antes,
            despues: { ...antes, ...bajaPayload },
            actor: actorData,
        });

        revalidatePath("/admin/creditos/remisiones");
        return { success: true, message: "Remisión dada de baja (lógica).", id };
    } catch (error) {
        console.error("[creditos] softDeleteRemisionDinero falló:", error);
        return fail(error instanceof Error ? error.message : "Error al dar de baja la remisión.");
    }
}
