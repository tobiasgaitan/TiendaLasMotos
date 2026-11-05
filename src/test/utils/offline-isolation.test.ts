/**
 * Tests WEB-038 — aislamiento del outbox offline.
 * Ejecutar con: npx tsx src/test/utils/offline-isolation.test.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
    esBorradorDePropietario,
    filtrarPorPropietario,
} from '@/lib/offline/outbox-utils';

let failures = 0;
function check(name: string, cond: boolean) {
    if (cond) {
        console.log(`ok - ${name}`);
    } else {
        failures++;
        console.error(`FAIL - ${name}`);
    }
}

function lanza(fn: () => void): boolean {
    try {
        fn();
        return false;
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('uid')) {
            console.error(
                '[offline-isolation.test] error inesperado en lanza:',
                error
            );
        }
        return true;
    }
}

const outbox = readFileSync('src/lib/offline/outbox.ts', 'utf8');
const outboxUtils = readFileSync(
    'src/lib/offline/outbox-utils.ts',
    'utf8'
);
const hook = readFileSync('src/hooks/useOfflineQueue.ts', 'utf8');
const indicator = readFileSync(
    'src/components/OfflineIndicator.tsx',
    'utf8'
);
const adminLayout = readFileSync('src/app/admin/layout.tsx', 'utf8');
const asesorPage = readFileSync(
    'src/app/admin/inventario-asesor/page.tsx',
    'utf8'
);
const authContext = readFileSync('src/context/AuthContext.tsx', 'utf8');
const form = readFileSync(
    'src/app/admin/inventario-asesor/ConteoAsesorForm.tsx',
    'utf8'
);
const uploadFoto = readFileSync('src/lib/offline/upload-foto.ts', 'utf8');

function bloque(
    fuente: string,
    inicio: string,
    fin: string
): string {
    const desde = fuente.indexOf(inicio);
    const hasta = fuente.indexOf(fin, desde + inicio.length);
    if (desde < 0 || hasta < 0) return '';
    return fuente.slice(desde, hasta);
}

const borradorA: { conteo_id: string; propietario_uid: string } = {
    conteo_id: 'a',
    propietario_uid: 'uid-A',
};
const borradorB: { conteo_id: string; propietario_uid: string } = {
    conteo_id: 'b',
    propietario_uid: 'uid-B',
};

check(
    'filtrarPorPropietario excluye borradores de otro uid',
    filtrarPorPropietario([borradorA, borradorB], 'uid-A').length === 1 &&
        filtrarPorPropietario([borradorA, borradorB], 'uid-A')[0].conteo_id ===
            'a'
);

check(
    'esBorradorDePropietario rechaza registros sin propietario_uid',
    esBorradorDePropietario({}, 'uid-A') === false
);

check(
    'esBorradorDePropietario rechaza propietario_uid vacío',
    esBorradorDePropietario({ propietario_uid: '   ' }, 'uid-A') === false
);

check(
    'filtrarPorPropietario lanza si uid está vacío',
    lanza(() => filtrarPorPropietario([borradorA], ''))
);

check(
    'OUTBOX_DB_VERSION es 2',
    outboxUtils.includes('OUTBOX_DB_VERSION = 2')
);

check(
    'listarBorradores exige propietarioUid en la firma',
    /export async function listarBorradores\(\s*propietarioUid:\s*string\s*\)/.test(
        outbox
    )
);

check(
    'contarPendientes exige propietarioUid en la firma',
    /export async function contarPendientes\(\s*propietarioUid:\s*string\s*\)/.test(
        outbox
    )
);

check(
    'onupgradeneeded descarta legados sin propietario con console.error',
    outbox.includes('Migración v2: descartando registro legado sin propietario') &&
        outbox.includes('cursor.delete()')
);

const efecto = bloque(
    hook,
    'useEffect(() => {',
    '}, [activo, uid, actualizarPendientes, sincronizarAhora]);'
);
const guardIndex = efecto.indexOf('if (!activo || !uid) {');
const listenerIndex = efecto.indexOf('window.addEventListener');
const intervalIndex = efecto.indexOf('window.setInterval');
const listarIndex = efecto.indexOf('void actualizarPendientes();');
const sincronizarIndex = efecto.indexOf('void sincronizarAhora();');
check(
    'provider tiene early-return antes de listeners, intervalo y lectura del outbox',
    efecto.length > 0 &&
        guardIndex >= 0 &&
        guardIndex < listenerIndex &&
        guardIndex < intervalIndex &&
        guardIndex < listarIndex &&
        guardIndex < sincronizarIndex
);

check(
    'admin/layout.tsx ya no monta OfflineIndicator',
    !adminLayout.includes('OfflineIndicator')
);

let proveedoresMontados = '';
try {
    proveedoresMontados = execFileSync(
        'grep',
        ['-R', '<OfflineQueueProvider', 'src/app'],
        { encoding: 'utf8' }
    );
} catch (error) {
    console.error(
        '[offline-isolation.test] No se pudo inspeccionar el montaje del provider:',
        error
    );
}
const lineasProvider = proveedoresMontados
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean);
check(
    'OfflineQueueProvider se monta una sola vez, en la página del asesor',
    lineasProvider.length === 1 &&
        lineasProvider[0].startsWith(
            'src/app/admin/inventario-asesor/page.tsx:'
        ) &&
        asesorPage.includes('<OfflineQueueProvider key={user.uid}>')
);

check(
    'OfflineIndicator usa contexto seguro y guard de rol',
    indicator.includes('useOfflineQueueContext') &&
        indicator.includes('role !== "asesor"') &&
        !indicator.includes('useOfflineQueue()')
);

const payloadBlock = bloque(
    outbox,
    'export type BorradorConteoPayload',
    'export interface BorradorConteoOutbox'
);
check(
    'propietario_uid no está en BorradorConteoPayload',
    payloadBlock.length > 0 && !payloadBlock.includes('propietario_uid')
);

check(
    'AuthContext logout llama limpiarOutbox(uid)',
    authContext.includes('const uid = user ? user.uid : "";') &&
        authContext.includes('limpiarOutbox(uid)') &&
        !authContext.includes('limpiarOutbox()')
);

const archivosCambiados = [
    'src/lib/offline/outbox.ts',
    'src/lib/offline/outbox-utils.ts',
    'src/hooks/useOfflineQueue.ts',
    'src/components/OfflineIndicator.tsx',
    'src/app/admin/layout.tsx',
    'src/app/admin/inventario-asesor/page.tsx',
    'src/app/admin/inventario-asesor/ConteoAsesorForm.tsx',
    'src/context/AuthContext.tsx',
];
check(
    'archivos cambiados sin optional chaining',
    archivosCambiados.every(
        (archivo) => !readFileSync(archivo, 'utf8').includes('?.')
    )
);

const archivosUiOffline = [outbox, outboxUtils, hook, indicator, form, uploadFoto];
check(
    'sin Firestore directo en UI/offline',
    archivosUiOffline.every(
        (fuente) =>
            !fuente.includes('setDoc') &&
            !fuente.includes('updateDoc') &&
            !fuente.includes('addDoc') &&
            !fuente.includes('deleteDoc') &&
            !fuente.includes('.collection(') &&
            !fuente.includes('getDoc(') &&
            !fuente.includes('onSnapshot(')
    )
);

if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED`);
    process.exit(1);
}

console.log('\noffline-isolation.test.ts: ALL PASSED');
