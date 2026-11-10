/**
 * Tests WEB-038 — Punto 4: PWA, persistencia condicionada y outbox.
 * Ejecutar con: npx tsx src/test/utils/pwa.test.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
    calcularBackoffMs,
    construirStoragePath,
    esBorradorSincronizable,
    esMimeFotoPermitido,
    esRutaInventario,
    esUuid,
    extensionDesdeMime,
    generarConteoId,
    MAX_BACKOFF_MS,
    MAX_FOTO_BYTES,
    MAX_FOTO_COMPRIMIDA_BYTES,
    normalizarNombreArchivo,
    OUTBOX_DB_NAME,
    OUTBOX_DB_VERSION,
    OUTBOX_STORE_BORRADORES,
    OUTBOX_STORE_FOTOS,
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

interface HeaderRule {
    source: string;
    headers: Array<{ key: string; value: string }>;
}

interface HostingTarget {
    target: string;
    headers: HeaderRule[];
}

function leerHeader(
    target: HostingTarget,
    source: string,
    key: string
): string | null {
    const regla = target.headers.find((item) => item.source === source);
    if (!regla) return null;
    const header = regla.headers.find((item) => item.key === key);
    return header ? header.value : null;
}

function dimensionesPng(ruta: string): { ancho: number; alto: number } {
    const data = readFileSync(ruta);
    const firma = data.subarray(0, 8).toString('hex');
    if (firma !== '89504e470d0a1a0a') {
        return { ancho: 0, alto: 0 };
    }
    return {
        ancho: data.readUInt32BE(16),
        alto: data.readUInt32BE(20),
    };
}

function run() {
    // --- utilidades puras del outbox ---
    const id1 = generarConteoId();
    const id2 = generarConteoId();
    check(
        'conteo_id es UUID v4',
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            id1
        )
    );
    check('conteo_id es único', id1 !== id2);
    check(
        'esUuid acepta conteo_id y rechaza basura',
        esUuid(id1) &&
            !esUuid('no-es-uuid') &&
            !esUuid('550e8400-e29b-41d4-a716-44665544000')
    );
    check(
        'storage_path usa prefijo y email normalizado',
        construirStoragePath(' Asesor@Test.com ', id1, 'image/jpeg') ===
            `inventario_repuestos/asesor@test.com/${id1}.jpg`
    );
    check(
        'extensiones de foto correctas',
        extensionDesdeMime('image/jpeg') === 'jpg' &&
            extensionDesdeMime('image/png') === 'png' &&
            extensionDesdeMime('image/webp') === 'webp'
    );
    check(
        'MIME de foto permitido/rechazado',
        esMimeFotoPermitido('image/jpeg') &&
            esMimeFotoPermitido('image/png') &&
            esMimeFotoPermitido('image/webp') &&
            !esMimeFotoPermitido('image/gif') &&
            !esMimeFotoPermitido('application/pdf')
    );
    check(
        'nombre de archivo saneado y limitado',
        normalizarNombreArchivo(
            '  foto\r\ncon\u0000control/muy largo  ',
            id1,
            'image/jpeg'
        ).length <= 180
    );
    check(
        'nombre de archivo vacío usa fallback',
        normalizarNombreArchivo('   ', id1, 'image/png') === `${id1}.png`
    );
    check(
        'backoff exponencial y techo',
        calcularBackoffMs(1) === 2000 &&
            calcularBackoffMs(2) === 4000 &&
            calcularBackoffMs(9) === MAX_BACKOFF_MS &&
            calcularBackoffMs(0) === 2000
    );
    check(
        'allowlist de inventario exacta',
        esRutaInventario('/admin/inventario-asesor') &&
            esRutaInventario('/admin/inventario-asesor/') &&
            !esRutaInventario('/admin/inventory') &&
            !esRutaInventario('/admin/inventario-asesor/hoy') &&
            !esRutaInventario('/admin/inventario-asesorx') &&
            !esRutaInventario('/admin/otra')
    );
    const ahora = Date.now();
    check(
        'borrador con backoff futuro se omite',
        !esBorradorSincronizable('error', ahora, ahora + 5000, ahora, true)
    );
    check(
        'borrador vencido se sincroniza',
        esBorradorSincronizable('error', ahora, ahora - 1, ahora, true)
    );
    check(
        'sincronización reciente no se pisa',
        !esBorradorSincronizable(
            'sincronizando',
            ahora - 1000,
            0,
            ahora,
            true
        )
    );
    check(
        'sincronización colgada se recupera',
        esBorradorSincronizable(
            'sincronizando',
            ahora - 61000,
            0,
            ahora,
            true
        )
    );
    check(
        'constantes de outbox canónicas',
        OUTBOX_DB_NAME === 'tlm_offline' &&
            OUTBOX_DB_VERSION === 2 &&
            OUTBOX_STORE_BORRADORES === 'borradores_conteos' &&
            OUTBOX_STORE_FOTOS === 'fotos_borrador'
    );
    check(
        'límites de foto 5 MB / 1.5 MB',
        MAX_FOTO_BYTES === 5 * 1024 * 1024 &&
            MAX_FOTO_COMPRIMIDA_BYTES === 1.5 * 1024 * 1024
    );

    // --- manifest, iconos y fallback ---
    const manifest = JSON.parse(
        readFileSync('public/manifest.json', 'utf8')
    ) as {
        id: string;
        name: string;
        short_name: string;
        lang: string;
        start_url: string;
        scope: string;
        display: string;
        theme_color: string;
        background_color: string;
        icons: Array<{
            src: string;
            sizes: string;
            type: string;
            purpose: string;
        }>;
    };
    check(
        'manifest id correcto',
        manifest.id === '/admin/inventario-asesor'
    );
    check(
        'manifest start_url apunta al conteo del asesor',
        manifest.start_url === '/admin/inventario-asesor?pwa=asesor'
    );
    check('manifest scope raíz', manifest.scope === '/');
    check(
        'manifest standalone / portrait',
        manifest.display === 'standalone' &&
            (manifest as { orientation?: string }).orientation ===
                'portrait-primary'
    );
    check('manifest idioma es-CO', manifest.lang === 'es-CO');
    check(
        'manifest colores de marca',
        manifest.theme_color === '#dc2626' &&
            manifest.background_color === '#020617'
    );
    check('manifest tiene 3 iconos', manifest.icons.length === 3);
    check(
        'manifest declara iconos 192/512/maskable',
        manifest.icons.some(
            (icon) =>
                icon.src === '/icons/icon-192.png' &&
                icon.sizes === '192x192' &&
                icon.purpose === 'any'
        ) &&
            manifest.icons.some(
                (icon) =>
                    icon.src === '/icons/icon-512.png' &&
                    icon.sizes === '512x512' &&
                    icon.purpose === 'any'
            ) &&
            manifest.icons.some(
                (icon) =>
                    icon.src === '/icons/icon-maskable-512.png' &&
                    icon.sizes === '512x512' &&
                    icon.purpose === 'maskable'
            )
    );

    const icon192 = dimensionesPng('public/icons/icon-192.png');
    const icon512 = dimensionesPng('public/icons/icon-512.png');
    const iconMaskable = dimensionesPng(
        'public/icons/icon-maskable-512.png'
    );
    check(
        'icon-192.png es PNG 192x192',
        icon192.ancho === 192 && icon192.alto === 192
    );
    check(
        'icon-512.png es PNG 512x512',
        icon512.ancho === 512 && icon512.alto === 512
    );
    check(
        'icon-maskable-512.png es PNG 512x512',
        iconMaskable.ancho === 512 && iconMaskable.alto === 512
    );
    check(
        'offline.html existe y tiene fallback',
        readFileSync('public/offline.html', 'utf8').includes('Sin conexión')
    );

    // --- service worker manual ---
    const sw = readFileSync('public/sw.js', 'utf8');
    check('SW cache versionada tlm-shell-v3', sw.includes("'tlm-shell-v3'"));
    check(
        'SW no conserva tlm-shell-v2 como caché activa',
        !sw.includes("const CACHE_SHELL = 'tlm-shell-v2'")
    );
    check(
        'SW usa la ruta nueva y no la del inventario de motos',
        sw.includes("CACHE_KEY_INVENTARIO = '/admin/inventario-asesor'") &&
            sw.includes("pathname === '/admin/inventario-asesor'") &&
            !sw.includes("'/admin/inventory'")
    );
    check(
        'SW precachea shell, manifest e iconos',
        sw.includes("'/offline.html'") &&
            sw.includes("'/manifest.json'") &&
            sw.includes("'/icons/icon-192.png'") &&
            sw.includes("'/icons/icon-512.png'")
    );
    check(
        'SW solo intercepta GET del mismo origen',
        sw.includes("request.method !== 'GET'") &&
            sw.includes('url.origin !== self.location.origin')
    );
    check(
        'SW excluye API, RSC y cross-origin',
        sw.includes("url.pathname.startsWith('/api/')") &&
            sw.includes("url.pathname.includes('_rsc')") &&
            sw.includes('url.searchParams.has')
    );
    check(
        'SW usa network-first para inventario y cache-first para estáticos',
        sw.includes('networkFirstNavigation') &&
            sw.includes('cacheFirst') &&
            sw.includes("url.pathname.startsWith('/_next/static/')")
    );
    check(
        'SW toma control y limpia cachés viejas',
        sw.includes('self.skipWaiting()') &&
            sw.includes('self.clients.claim()') &&
            sw.includes('caches.delete(nombre)')
    );
    check(
        'SW corta POST antes de cualquier cacheo',
        sw.includes("if (request.method !== 'GET') return;")
    );

    let swSyntaxOk = true;
    try {
        execFileSync(process.execPath, ['--check', 'public/sw.js'], {
            stdio: 'pipe',
        });
    } catch (error) {
        console.error('[pwa.test] sw.js tiene error de sintaxis:', error);
        swSyntaxOk = false;
    }
    check('sw.js sintaxis válida', swSyntaxOk);

    // --- headers de Firebase Hosting ---
    const firebase = JSON.parse(readFileSync('firebase.json', 'utf8')) as {
        hosting: HostingTarget[];
    };
    for (const targetName of ['tiendalasmotos', 'beta']) {
        const target = firebase.hosting.find(
            (item) => item.target === targetName
        );
        check(`hosting ${targetName} existe`, target !== undefined);
        if (!target) continue;

        const indiceGlobal = target.headers.findIndex(
            (item) => item.source === '**'
        );
        const indiceSw = target.headers.findIndex(
            (item) => item.source === '/sw.js'
        );
        check(
            `${targetName}: overrides después del bloque global`,
            indiceGlobal >= 0 && indiceSw > indiceGlobal
        );
        check(
            `${targetName}: /sw.js Service-Worker-Allowed`,
            leerHeader(target, '/sw.js', 'Service-Worker-Allowed') === '/'
        );
        check(
            `${targetName}: /sw.js no-cache`,
            leerHeader(target, '/sw.js', 'Cache-Control') ===
                'no-cache, max-age=0, must-revalidate'
        );
        check(
            `${targetName}: manifest cache 1h`,
            leerHeader(target, '/manifest.json', 'Cache-Control') ===
                'public, max-age=3600'
        );
        check(
            `${targetName}: iconos cache inmutable`,
            leerHeader(target, '/icons/**', 'Cache-Control') ===
                'public, max-age=31536000, immutable'
        );
        check(
            `${targetName}: _next/static cache inmutable`,
            leerHeader(target, '/_next/static/**', 'Cache-Control') ===
                'public, max-age=31536000, immutable'
        );
    }

    // --- integración de layout, persistencia y logout ---
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    check(
        'layout declara manifest y themeColor',
        layout.includes('manifest: "/manifest.json"') &&
            layout.includes('themeColor: "#dc2626"')
    );
    check(
        'layout monta PwaRegistrar dentro de AuthProvider',
        layout.includes('PwaRegistrar') && layout.includes('<PwaRegistrar />')
    );

    const pwaRegistrar = readFileSync('src/components/PwaRegistrar.tsx', 'utf8');
    check(
        'PwaRegistrar solo registra asesor en producción',
        pwaRegistrar.includes('role !== "asesor"') &&
            pwaRegistrar.includes('NODE_ENV !== "production"') &&
            pwaRegistrar.includes('register("/sw.js"')
    );
    check(
        'PwaRegistrar actualiza sin desregistrar ni tocar IndexedDB',
        pwaRegistrar.includes('updateViaCache: "none"') &&
            pwaRegistrar.includes('registration.update()') &&
            !pwaRegistrar.includes('unregister') &&
            !pwaRegistrar.includes('indexedDB') &&
            !pwaRegistrar.includes('tlm_offline')
    );

    const offlineIndicator = readFileSync(
        'src/components/OfflineIndicator.tsx',
        'utf8'
    );
    check(
        'OfflineIndicator consume contexto seguro y muestra estados',
        offlineIndicator.includes('useOfflineQueueContext') &&
            offlineIndicator.includes('role !== "asesor"') &&
            offlineIndicator.includes('Sin conexión') &&
            offlineIndicator.includes('pendiente') &&
            offlineIndicator.includes('Sincronizando')
    );

    const firebaseSource = readFileSync('src/lib/firebase.ts', 'utf8');
    check(
        'firebase.ts usa enableIndexedDbPersistence condicionado',
        firebaseSource.includes('enableIndexedDbPersistence(db)') &&
            firebaseSource.includes('tlm_offline_asesor')
    );
    check(
        'firebase.ts exporta la promesa de persistencia',
        firebaseSource.includes('persistenciaOfflineLista')
    );
    check(
        'firebase.ts purga con terminate + clearIndexedDbPersistence',
        firebaseSource.includes('terminate(db)') &&
            firebaseSource.includes('clearIndexedDbPersistence(db)')
    );

    const authSource = readFileSync('src/context/AuthContext.tsx', 'utf8');
    const esperasPersistencia =
        authSource.match(/await persistenciaOfflineLista/g) || [];
    check(
        'AuthContext espera persistencia dos veces',
        esperasPersistencia.length === 2
    );
    const primeraEspera = authSource.indexOf(
        'await persistenciaOfflineLista'
    );
    const onSnapshotIndex = authSource.indexOf('onSnapshot(');
    const segundaEspera = authSource.indexOf(
        'await persistenciaOfflineLista',
        primeraEspera + 1
    );
    const getDocIndex = authSource.indexOf('getDoc(');
    check(
        'espera persistencia antes de matriz y getDoc',
        primeraEspera >= 0 &&
            primeraEspera < onSnapshotIndex &&
            segundaEspera >= 0 &&
            segundaEspera < getDocIndex
    );
    check(
        'AuthContext escribe flag y hace UNA recarga',
        authSource.includes('CLAVE_FLAG_ASESOR') &&
            (authSource.match(/window\.location\.reload\(\)/g) || [])
                .length === 1
    );
    check(
        'logout purga outbox del propietario, persistencia y cachés',
        authSource.includes('limpiarOutbox(uid)') &&
            authSource.includes('limpiarCachesServiceWorker') &&
            authSource.includes('purgarPersistenciaOffline')
    );

    const purgeSource = readFileSync('src/lib/offline/purge.ts', 'utf8');
    check(
        'purge borra Cache Storage y desregistra SW',
        purgeSource.includes('caches.delete') &&
            purgeSource.includes('getRegistrations') &&
            purgeSource.includes('unregister')
    );

    const outboxSource = readFileSync('src/lib/offline/outbox.ts', 'utf8');
    check(
        'outbox sube foto y llama crearConteoPendiente',
        outboxSource.includes('uploadBytes') &&
            outboxSource.includes('getDownloadURL') &&
            outboxSource.includes('crearConteoPendiente')
    );
    check(
        'outbox acepta conteoId/fotoSubida retrocompatibles',
        outboxSource.includes('OpcionesEncolarConteo') &&
            outboxSource.includes('opciones.conteoId') &&
            outboxSource.includes('opciones.fotoSubida')
    );
    check(
        'outbox conserva borradores ante error',
        outboxSource.includes('marcarError') &&
            outboxSource.includes('proximo_intento_en') &&
            outboxSource.includes('eliminarBorrador')
    );

    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
    };
    const dependencias = packageJson.dependencies || {};
    const dependenciasDev = packageJson.devDependencies || {};
    check(
        'no se agregó next-pwa',
        !dependencias['next-pwa'] && !dependenciasDev['next-pwa']
    );
    check(
        'next.config.ts no usa next-pwa',
        !readFileSync('next.config.ts', 'utf8').includes('next-pwa')
    );
}

run();

if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED`);
    process.exit(1);
}
console.log('\npwa.test.ts: ALL PASSED');
