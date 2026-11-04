/**
 * Tests WEB-038 — Punto 3: helpers puros del dashboard de aprobaciones.
 * Ejecutar con: npx tsx src/test/utils/inventario-ui.test.ts
 */
import {
    construirDatosMaestro,
    formatearFecha,
    parseAplicaA,
    validarMotivoRechazo,
} from '@/lib/inventario/ui-helpers';

let failures = 0;
function check(name: string, cond: boolean) {
    if (cond) {
        console.log(`ok - ${name}`);
    } else {
        failures++;
        console.error(`FAIL - ${name}`);
    }
}

function run() {
    // --- parseAplicaA ---
    const aplica = parseAplicaA('motor, frenos, , motor');
    check(
        'parseAplicaA separa, limpia y deduplica',
        aplica.length === 2 &&
            aplica[0] === 'motor' &&
            aplica[1] === 'frenos'
    );
    check('parseAplicaA solo espacios devuelve []', parseAplicaA('   ').length === 0);

    // --- formatearFecha ---
    check('formatearFecha vacío devuelve —', formatearFecha('') === '—');
    check(
        'formatearFecha inválida devuelve —',
        formatearFecha('fecha-invalida') === '—'
    );
    check(
        'formatearFecha ISO válida no está vacía',
        formatearFecha('2026-11-03T12:34:56.000Z') !== '—'
    );

    // --- validarMotivoRechazo ---
    check('motivo de 3 caracteres es inválido', !validarMotivoRechazo('abc'));
    check('motivo de 5 caracteres es válido', validarMotivoRechazo('abcde'));
    check(
        'motivo con espacios exteriores de 5 caracteres es válido',
        validarMotivoRechazo('  abcde  ')
    );

    // --- construirDatosMaestro ---
    check(
        'construirDatosMaestro vacío devuelve undefined',
        construirDatosMaestro({
            fabricante: '',
            aplicaA: '',
            categoria: '',
            precio: '',
            stockMinimo: '',
        }) === undefined
    );

    const datos = construirDatosMaestro({
        fabricante: '  Bosch  ',
        aplicaA: 'motor, frenos, , motor',
        categoria: '  Filtros  ',
        precio: '12.5',
        stockMinimo: '3',
    });

    check(
        'construirDatosMaestro normaliza aplica_a',
        Boolean(
            datos &&
                datos.fabricante === 'Bosch' &&
                datos.categoria === 'Filtros' &&
                datos.aplica_a.length === 2 &&
                datos.aplica_a[0] === 'motor' &&
                datos.aplica_a[1] === 'frenos'
        )
    );
    check(
        'construirDatosMaestro convierte números',
        Boolean(datos && datos.precio === 12.5 && datos.stock_minimo === 3)
    );

    const parcial = construirDatosMaestro({
        fabricante: 'Bosch',
        aplicaA: 'motor',
        categoria: '',
        precio: '12.5',
        stockMinimo: '3',
    });
    check(
        'construirDatosMaestro devuelve datos parciales para que el schema los valide',
        Boolean(
            parcial &&
                parcial.fabricante === 'Bosch' &&
                parcial.categoria === '' &&
                parcial.precio === 12.5
        )
    );

    if (failures > 0) {
        console.error(`\n${failures} test(s) fallaron.`);
        process.exitCode = 1;
    } else {
        console.log('\nTodos los tests de inventario-ui pasaron.');
    }
}

run();
