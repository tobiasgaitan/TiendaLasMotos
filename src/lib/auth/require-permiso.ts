/**
 * Guard server-side de autorización por matriz de permisos (P5).
 *
 * SOLO para archivos 'use server' (usa Admin SDK vía getDb).
 * NO importar desde componentes cliente: la UI usa `puedeAccion()` del
 * AuthContext (gating visual, no es barrera de seguridad).
 *
 * FAIL-CLOSED en escrituras: sin matriz válida y rol != superadmin → rechaza.
 */

import { getDb } from '@/lib/firebase-admin';
import {
    DEFAULT_MATRIZ,
    puede,
    scopeDe,
    type Accion,
    type ColeccionPermiso,
    type Rol,
    type ScopePropiedad,
} from '@/types/roles';
import { resolverRol } from './resolve-rol';

export interface ActorPermiso {
    uid: string;
    email?: string | null;
}

export interface ScopeDoc {
    email_usuario?: string | null;
    email_inversor?: string | null;
    email_admin?: string | null;
}

export interface ResultadoPermiso {
    rol: Rol | 'guest';
    email: string;
}

function emailCanon(email: unknown): string {
    return typeof email === 'string' ? email.toLowerCase().trim() : '';
}

/** Rol del actor resolviendo sys_admin_users por email (lectura resiliente rol/role). */
export async function resolverRolActor(email: string): Promise<{ rol: Rol | 'guest'; found: boolean }> {
    const canon = emailCanon(email);
    if (!canon) return { rol: 'guest', found: false };
    try {
        const adminDb = getDb();
        const snap = await adminDb
            .collection('sys_admin_users')
            .where('email', '==', canon)
            .limit(1)
            .get();
        if (snap.empty) return { rol: 'guest', found: false };
        return { rol: resolverRol(snap.docs[0].data() as Record<string, unknown>), found: true };
    } catch (error) {
        console.error('[permisos] resolverRolActor falló:', error);
        return { rol: 'guest', found: false };
    }
}

/** Permisos del rol desde sys_permissions_matrix/{rol} o DEFAULT_MATRIZ. */
export async function cargarPermisosRol(
    rol: Rol | 'guest'
): Promise<{ permisos: Partial<Record<ColeccionPermiso, { acciones: Accion[]; scope?: ScopePropiedad }>>; fromMatrix: boolean }> {
    if (rol === 'guest') return { permisos: {}, fromMatrix: false };
    try {
        const adminDb = getDb();
        const snap = await adminDb.collection('sys_permissions_matrix').doc(rol).get();
        if (snap.exists) {
            const data = snap.data() as { activo?: boolean; permisos?: Record<string, unknown> };
            if (data.activo !== false && data.permisos && typeof data.permisos === 'object') {
                return {
                    permisos: data.permisos as Partial<Record<ColeccionPermiso, { acciones: Accion[]; scope?: ScopePropiedad }>>,
                    fromMatrix: true,
                };
            }
        }
    } catch (error) {
        console.error('[permisos] cargarPermisosRol falló:', error);
    }
    return { permisos: DEFAULT_MATRIZ[rol], fromMatrix: false };
}

/**
 * Guard: lanza Error si el actor no puede ejecutar (colección, acción).
 * Si el permiso exige scope de propiedad, `scopeDoc` debe traer el email
 * coincidente con el del actor (fail-closed si falta).
 */
export async function requirePermiso(
    actor: ActorPermiso,
    coleccion: ColeccionPermiso,
    accion: Accion,
    scopeDoc?: ScopeDoc | null
): Promise<ResultadoPermiso> {
    const email = emailCanon(actor.email);
    if (!email) throw new Error('No autorizado.');
    const { rol } = await resolverRolActor(email);
    const { permisos, fromMatrix } = await cargarPermisosRol(rol);
    const esEscritura = accion !== 'read';
    if (esEscritura && !fromMatrix && rol !== 'superadmin') {
        console.warn('[permisos] matriz no disponible, rechazo fail-closed:', { coleccion, accion, rol });
        throw new Error('No autorizado: matriz de permisos no disponible.');
    }
    if (!puede(permisos, coleccion, accion)) {
        throw new Error('No autorizado: permiso insuficiente.');
    }
    const scope = scopeDe(permisos, coleccion);
    if (scope) {
        const esperado = emailCanon(scopeDoc?.[scope]);
        if (!esperado || esperado !== email) {
            throw new Error('No autorizado: fuera de tu alcance.');
        }
    }
    return { rol, email };
}
