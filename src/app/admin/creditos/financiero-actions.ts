'use server';

import { z } from "zod";
import { getDb } from "@/lib/firebase-admin";
import { revalidatePath } from "next/cache";
import { calcularComision } from "@/lib/actions/creditos-calc";
import type { CreditoCondiciones } from "@/types/creditos";
import {
    requireActor,
    appendAuditoria,
    type ActionResult,
} from "./actions";
import { actorSchema, moneySchema } from "@/lib/actions/creditos-schemas";
import { requirePermiso } from "@/lib/auth/require-permiso";

/**
 * Server Actions financieras — Fase 9 (Regla A + M3 + M4).
 *
 * - Regla A: `valor_comision`/`valor_neto_empresa` se calculan en SERVIDOR con
 *   `calcularComision()` leyendo `creditos.condiciones`. Todo valor enviado por el
 *   cliente para esos campos se DESCARTA.
 * - `motivo` obligatorio cuando `tipo_transaccion === 'multa'`.
 * - `nota_credito` (Sección 4) es el único mecanismo de ajuste contable negativo.
 * - Remisiones con máquina de estados `pendiente → recibido` (+ `anulado`).
 * - Prohibido `delete()` físico; ledger append-only vía `add()` (OVERRIDE QWEN #4).
 */

// ==========================================
// 0. Helpers locales
// ==========================================

export type PagoResult = ActionResult & {
    valor_comision?: number;
    valor_neto_empresa?: number;
};

function validarActor(actor: unknown) {
    const parsed = actorSchema.safeParse(actor);
    return parsed.success ? parsed.data : null;
}

/** Autorización P5: requireAdmin absorbido por requirePermiso (matriz configurable). */

/** Rango del día actual en America/Bogota (UTC-5 fijo, sin DST). */
function rangoDiaBogota(): { inicio: Date; fin: Date } {
    const ahora = new Date();
    const utcMs = ahora.getTime() + ahora.getTimezoneOffset() * 60000;
    const bogota = new Date(utcMs - 5 * 3600000);
    const inicioBog = new Date(bogota.getFullYear(), bogota.getMonth(), bogota.getDate(), 0, 0, 0, 0);
    const finBog = new Date(bogota.getFullYear(), bogota.getMonth(), bogota.getDate(), 23, 59, 59, 999);
    return {
        inicio: new Date(inicioBog.getTime() + 5 * 3600000),
        fin: new Date(finBog.getTime() + 5 * 3600000),
    };
}

// ==========================================
// 1. pagos_y_multas (Regla A en servidor)
// ==========================================

const pagoSchema = z.object({
    id_credito: z.string().min(1),
    valor_pagado_cliente: z.coerce.number().finite(),
    tipo_transaccion: z.enum(['pago_cuota', 'multa', 'nota_credito']),
    metodo_pago: z.enum(['efectivo', 'transferencia', 'tarjeta', 'pse']).optional(),
    referencia: z.string().optional(),
    motivo: z.string().optional(),
})
    .refine((d) => d.tipo_transaccion !== 'multa' || (d.motivo ?? '').trim().length > 0, {
        message: 'La multa exige motivo',
        path: ['motivo'],
    })
    .refine((d) => d.tipo_transaccion === 'nota_credito' || d.valor_pagado_cliente >= 0, {
        message: 'Solo la nota crédito admite valor negativo',
        path: ['valor_pagado_cliente'],
    });

