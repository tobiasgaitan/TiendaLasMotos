/**
 * Tests WEB-038 — schemas y validaciones puras de inventario de repuestos.
 * Ejecutar con: npx tsx src/test/utils/inventario-schemas.test.ts
 */
import {
    aprobarConteoSchema,
    crearConteoSchema,
    datosMaestroSchema,
    esEstadoConteo,
    esFotoUrlDeAsesor,
    esStoragePathDeAsesor,
    extraerStoragePath,
    listarPendientesSchema,
    rechazarConteoSchema,
} from '@/lib/actions/inventario-schemas';

let failures = 0;
function check(name: string, cond: boolean) {
    if (cond) {
        console.log(`ok - ${name}`);
    } else {
        failures++;
        console.error(`FAIL - ${name}`);
    }
}

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const FOTO_URL =
    'https://firebasestorage.googleapis.com/v0/b/tiendalasmotos.appspot.com/o/inventario_repuestos%2Fasesor%40test.com%2Ffoto.jpg?alt=media&token=abc';
const STORAGE_PATH = 'inventario_repuestos/asesor@test.com/foto.jpg';

const BASE = {
    conteo_id: UUID,
    inventario_documento_id: 'BRK-001',
    sede_id: 'sede-1',
    referencia_sugerida: 'disco de freno',
    referencia_confirmada: 'brk-001',
    descripcion: 'Disco de freno delantero',
    cantidad_contada: 4,
    ubicacion: 'a-01-05',
    anotaciones: 'Estante A',
    foto_url: FOTO_URL,
    storage_path: STORAGE_PATH,
    nombre_archivo: 'foto.jpg',
    mime_type: 'image/jpeg' as const,
    tamano_bytes: 1024,
    etiquetas_vision: ['brake'],
};

// --- crearConteoSchema ---
const crearOk = crearConteoSchema.safeParse(BASE);
check('crear conteo válido', crearOk.success);
if (crearOk.success) {
    check('referencia normalizada a mayúsculas', crearOk.data.referencia_confirmada === 'BRK-001');
    check('ubicación conservada tras trim', crearOk.data.ubicacion === 'a-01-05');
    check('etiquetas vision conservadas', crearOk.data.etiquetas_vision.length === 1);
    check(
        'multimodal omitido se normaliza a null',
        crearOk.data.cantidad_sugerida_multimodal === null &&
            crearOk.data.justificacion_multimodal === null &&
            crearOk.data.confidence_multimodal === null
    );
}

const multimodalOk = crearConteoSchema.safeParse({
    ...BASE,
    cantidad_sugerida_multimodal: 0,
    justificacion_multimodal: '  Sin unidades visibles.  ',
    confidence_multimodal: 0,
});
check('multimodal acepta 0 y justificación', multimodalOk.success);
if (multimodalOk.success) {
    check(
        'multimodal conserva cantidad 0',
        multimodalOk.data.cantidad_sugerida_multimodal === 0
    );
    check(
        'multimodal conserva confidence 0',
        multimodalOk.data.confidence_multimodal === 0
    );
    check(
        'justificación multimodal se recorta',
        multimodalOk.data.justificacion_multimodal === 'Sin unidades visibles.'
    );
    check(
        'multimodal no altera cantidad_contada',
        multimodalOk.data.cantidad_contada === 4
    );
}

const multimodalNull = crearConteoSchema.safeParse({
    ...BASE,
    cantidad_sugerida_multimodal: null,
    justificacion_multimodal: '',
    confidence_multimodal: null,
});
check('multimodal acepta null y justificación vacía', multimodalNull.success);
if (multimodalNull.success) {
    check(
        'justificación vacía se normaliza a null',
        multimodalNull.data.justificacion_multimodal === null
    );
    check(
        'null no se convierte en 0',
        multimodalNull.data.cantidad_sugerida_multimodal === null &&
            multimodalNull.data.confidence_multimodal === null
    );
}

