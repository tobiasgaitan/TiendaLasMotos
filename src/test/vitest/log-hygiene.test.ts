import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const adminSidebar = readFileSync(
    'src/components/AdminSidebar.tsx',
    'utf8'
);
const loginActions = readFileSync(
    'src/app/admin/login/actions.ts',
    'utf8'
);
const outbox = readFileSync('src/lib/offline/outbox.ts', 'utf8');

describe('WEB-LOG-HIGIENE-001', () => {
    it('detecta NEXT_REDIRECT en el logout y no lo loguea como error', () => {
        expect(adminSidebar).toContain('NEXT_REDIRECT');
        expect(adminSidebar).toContain('esRedireccionControladaNext');
        expect(adminSidebar).toContain('console.debug(');
        expect(adminSidebar).toContain(
            '[auth] Logout redirect controlado por Next.js'
        );
        expect(adminSidebar).toContain('console.error("Logout failed", error)');
        expect(
            adminSidebar.indexOf('esRedireccionControladaNext(error)') <
                adminSidebar.indexOf('console.error("Logout failed", error)')
        ).toBe(true);
    });

    it('conserva la redirección legítima de deleteSession', () => {
        expect(loginActions).toContain("redirect('/admin/login')");
    });

    it('degrada logs esperados de migración y conserva errores reales', () => {
        expect(outbox).toContain('console.debug(');
        expect(outbox).toContain(
            'Migración v2: descartando registro legado sin propietario'
        );
        expect(outbox).toContain('console.info(');
        expect(outbox).toContain('Migración v2 completada');
        expect(outbox).toContain('Migración v2 falló');
    });
});