export async function createPagoYMulta(input: unknown, actor: unknown): Promise<PagoResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    const validated = pagoSchema.safeParse(input);
    if (!validated.success) {
        const first = validated.error.errors[0];
        return { success: false, message: first?.message || 'Datos del pago inválidos.' };
    }
    try {
        const me = await requireActor(a.idToken);
        const adminDb = getDb();
        const data = validated.data;

        // El crédito debe existir y estar activo (prohibido huérfano silencioso)
        const creditoSnap = await adminDb.collection('creditos').doc(data.id_credito).get();
        if (!creditoSnap.exists) {
            return { success: false, message: 'El crédito no existe.' };
        }
        const credito = creditoSnap.data() as { activo?: boolean; condiciones?: CreditoCondiciones };
        if (credito.activo === false) {
            return { success: false, message: 'El crédito está dado de baja.' };
        }
        if (!credito.condiciones) {
            return { success: false, message: 'El crédito no tiene condiciones registradas.' };
        }
        const asignCobro = (creditoSnap.data() as { asignaciones?: { email_usuario?: string | null } }).asignaciones;
        await requirePermiso(me, 'pagos_y_multas', 'create', { email_usuario: asignCobro?.email_usuario ?? null });

        // Regla A — cálculo en SERVIDOR; se ignoran valores del cliente.
        const { valor_comision, valor_neto_empresa } = calcularComision(
            data.valor_pagado_cliente,
            data.tipo_transaccion,
            credito.condiciones
        );

        const payload: Record<string, unknown> = {
            id_credito: data.id_credito,
            valor_pagado_cliente: data.valor_pagado_cliente,
            tipo_transaccion: data.tipo_transaccion,
            valor_comision,
            valor_neto_empresa,
            fecha_registro: new Date(),
            registrado_por: me.uid,
            registrado_por_email: me.email ?? null,
            created_at: new Date(),
            updated_at: new Date(),
            activo: true,
        };
        if (data.metodo_pago) payload.metodo_pago = data.metodo_pago;
        if (data.referencia) payload.referencia = data.referencia.trim();
        if (data.motivo) payload.motivo = data.motivo.trim();

        const docRef = await adminDb.collection('pagos_y_multas').add(payload);
        await appendAuditoria({
            coleccion: 'pagos_y_multas', documentoId: docRef.id, operacion: 'CREATE',
            antes: null, despues: payload, actor: me,
        });
        revalidatePath('/admin/creditos/pagos');
        revalidatePath('/admin/creditos/remisiones');
        revalidatePath('/admin/creditos/inversores');
        return {
            success: true, message: 'Cobro registrado correctamente.', id: docRef.id,
            valor_comision, valor_neto_empresa,
        };
    } catch (error) {
        console.error('[creditos] createPagoYMulta falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al registrar el cobro: ${msg}` };
    }
}

const pagoPatchSchema = z.object({
    valor_pagado_cliente: z.coerce.number().finite().optional(),
    metodo_pago: z.enum(['efectivo', 'transferencia', 'tarjeta', 'pse']).optional(),
    referencia: z.string().optional(),
    motivo: z.string().optional(),
});

export async function updatePagoYMulta(id: string, patch: unknown, actor: unknown): Promise<PagoResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    const validated = pagoPatchSchema.safeParse(patch);
    if (!validated.success) {
        return { success: false, message: 'Datos de actualización inválidos.' };
    }
    try {
        const me = await requireActor(a.idToken);
        const adminDb = getDb();
        const docRef = adminDb.collection('pagos_y_multas').doc(id);
        const snap = await docRef.get();
        if (!snap.exists) return { success: false, message: 'El registro no existe.' };
        const antes = snap.data() as Record<string, unknown>;
        const creditoPrevio = await adminDb.collection('creditos').doc(String(antes.id_credito)).get();
        const asignPrevia = (creditoPrevio.data() as { asignaciones?: { email_usuario?: string | null } } | undefined)?.asignaciones;
        await requirePermiso(me, 'pagos_y_multas', 'update', { email_usuario: asignPrevia?.email_usuario ?? null });

        // id_credito y tipo_transaccion son inmutables (prohibido PAGO↔MULTA).
        const rawPatch = (patch ?? {}) as Record<string, unknown>;
        if ('id_credito' in rawPatch || 'tipo_transaccion' in rawPatch) {
            console.warn('[creditos] updatePagoYMulta: intento de reasignar id_credito/tipo_transaccion — descartado', { id });
        }

        const data = validated.data;
        const tipo = antes.tipo_transaccion as 'pago_cuota' | 'multa' | 'nota_credito';
        const updates: Record<string, unknown> = {
            updated_at: new Date(),
            actualizado_por: me.uid,
        };
        if (data.valor_pagado_cliente !== undefined) {
            if (tipo !== 'nota_credito' && data.valor_pagado_cliente < 0) {
                return { success: false, message: 'Solo la nota crédito admite valor negativo.' };
            }
            // Recalcular comisión/neto con las condiciones del crédito
            const creditoSnap = await adminDb.collection('creditos').doc(String(antes.id_credito)).get();
            const credito = creditoSnap.data() as { condiciones?: CreditoCondiciones } | undefined;
            if (!credito?.condiciones) {
                return { success: false, message: 'El crédito no tiene condiciones registradas.' };
            }
            const calc = calcularComision(data.valor_pagado_cliente, tipo, credito.condiciones);
            updates.valor_pagado_cliente = data.valor_pagado_cliente;
            updates.valor_comision = calc.valor_comision;
            updates.valor_neto_empresa = calc.valor_neto_empresa;
        }
        if (data.metodo_pago !== undefined) updates.metodo_pago = data.metodo_pago;
        if (data.referencia !== undefined) updates.referencia = data.referencia.trim();
        if (data.motivo !== undefined) {
            const motivo = data.motivo.trim();
            if (tipo === 'multa' && motivo.length === 0) {
                return { success: false, message: 'La multa exige motivo.' };
            }
            updates.motivo = motivo;
        }

        await docRef.update(updates);
        const despues = { ...antes, ...updates };
        await appendAuditoria({
            coleccion: 'pagos_y_multas', documentoId: id, operacion: 'UPDATE',
            antes, despues, actor: me,
        });
        revalidatePath('/admin/creditos/pagos');
        return {
            success: true, message: 'Registro actualizado correctamente.', id,
            valor_comision: despues.valor_comision as number | undefined,
            valor_neto_empresa: despues.valor_neto_empresa as number | undefined,
        };
    } catch (error) {
        console.error('[creditos] updatePagoYMulta falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al actualizar el registro: ${msg}` };
    }
}

