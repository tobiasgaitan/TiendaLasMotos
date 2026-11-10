/**
 * Tests WEB-040 — destino seguro posterior al login.
 * Ejecutar con: npx tsx src/test/utils/post-login.test.ts
 */
import { readFileSync } from 'node:fs';
import {
    DESTINO_POST_LOGIN_DEFAULT,
    resolverDestinoPostLogin,
} from '@/lib/auth/post-login';
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

// --- fallback canónico ---
check('null → default', resolverDestinoPostLogin(null) === DESTINO_POST_LOGIN_DEFAULT);
check('undefined → default', resolverDestinoPostLogin(undefined) === DESTINO_POST_LOGIN_DEFAULT);
check('vacío → default', resolverDestinoPostLogin('') === DESTINO_POST_LOGIN_DEFAULT);
check('espacios → default', resolverDestinoPostLogin('   ') === DESTINO_POST_LOGIN_DEFAULT);

// --- typo legacy /admin/simulator ---
check(
    '/admin/simulator NUNCA se devuelve',
    !resolverDestinoPostLogin('/admin/simulator?defaultLanding=1').includes('/admin/simulator')
);
check(
    '/admin/simulator canonicaliza',
    resolverDestinoPostLogin('/admin/simulator?defaultLanding=1') ===
        '/admin/simulador?defaultLanding=1'
);
check(
    '/admin/simulator/ canonicaliza',
    resolverDestinoPostLogin('/admin/simulator/') === '/admin/simulador?defaultLanding=1'
);

// --- destino canónico del simulador ---
check(
    '/admin/simulador fuerza defaultLanding=1',
    resolverDestinoPostLogin('/admin/simulador') === '/admin/simulador?defaultLanding=1'
);
check(
    '/admin/simulador conserva query y fuerza flag',
    resolverDestinoPostLogin('/admin/simulador?foo=bar') ===
        '/admin/simulador?foo=bar&defaultLanding=1'
);

// --- deep links válidos ---
check(
    'preserva /admin/inventario-asesor',
    resolverDestinoPostLogin('/admin/inventario-asesor') === '/admin/inventario-asesor'
);
check(
    'preserva /admin/creditos',
    resolverDestinoPostLogin('/admin/creditos') === '/admin/creditos'
);
check(
    'preserva /admin',
    resolverDestinoPostLogin('/admin') === '/admin'
);

// --- rechazos de seguridad / rutas no válidas ---
check('rechaza /admin/login', resolverDestinoPostLogin('/admin/login') === DESTINO_POST_LOGIN_DEFAULT);
check(
    'rechaza //evil.com',
    resolverDestinoPostLogin('//evil.com') === DESTINO_POST_LOGIN_DEFAULT
);
check(
    'rechaza https://evil.com',
    resolverDestinoPostLogin('https://evil.com') === DESTINO_POST_LOGIN_DEFAULT
);
check(
    'rechaza javascript:',
    resolverDestinoPostLogin('javascript:alert(1)') === DESTINO_POST_LOGIN_DEFAULT
);
check('rechaza rutas fuera de /admin', resolverDestinoPostLogin('/foo') === DESTINO_POST_LOGIN_DEFAULT);

// --- contrato GOD NODE: RoleBasedRedirect aplica landingPorRol(role) ---
const destinoBase = resolverDestinoPostLogin('/admin/simulator?defaultLanding=1');
check('asesor parte de base canónica', destinoBase === '/admin/simulador?defaultLanding=1');
check('asesor landing final', landingPorRol('asesor') === '/admin/inventario-asesor');
check('admin landing final', landingPorRol('admin') === '/admin/simulador');
check('admin_creditos landing final', landingPorRol('admin_creditos') === '/admin/creditos');

// --- WEB-048: AuthContext sin reload y LoginForm con rol/flag antes de navegar ---
const authContextSource = readFileSync(
    'src/context/AuthContext.tsx',
    'utf8'
);
const loginFormSource = readFileSync(
    'src/app/admin/login/LoginForm.tsx',
    'utf8'
);
const firebaseSource = readFileSync('src/lib/firebase.ts', 'utf8');

check(
    'AuthContext eliminó window.location.reload',
    !authContextSource.includes('window.location.reload')
);
check(
    'AuthContext conserva CLAVE_FLAG_ASESOR',
    authContextSource.includes('CLAVE_FLAG_ASESOR')
);
check(
    'LoginForm espera rol y escribe flag antes de navegar',
    loginFormSource.includes('useAuth()') &&
        loginFormSource.includes('CLAVE_FLAG_ASESOR') &&
        loginFormSource.includes('prepararNavegacion') &&
        loginFormSource.indexOf(
            'window.localStorage.setItem(CLAVE_FLAG_ASESOR'
        ) < loginFormSource.indexOf('window.location.href')
);
check(
    'CLAVE_RECARGA_OFFLINE sigue existiendo como clave',
    firebaseSource.includes('CLAVE_RECARGA_OFFLINE')
);
check(
    'RoleBasedRedirect conserva su contrato de loading/role',
    readFileSync('src/components/RoleBasedRedirect.tsx', 'utf8').includes(
        'useAuth'
    )
);

if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED`);
    process.exit(1);
} else {
    console.log('\npost-login.test.ts: ALL PASSED');
}
