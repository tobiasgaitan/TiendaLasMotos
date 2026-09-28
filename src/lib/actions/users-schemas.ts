import { z } from "zod";
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
 * Construye el payload de updateUser. Retorna ÚNICAMENTE campos de merge
 * JSON-serializables (updated_at, name?, rol?, active?). NUNCA incluye la
 * clave 'role': la limpieza legacy vive en el Server Action con
 * FieldValue.delete() del Admin SDK (WEB-029-FIX-1).
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
    return payload;
}

/**
 * ¿Debe limpiarse la clave legacy 'role'? true si y solo si el documento
 * previo la contiene. Decisión pura testeable a nivel de esquema.
 */
export function DEBE_LIMPIAR_ROLE_LEGACY(antes: Record<string, unknown> | null): boolean {
    return !!antes && "role" in antes;
}
