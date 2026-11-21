/**
 * Tests WEB-038 — inventario de repuestos.
 *
 * No toca Firebase: los casos de Server Actions fallan antes de
 * requireActorInventario.
 * Ejecutar con: npx tsx src/test/utils/inventario-repuestos.test.ts
 */
import { readFileSync } from 'node:fs';
import { crearRepuesto } from '@/app/admin/inventario-repuestos/actions/crearRepuesto';
import { editarRepuesto } from '@/app/admin/inventario-repuestos/actions/editarRepuesto';
import { listarRepuestos } from '@/app/admin/inventario-repuestos/actions/listarRepuestos';
import {
    contarRepuestosSchema,
    crearRepuestoSchema,
    editarRepuestoSchema,
    listarRepuestosSchema,
} from '@/lib/actions/inventario-repuestos-schemas';
import {
    construirCambiosRepuesto,
    filtrarRepuestos,
    hayFiltrosActivos,
} from '@/lib/inventario/repuestos';
import type { RepuestoInventarioDTO } from '@/types/inventario-repuestos';

const EDITAR_SOURCE = readFileSync(
    'src/app/admin/inventario-repuestos/actions/editarRepuesto.ts',
    'utf8'
);
const LISTAR_SOURCE = readFileSync(
    'src/app/admin/inventario-repuestos/actions/listarRepuestos.ts',
    'utf8'
);
const CREAR_SOURCE = readFileSync(
    'src/app/admin/inventario-repuestos/actions/crearRepuesto.ts',
    'utf8'
);
const CLIENT_SOURCE = readFileSync(
    'src/app/admin/inventario-repuestos/InventarioRepuestosClient.tsx',
    'utf8'
);
const MODAL_SOURCE = readFileSync(
    'src/components/inventario/CrearRepuestoModal.tsx',
    'utf8'
);
const PAGE_SOURCE = readFileSync(
    'src/app/admin/inventario-repuestos/page.tsx',
    'utf8'
);
const TYPES_SOURCE = readFileSync(
    'src/types/inventario-repuestos.ts',
    'utf8'
);
const SIDEBAR_SOURCE = readFileSync(
    'src/components/AdminSidebar.tsx',
    'utf8'
);
const ELIMINAR_SOURCE = readFileSync(
    'src/app/admin/inventario-repuestos/actions/eliminarRepuesto.ts',
    'utf8'
);
const ELIMINAR_MODAL_SOURCE = readFileSync(
    'src/components/inventario/EliminarRepuestoModal.tsx',
    'utf8'
);
const INVENTARIO_TYPES_SOURCE = readFileSync(
    'src/types/inventario.ts',
    'utf8'
);
const PERMISOS_MERGE_SOURCE = readFileSync(
    'scripts/merge-permissions-delete-inventario.ts',
    'utf8'
);
const CONTAR_SOURCE = readFileSync(
    'src/app/admin/inventario-repuestos/actions/contarRepuestos.ts',
    'utf8'
);
const BUSCAR_SOURCE = readFileSync(
    'src/app/admin/inventario-asesor/actions/buscarCandidatosRepuesto.ts',
    'utf8'
);
const INDEXES_SOURCE = readFileSync('firestore.indexes.json', 'utf8');

let failures = 0;
function check(name: string, cond: boolean) {
    if (cond) {
        console.log(`ok - ${name}`);
    } else {
        failures++;
        console.error(`FAIL - ${name}`);
    }
}

function lanza(fn: () => void): boolean {
    try {
        fn();
        return false;
    } catch (error) {
        if (!(error instanceof Error) || !error.message.trim()) {
            console.error(
                '[inventario-repuestos.test] error inesperado en lanza:',
                error
            );
        }
        return true;
    }
}

const BASE: RepuestoInventarioDTO = {
    documento_id: 'doc-brk-001',
    referencia: 'BRK-001',
    sede_id: 'sede-1',
    sede_nombre: 'Sede Principal',
    descripcion: 'Disco de freno delantero',
    fabricante: 'Honda',
    aplica_a: ['Honda CB 190'],
    categoria: 'Frenos',
    unidad_medida: 'unidad',
    precio: 125000,
    ubicacion: 'A-01-05',
    stock: 8,
    stock_minimo: 3,
    referencias_alternativas: ['BRK-ALT-1'],
    imagen_url: 'https://example.com/foto.jpg',
    creado_por: 'admin@test.com',
    creado_en: '2026-01-01T00:00:00.000Z',
    actualizado_por: 'admin@test.com',
    actualizado_en: '2026-01-01T00:00:00.000Z',
};

const BORRADOR = {
    descripcion: BASE.descripcion,
    stock: String(BASE.stock),
    stock_minimo: String(BASE.stock_minimo),
    precio: String(BASE.precio),
    unidad_medida: BASE.unidad_medida,
    ubicacion: BASE.ubicacion ?? '',
    referencias_alternativas: [...BASE.referencias_alternativas],
};

