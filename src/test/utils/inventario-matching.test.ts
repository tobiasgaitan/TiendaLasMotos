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
check('stopwords solas no generan tokens', tokenizar('de la el para').length === 0);
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

const porEtiquetaAcentuada = rankearCandidatos(CATALOGO, {
    etiquetas: ['LLÁNTA'],
});
check(
    'etiqueta con acentos y mayúsculas encuentra descripción',
    porEtiquetaAcentuada[0]?.referencia === 'LLANTA-5VL-E1341-00'
);

const porEtiquetaCategoria = rankearCandidatos(CATALOGO, {
    etiquetas: ['frenos'],
});
check(
    'etiqueta coincide con categoría',
    porEtiquetaCategoria[0]?.referencia === 'BRK-001'
);

const porFabricante = rankearCandidatos(CATALOGO, {
    consulta: 'Yamaha',
});
check(
    'consulta coincide con fabricante',
    porFabricante[0]?.referencia === 'LLANTA-5VL-E1341-00'
);

const porAplicaA = rankearCandidatos(CATALOGO, {
    consulta: 'Moto 150',
});
check(
    'consulta coincide con aplica_a',
    porAplicaA.some((item) => item.referencia === 'FILTRO-AIRE-01')
);

// --- matching por descripción y consulta ---
const porDescripcion = rankearCandidatos(CATALOGO, {
    consulta: 'filtro aire',
});
check('consulta por descripción encuentra filtro', porDescripcion[0]?.referencia === 'FILTRO-AIRE-01');

const sinCoincidencias = rankearCandidatos(CATALOGO, {
    etiquetas: ['parabrisas'],
});
check('sin coincidencias devuelve lista vacía', sinCoincidencias.length === 0);

const etiquetasVacias = rankearCandidatos(CATALOGO, {
    etiquetas: ['', '   '],
});
check(
    'etiquetas vacías no filtran el catálogo',
    etiquetasVacias.length === CATALOGO.length
);

const consultaVacia = rankearCandidatos(CATALOGO, {
    consulta: '   ',
});
check(
    'consulta vacía no filtra el catálogo',
    consultaVacia.length === CATALOGO.length
);

const referenciaContenida = rankearCandidatos(CATALOGO, {
    consulta: 'LLANTA-5VL',
});
check(
    'referencia contenida encuentra candidato',
    referenciaContenida[0]?.referencia === 'LLANTA-5VL-E1341-00'
);

const onceEtiquetas = rankearCandidatos(CATALOGO, {
    etiquetas: [
        'x0',
        'x1',
        'x2',
        'x3',
        'x4',
        'x5',
        'x6',
        'x7',
        'x8',
        'x9',
        'frenos',
    ],
});
check(
    'solo se evalúan las primeras 10 etiquetas',
    onceEtiquetas.length === 0
);

const unaEtiqueta = rankearCandidatos(CATALOGO, {
    etiquetas: ['tire'],
});
const etiquetaDuplicada = rankearCandidatos(CATALOGO, {
    etiquetas: ['tire', 'TIRE', 'tire'],
});
check(
    'etiquetas normalizadas se deduplican',
    unaEtiqueta[0]?.score === etiquetaDuplicada[0]?.score
);

const sinReferencia = rankearCandidatos([
    { ...CATALOGO[0], referencia: '' },
    CATALOGO[1],
]);
check(
    'candidato sin referencia se descarta',
    sinReferencia.length === 1 &&
        sinReferencia[0]?.referencia === 'LLANTA-5VL-E1341-00'
);

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

const matchingSource = readFileSync(
    'src/lib/inventario/matching.ts',
    'utf8'
);
check(
    'matching puro no depende de Firestore, React ni DOM',
    !matchingSource.includes('firebase') &&
        !matchingSource.includes('react') &&
        !matchingSource.includes('document.') &&
        !matchingSource.includes('window.')
);

if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED`);
    process.exit(1);
} else {
    console.log('\ninventario-matching.test.ts: ALL PASSED');
}
