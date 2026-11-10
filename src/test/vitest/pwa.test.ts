import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sw = readFileSync('public/sw.js', 'utf8');
const registrar = readFileSync(
    'src/components/PwaRegistrar.tsx',
    'utf8'
);
const purge = readFileSync('src/lib/offline/purge.ts', 'utf8');
const manifest = JSON.parse(
    readFileSync('public/manifest.json', 'utf8')
) as {
    start_url: string;
    scope: string;
};

describe('MT-09 PWA/SW contracts', () => {
    it('usa caché shell tlm-shell-v3 y no v2 activa', () => {
        expect(sw).toContain("const CACHE_SHELL = 'tlm-shell-v3'");
        expect(sw).not.toContain("const CACHE_SHELL = 'tlm-shell-v2'");
    });

    it('mantiene allowlist exacta de inventario asesor', () => {
        expect(sw).toContain("pathname === '/admin/inventario-asesor'");
        expect(sw).toContain("pathname === '/admin/inventario-asesor/'");
        expect(sw).not.toContain("'/admin/inventory'");
        expect(sw).not.toContain("'/admin/inventario-asesor/hoy'");
    });

    it('no cachea POST, API, RSC, Auth, Firestore ni Storage', () => {
        expect(sw).toContain("request.method !== 'GET'");
        expect(sw).toContain("url.pathname.startsWith('/api/')");
        expect(sw).toContain("url.pathname.includes('_rsc')");
        expect(sw).toContain("url.searchParams.has('_rsc')");
        expect(sw).toContain('url.origin !== self.location.origin');
    });

    it('limpia versiones antiguas de shell al activar', () => {
        expect(sw).toContain("nombre.startsWith('tlm-shell-')");
        expect(sw).toContain('nombre !== CACHE_SHELL');
        expect(sw).toContain('caches.delete(nombre)');
        expect(sw).toContain('self.skipWaiting()');
        expect(sw).toContain('self.clients.claim()');
    });

    it('PwaRegistrar actualiza sin unregister ni IndexedDB', () => {
        expect(registrar).toContain('role !== "asesor"');
        expect(registrar).toContain('NODE_ENV !== "production"');
        expect(registrar).toContain('updateViaCache: "none"');
        expect(registrar).toContain('registration.update()');
        expect(registrar).not.toContain('unregister');
        expect(registrar).not.toContain('indexedDB');
        expect(registrar).not.toContain('tlm_offline');
    });

    it('purge elimina caches/SW pero no IndexedDB', () => {
        expect(purge).toContain('caches.delete');
        expect(purge).toContain('getRegistrations');
        expect(purge).toContain('unregister');
        expect(purge).not.toContain('indexedDB');
        expect(purge).not.toContain('tlm_offline');
    });

    it('manifest conserva start_url y scope canónicos', () => {
        expect(manifest.start_url).toBe(
            '/admin/inventario-asesor?pwa=asesor'
        );
        expect(manifest.scope).toBe('/');
    });
});
