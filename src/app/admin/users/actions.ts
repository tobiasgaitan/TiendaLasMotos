'use server';

import { z } from "zod";
import { getFieldValue } from "@/lib/firebase-admin";
import { runAction, withAuthAndAudit } from "@/lib/actions/run-action";
import type { ActionResult } from "@/lib/actions/result";
import {
    userCreateSchema,
    userPatchSchema,
    emailCanonSchema,
    esAutoBorrado,
    construirPayloadUsuario,
    DEBE_LIMPIAR_ROLE_LEGACY,
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

const createUserImpl = withAuthAndAudit<
    z.infer<typeof userCreateSchema>,
    ActionResult
>(
    {
        name: 'createUser',
        schema: userCreateSchema,
        invalidMessage: 'Datos del usuario inválidos. Revisa los campos.',
        permission: { coleccion: 'sys_admin_users', accion: 'create' },
        revalidate: ['/admin/users'],
        errorPrefix: 'Error al crear el usuario',
    },
    async ({ db, actor: me, input: data, audit }): Promise<ActionResult> => {
        // Evita sobrescritura silenciosa: el docId (email) debe ser nuevo.
        const docRef = db.collection('sys_admin_users').doc(data.email);
        const snap = await docRef.get();
        if (snap.exists) {
            return {
                success: false,
                message: 'Ya existe un usuario con ese correo.',
            };
        }

        const payload: Record<string, unknown> = {
            name: data.name,
            email: data.email,
            rol: data.rol,
            active: data.active,
            registrado_por: me.uid,
            registrado_por_email: me.email ?? null,
            created_at: new Date(),
            updated_at: new Date(),
        };
        await docRef.set(payload);
        await audit({
            coleccion: 'sys_admin_users',
            documentoId: data.email,
            operacion: 'CREATE',
            antes: null,
            despues: payload,
        });
        return {
            success: true,
            message: 'Usuario creado correctamente.',
            id: data.email,
        };
    }
);

export async function createUser(input: unknown, actor: unknown): Promise<ActionResult> {
    return createUserImpl(input, actor);
}

const updateUserSchema = z.object({
    emailKey: emailCanonSchema,
    patch: userPatchSchema,
});

export async function updateUser(
    emailKey: unknown,
    patch: unknown,
    actor: unknown
): Promise<ActionResult> {
    return runAction<z.infer<typeof updateUserSchema>, ActionResult>(
        {
            name: 'updateUser',
            schema: updateUserSchema,
            invalidMessage: (error) =>
                error.errors.some((item) => item.path[0] === 'emailKey')
                    ? 'Correo inválido.'
                    : 'Datos de actualización inválidos.',
            permission: {
                coleccion: 'sys_admin_users',
                accion: 'update',
            },
            revalidate: ['/admin/users'],
            errorPrefix: 'Error al actualizar el usuario',
        },
        { emailKey, patch },
        actor,
        async ({ db, actor: me, input, audit }): Promise<ActionResult> => {
            const docRef = db
                .collection('sys_admin_users')
                .doc(input.emailKey);
            const snap = await docRef.get();
            if (!snap.exists) {
                return {
                    success: false,
                    message: 'El usuario no existe.',
                };
            }
            const antes = snap.data() as Record<string, unknown>;

            const updates = construirPayloadUsuario(input.patch);
            updates.actualizado_por = me.uid;
            // WEB-029-FIX-1: limpieza legacy con centinela del Admin SDK dentro del
            // mismo batch atómico. Un único batch.commit(); cero escrituras parciales.
            const limpiarRole = DEBE_LIMPIAR_ROLE_LEGACY(antes);
            const batch = db.batch();
            batch.set(
                docRef,
                {
                    ...updates,
                    ...(limpiarRole
                        ? { role: getFieldValue().delete() }
                        : {}),
                },
                { merge: true }
            );
            await batch.commit();
            // Ledger JSON-plano: la clave eliminada se refleja ausente (sin centinelas).
            const despues: Record<string, unknown> = {
                ...antes,
                ...updates,
            };
            if (limpiarRole) delete despues.role;
            await audit({
                coleccion: 'sys_admin_users',
                documentoId: input.emailKey,
                operacion: 'UPDATE',
                antes,
                despues,
            });
            return {
                success: true,
                message: 'Usuario actualizado correctamente.',
                id: input.emailKey,
            };
        }
    );
}

export async function deleteUser(emailKey: unknown, actor: unknown): Promise<ActionResult> {
    return runAction<unknown, ActionResult>(
        {
            name: 'deleteUser',
            revalidate: ['/admin/users'],
            errorPrefix: 'Error al revocar el acceso',
        },
        emailKey,
        actor,
        async ({
            db,
            actor: me,
            input: rawEmail,
            requirePermiso,
            audit,
        }): Promise<ActionResult> => {
            const emailCanon =
                typeof rawEmail === "string"
                    ? rawEmail.toLowerCase().trim()
                    : "";
            if (!emailCanon) {
                return { success: false, message: "Correo inválido." };
            }

            // Guard anti-suicidio: nadie revoca su propio acceso.
            if (esAutoBorrado(emailCanon, me.email)) {
                return {
                    success: false,
                    message: "No puedes revocar tu propio acceso (403).",
                };
            }

            await requirePermiso("sys_admin_users", "delete");

            const docRef = db
                .collection("sys_admin_users")
                .doc(emailCanon);
            const snap = await docRef.get();
            if (!snap.exists) {
                return { success: false, message: "El usuario no existe." };
            }
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
            await audit({
                coleccion: "sys_admin_users",
                documentoId: emailCanon,
                operacion: "SOFT_DELETE",
                antes,
                despues: { ...antes, ...updates },
            });
            return {
                success: true,
                message: "Acceso revocado correctamente.",
                id: emailCanon,
            };
        }
    );
}
