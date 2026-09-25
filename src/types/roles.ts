/**
 * SSOT de roles y permisos (P5 — Matriz de Permisos Configurables).
 *
 * Roles canónicos: superadmin, admin, cobrador, inversor, auditor.
 * (`vendedor` es legacy y se normaliza a `cobrador` en resolve-rol.ts)
 *
 * Sin borrado físico en colecciones financieras: la matriz no otorga `delete`
 * en colecciones financieras; la baja es update de `activo=false`.
 */

export const ROLES = ['superadmin', 'admin', 'cobrador', 'inversor', 'auditor'] as const;
export type Rol = (typeof ROLES)[number];

export type Accion = 'create' | 'read' | 'update' | 'delete';

export const COLECCIONES = [
    'creditos',
    'clientes_credito',
    'pagos_y_multas',
    'pagos_inversores',
    'remisiones_dinero',
    'historial_auditoria',
    'anomalias',
    'sys_admin_users',
] as const;
export type ColeccionPermiso = (typeof COLECCIONES)[number];

/** Campo de propiedad que debe igualar el email del actor para scope "propio". */
export type ScopePropiedad = 'email_usuario' | 'email_inversor' | 'email_admin' | null;

export interface PermisoColeccion {
    acciones: Accion[];
    scope?: ScopePropiedad;
}

/** Matriz completa: rol → colección → permiso. */
export type MatrizRol = Record<Rol, Partial<Record<ColeccionPermiso, PermisoColeccion>>>;

/** Documento en sys_permissions_matrix/{rol}. */
export interface MatrizPermisosDoc {
    rol: Rol;
    permisos: Partial<Record<ColeccionPermiso, PermisoColeccion>>;
    activo: boolean;
    updated_at?: unknown;
}

export function esRolValido(v: unknown): v is Rol {
    return typeof v === 'string' && (ROLES as readonly string[]).includes(v.toLowerCase());
}

/** Chequeo puro: ¿el mapa de permisos concede (colección, acción)? */
export function puede(
    permisos: Partial<Record<ColeccionPermiso, PermisoColeccion>> | undefined | null,
    coleccion: ColeccionPermiso,
    accion: Accion
): boolean {
    if (!permisos) return false;
    const p = permisos[coleccion];
    if (!p || !Array.isArray(p.acciones)) return false;
    return p.acciones.includes(accion);
}

/** Scope declarado para (rol, colección), o null si no hay restricción de propiedad. */
export function scopeDe(
    permisos: Partial<Record<ColeccionPermiso, PermisoColeccion>> | undefined | null,
    coleccion: ColeccionPermiso
): ScopePropiedad {
    if (!permisos) return null;
    return permisos[coleccion]?.scope ?? null;
}

/**
 * Semilla y fallback funcional (== comportamiento actual del sistema).
 * admin/superadmin conservan acceso total operativo; cobrador/inversor/auditor
 * quedan restringidos a sus scopes. Sin `delete` en financieras.
 */
export const DEFAULT_MATRIZ: MatrizRol = {
    superadmin: {
        creditos: { acciones: ['create', 'read', 'update'] },
        clientes_credito: { acciones: ['create', 'read', 'update'] },
        pagos_y_multas: { acciones: ['create', 'read', 'update'] },
        pagos_inversores: { acciones: ['create', 'read', 'update'] },
        remisiones_dinero: { acciones: ['create', 'read', 'update'] },
        historial_auditoria: { acciones: ['read'] },
        anomalias: { acciones: ['create', 'read', 'update', 'delete'] },
        sys_admin_users: { acciones: ['create', 'read', 'update', 'delete'] },
    },
    admin: {
        creditos: { acciones: ['create', 'read', 'update'] },
        clientes_credito: { acciones: ['create', 'read', 'update'] },
        pagos_y_multas: { acciones: ['create', 'read', 'update'] },
        pagos_inversores: { acciones: ['create', 'read', 'update'] },
        remisiones_dinero: { acciones: ['create', 'read', 'update'] },
        historial_auditoria: { acciones: ['read'] },
        anomalias: { acciones: ['create', 'read', 'update', 'delete'] },
        sys_admin_users: { acciones: ['read'] },
    },
    cobrador: {
        creditos: { acciones: ['read'], scope: 'email_usuario' },
        pagos_y_multas: { acciones: ['create', 'read'], scope: 'email_usuario' },
        remisiones_dinero: { acciones: ['create', 'read'], scope: 'email_usuario' },
        historial_auditoria: { acciones: ['read'] },
        anomalias: { acciones: ['create'] },
    },
    inversor: {
        creditos: { acciones: ['read'], scope: 'email_inversor' },
        pagos_y_multas: { acciones: ['read'], scope: 'email_inversor' },
        pagos_inversores: { acciones: ['read'], scope: 'email_inversor' },
        anomalias: { acciones: ['create'] },
    },
    auditor: {
        creditos: { acciones: ['read'] },
        clientes_credito: { acciones: ['read'] },
        pagos_y_multas: { acciones: ['read'] },
        pagos_inversores: { acciones: ['read'] },
        remisiones_dinero: { acciones: ['read'] },
        historial_auditoria: { acciones: ['read'] },
        anomalias: { acciones: ['create', 'read', 'update', 'delete'] },
        sys_admin_users: { acciones: ['read'] },
    },
};
