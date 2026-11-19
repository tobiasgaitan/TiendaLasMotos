/**
 * WEB-INV-COMPANIONS-ABC-001 — Merge puro de la acción `delete` de inventario.
 *
 * No toca Firestore. El script operativo consume esta función para actualizar
 * `sys_permissions_matrix/{superadmin,admin}` de forma idempotente.
 */
import { DEFAULT_MATRIZ, type Rol } from '../../types/roles';

export const ROLES_DELETE_INVENTARIO = ['superadmin', 'admin'] as const;

export type RolDeleteInventario = (typeof ROLES_DELETE_INVENTARIO)[number];

export interface ResultadoMergePermisos {
    permisos: Record<string, unknown>;
    cambios: string[];
    advertencia?: string;
}

function esObjeto(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === 'object' && value !== null && !Array.isArray(value)
    );
}

function rolConDelete(rol: Rol): rol is RolDeleteInventario {
    return (ROLES_DELETE_INVENTARIO as readonly string[]).includes(rol);
}

/**
 * Agrega `delete` a `inventario_repuestos` para admin/superadmin.
 *
 * - Idempotente: si `delete` ya existe, no hay cambios.
 * - Preserva acciones y `scope` existentes.
 * - Si la colección no existe, parte de DEFAULT_MATRIZ y agrega `delete`.
 * - Si `acciones` no es un arreglo, no modifica y reporta advertencia.
 * - No muta la entrada.
 */
export function mergeDeleteInventario(
    rol: Rol,
    permisos: unknown
): ResultadoMergePermisos {
    if (!rolConDelete(rol)) {
        return {
            permisos: esObjeto(permisos) ? { ...permisos } : {},
            cambios: [],
        };
    }

    if (!esObjeto(permisos)) {
        return {
            permisos: {},
            cambios: [],
            advertencia: 'permisos inválidos o ausentes',
        };
    }

    const actual = permisos.inventario_repuestos;
    if (!esObjeto(actual)) {
        const base = DEFAULT_MATRIZ[rol].inventario_repuestos;
        if (!base) {
            return {
                permisos: { ...permisos },
                cambios: [],
                advertencia: 'DEFAULT_MATRIZ sin inventario_repuestos',
            };
        }

        const acciones = Array.isArray(base.acciones)
            ? [...base.acciones]
            : [];
        if (!acciones.includes('delete')) acciones.push('delete');

        return {
            permisos: {
                ...permisos,
                inventario_repuestos: { ...base, acciones },
            },
            cambios: ['inventario_repuestos:delete'],
        };
    }

    const acciones = actual.acciones;
    if (!Array.isArray(acciones)) {
        return {
            permisos: { ...permisos },
            cambios: [],
            advertencia: 'inventario_repuestos.acciones inválidas',
        };
    }

    if (acciones.includes('delete')) {
        return { permisos: { ...permisos }, cambios: [] };
    }

    return {
        permisos: {
            ...permisos,
            inventario_repuestos: {
                ...actual,
                acciones: [...acciones, 'delete'],
            },
        },
        cambios: ['inventario_repuestos:delete'],
    };
}
