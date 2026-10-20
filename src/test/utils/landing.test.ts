/**
 * Tests WEB-038 — helper puro landingPorRol.
 * Ejecutar con: npx tsx src/test/utils/landing.test.ts
 */
import { landingPorRol } from '@/lib/auth/landing';

let failures = 0;
function check(name: string, cond: boolean) {
    if (cond) {
        console.log(`ok - ${name}`);
    } else {
        failures++;
        console.error(`FAIL - ${name}`);
    }
}

// --- admin_creditos → /admin/creditos ---
check('admin_creditos → /admin/creditos', landingPorRol('admin_creditos') === '/admin/creditos');

// --- resto de roles → /admin/simulador ---
check('superadmin → /admin/simulador', landingPorRol('superadmin') === '/admin/simulador');
check('admin → /admin/simulador', landingPorRol('admin') === '/admin/simulador');
check('cobrador → /admin/simulador', landingPorRol('cobrador') === '/admin/simulador');
check('inversor → /admin/simulador', landingPorRol('inversor') === '/admin/simulador');
check('auditor → /admin/simulador', landingPorRol('auditor') === '/admin/simulador');
check('guest → /admin/simulador', landingPorRol('guest') === '/admin/simulador');

// --- nulos → /admin/simulador ---
check('null → /admin/simulador', landingPorRol(null) === '/admin/simulador');
check('undefined → /admin/simulador', landingPorRol(undefined) === '/admin/simulador');

// --- case-insensitive ---
check('ADMIN_CREDITOS → /admin/creditos', landingPorRol('ADMIN_CREDITOS') === '/admin/creditos');

if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED`);
    process.exit(1);
} else {
    console.log('\nlanding.test.ts: ALL PASSED');
}
