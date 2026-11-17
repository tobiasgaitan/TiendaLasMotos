'use server';

import { z } from "zod";
import { getDb } from "@/lib/firebase-admin";
import { revalidatePath } from "next/cache";
import { moneySchema, intSchema } from "@/lib/actions/creditos-schemas";
import { requirePermiso } from "@/lib/auth/require-permiso";
import { requireActor, validarActor } from "@/lib/actions/actor";
import { appendAuditoria } from "@/lib/actions/audit";
import { runAction, withAuthAndAudit } from "@/lib/actions/run-action";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Server Actions core — Módulo de Gestión de Créditos y Renting (Fase 9).
 *
 * - OVERRIDE QWEN #3: `registrado_por` = uid VERIFICADO por `verifyIdToken()`.
 *   NUNCA se acepta un uid sin verificar.
 * - OVERRIDE QWEN #4: el ledger `historial_auditoria` es append-only vía `add()`.
 *   PROHIBIDO batch.set()/set()/update()/delete() sobre el ledger.
 * - Prohibido `delete()` físico en todas las colecciones (baja lógica).
 */

// ==========================================
// 0. Tipos y núcleo compartido (movido a src/lib/actions)
// ==========================================

export { requireActor } from '@/lib/actions/actor';
export { appendAuditoria } from '@/lib/actions/audit';
export type { ActionResult } from '@/lib/actions/result';
export type { ActorInput, VerifiedActor } from '@/lib/actions/actor';
export type { AuditoriaInput, OperacionAuditoria } from '@/lib/actions/audit';

// ==========================================
// 2. Utilidades
// ==========================================

function normalizarCelular(raw: string): string | null {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length === 10) return '57' + digits; // tolerancia legacy
    if (digits.length === 12 && digits.startsWith('57')) return digits;
    return null; // prohibido null-masking silencioso
}

function parseFechaISO(raw: unknown): Date | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const d = new Date(String(raw));
    return isNaN(d.getTime()) ? null : d;
}

async function getNextNumeroCredito(): Promise<string> {
    // Correlativo aditivo CRE-YYYY-XXXX en configuracion/counters (SSOT quotation.ts).
    // Prohibida colección nueva de contadores; { merge: true } no toca quotation*.
    const adminDb = getDb();
    const year = new Date().getFullYear();
    const counterRef = adminDb.collection('configuracion').doc('counters');
    const numero = await adminDb.runTransaction(async (t: any) => {
        const snap = await t.get(counterRef);
        let count = 0;
        if (snap.exists) {
            const data = snap.data() as { creditoCount?: number; creditoYear?: number } | undefined;
            count = data && data.creditoYear === year ? (data.creditoCount || 0) : 0;
        }
        const next = count + 1;
        t.set(counterRef, { creditoCount: next, creditoYear: year }, { merge: true });
        return `CRE-${year}-${String(next).padStart(4, '0')}`;
    });
    return numero as string;
}

// ==========================================
// 3. CRUD creditos
// ==========================================

const vehiculoSchema = z.object({
    placa: z.string().min(1).transform((s) => s.trim().toUpperCase()),
    marca: z.string().optional(),
    modelo: z.string().optional(),
    anio: intSchema.optional(),
    color: z.string().optional(),
});

const condicionesSchema = z.object({
    porcentaje_comision: moneySchema,
    valor_cuota: moneySchema,
    excluir_domingos: z.boolean(),
    modalidad_credito: z.enum(['renting', 'credito', 'contado']),
});

const asignacionesSchema = z.object({
    email_admin: z.string().min(1),
    email_usuario: z.string().min(1),
    email_inversor: z.string().min(1),
});

const creditoSchema = z.object({
    id_cliente: z.string().min(1),
    fecha_registro: z.string().optional(),
    vehiculo: vehiculoSchema,
    condiciones: condicionesSchema,
    asignaciones: asignacionesSchema,
});

const createCreditoImpl = withAuthAndAudit<
    z.infer<typeof creditoSchema>,
    ActionResult
