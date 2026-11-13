/**
 * Tests WEB-038 — Punto 3: Vision puro y pre-auth de la Server Action.
 * Ejecutar con: npx tsx src/test/utils/vision.test.ts
 */
import { readFileSync } from 'node:fs';
import { analizarImagenRepuesto } from '@/app/admin/inventory/actions/analizarImagenRepuesto';
import { analizarImagenSchema } from '@/lib/actions/inventario-schemas';
import {
    categoriaDesdeEtiqueta,
    categoriaSugerida,
    combinarEtiquetas,
    esMimeVisionPermitido,
    esTamanoImagenPermitido,
    normalizarMimeVision,
    sanitizarEtiquetasVision,
    sanitizarObjetosVision,
    VISION_MAX_BYTES,
    VISION_OBJECT_MAX_RESULTS,
} from '@/lib/actions/vision-mapping';

let failures = 0;
function check(name: string, cond: boolean) {
    if (cond) {
        console.log(`ok - ${name}`);
    } else {
        failures++;
        console.error(`FAIL - ${name}`);
    }
}

const FOTO_URL =
    'https://firebasestorage.googleapis.com/v0/b/tiendalasmotos.appspot.com/o/inventario_repuestos%2Fasesor%40test.com%2Ffoto.jpg?alt=media&token=abc';

// --- sanitización de etiquetas ---
const labels = [
    { description: 'Brake', score: 0.91 },
    { description: 'brake', score: 0.70 },
    { description: 'Tire', score: 0.6 },
    { description: 'Low score', score: 0.59 },
    { description: '   ', score: 0.99 },
    { description: 'A'.repeat(100), score: 0.8 },
    { description: 'bad\u0000label', score: 0.75 },
];

const sugerencias = sanitizarEtiquetasVision(labels);
check('score mínimo 0.60 incluido', sugerencias.some((s) => s.etiqueta === 'Tire' && s.score === 0.6));
check('score < 0.60 excluido', !sugerencias.some((s) => s.etiqueta === 'Low score'));
check('etiqueta vacía excluida', sugerencias.every((s) => s.etiqueta.trim().length > 0));
check('dedupe case-insensitive', sugerencias.filter((s) => s.etiqueta.toLowerCase() === 'brake').length === 1);
const brake = sugerencias.find((s) => s.etiqueta.toLowerCase() === 'brake');
check('dedupe conserva mayor score', brake !== undefined && brake.score === 0.91);
check('orden descendente por score', sugerencias.every((s, i) => i === 0 || sugerencias[i - 1].score >= s.score));
check('máximo 80 caracteres por etiqueta', sugerencias.every((s) => s.etiqueta.length <= 80));
check('caracteres de control saneados', sugerencias.some((s) => s.etiqueta === 'bad label'));
check('labels no-array devuelve vacío', sanitizarEtiquetasVision(null).length === 0);

const muchas = Array.from({ length: 15 }, (_, i) => ({
    description: `etiqueta-${i}`,
    score: 0.9,
}));
check('máximo 10 etiquetas', sanitizarEtiquetasVision(muchas).length === 10);

// --- object localization / unidades ---
const objetos = [
    { name: 'Tire', score: 0.92 },
    { name: 'tire', score: 0.88 },
    { name: 'Tire', score: 0.81 },
    { name: 'Wheel', score: 0.77 },
    { name: 'Low object', score: 0.59 },
    { name: '   ', score: 0.99 },
];
const unidades = sanitizarObjetosVision(objetos);
check(
    'object localization agrupa y cuenta instancias',
    unidades.find((unidad) => unidad.etiqueta.toLowerCase() === 'tire')
        ?.cantidad === 3
);
check(
    'object localization conserva score máximo',
    unidades.find((unidad) => unidad.etiqueta.toLowerCase() === 'tire')
        ?.score === 0.92
);
check(
    'object localization descarta score bajo',
    !unidades.some((unidad) => unidad.etiqueta === 'Low object')
);
check('object localization no-array devuelve vacío', sanitizarObjetosVision(null).length === 0);
check(
    'combinarEtiquetas deduplica labels/objetos',
    combinarEtiquetas(['Tire', 'Brake'], ['tire', 'Wheel']).length === 3
);
check(
    'límite de resultados de object localization definido',
    VISION_OBJECT_MAX_RESULTS > 0
);

