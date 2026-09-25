/**
 * Contrato de gating del sidebar (P5 — corrección pre-certificación).
 *
 * - Nodos SIN colección respaldada (simuladores, inventario, prospectos):
 *   visibles solo para superadmin y admin.
 * - Nodos CON colección respaldada: visibles si el rol posee `read` sobre ella.
 *   Configuración Sistema ⇒ sys_admin_users (superadmin, admin, auditor).
 *   Gestión de Créditos ⇒ creditos read (los 5 roles); sub-nodos por acción/scope.
 * - Default fail-closed: nodo futuro sin mapeo explícito ⇒ oculto para no-admin.
 *
 * Módulo puro (sin SDK): testeable unitariamente.
 */

import {
    esRolValido,
    puede,
    type Accion,
    type ColeccionPermiso,
    type MatrizRol,
    type Rol,
} from '@/types/roles';

export type NodoSidebar =
    | 'simuladores'
    | 'inventario'
    | 'prospectos'
    | 'config'
    | 'config-usuarios'
    | 'creditos-contratos'
    | 'creditos-pagos'
    | 'creditos-remisiones'
    | 'creditos-inversores'
    | 'creditos-auditoria';

type RequisitoNodo = { soloAdmin: true } | { coleccion: ColeccionPermiso; accion: Accion };

/** Mapeo explícito nodo → requisito. Todo nodo futuro DEBE registrarse aquí. */
export const MAPA_NODOS: Record<NodoSidebar, RequisitoNodo> = {
    // Sin colección respaldada: solo superadmin/admin.
    simuladores: { soloAdmin: true },
    inventario: { soloAdmin: true },
    prospectos: { soloAdmin: true },
    // Respaldados por colección: read sobre ella.
    config: { coleccion: 'sys_admin_users', accion: 'read' },
    'config-usuarios': { coleccion: 'sys_admin_users', accion: 'read' },
    'creditos-contratos': { coleccion: 'creditos', accion: 'read' },
    'creditos-pagos': { coleccion: 'pagos_y_multas', accion: 'create' },
    'creditos-remisiones': { coleccion: 'remisiones_dinero', accion: 'read' },
    'creditos-inversores': { coleccion: 'pagos_inversores', accion: 'read' },
    'creditos-auditoria': { coleccion: 'historial_auditoria', accion: 'read' },
};

export function esAdminLike(rol: string | null | undefined): boolean {
    return rol === 'superadmin' || rol === 'admin';
}

/**
 * ¿Puede `rol` ver `nodo` con la matriz dada?
 * Nodo desconocido (no registrado en MAPA_NODOS) ⇒ fail-closed para no-admin.
 */
export function puedeVerNodo(
    rol: string | null | undefined,
    matriz: MatrizRol,
    nodo: NodoSidebar | string
): boolean {
    const req: RequisitoNodo | undefined =
        MAPA_NODOS[nodo as NodoSidebar];
    if (!req) return esAdminLike(rol); // fail-closed por defecto
    if ('soloAdmin' in req) return esAdminLike(rol);
    if (typeof rol !== 'string' || !esRolValido(rol)) return false;
    return puede(matriz[rol as Rol], req.coleccion, req.accion);
}

/** El grupo Gestión de Créditos es visible si algún sub-nodo lo es. */
export function verGrupoCreditos(rol: string | null | undefined, matriz: MatrizRol): boolean {
    const hijos: NodoSidebar[] = [
        'creditos-contratos',
        'creditos-pagos',
        'creditos-remisiones',
        'creditos-inversores',
        'creditos-auditoria',
    ];
    return hijos.some((h) => puedeVerNodo(rol, matriz, h));
}
