/**
 * Tests P5 — contrato de gating del sidebar (corrección pre-certificación).
 * Ejecutar con: npx tsx src/test/utils/sidebar-visibility.test.ts
 */
import { DEFAULT_MATRIZ } from '@/types/roles';
import {
    esAdminLike,
    puedeVerNodo,
    verGrupoCreditos,
} from '@/lib/auth/sidebar-visibility';

let failures = 0;
function check(name: string, cond: boolean) {
    if (cond) {
        console.log(`ok - ${name}`);
    } else {
        failures++;
        console.error(`FAIL - ${name}`);
    }
}

const M = DEFAULT_MATRIZ;

// --- esAdminLike ---
check('admin-like: superadmin/admin', esAdminLike('superadmin') && esAdminLike('admin'));
check('no admin-like: resto', !esAdminLike('cobrador') && !esAdminLike('inversor') && !esAdminLike('auditor') && !esAdminLike('guest') && !esAdminLike(null));

// --- superadmin/admin: todo visible ---
for (const rol of ['superadmin', 'admin'] as const) {
    check(`${rol} ve simuladores`, puedeVerNodo(rol, M, 'simuladores'));
    check(`${rol} ve inventario`, puedeVerNodo(rol, M, 'inventario'));
    check(`${rol} ve prospectos`, puedeVerNodo(rol, M, 'prospectos'));
    check(`${rol} ve config`, puedeVerNodo(rol, M, 'config'));
    check(`${rol} ve grupo créditos`, verGrupoCreditos(rol, M));
}

// --- cobrador: solo créditos propios + auditoría, sin config ni admin general ---
check('cobrador NO ve simuladores/inventario/prospectos',
    !puedeVerNodo('cobrador', M, 'simuladores') && !puedeVerNodo('cobrador', M, 'inventario') && !puedeVerNodo('cobrador', M, 'prospectos'));
check('cobrador NO ve config', !puedeVerNodo('cobrador', M, 'config') && !puedeVerNodo('cobrador', M, 'config-usuarios'));
check('cobrador ve grupo créditos', verGrupoCreditos('cobrador', M));
check('cobrador: contratos/pagos/remisiones/auditoría sí, inversores no',
    puedeVerNodo('cobrador', M, 'creditos-contratos') &&
    puedeVerNodo('cobrador', M, 'creditos-pagos') &&
    puedeVerNodo('cobrador', M, 'creditos-remisiones') &&
    puedeVerNodo('cobrador', M, 'creditos-auditoria') &&
    !puedeVerNodo('cobrador', M, 'creditos-inversores'));

// --- inversor: solo contratos + inversores ---
check('inversor NO ve admin general ni config',
    !puedeVerNodo('inversor', M, 'simuladores') && !puedeVerNodo('inversor', M, 'inventario') &&
    !puedeVerNodo('inversor', M, 'prospectos') && !puedeVerNodo('inversor', M, 'config'));
check('inversor ve grupo créditos', verGrupoCreditos('inversor', M));
check('inversor: contratos+inversores sí; pagos/remisiones/auditoría no',
    puedeVerNodo('inversor', M, 'creditos-contratos') &&
    puedeVerNodo('inversor', M, 'creditos-inversores') &&
    !puedeVerNodo('inversor', M, 'creditos-pagos') &&
    !puedeVerNodo('inversor', M, 'creditos-remisiones') &&
    !puedeVerNodo('inversor', M, 'creditos-auditoria'));

// --- auditor: config + contratos + auditoría ---
check('auditor NO ve admin general',
    !puedeVerNodo('auditor', M, 'simuladores') && !puedeVerNodo('auditor', M, 'inventario') && !puedeVerNodo('auditor', M, 'prospectos'));
check('auditor ve config', puedeVerNodo('auditor', M, 'config') && puedeVerNodo('auditor', M, 'config-usuarios'));
check('auditor ve grupo créditos', verGrupoCreditos('auditor', M));
check('auditor: contratos+remisiones+inversores(read-only)+auditoría sí; pagos no',
    puedeVerNodo('auditor', M, 'creditos-contratos') &&
    puedeVerNodo('auditor', M, 'creditos-remisiones') &&
    puedeVerNodo('auditor', M, 'creditos-inversores') &&
    puedeVerNodo('auditor', M, 'creditos-auditoria') &&
    !puedeVerNodo('auditor', M, 'creditos-pagos'));

// --- guest: nada ---
check('guest no ve nada',
    !puedeVerNodo('guest', M, 'simuladores') && !puedeVerNodo('guest', M, 'config') &&
    !puedeVerNodo('guest', M, 'creditos-contratos') && !verGrupoCreditos('guest', M));

// --- fail-closed: nodo futuro sin mapeo ---
check('fail-closed: admin ve nodo futuro', puedeVerNodo('admin', M, 'nodo-futuro-x'));
check('fail-closed: cobrador NO ve nodo futuro', !puedeVerNodo('cobrador', M, 'nodo-futuro-x'));
check('fail-closed: guest NO ve nodo futuro', !puedeVerNodo('guest', M, 'nodo-futuro-x'));

if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED`);
    process.exit(1);
} else {
    console.log('\nsidebar-visibility.test.ts: ALL PASSED');
}
