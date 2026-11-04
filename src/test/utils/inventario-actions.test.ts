/**
 * Tests WEB-038 — pre-auth de Server Actions de inventario.
 *
 * No toca Firebase: todos los casos fallan antes de verifyIdToken o antes
 * de cualquier lectura/escritura.
 * Ejecutar con: npx tsx src/test/utils/inventario-actions.test.ts
 */
import { crearConteoPendiente } from '@/app/admin/inventory/actions/crearConteoPendiente';
import { aprobarConteo } from '@/app/admin/inventory/actions/aprobarConteo';
import { rechazarConteo } from '@/app/admin/inventory/actions/rechazarConteo';
import { listarPendientes } from '@/app/admin/inventory/actions/listarPendientes';

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
const BASE = {
    conteo_id: UUID,
    referencia_sugerida: 'disco de freno',
    referencia_confirmada: 'BRK-001',
    descripcion: 'Disco de freno delantero',
    cantidad_contada: 4,
    ubicacion: 'A-01-05',
    anotaciones: '',
    foto_url: FOTO_URL,
    storage_path: 'inventario_repuestos/asesor@test.com/foto.jpg',
    nombre_archivo: 'foto.jpg',
    mime_type: 'image/jpeg',
    tamano_bytes: 1024,
    etiquetas_vision: [],
};

async function run() {
    const crearSinActor = await crearConteoPendiente(BASE, {});
    check('crearConteoPendiente rechaza actor inválido', crearSinActor.success === false);

    const crearInputInvalido = await crearConteoPendiente({}, { uid: 'x', idToken: 'x' });
    check('crearConteoPendiente rechaza input inválido antes de Firebase', crearInputInvalido.success === false);

    const aprobarSinActor = await aprobarConteo({ conteo_id: UUID }, {});
    check('aprobarConteo rechaza actor inválido', aprobarSinActor.success === false);

    const aprobarInputInvalido = await aprobarConteo({}, { uid: 'x', idToken: 'x' });
    check('aprobarConteo rechaza input inválido antes de Firebase', aprobarInputInvalido.success === false);

    const rechazarSinActor = await rechazarConteo({ conteo_id: UUID, motivo_rechazo: 'Foto borrosa' }, {});
    check('rechazarConteo rechaza actor inválido', rechazarSinActor.success === false);

    const rechazarInputInvalido = await rechazarConteo({}, { uid: 'x', idToken: 'x' });
    check('rechazarConteo rechaza input inválido antes de Firebase', rechazarInputInvalido.success === false);

    const listarSinActor = await listarPendientes({}, {});
    check('listarPendientes rechaza actor inválido', listarSinActor.success === false);
    check('listarPendientes devuelve array vacío en error', Array.isArray(listarSinActor.pendientes) && listarSinActor.pendientes.length === 0);
}

run()
    .then(() => {
        if (failures > 0) {
            console.error(`\n${failures} test(s) FAILED`);
            process.exit(1);
        }
        console.log('\ninventario-actions.test.ts: ALL PASSED');
    })
    .catch((error) => {
        console.error('[inventario-actions.test] Falló la suite:', error);
        process.exit(1);
    });
