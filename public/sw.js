/**
 * WEB-038 — Service Worker manual (sin next-pwa).
 *
 * Estrategia:
 * - Shell PWA versionado en tlm-shell-v2.
 * - Navegación allowlisted /admin/inventario-asesor: network-first con fallback.
 * - Estáticos /_next/static y /icons: cache-first.
 * - Nunca cachea POST, /api, _rsc, Firestore, Auth ni Storage.
 */

const CACHE_SHELL = 'tlm-shell-v2';
const CACHE_KEY_INVENTARIO = '/admin/inventario-asesor';
const PRECACHE = [
    '/offline.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE_SHELL)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
            .catch((error) => {
                console.error('[sw] Precarga del shell falló:', error);
                throw error;
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((nombres) =>
                Promise.all(
                    nombres
                        .filter(
                            (nombre) =>
                                nombre.startsWith('tlm-shell-') &&
                                nombre !== CACHE_SHELL
                        )
                        .map((nombre) => caches.delete(nombre))
                )
            )
            .then(() => self.clients.claim())
            .catch((error) => {
                console.error('[sw] Activación/limpieza de cachés falló:', error);
            })
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (url.pathname.startsWith('/api/')) return;
    if (url.pathname.includes('_rsc')) return;
    if (url.searchParams.has('_rsc')) return;

    if (
        url.pathname.startsWith('/_next/static/') ||
        url.pathname.startsWith('/icons/')
    ) {
        event.respondWith(cacheFirst(request));
        return;
    }

    if (
        url.pathname === '/manifest.json' ||
        url.pathname === '/offline.html'
    ) {
        event.respondWith(cacheFirst(request));
        return;
    }

    if (request.mode === 'navigate') {
        if (esRutaInventario(url.pathname)) {
            event.respondWith(networkFirstNavigation(request));
        }
    }
});

function esRutaInventario(pathname) {
    return (
        pathname === '/admin/inventario-asesor' ||
        pathname === '/admin/inventario-asesor/'
    );
}

async function cacheFirst(request) {
    let cache = null;
    try {
        cache = await caches.open(CACHE_SHELL);
    } catch (error) {
        console.error('[sw] No se pudo abrir la caché shell:', error);
    }

    if (cache) {
        try {
            const cached = await cache.match(request);
            if (cached) return cached;
        } catch (error) {
            console.error('[sw] No se pudo leer la caché shell:', error);
        }
    }

    try {
        const response = await fetch(request);
        if (response && response.ok && cache) {
            try {
                await cache.put(request, response.clone());
            } catch (error) {
                console.error('[sw] No se pudo cachear un estático:', error);
            }
        }
        return response;
    } catch (error) {
        console.error('[sw] Cache-first sin red:', error);

        if (cache) {
            try {
                const fallback = await cache.match(request);
                if (fallback) return fallback;
            } catch (errorCache) {
                console.error(
                    '[sw] No se pudo leer el fallback de caché:',
                    errorCache
                );
            }
        }

        return new Response('Sin conexión', {
            status: 503,
            statusText: 'Sin conexión',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}

async function networkFirstNavigation(request) {
    let cache = null;
    try {
        cache = await caches.open(CACHE_SHELL);
    } catch (error) {
        console.error('[sw] No se pudo abrir la caché de navegación:', error);
    }

    try {
        const response = await fetch(request);
        const contentType = response.headers.get('content-type') || '';
        const responseUrl = new URL(response.url);

        if (
            response.ok &&
            contentType.includes('text/html') &&
            esRutaInventario(responseUrl.pathname) &&
            cache
        ) {
            try {
                await cache.put(CACHE_KEY_INVENTARIO, response.clone());
            } catch (error) {
                console.error('[sw] No se pudo cachear el shell:', error);
            }
        }

        if (response.ok) return response;

        if (cache) {
            try {
                const cached = await cache.match(CACHE_KEY_INVENTARIO);
                if (cached) return cached;
            } catch (error) {
                console.error(
                    '[sw] No se pudo leer el shell cacheado:',
                    error
                );
            }
        }

        return response;
    } catch (error) {
        console.error('[sw] Navegación sin red; usando fallback:', error);

        if (cache) {
            try {
                const cached = await cache.match(CACHE_KEY_INVENTARIO);
                if (cached) return cached;

                const offline = await cache.match('/offline.html');
                if (offline) return offline;
            } catch (errorCache) {
                console.error(
                    '[sw] No se pudo leer el fallback offline:',
                    errorCache
                );
            }
        }

        return new Response('Sin conexión', {
            status: 503,
            statusText: 'Sin conexión',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}
