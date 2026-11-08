/**
 * WEB-043 — Tests puros de matching de etiquetas Vision contra el catálogo.
 * Ejecutar con: npx tsx src/test/utils/inventario-matching.test.ts
 */
import { readFileSync } from 'node:fs';
import {
    normalizarTexto,
    rankearCandidatos,
    tokenizar,
    type CandidatoFuente,
} from '@/lib/inventario/matching';

let failures = 0;
function check(name: string, cond: boolean) {
    if (cond) {
        console.log(`ok - ${name}`);
    } else {
        failures++;
        console.error(`FAIL - ${name}`);
    }
}

const CATALOGO: CandidatoFuente[] = [
    {
        referencia: 'BRK-001',
        descripcion: 'Disco de freno delantero',
        fabricante: 'Bosch',
        categoria: 'FRENOS',
        aplica_a: ['Moto 125', 'Moto 150'],
        stock: 4,
    },
    {
        referencia: 'LLANTA-5VL-E1341-00',
        descripcion: 'Llanta trasera',
        fabricante: 'Yamaha',
        categoria: 'LLANTAS',
        aplica_a: ['Moto 125'],
        stock: 2,
    },
    {
        referencia: 'FILTRO-AIRE-01',
        descripcion: 'Filtro de aire',
        fabricante: 'Honda',
        categoria: 'FILTROS',
        aplica_a: ['Moto 150'],
        stock: 8,
    },
];

// --- normalización ---
check('normaliza tildes y mayúsculas', normalizarTexto('  Llánta  Trasera  ') === 'llanta trasera');
check('tokeniza sin stopwords', tokenizar('Disco de freno para moto').join(' ') === 'disco freno moto');
check('referencia normalizada conserva tokens', normalizarTexto('5VL-E1341-00') === '5vl e1341 00');

// --- matching por referencia ---
const porReferencia = rankearCandidatos(CATALOGO, {
    consulta: 'brk-001',
});
check('consulta exacta de referencia gana', porReferencia[0]?.referencia === 'BRK-001');
check('candidato conserva docId canónico', porReferencia[0]?.referencia === CATALOGO[0].referencia);

// --- matching por categoría/etiqueta ---
const porEtiqueta = rankearCandidatos(CATALOGO, {
    etiquetas: ['tire'],
});
check('etiqueta tire encuentra LLANTAS', porEtiqueta[0]?.referencia === 'LLANTA-5VL-E1341-00');
check('tire registra coincidencia', porEtiqueta[0]?.coincidencias.includes('tire') === true);

const porEtiquetaBrake = rankearCandidatos(CATALOGO, {
    etiquetas: ['brake'],
});
check('etiqueta brake encuentra FRENOS', porEtiquetaBrake[0]?.referencia === 'BRK-001');

// --- matching por descripción y consulta ---
const porDescripcion = rankearCandidatos(CATALOGO, {
    consulta: 'filtro aire',
});
check('consulta por descripción encuentra filtro', porDescripcion[0]?.referencia === 'FILTRO-AIRE-01');

const sinCoincidencias = rankearCandidatos(CATALOGO, {
    etiquetas: ['parabrisas'],
});
check('sin coincidencias devuelve lista vacía', sinCoincidencias.length === 0);

// --- catálogo sin filtros ---
const catalogoCompleto = rankearCandidatos(CATALOGO);
check('sin filtro devuelve todo el catálogo', catalogoCompleto.length === CATALOGO.length);
check(
    'sin filtro ordena por referencia',
    catalogoCompleto.map((item) => item.referencia).join('|') ===
        ['BRK-001', 'FILTRO-AIRE-01', 'LLANTA-5VL-E1341-00'].join('|')
);

// --- Faraday / contrato estático de la action ---
const actionSource = readFileSync(
    'src/app/admin/inventory/actions/buscarCandidatosRepuesto.ts',
    'utf8'
);
check("action declara 'use server'", actionSource.startsWith("'use server';"));
check('action valida actor', actionSource.includes('validarActor(actor)'));
check(
    'action verifica idToken',
    actionSource.includes('requireActorInventario(a.idToken)')
);
check(
    'action exige permiso de lectura',
    actionSource.includes("requirePermiso(me, 'inventario_repuestos', 'read')")
);
check(
    'action usa doc.id como referencia',
    actionSource.includes('const referencia = doc.id')
);
check(
    'action no escribe inventario_repuestos',
    !/\.set\(|\.add\(|\.update\(|\.delete\(/.test(actionSource)
);

const verificarSource = readFileSync(
    'src/app/admin/inventario-repuestos/actions/obtenerRepuestoPorReferencia.ts',
    'utf8'
);
check(
    'verificación de referencia declara use server',
    verificarSource.startsWith("'use server';")
);
check(
    'verificación de referencia usa Faraday',
    verificarSource.includes('validarActor(actor)') &&
        verificarSource.includes('requireActorInventario(a.idToken)') &&
        verificarSource.includes('requirePermiso(')
);

if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED`);
    process.exit(1);
} else {
    console.log('\ninventario-matching.test.ts: ALL PASSED');
}
