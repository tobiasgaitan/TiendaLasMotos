/**
 * WEB-038 — Semilla/merge de permisos de inventario de repuestos.
 *
 * Uso:
 *   npx tsx scripts/seed-permissions-inventario.ts
 *
 * Requiere credenciales de Firebase Admin (ADC o GOOGLE_APPLICATION_CREDENTIALS).
 * No sobrescribe permisos existentes: solo agrega las colecciones nuevas que
 * falten en cada documento de sys_permissions_matrix.
 */
import * as admin from 'firebase-admin';
import {
    DEFAULT_MATRIZ,
    type ColeccionPermiso,
    type Rol,
} from '../src/types/roles';

const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    'tiendalasmotos-beta';

if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
}

const db = admin.firestore();

const NUEVAS_COLECCIONES: ColeccionPermiso[] = [
    'inventario_repuestos',
    'conteos_pendientes_repuestos',
    'fotos_inventario',
    'historial_auditoria_inventario',
];

const ROLES_A_SEMBRAR: Rol[] = ['superadmin', 'admin', 'asesor', 'auditor'];

async function seedPermisosInventario(): Promise<void> {
    console.log(`[seed] Proyecto: ${projectId}`);
    console.log(`[seed] Roles: ${ROLES_A_SEMBRAR.join(', ')}`);

    for (const rol of ROLES_A_SEMBRAR) {
        const ref = db.collection('sys_permissions_matrix').doc(rol);
        const snap = await ref.get();

        if (!snap.exists) {
            await ref.set({
                rol,
                permisos: DEFAULT_MATRIZ[rol],
                activo: true,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`[seed] ${rol}: documento creado con DEFAULT_MATRIZ.`);
            continue;
        }

        const data = snap.data();
        if (!data) {
            console.error(`[seed] ${rol}: documento sin datos; se omite.`);
            continue;
        }

        if (data.activo === false) {
            console.log(`[seed] ${rol}: inactivo; no se modifica.`);
            continue;
        }

        if (!data.permisos || typeof data.permisos !== 'object') {
            console.error(`[seed] ${rol}: permisos inválidos; se omite para no sobrescribir.`);
            continue;
        }

        const permisosActuales = data.permisos as Record<string, unknown>;
        const permisosActualizados: Record<string, unknown> = { ...permisosActuales };
        let agregadas = 0;

        for (const coleccion of NUEVAS_COLECCIONES) {
            if (coleccion in permisosActualizados) continue;

            const permiso = DEFAULT_MATRIZ[rol][coleccion];
            if (!permiso) {
                console.error(
                    `[seed] ${rol}: DEFAULT_MATRIZ no define ${coleccion}; se omite.`
                );
                continue;
            }

            permisosActualizados[coleccion] = permiso;
            agregadas++;
        }

        if (agregadas === 0) {
            console.log(`[seed] ${rol}: sin cambios.`);
            continue;
        }

        await ref.update({
            permisos: permisosActualizados,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[seed] ${rol}: ${agregadas} colección(es) agregada(s).`);
    }
}

seedPermisosInventario()
    .then(async () => {
        console.log('[seed] Completado.');
        await admin.app().delete();
    })
    .catch((error: unknown) => {
        console.error('[seed] Falló la semilla de permisos:', error);
        process.exit(1);
    });