>(
    {
        name: 'createCredito',
        schema: creditoSchema,
        invalidMessage: 'Datos del crédito inválidos. Revisa los campos.',
        permission: { coleccion: 'creditos', accion: 'create' },
        revalidate: ['/admin/creditos'],
        errorPrefix: 'Error al crear el crédito',
    },
    async ({ db, actor: me, input: data, audit }): Promise<ActionResult> => {
        // FK: el cliente debe existir y estar activo (prohibido huérfano silencioso)
        const clienteSnap = await db
            .collection('clientes_credito')
            .doc(data.id_cliente)
            .get();
        if (
            !clienteSnap.exists ||
            (clienteSnap.data() as { activo?: boolean } | undefined)?.activo === false
        ) {
            return { success: false, message: 'El cliente no existe o está inactivo.' };
        }

        const fechaRegistro = parseFechaISO(data.fecha_registro) ?? new Date();
        const numero_credito = await getNextNumeroCredito();
        const payload = {
            id_cliente: data.id_cliente.trim(),
            fecha_registro: fechaRegistro,
            vehiculo: data.vehiculo,
            condiciones: data.condiciones,
            asignaciones: data.asignaciones,
            numero_credito,
            registrado_por: me.uid,
            registrado_por_email: me.email ?? null,
            created_at: new Date(),
            updated_at: new Date(),
            activo: true,
        };
        const docRef = await db.collection('creditos').add(payload);
        await audit({
            coleccion: 'creditos',
            documentoId: docRef.id,
            operacion: 'CREATE',
            antes: null,
            despues: { ...payload, fecha_registro: fechaRegistro.toISOString() },
        });
        return {
            success: true,
            message: 'Crédito creado correctamente.',
            id: docRef.id,
            numero_credito,
        };
    }
);

export async function createCredito(input: unknown, actor: unknown): Promise<ActionResult> {
    return createCreditoImpl(input, actor);
}

const creditoPatchSchema = z.object({
    vehiculo: vehiculoSchema.partial().optional(),
    condiciones: condicionesSchema.partial().optional(),
    asignaciones: asignacionesSchema.partial().optional(),
});

const updateCreditoSchema = z.object({
    id: z.string(),
    patch: creditoPatchSchema,
});

export async function updateCredito(id: string, patch: unknown, actor: unknown): Promise<ActionResult> {
    return runAction<z.infer<typeof updateCreditoSchema>, ActionResult>(
        {
            name: 'updateCredito',
            schema: updateCreditoSchema,
            invalidMessage: 'Datos de actualización inválidos.',
            permission: { coleccion: 'creditos', accion: 'update' },
            revalidate: ['/admin/creditos'],
            errorPrefix: 'Error al actualizar el crédito',
        },
        { id, patch },
        actor,
        async ({ db, actor: me, input, audit }): Promise<ActionResult> => {
            const docRef = db.collection('creditos').doc(input.id);
            const snap = await docRef.get();
            if (!snap.exists) {
                return { success: false, message: 'El crédito no existe.' };
            }
            const antes = snap.data() as Record<string, unknown>;
            if ((antes as { activo?: boolean }).activo === false) {
                return { success: false, message: 'El crédito está dado de baja.' };
            }

            // numero_credito y fecha_registro son inmutables: si vienen, se descartan y loguean.
            const rawPatch = (patch ?? {}) as Record<string, unknown>;
            if ('numero_credito' in rawPatch || 'fecha_registro' in rawPatch) {
                console.warn('[creditos] updateCredito: intento de modificar numero_credito/fecha_registro — descartado', { id });
            }

            const updates: Record<string, unknown> = {
                ...input.patch,
                updated_at: new Date(),
                actualizado_por: me.uid,
            };
            await docRef.update(updates);
            const despues = { ...antes, ...updates };
            await audit({
                coleccion: 'creditos',
                documentoId: input.id,
                operacion: 'UPDATE',
                antes,
                despues,
            });
            return {
                success: true,
                message: 'Crédito actualizado correctamente.',
                id: input.id,
            };
        }
    );
}