const VALIDO = editarRepuestoSchema.safeParse({
    documento_id: 'doc-brk-001',
    referencia: 'brk-001',
    cambios: {
        descripcion: '  Disco de freno trasero  ',
        stock: 9,
        stock_minimo: 4,
        precio: 130000,
        ubicacion: 'b-02-06',
    },
});

check(
    'schema acepta cambios válidos y normaliza referencia/ubicación/descripción',
    VALIDO.success &&
        VALIDO.data.referencia === 'BRK-001' &&
        VALIDO.data.cambios.ubicacion === 'b-02-06' &&
        VALIDO.data.cambios.descripcion === 'Disco de freno trasero'
);

check(
    'schema rechaza stock negativo',
    !editarRepuestoSchema.safeParse({
        documento_id: 'doc-brk-001',
        referencia: 'BRK-001',
        cambios: { stock: -1 },
    }).success
);

check(
    'schema rechaza stock decimal',
    !editarRepuestoSchema.safeParse({
        documento_id: 'doc-brk-001',
        referencia: 'BRK-001',
        cambios: { stock: 1.5 },
    }).success
);

check(
    'schema rechaza precio negativo',
    !editarRepuestoSchema.safeParse({
        documento_id: 'doc-brk-001',
        referencia: 'BRK-001',
        cambios: { precio: -0.01 },
    }).success
);

check(
    'schema acepta ubicación de formato libre',
    editarRepuestoSchema.safeParse({
        documento_id: 'doc-brk-001',
        referencia: 'BRK-001',
        cambios: { ubicacion: 'Área Norte, estante 2' },
    }).success
);

check(
    'schema rechaza descripción vacía',
    !editarRepuestoSchema.safeParse({
        documento_id: 'doc-brk-001',
        referencia: 'BRK-001',
        cambios: { descripcion: '   ' },
    }).success
);

check(
    'schema rechaza campos desconocidos',
    !editarRepuestoSchema.safeParse({
        documento_id: 'doc-brk-001',
        referencia: 'BRK-001',
        cambios: { stock: 1, categoria: 'Frenos' },
    }).success
);

check(
    'schema rechaza cambios vacíos',
    !editarRepuestoSchema.safeParse({
        documento_id: 'doc-brk-001',
        referencia: 'BRK-001',
        cambios: {},
    }).success
);

const CREAR_BASE = {
    referencia: 'brk-010',
    descripcion: '  Pastillas de freno  ',
    sede_id: '  sede-1  ',
    fabricante: '  Bosch  ',
    aplica_a: ['Moto 125'],
    categoria: '  Frenos  ',
    precio: 85000,
    ubicacion: '  Área Norte  ',
    stock: 3,
    stock_minimo: 1,
    referencias_alternativas: ['brk-011', 'brk-010', 'BRK-011'],
    imagen_url: null,
};

const crearOk = crearRepuestoSchema.safeParse(CREAR_BASE);
check(
    'crearRepuestoSchema normaliza referencia, sede, texto de catálogo y ubicación libre',
    crearOk.success &&
        crearOk.data.referencia === 'BRK-010' &&
        crearOk.data.sede_id === 'sede-1' &&
        crearOk.data.ubicacion === 'Área Norte' &&
        crearOk.data.descripcion === 'Pastillas de freno' &&
        crearOk.data.fabricante === 'BOSCH' &&
        crearOk.data.categoria === 'FRENOS' &&
        crearOk.data.referencias_alternativas.length === 1 &&
        crearOk.data.referencias_alternativas[0] === 'BRK-011'
);
check(
    'crearRepuestoSchema acepta imagen_url null',
    crearOk.success && crearOk.data.imagen_url === null
);
check(
    'crearRepuestoSchema acepta imagen_url omitida',
    crearRepuestoSchema.safeParse({
        ...CREAR_BASE,
        imagen_url: undefined,
    }).success
);
check(
    'crearRepuestoSchema conserva imagen_url vacía sin transformarla',
    (() => {
        const resultado = crearRepuestoSchema.safeParse({
            ...CREAR_BASE,
            imagen_url: '',
        });
        return resultado.success && resultado.data.imagen_url === '';
    })()
);
check(
    'crearRepuestoSchema rechaza URL de imagen inválida',
    !crearRepuestoSchema.safeParse({
        ...CREAR_BASE,
        imagen_url: 'no-es-url',
    }).success
);
check(
    'crearRepuestoSchema rechaza campos desconocidos',
    !crearRepuestoSchema.safeParse({
        ...CREAR_BASE,
        creado_por_uid: 'x',
    }).success
);
check(
    'crearRepuestoSchema acepta aplica_a vacío y campos opcionales omitidos',
    crearRepuestoSchema.safeParse({
        referencia: 'BRK-030',
        descripcion: 'Repuesto mínimo',
        sede_id: 'sede-1',
        ubicacion: 'Pasillo 1',
    }).success
);
check(
    'crearRepuestoSchema rechaza espacios en la referencia maestra',
    !crearRepuestoSchema.safeParse({
        ...CREAR_BASE,
        referencia: ' BRK-010 ',
    }).success
);
check(
    'crearRepuestoSchema rechaza espacios en una alternativa',
    !crearRepuestoSchema.safeParse({
        ...CREAR_BASE,
        referencias_alternativas: ['BRK 011'],
    }).success
);
check(
    'crearRepuestoSchema rechaza referencia inválida',
    !crearRepuestoSchema.safeParse({
        ...CREAR_BASE,
        referencia: 'BRK 010',
    }).success
);
check(
    'crearRepuestoSchema rechaza stock decimal',
    !crearRepuestoSchema.safeParse({
        ...CREAR_BASE,
        stock: 1.5,
    }).success
);