export async function softDeletePagoYMulta(id: string, motivo: string, actor: unknown): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    if (!motivo || !String(motivo).trim()) {
        return { success: false, message: 'La baja exige un motivo.' };
    }
    try {
        const me = await requireActor(a.idToken);
        const adminDb = getDb();
        const docRef = adminDb.collection('pagos_y_multas').doc(id);
        const snap = await docRef.get();
        if (!snap.exists) return { success: false, message: 'El registro no existe.' };
        const antes = snap.data() as Record<string, unknown>;
        const creditoBaja = await adminDb.collection('creditos').doc(String(antes.id_credito)).get();
        const asignBaja = (creditoBaja.data() as { asignaciones?: { email_usuario?: string | null } } | undefined)?.asignaciones;
        await requirePermiso(me, 'pagos_y_multas', 'update', { email_usuario: asignBaja?.email_usuario ?? null });
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
            coleccion: 'pagos_y_multas', documentoId: id, operacion: 'SOFT_DELETE',
            antes, despues: { ...antes, ...updates }, actor: me,
        });
        revalidatePath('/admin/creditos/pagos');
        return { success: true, message: 'Registro dado de baja correctamente.', id };
    } catch (error) {
        console.error('[creditos] softDeletePagoYMulta falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al dar de baja el registro: ${msg}` };
    }
}

// ==========================================
// 2. pagos_inversores (giro de salida)
// ==========================================

const pagoInversorSchema = z.object({
    id_credito: z.string().min(1),
    email_inversor: z.string().min(1),
    monto: moneySchema,
    metodo_pago: z.enum(['efectivo', 'transferencia', 'cheque', 'otro']).optional(),
    referencia: z.string().optional(),
});

export async function createPagoInversor(input: unknown, actor: unknown): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    const validated = pagoInversorSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, message: 'Datos del giro inválidos. Revisa los campos.' };
    }
    try {
        const me = await requireActor(a.idToken);
        const actorEmail = (me.email ?? '').toLowerCase().trim();
        if (!actorEmail) {
            return { success: false, message: 'La cuenta no tiene email verificado.' };
        }
        const adminDb = getDb();
        const data = validated.data;

        const creditoSnap = await adminDb.collection('creditos').doc(data.id_credito).get();
        if (!creditoSnap.exists) {
            return { success: false, message: 'El crédito no existe.' };
        }
        if ((creditoSnap.data() as { activo?: boolean } | undefined)?.activo === false) {
            return { success: false, message: 'El crédito está dado de baja.' };
        }
        await requirePermiso(me, 'pagos_inversores', 'create');

        const payload: Record<string, unknown> = {
            id_credito: data.id_credito,
            email_admin: actorEmail, // email canónico del admin que gira (Ruta A')
            email_inversor: data.email_inversor.trim(),
            monto: data.monto,
            fecha_registro: new Date(),
            registrado_por: me.uid,
            registrado_por_email: me.email ?? null,
            created_at: new Date(),
            updated_at: new Date(),
            activo: true,
        };
        if (data.metodo_pago) payload.metodo_pago = data.metodo_pago;
        if (data.referencia) payload.referencia = data.referencia.trim();

        const docRef = await adminDb.collection('pagos_inversores').add(payload);
        await appendAuditoria({
            coleccion: 'pagos_inversores', documentoId: docRef.id, operacion: 'CREATE',
            antes: null, despues: payload, actor: me,
        });
        revalidatePath('/admin/creditos/inversores');
        return { success: true, message: 'Giro registrado correctamente.', id: docRef.id };
    } catch (error) {
        console.error('[creditos] createPagoInversor falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al registrar el giro: ${msg}` };
    }
}