export async function softDeleteCredito(id: string, motivo: string, actor: unknown): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    if (!motivo || !String(motivo).trim()) {
        return { success: false, message: 'La baja exige un motivo.' };
    }
    try {
        const me = await requireActor(a.idToken);
        await requirePermiso(me, 'creditos', 'update');
        const adminDb = getDb();
        const docRef = adminDb.collection('creditos').doc(id);
        const snap = await docRef.get();
        if (!snap.exists) return { success: false, message: 'El crédito no existe.' };
        const antes = snap.data() as Record<string, unknown>;
        const updates = {
            activo: false,
            motivo_baja: String(motivo).trim(),
            fecha_baja: new Date(),
            baja_por: me.uid,
            updated_at: new Date(),
            actualizado_por: me.uid,
        };
        await docRef.update(updates);
        await appendAuditoria({
            coleccion: 'creditos', documentoId: id, operacion: 'SOFT_DELETE',
            antes, despues: { ...antes, ...updates }, actor: me,
        });
        revalidatePath('/admin/creditos');
        return { success: true, message: 'Crédito dado de baja correctamente.', id };
    } catch (error) {
        console.error('[creditos] softDeleteCredito falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al dar de baja el crédito: ${msg}` };
    }
}

// ==========================================
// 4. Alta/edición/baja de clientes_credito (NAMING LOCK)
// ==========================================

const clienteSchema = z.object({
    cedula: z.string().min(1).transform((s) => s.trim()),
    nombres: z.string().min(1).transform((s) => s.trim()),
    celular: z.string().min(1),
    direccion: z.string().min(1).transform((s) => s.trim()),
    fecha_registro: z.string().optional(),
    tipo_documento: z.enum(['CC', 'CE', 'NIT', 'PPT']).optional(),
    apellidos: z.string().optional(),
    email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
    ciudad: z.string().optional(),
});

export async function createClienteCredito(input: unknown, actor: unknown): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    const validated = clienteSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, message: 'Datos del cliente inválidos. Revisa los campos.' };
    }
    try {
        const me = await requireActor(a.idToken);
        await requirePermiso(me, 'clientes_credito', 'create');
        const adminDb = getDb();
        const data = validated.data;

        // Normalización 12 dígitos (contrato UNE); tolera legacy 10 dígitos.
        const celular = normalizarCelular(data.celular);
        if (!celular) {
            return { success: false, message: 'El celular no es normalizable (se esperan 10 o 12 dígitos).' };
        }

        // Duplicado por cedula (clave canónica de documento)
        const dup = await adminDb.collection('clientes_credito').where('cedula', '==', data.cedula).limit(1).get();
        if (!dup.empty) {
            return { success: false, message: 'Ya existe un cliente con esa cédula.' };
        }

        const fechaRegistro = parseFechaISO(data.fecha_registro) ?? new Date();
        const payload: Record<string, unknown> = {
            cedula: data.cedula,
            nombres: data.nombres,
            celular,
            direccion: data.direccion,
            fecha_registro: fechaRegistro,
            registrado_por: me.uid,
            registrado_por_email: me.email ?? null,
            updated_at: new Date(),
            activo: true,
        };
        // Extensiones aditivas opcionales (solo si vienen)
        if (data.tipo_documento) payload.tipo_documento = data.tipo_documento;
        if (data.apellidos) payload.apellidos = data.apellidos.trim();
        if (data.email) payload.email = data.email;
        if (data.ciudad) payload.ciudad = data.ciudad.trim();

        const docRef = await adminDb.collection('clientes_credito').add(payload);
        await appendAuditoria({
            coleccion: 'clientes_credito', documentoId: docRef.id, operacion: 'CREATE',
            antes: null, despues: { ...payload, fecha_registro: fechaRegistro.toISOString() }, actor: me,
        });
        revalidatePath('/admin/creditos');
        return { success: true, message: 'Cliente creado correctamente.', id: docRef.id };
    } catch (error) {
        console.error('[creditos] createClienteCredito falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al crear el cliente: ${msg}` };
    }
}

const clientePatchSchema = z.object({
    cedula: z.string().min(1).transform((s) => s.trim()).optional(),
    nombres: z.string().min(1).transform((s) => s.trim()).optional(),
    celular: z.string().min(1).optional(),
    direccion: z.string().min(1).transform((s) => s.trim()).optional(),
    tipo_documento: z.enum(['CC', 'CE', 'NIT', 'PPT']).optional(),
    apellidos: z.string().optional(),
    email: z.string().email().optional(),
    ciudad: z.string().optional(),
});

