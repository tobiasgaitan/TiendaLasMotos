/**
 * Resolución resiliente de rol desde documentos sys_admin_users (P5).
 *
 * Clave canónica SSOT: `rol`. Lectura tolerante: `doc.rol ?? doc.role`.
 * Legacy: `vendedor` se normaliza a `cobrador`. Desconocido/ausente → `guest`.
 *
 * Módulo puro (sin SDK): usable en cliente (AuthContext) y servidor.
 */

import { esRolValido, type Rol } from '@/types/roles';

export const ROL_INVITADO = 'guest' as const;

/** Normaliza un valor crudo a Rol canónico (o 'guest'). */
export function normalizarRol(raw: unknown): Rol | typeof ROL_INVITADO {
    if (typeof raw !== 'string') return ROL_INVITADO;
    const v = raw.toLowerCase().trim();
    if (v === 'vendedor') return 'cobrador'; // legacy → canónico
    if (esRolValido(v)) return v;
    return ROL_INVITADO;
}

/**
 * Lectura resiliente: doc.rol ?? doc.role ?? 'guest' (+ normalización legacy).
 * Equivale a la especificación: doc.rol ?? doc.role, con 'vendedor'→'cobrador'.
 */
export function resolverRol(
    doc: Record<string, unknown> | null | undefined
): Rol | typeof ROL_INVITADO {
    if (!doc || typeof doc !== 'object') return ROL_INVITADO;
    const raw = (doc as Record<string, unknown>).rol ?? (doc as Record<string, unknown>).role;
    return normalizarRol(raw);
}