const crearUnidadDefault = crearRepuestoSchema.safeParse({
    referencia: 'BRK-040',
    descripcion: 'Repuesto sin unidad explícita',
    sede_id: 'sede-1',
    ubicacion: 'Pasillo 1',
});
check(
    'crearRepuestoSchema usa unidad como default',
    crearUnidadDefault.success &&
        crearUnidadDefault.data.unidad_medida === 'unidad'
);
check(
    'crearRepuestoSchema acepta litro',
    crearRepuestoSchema.safeParse({
        ...CREAR_BASE,
        unidad_medida: 'litro',
    }).data?.unidad_medida === 'litro'
);
check(
    'crearRepuestoSchema rechaza unidad inválida',
    !crearRepuestoSchema.safeParse({
        ...CREAR_BASE,
        unidad_medida: 'docena',
    }).success
);
check(
    'cambiosRepuestoSchema acepta unidad_medida aditiva',
    editarRepuestoSchema.safeParse({
        documento_id: 'doc-brk-001',
        referencia: 'BRK-001',
        cambios: { unidad_medida: 'litro' },
    }).data?.cambios.unidad_medida === 'litro'
);
check(
    'cambiosRepuestoSchema rechaza unidad inválida',
    !editarRepuestoSchema.safeParse({
        documento_id: 'doc-brk-001',
        referencia: 'BRK-001',
        cambios: { unidad_medida: 'gramo' },
    }).success
);

const listarDefault = listarRepuestosSchema.parse({});
check(
    'listarRepuestosSchema usa PAGE_SIZE=50 y filtros vacíos',
    listarDefault.limite === 50 &&
        listarDefault.referencia === '' &&
        listarDefault.categoria === '' &&
        listarDefault.fabricante === '' &&
        listarDefault.referencia_alternativa === '' &&
        listarDefault.cursor === undefined
);
check(
    'listarRepuestosSchema normaliza el prefijo a mayúsculas',
    listarRepuestosSchema.parse({ referencia: 'brk-0' }).referencia ===
        'BRK-0'
);
check(
    'listarRepuestosSchema normaliza la referencia alternativa a mayúsculas',
    listarRepuestosSchema.parse({
        referencia_alternativa: '  alt-001  ',
    }).referencia_alternativa === 'ALT-001'
);
check(
    'listarRepuestosSchema rechaza referencia alternativa inválida',
    !listarRepuestosSchema.safeParse({
        referencia_alternativa: 'ALT 001',
    }).success
);
check(
    'listarRepuestosSchema rechaza referencia alternativa mayor a 64',
    !listarRepuestosSchema.safeParse({
        referencia_alternativa: 'A'.repeat(65),
    }).success
);
const listarNormalizado = listarRepuestosSchema.parse({
    categoria: '  frenos  ',
    fabricante: '  bosch  ',
});
check(
    'listarRepuestosSchema normaliza categoría y fabricante a mayúsculas',
    listarNormalizado.categoria === 'FRENOS' &&
        listarNormalizado.fabricante === 'BOSCH'
);
check(
    'listarRepuestosSchema acepta cursor válido',
    listarRepuestosSchema.safeParse({
        limite: 25,
        cursor: { referencia: 'BRK-001', documento_id: 'doc-1' },
    }).success
);
check(
    'listarRepuestosSchema rechaza cursor incompleto',
    !listarRepuestosSchema.safeParse({
        cursor: { referencia: 'BRK-001' },
    }).success
);
check(
    'listarRepuestosSchema rechaza límite fuera de rango',
    !listarRepuestosSchema.safeParse({ limite: 201 }).success
);
const contarNormalizado = contarRepuestosSchema.safeParse({
    referencia: 'brk',
    categoria: '  Frenos  ',
    fabricante: '  Bosch  ',
    referencia_alternativa: '  alt-002  ',
});
check(
    'contarRepuestosSchema normaliza referencia, categoría, fabricante y alternativa',
    contarNormalizado.success &&
        contarNormalizado.data.referencia === 'BRK' &&
        contarNormalizado.data.categoria === 'FRENOS' &&
        contarNormalizado.data.fabricante === 'BOSCH' &&
        contarNormalizado.data.referencia_alternativa === 'ALT-002'
);