export async function updateClienteCredito(id: string, patch: unknown, actor: unknown): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    const validated = clientePatchSchema.safeParse(patch);
    if (!validated.success) {
        return { success: false, message: 'Datos de actualización inválidos.' };
    }
    try {
        const me = await requireActor(a.idToken);
        await requirePermiso(me, 'clientes_credito', 'update');
        const adminDb = getDb();
        const docRef = adminDb.collection('clientes_credito').doc(id);
        const snap = await docRef.get();
        if (!snap.exists) return { success: false, message: 'El cliente no existe.' };
        const antes = snap.data() as Record<string, unknown>;

        // fecha_registro es inmutable: si viene en el patch, se descarta y loguea.
        const rawPatch = (patch ?? {}) as Record<string, unknown>;
        if ('fecha_registro' in rawPatch) {
            console.warn('[creditos] updateClienteCredito: intento de modificar fecha_registro — descartado', { id });
        }

        const data = validated.data;
        const updates: Record<string, unknown> = {
            updated_at: new Date(),
            actualizado_por: me.uid,
        };
        if (data.nombres !== undefined) updates.nombres = data.nombres;
        if (data.direccion !== undefined) updates.direccion = data.direccion;
        if (data.tipo_documento !== undefined) updates.tipo_documento = data.tipo_documento;
        if (data.apellidos !== undefined) updates.apellidos = data.apellidos.trim();
        if (data.email !== undefined) updates.email = data.email;
        if (data.ciudad !== undefined) updates.ciudad = data.ciudad.trim();
        if (data.celular !== undefined) {
            const celular = normalizarCelular(data.celular);
            if (!celular) return { success: false, message: 'El celular no es normalizable.' };
            updates.celular = celular;
        }
        if (data.cedula !== undefined) {
            // cedula editable solo si no colisiona con otro doc
            const dup = await adminDb.collection('clientes_credito').where('cedula', '==', data.cedula).get();
            const colision = dup.docs.some((d: any) => d.id !== id);
            if (colision) return { success: false, message: 'Otra ficha ya usa esa cédula.' };
            updates.cedula = data.cedula;
        }

        await docRef.update(updates);
        await appendAuditoria({
            coleccion: 'clientes_credito', documentoId: id, operacion: 'UPDATE',
            antes, despues: { ...antes, ...updates }, actor: me,
        });
        revalidatePath('/admin/creditos');
        return { success: true, message: 'Cliente actualizado correctamente.', id };
    } catch (error) {
        console.error('[creditos] updateClienteCredito falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al actualizar el cliente: ${msg}` };
    }
}

export async function softDeleteClienteCredito(id: string, motivo: string, actor: unknown): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    if (!motivo || !String(motivo).trim()) {
        return { success: false, message: 'La baja exige un motivo.' };
    }
    try {
        const me = await requireActor(a.idToken);
        await requirePermiso(me, 'clientes_credito', 'update');
        const adminDb = getDb();
        const docRef = adminDb.collection('clientes_credito').doc(id);
        const snap = await docRef.get();
        if (!snap.exists) return { success: false, message: 'El cliente no existe.' };
        const antes = snap.data() as Record<string, unknown>;
        const updates = {
            activo: false,
            motivo_baja: String(motivo).trim(),
            fecha_baja: new Date(),
            baja_por: me.uid,
            updated_at: new Date(),
            actualizado_por: me.uid,
        };
        await docRef.update(updates);
        await appendAuditoria({
            coleccion: 'clientes_credito', documentoId: id, operacion: 'SOFT_DELETE',
            antes, despues: { ...antes, ...updates }, actor: me,
        });
        revalidatePath('/admin/creditos');
        return { success: true, message: 'Cliente dado de baja correctamente.', id };
    } catch (error) {
        console.error('[creditos] softDeleteClienteCredito falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al dar de baja el cliente: ${msg}` };
    }
}