const pagoInversorPatchSchema = z.object({
    monto: moneySchema.optional(),
    metodo_pago: z.enum(['efectivo', 'transferencia', 'cheque', 'otro']).optional(),
    referencia: z.string().optional(),
});

export async function updatePagoInversor(id: string, patch: unknown, actor: unknown): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    const validated = pagoInversorPatchSchema.safeParse(patch);
    if (!validated.success) {
        return { success: false, message: 'Datos de actualización inválidos.' };
    }
    try {
        const me = await requireActor(a.idToken);
        const adminDb = getDb();
        const docRef = adminDb.collection('pagos_inversores').doc(id);
        const snap = await docRef.get();
        if (!snap.exists) return { success: false, message: 'El giro no existe.' };
        const antes = snap.data() as Record<string, unknown>;
        await requirePermiso(me, 'pagos_inversores', 'update');

        // id_credito / email_inversor / email_admin son inmutables (prohibido reasignar).
        const rawPatch = (patch ?? {}) as Record<string, unknown>;
        if ('id_credito' in rawPatch || 'email_inversor' in rawPatch || 'email_admin' in rawPatch) {
            console.warn('[creditos] updatePagoInversor: intento de reasignar FK — descartado', { id });
        }

        const data = validated.data;
        const updates: Record<string, unknown> = {
            updated_at: new Date(),
            actualizado_por: me.uid,
        };
        if (data.monto !== undefined) updates.monto = data.monto;
        if (data.metodo_pago !== undefined) updates.metodo_pago = data.metodo_pago;
        if (data.referencia !== undefined) updates.referencia = data.referencia.trim();

        await docRef.update(updates);
        await appendAuditoria({
            coleccion: 'pagos_inversores', documentoId: id, operacion: 'UPDATE',
            antes, despues: { ...antes, ...updates }, actor: me,
        });
        revalidatePath('/admin/creditos/inversores');
        return { success: true, message: 'Giro actualizado correctamente.', id };
    } catch (error) {
        console.error('[creditos] updatePagoInversor falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al actualizar el giro: ${msg}` };
    }
}

export async function softDeletePagoInversor(id: string, motivo: string, actor: unknown): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    if (!motivo || !String(motivo).trim()) {
        return { success: false, message: 'La baja exige un motivo.' };
    }
    try {
        const me = await requireActor(a.idToken);
        const adminDb = getDb();
        const docRef = adminDb.collection('pagos_inversores').doc(id);
        const snap = await docRef.get();
        if (!snap.exists) return { success: false, message: 'El giro no existe.' };
        const antes = snap.data() as Record<string, unknown>;
        await requirePermiso(me, 'pagos_inversores', 'update');
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
            coleccion: 'pagos_inversores', documentoId: id, operacion: 'SOFT_DELETE',
            antes, despues: { ...antes, ...updates }, actor: me,
        });
        revalidatePath('/admin/creditos/inversores');
        return { success: true, message: 'Giro dado de baja correctamente.', id };
    } catch (error) {
        console.error('[creditos] softDeletePagoInversor falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al dar de baja el giro: ${msg}` };
    }
}

// ==========================================
// 3. remisiones_dinero (M3 — máquina de estados)
// ==========================================

export type RemisionResult = ActionResult & { monto?: number };