const OTRO: RepuestoInventarioDTO = {
    ...BASE,
    referencia: 'ACE-002',
    descripcion: 'Aceite 20W-50',
    fabricante: 'Motul',
    categoria: 'Lubricantes',
    precio: 45000,
    stock: 20,
    referencias_alternativas: ['ACE-ALT-2'],
};

check(
    'filtrarRepuestos busca por referencia parcial',
    filtrarRepuestos([BASE, OTRO], {
        referencia: 'brk',
        categoria: '',
        fabricante: '',
        referencia_alternativa: '',
    }).length === 1
);

check(
    'filtrarRepuestos combina categoría y fabricante',
    filtrarRepuestos([BASE, OTRO], {
        referencia: '',
        categoria: 'Lubricantes',
        fabricante: 'Motul',
        referencia_alternativa: '',
    }).length === 1 &&
        filtrarRepuestos([BASE, OTRO], {
            referencia: '',
            categoria: 'Lubricantes',
            fabricante: 'Honda',
            referencia_alternativa: '',
        }).length === 0
);

check(
    'filtrarRepuestos aplica coincidencia exacta case-insensitive en alternativas',
    filtrarRepuestos([BASE, OTRO], {
        referencia: '',
        categoria: '',
        fabricante: '',
        referencia_alternativa: 'brk-alt-1',
    }).length === 1 &&
        filtrarRepuestos([BASE, OTRO], {
            referencia: '',
            categoria: '',
            fabricante: '',
            referencia_alternativa: 'BRK-ALT',
        }).length === 0 &&
        filtrarRepuestos([BASE, OTRO], {
            referencia: '',
            categoria: '',
            fabricante: '',
            referencia_alternativa: 'ace-alt-2',
        }).length === 1 &&
        filtrarRepuestos([BASE, OTRO], {
            referencia: '',
            categoria: '',
            fabricante: '',
            referencia_alternativa: 'ALT-2',
        }).length === 0
);

check(
    'hayFiltrosActivos devuelve false con todos los filtros vacíos',
    !hayFiltrosActivos({
        referencia: '',
        categoria: '',
        fabricante: '',
        referencia_alternativa: '',
    })
);

check(
    'hayFiltrosActivos ignora filtros con solo espacios',
    !hayFiltrosActivos({
        referencia: '   ',
        categoria: '  ',
        fabricante: '\t',
        referencia_alternativa: ' ',
    })
);

check(
    'hayFiltrosActivos detecta cada campo individual',
    hayFiltrosActivos({
        referencia: 'BRK',
        categoria: '',
        fabricante: '',
        referencia_alternativa: '',
    }) &&
        hayFiltrosActivos({
            referencia: '',
            categoria: 'FRENOS',
            fabricante: '',
            referencia_alternativa: '',
        }) &&
        hayFiltrosActivos({
            referencia: '',
            categoria: '',
            fabricante: 'BOSCH',
            referencia_alternativa: '',
        }) &&
        hayFiltrosActivos({
            referencia: '',
            categoria: '',
            fabricante: '',
            referencia_alternativa: 'ALT-1',
        })
);

check(
    'construirCambiosRepuesto no genera cambios si el borrador es igual',
    Object.keys(construirCambiosRepuesto(BASE, BORRADOR)).length === 0
);

const soloStock = construirCambiosRepuesto(BASE, {
    ...BORRADOR,
    stock: '12',
});

check(
    'construirCambiosRepuesto devuelve solo stock modificado',
    Object.keys(soloStock).length === 1 && soloStock.stock === 12
);

check(
    'construirCambiosRepuesto rechaza stock inválido',
    lanza(() =>
        construirCambiosRepuesto(BASE, {
            ...BORRADOR,
            stock: '-2',
        })
    )
);

const soloUnidad = construirCambiosRepuesto(BASE, {
    ...BORRADOR,
    unidad_medida: 'litro',
});
check(
    'construirCambiosRepuesto emite unidad_medida solo si cambia',
    Object.keys(soloUnidad).length === 1 &&
        soloUnidad.unidad_medida === 'litro'
);
check(
    'construirCambiosRepuesto no emite unidad_medida sin cambios',
    Object.keys(
        construirCambiosRepuesto(BASE, {
            ...BORRADOR,
            unidad_medida: 'unidad',
        })
    ).length === 0
);