// --- mapeo de categorías ---
check('Tire mapea a LLANTAS', categoriaDesdeEtiqueta('Tire') === 'LLANTAS');
check('vehicle brake mapea a FRENOS', categoriaDesdeEtiqueta('vehicle brake') === 'FRENOS');
check('etiqueta desconocida no mapea', categoriaDesdeEtiqueta('unknown-part') === null);
check('categoría sugerida usa orden de etiquetas', categoriaSugerida(['unknown', 'brake']) === 'FRENOS');
check('categoría sugerida vacía devuelve null', categoriaSugerida(['unknown']) === null);

// --- MIME y tamaño ---
check('normaliza MIME con charset', normalizarMimeVision('image/jpeg; charset=utf-8') === 'image/jpeg');
check('MIME png permitido', esMimeVisionPermitido('image/png'));
check('MIME webp permitido', esMimeVisionPermitido('image/webp'));
check('MIME gif rechazado', !esMimeVisionPermitido('image/gif'));
check('MIME ausente rechazado', !esMimeVisionPermitido(null));
check('tamaño cero rechazado', !esTamanoImagenPermitido(0));
check('tamaño 1 byte permitido', esTamanoImagenPermitido(1));
check('tamaño máximo permitido', esTamanoImagenPermitido(VISION_MAX_BYTES));
check('tamaño sobre máximo rechazado', !esTamanoImagenPermitido(VISION_MAX_BYTES + 1));

// --- schema de entrada ---
check('foto_url Firebase válida', analizarImagenSchema.safeParse({ foto_url: FOTO_URL }).success);
check('foto_url host ajeno rechazada', !analizarImagenSchema.safeParse({
    foto_url: 'https://example.com/v0/b/x/o/inventario_repuestos%2Fasesor%40test.com%2Ffoto.jpg',
}).success);
check('foto_url ausente rechazada', !analizarImagenSchema.safeParse({}).success);
check('foto_url no-URL rechazada', !analizarImagenSchema.safeParse({ foto_url: 'no-es-url' }).success);

// --- Action: rechazo pre-auth / pre-Firebase ---
async function run() {
    const sinActor = await analizarImagenRepuesto({ foto_url: FOTO_URL }, {});
    check('analizarImagenRepuesto rechaza actor inválido', sinActor.success === false);

    const inputInvalido = await analizarImagenRepuesto(
        {},
        { uid: 'x', idToken: 'x' }
    );
    check('analizarImagenRepuesto rechaza input inválido antes de Firebase', inputInvalido.success === false);

    const hostAjeno = await analizarImagenRepuesto(
        { foto_url: 'https://example.com/foto.jpg' },
        { uid: 'x', idToken: 'x' }
    );
    check('analizarImagenRepuesto rechaza host ajeno antes de Firebase', hostAjeno.success === false);

    // --- Garantía estática: la acción no escribe Firestore ---
    const source = readFileSync(
        'src/app/admin/inventory/actions/analizarImagenRepuesto.ts',
        'utf8'
    );
    check("acción declara 'use server'", source.startsWith("'use server';"));
    check('acción no importa getDb', !source.includes('getDb'));
    check('acción no usa .collection(', !source.includes('.collection('));
    check('acción no usa runTransaction', !source.includes('runTransaction'));
    check('acción no usa setDoc/updateDoc/addDoc/deleteDoc', !/(setDoc|updateDoc|addDoc|deleteDoc)/.test(source));
    check('acción no usa tx.', !/\btx\s*\./.test(source));
    check('acción solicita OBJECT_LOCALIZATION', source.includes("type: 'OBJECT_LOCALIZATION'"));
    check(
        'acción parsea localizedObjectAnnotations',
        source.includes('localizedObjectAnnotations')
    );

    // --- Storage rules referenciadas ---
    const firebaseConfig = JSON.parse(readFileSync('firebase.json', 'utf8')) as {
        storage?: { rules?: string };
    };
    const storageConfig = firebaseConfig.storage
        ? firebaseConfig.storage.rules
        : undefined;
    check('firebase.json referencia storage.rules', storageConfig === 'storage.rules');

    const storageRules = readFileSync('storage.rules', 'utf8');
    check('storage.rules protege el prefijo del asesor', storageRules.includes('match /inventario_repuestos/{asesorEmail}/{archivo}'));
    check('storage.rules limita escritura a 5 MB', storageRules.includes('5 * 1024 * 1024'));
}

run()
    .then(() => {
        if (failures > 0) {
            console.error(`\n${failures} test(s) FAILED`);
            process.exit(1);
        }
        console.log('\nvision.test.ts: ALL PASSED');
    })
    .catch((error) => {
        console.error('[vision.test] Falló la suite:', error);
        process.exit(1);
    });