export async function generarCierreCaja(actor: unknown): Promise<RemisionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    try {
        const me = await requireActor(a.idToken);
        const actorEmail = (me.email ?? '').toLowerCase().trim();
        if (!actorEmail) {
            return { success: false, message: 'La cuenta no tiene email verificado.' };
        }
        const adminDb = getDb();
        await requirePermiso(me, 'remisiones_dinero', 'create', { email_usuario: actorEmail });
        const { inicio, fin } = rangoDiaBogota();

        // Suma de valor_neto_empresa del día del cobrador (registrado_por = uid).
        const snap = await adminDb
            .collection('pagos_y_multas')
            .where('registrado_por', '==', me.uid)
            .where('fecha_registro', '>=', inicio)
            .where('fecha_registro', '<=', fin)
            .get();
        let monto = 0;
        snap.docs.forEach((d: any) => {
            const v = (d.data() as { valor_neto_empresa?: number }).valor_neto_empresa;
            if (typeof v === 'number' && Number.isFinite(v)) monto += v;
        });
        monto = Math.round(monto * 100) / 100;

        const payload = {
            email_cobrador: actorEmail,
            email_admin: '',
            monto,
            fecha_registro: new Date(),
            estado: 'pendiente' as const,
            registrado_por: me.uid,
            registrado_por_email: me.email ?? null,
            created_at: new Date(),
            updated_at: new Date(),
            activo: true,
        };
        const docRef = await adminDb.collection('remisiones_dinero').add(payload);
        await appendAuditoria({
            coleccion: 'remisiones_dinero', documentoId: docRef.id, operacion: 'CREATE',
            antes: null, despues: { ...payload }, actor: me,
        });
        revalidatePath('/admin/creditos/remisiones');
        return { success: true, message: 'Cierre de caja generado (pendiente).', id: docRef.id, monto };
    } catch (error) {
        console.error('[creditos] generarCierreCaja falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al generar el cierre: ${msg}` };
    }
}

export async function aprobarRemision(id: string, actor: unknown): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    try {
        const me = await requireActor(a.idToken);
        await requirePermiso(me, 'remisiones_dinero', 'update');
        const actorEmail = (me.email ?? '').toLowerCase().trim();
        if (!actorEmail) {
            return { success: false, message: 'La cuenta no tiene email verificado.' };
        }
        const adminDb = getDb();
        const docRef = adminDb.collection('remisiones_dinero').doc(id);
        const snap = await docRef.get();
        if (!snap.exists) return { success: false, message: 'La remisión no existe.' };
        const antes = snap.data() as Record<string, unknown>;
        if (antes.estado !== 'pendiente') {
            return { success: false, message: 'Solo se puede aprobar una remisión en estado pendiente.' };
        }
        const updates = {
            estado: 'recibido',
            email_admin: actorEmail,
            updated_at: new Date(),
            actualizado_por: me.uid,
        };
        await docRef.update(updates);
        await appendAuditoria({
            coleccion: 'remisiones_dinero', documentoId: id, operacion: 'UPDATE',
            antes, despues: { ...antes, ...updates }, actor: me,
        });
        revalidatePath('/admin/creditos/remisiones');
        return { success: true, message: 'Remisión aprobada (recibido).', id };
    } catch (error) {
        console.error('[creditos] aprobarRemision falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al aprobar la remisión: ${msg}` };
    }
}

export async function anularRemision(id: string, motivo: string, actor: unknown): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: 'No autorizado. Sesión inválida.' };
    if (!motivo || !String(motivo).trim()) {
        return { success: false, message: 'La anulación exige un motivo.' };
    }
    try {
        const me = await requireActor(a.idToken);
        await requirePermiso(me, 'remisiones_dinero', 'update');
        const adminDb = getDb();
        const docRef = adminDb.collection('remisiones_dinero').doc(id);
        const snap = await docRef.get();
        if (!snap.exists) return { success: false, message: 'La remisión no existe.' };
        const antes = snap.data() as Record<string, unknown>;
        if (antes.estado !== 'pendiente') {
            return { success: false, message: 'Solo se puede anular una remisión en estado pendiente.' };
        }
        const updates = {
            estado: 'anulado',
            activo: false,
            motivo_baja: String(motivo).trim(),
            fecha_baja: new Date(),
            baja_por: me.uid,
            updated_at: new Date(),
            actualizado_por: me.uid,
        };
        await docRef.update(updates);
        await appendAuditoria({
            coleccion: 'remisiones_dinero', documentoId: id, operacion: 'SOFT_DELETE',
            antes, despues: { ...antes, ...updates }, actor: me,
        });
        revalidatePath('/admin/creditos/remisiones');
        return { success: true, message: 'Remisión anulada correctamente.', id };
    } catch (error) {
        console.error('[creditos] anularRemision falló:', error);
        const msg = error instanceof Error ? error.message : 'Excepción desconocida';
        return { success: false, message: `Error al anular la remisión: ${msg}` };
    }
}
