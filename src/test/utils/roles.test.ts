/**
 * Tests P5 — tipos/roles y resolución resiliente de rol.
 * Ejecutar con: npx tsx src/test/utils/roles.test.ts
 */
import {
    DEFAULT_MATRIZ,
    puede,
    scopeDe,
    esRolValido,
    type MatrizRol,
} from '@/types/roles';
import { normalizarRol, resolverRol } from '@/lib/auth/resolve-rol';

let failures = 0;
function check(name: string, cond: boolean) {
    if (cond) {
        console.log(`ok - ${name}`);
    } else {
        failures++;
        console.error(`FAIL - ${name}`);
    }
}

// --- esRolValido ---
check('roles canónicos válidos', ['superadmin', 'admin', 'cobrador', 'inversor', 'auditor'].every(esRolValido));
check('case-insensitive', esRolValido('Admin') && esRolValido('SUPERADMIN'));
check('vendedor no es canónico', !esRolValido('vendedor'));
check('guest no es canónico', !esRolValido('guest'));
check('basura rechazada', !esRolValido('root') && !esRolValido(null) && !esRolValido(42));

// --- normalizarRol ---
check('vendedor → cobrador', normalizarRol('vendedor') === 'cobrador');
check('Vendedor (mayús) → cobrador', normalizarRol('Vendedor') === 'cobrador');
check('admin pasa', normalizarRol('admin') === 'admin');
check('desconocido → guest', normalizarRol('root') === 'guest');
check('no-string → guest', normalizarRol(null) === 'guest' && normalizarRol(undefined) === 'guest');

// --- resolverRol (rol ?? role) ---
check('lee rol', resolverRol({ rol: 'admin' }) === 'admin');
check('fallback a role', resolverRol({ role: 'inversor' }) === 'inversor');
check('rol gana a role', resolverRol({ rol: 'auditor', role: 'admin' }) === 'auditor');
check('role legacy vendedor → cobrador', resolverRol({ role: 'vendedor' }) === 'cobrador');
check('doc nulo → guest', resolverRol(null) === 'guest');
check('doc sin rol → guest', resolverRol({ email: 'x@y.z' }) === 'guest');

// --- puede() sobre DEFAULT_MATRIZ ---
const M: MatrizRol = DEFAULT_MATRIZ;
check('admin crea creditos', puede(M.admin, 'creditos', 'create'));
check('admin no borra pagos', !puede(M.admin, 'pagos_y_multas', 'delete'));
check('cobrador crea pagos', puede(M.cobrador, 'pagos_y_multas', 'create'));
check('cobrador no crea creditos', !puede(M.cobrador, 'creditos', 'create'));
check('cobrador no toca inversores', !puede(M.cobrador, 'pagos_inversores', 'read'));
check('inversor lee creditos', puede(M.inversor, 'creditos', 'read'));
check('inversor no crea giros', !puede(M.inversor, 'pagos_inversores', 'create'));
check('inversor lee giros propios', puede(M.inversor, 'pagos_inversores', 'read'));
check('auditor lee financieras', puede(M.auditor, 'pagos_y_multas', 'read') && puede(M.auditor, 'remisiones_dinero', 'read'));
check('auditor no crea pagos', !puede(M.auditor, 'pagos_y_multas', 'create'));
check('auditor CRUD anomalias', puede(M.auditor, 'anomalias', 'delete'));
check('superadmin full usuarios', puede(M.superadmin, 'sys_admin_users', 'delete'));
check('admin no borra usuarios', !puede(M.admin, 'sys_admin_users', 'delete'));
check('undefined → false', !puede(undefined, 'creditos', 'read'));

// --- scopeDe() ---
check('scope cobrador pagos', scopeDe(M.cobrador, 'pagos_y_multas') === 'email_usuario');
check('scope inversor creditos', scopeDe(M.inversor, 'creditos') === 'email_inversor');
check('admin sin scope', scopeDe(M.admin, 'creditos') === null);
check('scopeDe undefined → null', scopeDe(undefined, 'creditos') === null);

if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED`);
    process.exit(1);
} else {
    console.log('\nroles.test.ts: ALL PASSED');
}
