import { z } from "zod";
import { deleteField } from "firebase/firestore";
import { ROLES, type Rol } from "@/types/roles";

/**
 * Esquemas puros del CRUD de sys_admin_users (WEB-029).
 *
 * Vive FUERA de 'use server' (patrón creditos-schemas.ts, fix e0e2c05):
 * Next.js prohíbe exportar funciones no-async desde archivos 'use server',
 * por lo que los validadores y helpers testeables residen aquí.
 */

export const rolSchema = z.enum(ROLES);

export const emailCanonSchema = z
    .string()
    .email("Correo inválido.")
    .transform((s) => s.toLowerCase().trim());

export const userCreateSchema = z.object({
    name: z.string().min(1, "Nombre requerido.").transform((s) => s.trim()),
    email: emailCanonSchema,
    rol: rolSchema,
    active: z.boolean(),
});

export const userPatchSchema = z.object({
    name: z.string().min(1).transform((s) => s.trim()).optional(),
    rol: rolSchema.optional(),
    active: z.boolean().optional(),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserPatchInput = z.infer<typeof userPatchSchema>;

/**
 * Guard anti-suicidio (puro): true si el actor intenta revocar su propio documento.
 * Comparación case-insensitive sobre emails canónicos.
 */
export function esAutoBorrado(emailKey: string, actorEmail?: string | null): boolean {
    const a = (emailKey || "").toLowerCase().trim();
    const b = (actorEmail || "").toLowerCase().trim();
    return !!a && a === b;
}

/**
 * Construye el payload de updateUser. Incluye el sentinel deleteField() sobre
 * la clave legacy 'role' (limpieza P5; los lectores usan `rol` con fallback).
 */
export function construirPayloadUsuario(patch: {
    name?: string;
    rol?: Rol;
    active?: boolean;
}): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        updated_at: new Date(),
    };
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.rol !== undefined) payload.rol = patch.rol;
    if (patch.active !== undefined) payload.active = patch.active;
    payload.role = deleteField();
    return payload;
}