const conAlternativas = construirCambiosRepuesto(BASE, {
    ...BORRADOR,
    referencias_alternativas: [
        'BRK-ALT-1',
        'BRK-ALT-2',
        'BRK-001',
    ],
});
check(
    'construirCambiosRepuesto agrega alternativas sin duplicar la maestra',
    conAlternativas.referencias_alternativas?.join('|') ===
        'BRK-ALT-1|BRK-ALT-2'
);
check(
    'construirCambiosRepuesto rechaza espacios en alternativas',
    lanza(() =>
        construirCambiosRepuesto(BASE, {
            ...BORRADOR,
            referencias_alternativas: ['BRK ALT 2'],
        })
    )
);
check(
    'construirCambiosRepuesto no emite alternativas sin cambios',
    Object.keys(
        construirCambiosRepuesto(BASE, {
            ...BORRADOR,
            referencias_alternativas: ['BRK-ALT-1'],
        })
    ).length === 0
);

async function run() {
    const listarSinActor = await listarRepuestos({}, {});
    check(
        'listarRepuestos rechaza actor inválido',
        listarSinActor.success === false &&
            Array.isArray(listarSinActor.repuestos) &&
            listarSinActor.repuestos.length === 0
    );

    const listarInputInvalido = await listarRepuestos(
        { filtro: 'x' },
        { uid: 'x', idToken: 'x' }
    );
    check(
        'listarRepuestos rechaza input inválido antes de Firebase',
        listarInputInvalido.success === false
    );

    const editarSinActor = await editarRepuesto({}, {});
    check(
        'editarRepuesto rechaza actor inválido',
        editarSinActor.success === false
    );

    const editarInputInvalido = await editarRepuesto(
        {},
        { uid: 'x', idToken: 'x' }
    );
    check(
        'editarRepuesto rechaza input inválido antes de Firebase',
        editarInputInvalido.success === false
    );

    const crearSinActor = await crearRepuesto(CREAR_BASE, {});
    check('crearRepuesto rechaza actor inválido', crearSinActor.success === false);

    const crearInputInvalido = await crearRepuesto(
        {},
        { uid: 'x', idToken: 'x' }
    );
    check(
        'crearRepuesto rechaza input inválido antes de Firebase',
        crearInputInvalido.success === false
    );

    check(
        'listarRepuestos usa requireActorInventario y requirePermiso read',
        LISTAR_SOURCE.includes('requireActorInventario') &&
            LISTAR_SOURCE.includes("'inventario_repuestos'") &&
            LISTAR_SOURCE.includes("'read'")
    );

    check(
        'listarRepuestos exige rol admin o superadmin',
        LISTAR_SOURCE.includes("permiso.rol !== 'admin'") &&
            LISTAR_SOURCE.includes("permiso.rol !== 'superadmin'")
    );

    check(
        'listarRepuestos usa cursor, orden estable y límite',
        LISTAR_SOURCE.includes(".orderBy('referencia')") &&
            LISTAR_SOURCE.includes('FieldPath.documentId()') &&
            LISTAR_SOURCE.includes('.startAfter(') &&
            LISTAR_SOURCE.includes('.limit(filtros.limite + 1)') &&
            LISTAR_SOURCE.includes('siguienteCursor')
    );

    check(
        'listarRepuestos aplica filtros server-side',
        LISTAR_SOURCE.includes(".where('categoria', '==', filtros.categoria)") &&
            LISTAR_SOURCE.includes(
                ".where('fabricante', '==', filtros.fabricante)"
            ) &&
            LISTAR_SOURCE.includes(".where('referencia', '>='") &&
            LISTAR_SOURCE.includes(".where('referencia', '<='") &&
            LISTAR_SOURCE.includes("'referencias_alternativas'") &&
            LISTAR_SOURCE.includes("'array-contains'")
    );

    check(
        'contarRepuestos usa count() y no devuelve documentos',
        CONTAR_SOURCE.includes('.count().get()') &&
            CONTAR_SOURCE.includes('snap.data().count') &&
            CONTAR_SOURCE.includes("where('categoria'") &&
            CONTAR_SOURCE.includes("where('fabricante'") &&
            CONTAR_SOURCE.includes("where('referencia', '>='") &&
            CONTAR_SOURCE.includes("'referencias_alternativas'") &&
            CONTAR_SOURCE.includes("'array-contains'") &&
            !CONTAR_SOURCE.includes('startAfter') &&
            !CONTAR_SOURCE.includes('.orderBy(') &&
            !CONTAR_SOURCE.includes('siguienteCursor')
    );

    const indexes = (
        JSON.parse(INDEXES_SOURCE) as {
            indexes: Array<{
                collectionGroup: string;
                fields: Array<{ fieldPath: string; arrayConfig?: string }>;
            }>;
        }
    ).indexes;
    const indicesAlternativas = indexes.filter(
        (index) =>
            index.collectionGroup === 'inventario_repuestos' &&
            index.fields.some(
                (field) =>
                    field.fieldPath === 'referencias_alternativas' &&
                    field.arrayConfig === 'CONTAINS'
            )
    );

    check(
        'firestore.indexes.json declara los 4 índices de alternativas con CONTAINS',
        indicesAlternativas.length === 4 &&
            indicesAlternativas.every(
                (index) =>
                    index.fields[index.fields.length - 2]?.fieldPath ===
                        'referencia' &&
                    index.fields[index.fields.length - 1]?.fieldPath ===
                        '__name__'
            )
    );

    check(
        'buscarCandidatosRepuesto acota la búsqueda sin scan ilimitado',
        BUSCAR_SOURCE.includes(".where('referencia', '==', consulta)") &&
            BUSCAR_SOURCE.includes(".where('referencia', '>='") &&
            BUSCAR_SOURCE.includes(".where('referencia', '<='") &&
            BUSCAR_SOURCE.includes('array-contains') &&
            BUSCAR_SOURCE.includes('.limit(limite)') &&
            BUSCAR_SOURCE.includes('LIMITE_VENTANA_ETIQUETAS') &&
            BUSCAR_SOURCE.includes('rankearCandidatos')
    );

    check(
        'editarRepuesto usa requireActorInventario y requirePermiso update',
        EDITAR_SOURCE.includes('requireActorInventario') &&
            EDITAR_SOURCE.includes("'inventario_repuestos'") &&
            EDITAR_SOURCE.includes("'update'")
    );

    check(
        'editarRepuesto exige rol admin o superadmin',
        EDITAR_SOURCE.includes("permiso.rol !== 'admin'") &&
            EDITAR_SOURCE.includes("permiso.rol !== 'superadmin'")
    );

    check(
        'editarRepuesto crea el ledger solo con tx.create',
        EDITAR_SOURCE.includes('tx.create(ledgerRef') &&
            !EDITAR_SOURCE.includes('tx.set(') &&
            !EDITAR_SOURCE.includes('tx.delete(') &&
            !EDITAR_SOURCE.includes('tx.update(ledgerRef')
    );

    check(
        'crearRepuesto usa Faraday y permiso create',
        CREAR_SOURCE.startsWith("'use server';") &&
            CREAR_SOURCE.includes('validarActor(actor)') &&
            CREAR_SOURCE.includes('requireActorInventario(a.idToken)') &&
            CREAR_SOURCE.includes('requirePermiso(') &&
            CREAR_SOURCE.includes("'inventario_repuestos'") &&
            CREAR_SOURCE.includes("'create'")
    );

    check(
        'crearRepuesto exige rol admin o superadmin',
        CREAR_SOURCE.includes("permiso.rol !== 'admin'") &&
            CREAR_SOURCE.includes("permiso.rol !== 'superadmin'")
    );

    check(
        'crearRepuesto usa auto-ID, alternativas y transacción atómica',
        CREAR_SOURCE.includes('.doc()') &&
            CREAR_SOURCE.includes('referencias_alternativas') &&
            CREAR_SOURCE.includes('runTransaction') &&
            CREAR_SOURCE.includes('tx.create(repuestoRef, payload)') &&
            CREAR_SOURCE.includes('tx.create(ledgerRef')
    );

    check(
        'crearRepuesto no usa .add()',
        !CREAR_SOURCE.includes('.add(')
    );

    check(
        'crearRepuesto escribe ledger CREATE canónico',
        CREAR_SOURCE.includes("operacion: 'CREATE'") &&
            CREAR_SOURCE.includes('datos_anteriores: null') &&
            CREAR_SOURCE.includes('registrado_por: me.uid')
    );

    check(
        'crearRepuesto usa campos canónicos y no alias',
        CREAR_SOURCE.includes('creado_por: me.email') &&
            CREAR_SOURCE.includes('creado_en: ahora') &&
            !CREAR_SOURCE.includes('creado_por_uid') &&
            !CREAR_SOURCE.includes('creado_por_email') &&
            !CREAR_SOURCE.includes('fecha_creacion') &&
            !CREAR_SOURCE.includes('accion:')
    );

    check(
        'crearRepuesto normaliza imagen ausente a cadena vacía',
        CREAR_SOURCE.includes("imagen_url: data.imagen_url ?? ''")
    );

    check(
        'acciones nuevas no usan estado_conteo',
        !EDITAR_SOURCE.includes('estado_conteo') &&
            !LISTAR_SOURCE.includes('estado_conteo') &&
            !CREAR_SOURCE.includes('estado_conteo')
    );

    check(
        'cliente no accede directamente a Firestore',
        !CLIENT_SOURCE.includes('firebase/firestore') &&
            !CLIENT_SOURCE.includes('.collection(') &&
            !CLIENT_SOURCE.includes('getDocs(') &&
            !CLIENT_SOURCE.includes('onSnapshot(') &&
            !MODAL_SOURCE.includes('firebase/firestore')
    );

    check(
        'botón Nuevo Repuesto condicionado por permiso create',
        CLIENT_SOURCE.includes(
            "puedeAccion('inventario_repuestos', 'create')"
        ) &&
            CLIENT_SOURCE.includes('Nuevo Repuesto') &&
            CLIENT_SOURCE.includes('CrearRepuestoModal')
    );

    check(
        'modal usa Server Action, alternativas y recarga la lista',
        MODAL_SOURCE.includes('crearRepuesto') &&
            MODAL_SOURCE.includes('crearRepuestoSchema') &&
            MODAL_SOURCE.includes('referencias_alternativas') &&
            MODAL_SOURCE.includes('+ Agregar referencia') &&
            MODAL_SOURCE.includes('Precio de compra') &&
            !MODAL_SOURCE.includes('listarSedes') &&
            MODAL_SOURCE.includes('await onCreado()') &&
            MODAL_SOURCE.includes('onClose()')
    );

    check(
        'modal atribuye errores por campo e índice y muestra el formato',
        MODAL_SOURCE.includes('Referencia alternativa #') &&
            MODAL_SOURCE.includes('Referencia maestra') &&
            MODAL_SOURCE.includes('mensajesDeValidacion') &&
            MODAL_SOURCE.includes('A-Z, 0-9, ., _, -') &&
            !MODAL_SOURCE.includes('actual.trim().toUpperCase()') &&
            !MODAL_SOURCE.includes('item.trim().toUpperCase()')
    );

    check(
        'página permite create, update o delete',
        PAGE_SOURCE.includes("puedeAccion('inventario_repuestos', 'create')") &&
            PAGE_SOURCE.includes("puedeAccion('inventario_repuestos', 'update')") &&
            PAGE_SOURCE.includes("puedeAccion('inventario_repuestos', 'delete')") &&
            PAGE_SOURCE.includes('!puedeCrear && !puedeEditar && !puedeEliminar')
    );

    check(
        'eliminarRepuesto usa Faraday Cage y permiso delete',
        ELIMINAR_SOURCE.startsWith("'use server';") &&
            ELIMINAR_SOURCE.includes('validarActor(actor)') &&
            ELIMINAR_SOURCE.includes('requireActorInventario(a.idToken)') &&
            ELIMINAR_SOURCE.includes('requirePermiso(') &&
            ELIMINAR_SOURCE.includes("'inventario_repuestos'") &&
            ELIMINAR_SOURCE.includes("'delete'") &&
            ELIMINAR_SOURCE.includes("permiso.rol !== 'admin'") &&
            ELIMINAR_SOURCE.includes("permiso.rol !== 'superadmin'")
    );

    check(
        'eliminarRepuesto aplica guardia FK por inventario_documento_id',
        ELIMINAR_SOURCE.includes('conteos_pendientes_repuestos') &&
            ELIMINAR_SOURCE.includes("where('inventario_documento_id'") &&
            ELIMINAR_SOURCE.includes('.limit(1)') &&
            ELIMINAR_SOURCE.includes('RepuestoConConteosError') &&
            ELIMINAR_SOURCE.includes('codigo: \'FK_CONTEOS\'')
    );

    check(
        'eliminarRepuesto es atómico y escribe ledger DELETE append-only',
        ELIMINAR_SOURCE.includes('runTransaction') &&
            ELIMINAR_SOURCE.includes('tx.create(ledgerRef') &&
            ELIMINAR_SOURCE.includes('tx.delete(repuestoRef)') &&
            ELIMINAR_SOURCE.includes("operacion: 'DELETE'") &&
            ELIMINAR_SOURCE.includes('datos_nuevos: null') &&
            ELIMINAR_SOURCE.includes('campos_modificados: []') &&
            !ELIMINAR_SOURCE.includes('tx.set(') &&
            !ELIMINAR_SOURCE.includes('.add(')
    );

    check(
        'eliminarRepuesto es idempotente si el documento no existe',
        ELIMINAR_SOURCE.includes('if (!snap.exists)') &&
            ELIMINAR_SOURCE.includes('idempotente: true')
    );

    check(
        'UI de borrado tiene gating, confirmación y mensaje FK',
        CLIENT_SOURCE.includes(
            "puedeAccion('inventario_repuestos', 'delete')"
        ) &&
            CLIENT_SOURCE.includes('EliminarRepuestoModal') &&
            CLIENT_SOURCE.includes('setRepuestoAEliminar') &&
            ELIMINAR_MODAL_SOURCE.includes('eliminarRepuesto') &&
            ELIMINAR_MODAL_SOURCE.includes('conteos pendientes') &&
            ELIMINAR_MODAL_SOURCE.includes('role="alert"') &&
            ELIMINAR_MODAL_SOURCE.includes('Eliminar definitivamente') &&
            ELIMINAR_MODAL_SOURCE.includes('no se puede deshacer')
    );

    check(
        'tipo de auditoría incluye DELETE y resultado admite FK_CONTEOS',
        INVENTARIO_TYPES_SOURCE.includes(
            "operacion: 'CREATE' | 'UPDATE' | 'DELETE'"
        ) &&
            INVENTARIO_TYPES_SOURCE.includes("'FK_CONTEOS'")
    );

    check(
        'script de matriz viva es dry-run por defecto y usa merge puro',
        PERMISOS_MERGE_SOURCE.includes('let aplicar = false;') &&
            PERMISOS_MERGE_SOURCE.includes("clave === 'apply'") &&
            PERMISOS_MERGE_SOURCE.includes('if (!aplicar)') &&
            PERMISOS_MERGE_SOURCE.includes('mergeDeleteInventario') &&
            PERMISOS_MERGE_SOURCE.includes('sys_permissions_matrix')
    );

    check(
        'cliente usa documento_id, edita alternativas y muestra sede_nombre',
        CLIENT_SOURCE.includes('documento_id') &&
            CLIENT_SOURCE.includes('referencias_alternativas') &&
            CLIENT_SOURCE.includes('Alternativas:') &&
            CLIENT_SOURCE.includes('actualizarAlternativas') &&
            CLIENT_SOURCE.includes('+ Alternativa') &&
            CLIENT_SOURCE.includes('sede_nombre') &&
            !CLIENT_SOURCE.includes('Sede: {repuesto.sede_id')
    );

    check(
        'estado de error incluye botón Reintentar',
        CLIENT_SOURCE.includes('Reintentar') &&
            CLIENT_SOURCE.includes('cargarRepuestos')
    );

    const columnas = [
        'Referencia',
        'Descripción',
        'Categoría',
        'Unidad',
        'Fabricante',
        'Stock',
        'Stock mínimo',
        'Ubicación',
        'Precio',
    ];
    check(
        'tabla expone exactamente las nueve columnas requeridas',
        (CLIENT_SOURCE.match(/scope="col"/g) ?? []).length === 9 &&
            columnas.every((columna) => CLIENT_SOURCE.includes(columna))
    );
    check(
        'cliente edita unidad_medida con dominio unidad|litro',
        CLIENT_SOURCE.includes('unidad_medida') &&
            CLIENT_SOURCE.includes('UNIDADES_MEDIDA') &&
            CLIENT_SOURCE.includes('actualizarUnidadMedida')
    );
    check(
        'acciones persisten unidad_medida y el ledger la incluye',
        CREAR_SOURCE.includes('unidad_medida') &&
            EDITAR_SOURCE.includes('unidad_medida') &&
            LISTAR_SOURCE.includes('unidad_medida')
    );
    check(
        'modal de alta permite elegir unidad de medida',
        MODAL_SOURCE.includes('unidad_medida') &&
            MODAL_SOURCE.includes('UNIDADES_MEDIDA') &&
            MODAL_SOURCE.includes('Unidad de medida')
    );

    check(
        'sidebar incluye Inventario > Repuestos',
        SIDEBAR_SOURCE.includes('>Inventario<') &&
            SIDEBAR_SOURCE.includes('Repuestos') &&
            SIDEBAR_SOURCE.includes('href="/admin/inventario-repuestos"')
    );

    check(
        'DTO declara documento_id, alternativas y alineación con InventarioRepuesto',
        TYPES_SOURCE.includes('InventarioRepuesto') &&
            TYPES_SOURCE.includes('Omit<') &&
            TYPES_SOURCE.includes('documento_id') &&
            TYPES_SOURCE.includes('referencias_alternativas') &&
            TYPES_SOURCE.includes('sede_nombre') &&
            TYPES_SOURCE.includes('creado_en') &&
            TYPES_SOURCE.includes('actualizado_en')
    );
}

run()
    .then(() => {
        if (failures > 0) {
            console.error(`\n${failures} test(s) FAILED`);
            process.exit(1);
        }
        console.log('\ninventario-repuestos.test.ts: ALL PASSED');
    })
    .catch((error) => {
        console.error('[inventario-repuestos.test] Falló la suite:', error);
        process.exit(1);
    });
