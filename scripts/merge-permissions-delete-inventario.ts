/**
 * WEB-INV-COMPANIONS-ABC-001 — Merge de `delete` en la matriz viva.
 *
 * Uso:
 *   npx tsx scripts/merge-permissions-delete-inventario.ts --project=tiendalasmotos
 *   npx tsx scripts/merge-permissions-delete-inventario.ts --project=tiendalasmotos --apply
 *
 * Sin `--apply` es dry-run: lee y reporta, no escribe.
 * No asume proyecto y no se ejecuta durante el desarrollo de los companions.
 */
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
    mergeDeleteInventario,
    ROLES_DELETE_INVENTARIO,
} from '../src/lib/auth/permisos-inventario';

interface Opciones {
    projectId: string;
    aplicar: boolean;
}

function parseOpciones(argv: string[]): Opciones {
    let projectId = '';
    let aplicar = false;

    for (const arg of argv) {
        if (!arg.startsWith('--')) continue;
        const [clave, valor = ''] = arg.slice(2).split('=', 2);

        if (clave === 'project') {
            projectId = valor.trim();
        } else if (clave === 'apply') {
            aplicar = true;
        } else if (clave === 'dry-run') {
            aplicar = false;
        } else {
            throw new Error(`Opción desconocida: --${clave}`);
        }
    }

    if (!projectId) {
        throw new Error(
            'Falta --project. Este script no asume proyecto.'
        );
    }

    return { projectId, aplicar };
}

async function main(): Promise<void> {
    const { projectId, aplicar } = parseOpciones(process.argv.slice(2));
    const app = initializeApp({ projectId });
    const db = getFirestore(app);

    console.log(`[merge] Proyecto: ${projectId}`);
    console.log(`[merge] Modo: ${aplicar ? 'APPLY' : 'DRY-RUN'}`);

    try {
        for (const rol of ROLES_DELETE_INVENTARIO) {
            const ref = db.collection('sys_permissions_matrix').doc(rol);
            const snap = await ref.get();

            if (!snap.exists) {
                console.log(`[merge] ${rol}: documento inexistente; se omite.`);
                continue;
            }

            const data = snap.data() as Record<string, unknown> | undefined;
            if (!data) {
                console.warn(`[merge] ${rol}: documento sin datos; se omite.`);
                continue;
            }

            if (data.activo === false) {
                console.log(`[merge] ${rol}: inactivo; no se modifica.`);
                continue;
            }

            const resultado = mergeDeleteInventario(rol, data.permisos);
            if (resultado.advertencia) {
                console.warn(
                    `[merge] ${rol}: ${resultado.advertencia}; no se modifica.`
                );
                continue;
            }

            if (resultado.cambios.length === 0) {
                console.log(`[merge] ${rol}: sin cambios.`);
                continue;
            }

            if (!aplicar) {
                console.log(
                    `[dry-run] ${rol}: agregaría ${resultado.cambios.join(
                        ', '
                    )}.`
                );
                continue;
            }

            await ref.update({
                permisos: resultado.permisos,
                updated_at: FieldValue.serverTimestamp(),
            });
            console.log(
                `[merge] ${rol}: aplicado ${resultado.cambios.join(', ')}.`
            );
        }
    } finally {
        await deleteApp(app);
    }
}

main().catch((error: unknown) => {
    console.error(
        '[merge] Falló el merge de permisos:',
        error instanceof Error ? error.message : error
    );
    process.exit(1);
});
