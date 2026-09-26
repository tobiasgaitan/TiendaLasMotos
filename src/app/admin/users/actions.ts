'use server';

import { getDb } from "@/lib/firebase-admin";
import { revalidatePath } from "next/cache";
import {
    requireActor,
    appendAuditoria,
    type ActionResult,
} from "@/app/admin/creditos/actions";
import { actorSchema } from "@/lib/actions/creditos-schemas";
import { requirePermiso } from "@/lib/auth/require-permiso";
import {
    userCreateSchema,
    userPatchSchema,
    emailCanonSchema,
    esAutoBorrado,
    construirPayloadUsuario,
} from "@/lib/actions/users-schemas";

/**
 * Server Actions — CRUD de sys_admin_users vía Admin SDK (WEB-029).
 *
 * Reemplaza las escrituras por SDK cliente (setDoc/deleteDoc) del panel.
 * - `registrado_por` = uid VERIFICADO por `verifyIdToken()` (OVERRIDE QWEN #3).
 * - Autorización por matriz P5 (`requirePermiso`); solo superadmin borra.
 * - Ledger `historial_auditoria` append-only vía `add()` (OVERRIDE QWEN #4).
 * - PROHIBIDO `delete()` físico: la baja es `active: false` (baja lógica).
 */

function validarActor(actor: unknown): { uid: string; idToken: string } | null {
    const parsed = actorSchema.safeParse(actor);
    if (!parsed.success) return null;
    return parsed.data;
}

export async function createUser(input: unknown, actor: unknown): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: "No autorizado. Sesión inválida." };
    const validated = userCreateSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, message: "Datos del usuario inválidos. Revisa los campos." };
    }
    try {
        const me = await requireActor(a.idToken);
        await requirePermiso(me, "sys_admin_users", "create");
        const adminDb = getDb();
        const data = validated.data;

        // Evita sobrescritura silenciosa: el docId (email) debe ser nuevo.
        const docRef = adminDb.collection("sys_admin_users").doc(data.email);
        const snap = await docRef.get();
        if (snap.exists) {
            return { success: false, message: "Ya existe un usuario con ese correo." };
        }

        const payload: Record<string, unknown> = {
            name: data.name,
            email: data.email,
            rol: data.rol,
            active: data.active,
            createdAt: new Date().toISOString(),
            registrado_por: me.uid,
            registrado_por_email: me.email ?? null,
            created_at: new Date(),
            updated_at: new Date(),
        };
        await docRef.set(payload);
        await appendAuditoria({
            coleccion: "sys_admin_users",
            documentoId: data.email,
            operacion: "CREATE",
            antes: null,
            despues: payload,
            actor: me,
        });
        revalidatePath("/admin/users");
        return { success: true, message: "Usuario creado correctamente.", id: data.email };
    } catch (error) {
        console.error("[users] createUser falló:", error);
        const msg = error instanceof Error ? error.message : "Excepción desconocida";
        return { success: false, message: `Error al crear el usuario: ${msg}` };
    }
}

export async function updateUser(
    emailKey: unknown,
    patch: unknown,
    actor: unknown
): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: "No autorizado. Sesión inválida." };
    const emailParsed = emailKey !== undefined
        ? emailCanonSchema.safeParse(emailKey)
        : { success: false as const };
    if (!emailParsed.success) {
        return { success: false, message: "Correo inválido." };
    }
    const validated = userPatchSchema.safeParse(patch);
    if (!validated.success) {
        return { success: false, message: "Datos de actualización inválidos." };
    }
    try {
        const me = await requireActor(a.idToken);
        await requirePermiso(me, "sys_admin_users", "update");
        const adminDb = getDb();
        const docRef = adminDb.collection("sys_admin_users").doc(emailParsed.data);
        const snap = await docRef.get();
        if (!snap.exists) return { success: false, message: "El usuario no existe." };
        const antes = snap.data() as Record<string, unknown>;

        const updates = construirPayloadUsuario(validated.data);
        updates.actualizado_por = me.uid;
        await docRef.set(updates, { merge: true });
        await appendAuditoria({
            coleccion: "sys_admin_users",
            documentoId: emailParsed.data,
            operacion: "UPDATE",
            antes,
            despues: { ...antes, ...updates },
            actor: me,
        });
        revalidatePath("/admin/users");
        return { success: true, message: "Usuario actualizado correctamente.", id: emailParsed.data };
    } catch (error) {
        console.error("[users] updateUser falló:", error);
        const msg = error instanceof Error ? error.message : "Excepción desconocida";
        return { success: false, message: `Error al actualizar el usuario: ${msg}` };
    }
}

export async function deleteUser(emailKey: unknown, actor: unknown): Promise<ActionResult> {
    const a = validarActor(actor);
    if (!a) return { success: false, message: "No autorizado. Sesión inválida." };
    try {
        const me = await requireActor(a.idToken);
        const emailCanon =
            typeof emailKey === "string" ? emailKey.toLowerCase().trim() : "";
        if (!emailCanon) {
            return { success: false, message: "Correo inválido." };
        }
        // Guard anti-suicidio: nadie revoca su propio acceso.
        if (esAutoBorrado(emailCanon, me.email)) {
            return { success: false, message: "No puedes revocar tu propio acceso (403)." };
        }
        await requirePermiso(me, "sys_admin_users", "delete");
        const adminDb = getDb();
        const docRef = adminDb.collection("sys_admin_users").doc(emailCanon);
        const snap = await docRef.get();
        if (!snap.exists) return { success: false, message: "El usuario no existe." };
        const antes = snap.data() as Record<string, unknown>;

        // Baja lógica — PROHIBIDO delete() físico del documento.
        const updates = {
            active: false,
            motivo_baja: "Revocación de acceso al panel",
            fecha_baja: new Date(),
            baja_por: me.uid,
            updated_at: new Date(),
            actualizado_por: me.uid,
        };
        await docRef.set(updates, { merge: true });
        await appendAuditoria({
            coleccion: "sys_admin_users",
            documentoId: emailCanon,
            operacion: "SOFT_DELETE",
            antes,
            despues: { ...antes, ...updates },
            actor: me,
        });
        revalidatePath("/admin/users");
        return { success: true, message: "Acceso revocado correctamente.", id: emailCanon };
    } catch (error) {
        console.error("[users] deleteUser falló:", error);
        const msg = error instanceof Error ? error.message : "Excepción desconocida";
        return { success: false, message: `Error al revocar el acceso: ${msg}` };
    }
}