check(
    'cantidad multimodal negativa rechazada',
    !crearConteoSchema.safeParse({
        ...BASE,
        cantidad_sugerida_multimodal: -1,
    }).success
);
check(
    'cantidad multimodal decimal rechazada',
    !crearConteoSchema.safeParse({
        ...BASE,
        cantidad_sugerida_multimodal: 1.5,
    }).success
);
check(
    'confidence multimodal > 1 rechazada',
    !crearConteoSchema.safeParse({
        ...BASE,
        confidence_multimodal: 1.01,
    }).success
);
check(
    'justificación multimodal > 500 rechazada',
    !crearConteoSchema.safeParse({
        ...BASE,
        justificacion_multimodal: 'a'.repeat(501),
    }).success
);

check('referencia con espacio rechazada', !crearConteoSchema.safeParse({ ...BASE, referencia_confirmada: 'BRK 001' }).success);
check('ubicación vacía rechazada', !crearConteoSchema.safeParse({ ...BASE, ubicacion: '' }).success);
check('cantidad negativa rechazada', !crearConteoSchema.safeParse({ ...BASE, cantidad_contada: -1 }).success);
check('mime no permitido rechazado', !crearConteoSchema.safeParse({ ...BASE, mime_type: 'image/gif' }).success);
check('foto > 5MB rechazada', !crearConteoSchema.safeParse({ ...BASE, tamano_bytes: 6 * 1024 * 1024 }).success);
check('storage_path desalineado rechazado', !crearConteoSchema.safeParse({ ...BASE, storage_path: 'inventario_repuestos/otro/foto.jpg' }).success);
check('host ajeno rechazado', !crearConteoSchema.safeParse({
    ...BASE,
    foto_url: 'https://example.com/v0/b/x/o/inventario_repuestos%2Fasesor%40test.com%2Ffoto.jpg',
}).success);

// --- helpers de Storage ---
check('extrae path de Firebase Storage', extraerStoragePath(FOTO_URL) === STORAGE_PATH);
check('path pertenece asesor', esStoragePathDeAsesor(STORAGE_PATH, 'asesor@test.com'));
check('path NO pertenece a otro asesor', !esStoragePathDeAsesor(STORAGE_PATH, 'otro@test.com'));
check('URL pertenece asesor', esFotoUrlDeAsesor(FOTO_URL, 'asesor@test.com'));
check('URL NO pertenece a otro asesor', !esFotoUrlDeAsesor(FOTO_URL, 'otro@test.com'));
check('email vacío rechazado', !esStoragePathDeAsesor(STORAGE_PATH, ''));
check('host ajeno sin path', extraerStoragePath('https://example.com/foto.jpg') === null);

// --- datos maestros y aprobación ---
const DATOS_MAESTRO = {
    fabricante: 'Genérico',
    aplica_a: ['Moto 125'],
    categoria: 'FRENOS',
    precio: 85000,
    stock_minimo: 2,
};
check('datos maestros válidos', datosMaestroSchema.safeParse(DATOS_MAESTRO).success);
check('aprobación con datos maestros', aprobarConteoSchema.safeParse({ conteo_id: UUID, datos_maestro: DATOS_MAESTRO }).success);
check('aprobación sin datos maestros (referencia existente)', aprobarConteoSchema.safeParse({ conteo_id: UUID }).success);
check('precio negativo rechazado', !aprobarConteoSchema.safeParse({
    conteo_id: UUID,
    datos_maestro: { ...DATOS_MAESTRO, precio: -1 },
}).success);
check('aplica_a vacío rechazado', !aprobarConteoSchema.safeParse({
    conteo_id: UUID,
    datos_maestro: { ...DATOS_MAESTRO, aplica_a: [] },
}).success);

// --- rechazo y listado ---
check('rechazo válido', rechazarConteoSchema.safeParse({ conteo_id: UUID, motivo_rechazo: 'Foto borrosa' }).success);
check('motivo corto rechazado', !rechazarConteoSchema.safeParse({ conteo_id: UUID, motivo_rechazo: 'x' }).success);
check('listado default pendiente_revision', listarPendientesSchema.parse({}).estado === 'pendiente_revision');
check('listado estado inválido rechazado', !listarPendientesSchema.safeParse({ estado: 'pending' }).success);
check('esEstadoConteo reconoce aprobado', esEstadoConteo('aprobado'));
check('esEstadoConteo rechaza basura', !esEstadoConteo('approved'));

if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED`);
    process.exit(1);
} else {
    console.log('\ninventario-schemas.test.ts: ALL PASSED');
}
