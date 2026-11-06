/**
 * Tests WEB-038 — inventario de repuestos.
 *
 * No toca Firebase: los casos de Server Actions fallan antes de
 * requireActorInventario.
 * Ejecutar con: npx tsx src/test/utils/inventario-repuestos.test.ts
 */
import { readFileSync } from 'node:fs';
import { editarRepuesto } from '@/app/admin/inventario-repuestos/actions/editarRepuesto';
import { listarRepuestos } from '@/app/admin/inventario-repuestos/actions/listarRepuestos';
import { editarRepuestoSchema } from '@/lib/actions/inventario-repuestos-schemas';
import {
    construirCambiosRepuesto,
    filtrarRepuestos,
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
const CLIENT_SOURCE = readFileSync(
    'src/app/admin/inventario-repuestos/InventarioRepuestosClient.tsx',
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
    referencia: 'BRK-001',
    descripcion: 'Disco de freno delantero',
    fabricante: 'Honda',
    aplica_a: ['Honda CB 190'],
    categoria: 'Frenos',
    precio: 125000,
    ubicacion: 'A-01-05',
    stock: 8,
    stock_minimo: 3,
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
    ubicacion: BASE.ubicacion,
};

const VALIDO = editarRepuestoSchema.safeParse({
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
        VALIDO.data.cambios.ubicacion === 'B-02-06' &&
        VALIDO.data.cambios.descripcion === 'Disco de freno trasero'
);

check(
    'schema rechaza stock negativo',
    !editarRepuestoSchema.safeParse({
        referencia: 'BRK-001',
        cambios: { stock: -1 },
    }).success
);

check(
    'schema rechaza stock decimal',
    !editarRepuestoSchema.safeParse({
        referencia: 'BRK-001',
        cambios: { stock: 1.5 },
    }).success
);

check(
    'schema rechaza precio negativo',
    !editarRepuestoSchema.safeParse({
        referencia: 'BRK-001',
        cambios: { precio: -0.01 },
    }).success
);

check(
    'schema rechaza ubicación inválida',
    !editarRepuestoSchema.safeParse({
        referencia: 'BRK-001',
        cambios: { ubicacion: 'AA-1-2' },
    }).success
);

check(
    'schema rechaza descripción vacía',
    !editarRepuestoSchema.safeParse({
        referencia: 'BRK-001',
        cambios: { descripcion: '   ' },
    }).success
);

check(
    'schema rechaza campos desconocidos',
    !editarRepuestoSchema.safeParse({
        referencia: 'BRK-001',
        cambios: { stock: 1, categoria: 'Frenos' },
    }).success
);

check(
    'schema rechaza cambios vacíos',
    !editarRepuestoSchema.safeParse({
        referencia: 'BRK-001',
        cambios: {},
    }).success
);

const OTRO: RepuestoInventarioDTO = {
    ...BASE,
    referencia: 'ACE-002',
    descripcion: 'Aceite 20W-50',
    fabricante: 'Motul',
    categoria: 'Lubricantes',
    precio: 45000,
    stock: 20,
};

check(
    'filtrarRepuestos busca por referencia parcial',
    filtrarRepuestos([BASE, OTRO], {
        referencia: 'brk',
        categoria: '',
        fabricante: '',
    }).length === 1
);

check(
    'filtrarRepuestos combina categoría y fabricante',
    filtrarRepuestos([BASE, OTRO], {
        referencia: '',
        categoria: 'Lubricantes',
        fabricante: 'Motul',
    }).length === 1 &&
        filtrarRepuestos([BASE, OTRO], {
            referencia: '',
            categoria: 'Lubricantes',
            fabricante: 'Honda',
        }).length === 0
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
        'listarRepuestos no usa limit ni orderBy',
        !LISTAR_SOURCE.includes('.limit(') &&
            !LISTAR_SOURCE.includes('.orderBy(')
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
        'acciones nuevas no usan estado_conteo',
        !EDITAR_SOURCE.includes('estado_conteo') &&
            !LISTAR_SOURCE.includes('estado_conteo')
    );

    check(
        'cliente no accede directamente a Firestore',
        !CLIENT_SOURCE.includes('firebase/firestore') &&
            !CLIENT_SOURCE.includes('.collection(') &&
            !CLIENT_SOURCE.includes('getDocs(') &&
            !CLIENT_SOURCE.includes('onSnapshot(')
    );

    check(
        'página exige admin/superadmin',
        PAGE_SOURCE.includes("role === 'admin'") &&
            PAGE_SOURCE.includes("role === 'superadmin'")
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
        'Fabricante',
        'Stock',
        'Stock mínimo',
        'Ubicación',
        'Precio',
    ];
    check(
        'tabla expone exactamente las ocho columnas requeridas',
        (CLIENT_SOURCE.match(/scope="col"/g) ?? []).length === 8 &&
            columnas.every((columna) => CLIENT_SOURCE.includes(columna))
    );

    check(
        'sidebar incluye Inventario > Repuestos',
        SIDEBAR_SOURCE.includes('>Inventario<') &&
            SIDEBAR_SOURCE.includes('Repuestos') &&
            SIDEBAR_SOURCE.includes('href="/admin/inventario-repuestos"')
    );

    check(
        'DTO declara alineación 1:1 con InventarioRepuesto',
        TYPES_SOURCE.includes('InventarioRepuesto') &&
            TYPES_SOURCE.includes('Omit<') &&
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
