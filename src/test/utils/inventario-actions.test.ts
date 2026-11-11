/**
 * Tests WEB-038 — pre-auth de Server Actions de inventario.
 *
 * No toca Firebase: todos los casos fallan antes de verifyIdToken o antes
 * de cualquier lectura/escritura.
 * Ejecutar con: npx tsx src/test/utils/inventario-actions.test.ts
 */
import { readFileSync } from 'node:fs';
import { crearConteoPendiente } from '@/app/admin/inventory/actions/crearConteoPendiente';
import { aprobarConteo } from '@/app/admin/inventory/actions/aprobarConteo';
import { rechazarConteo } from '@/app/admin/inventory/actions/rechazarConteo';
import { listarPendientes } from '@/app/admin/inventory/actions/listarPendientes';
import {
    datosNuevosAprobacion,
    reconciliarDatosNuevosLegado,
} from '@/lib/actions/inventario-ledger';
import {
    aprobarConteoSchema,
    rechazarConteoSchema,
} from '@/lib/actions/inventario-schemas';

const APROBAR_SOURCE = readFileSync(
    'src/app/admin/inventory/actions/aprobarConteo.ts',
    'utf8'
);
const RECHAZAR_SOURCE = readFileSync(
    'src/app/admin/inventory/actions/rechazarConteo.ts',
    'utf8'
);
const CREAR_SOURCE = readFileSync(
    'src/app/admin/inventory/actions/crearConteoPendiente.ts',
    'utf8'
);
const APROBAR_MODAL_SOURCE = readFileSync(
    'src/components/inventario/AprobarConteoModal.tsx',
    'utf8'
);
const FORM_ASESOR_SOURCE = readFileSync(
    'src/app/admin/inventario-asesor/ConteoAsesorForm.tsx',
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
    check(
        'aprobarConteo no escribe estado_conteo en el ledger',
        !APROBAR_SOURCE.includes('estado_conteo')
    );
    check(
        'rechazarConteo usa la clave canonica estado y no estado_conteo',
        RECHAZAR_SOURCE.includes("estado: 'rechazado'") &&
            !RECHAZAR_SOURCE.includes('estado_conteo')
    );
    check(
        'aprobarConteo escribe revisado_por con UID verificado',
        APROBAR_SOURCE.includes('revisado_por: me.uid') &&
            !APROBAR_SOURCE.includes('revisado_por: me.email')
    );
    check(
        'rechazarConteo escribe revisado_por UID en conteo y ledger',
        (RECHAZAR_SOURCE.match(/revisado_por:\s*me\.uid/g) || []).length >=
            2 && !RECHAZAR_SOURCE.includes('revisado_por: me.email')
    );
    check(
        'ambas acciones conservan registrado_por UID y email en ledger',
        APROBAR_SOURCE.includes('registrado_por: me.uid') &&
            APROBAR_SOURCE.includes('registrado_por_email: me.email') &&
            RECHAZAR_SOURCE.includes('registrado_por: me.uid') &&
            RECHAZAR_SOURCE.includes('registrado_por_email: me.email')
    );
    const aprobarForjado = aprobarConteoSchema.safeParse({
        conteo_id: UUID,
        revisado_por: 'atacante',
        registrado_por: 'atacante',
    });
    check(
        'aprobarConteo ignora revisado_por/registrado_por del cliente',
        aprobarForjado.success &&
            !('revisado_por' in aprobarForjado.data) &&
            !('registrado_por' in aprobarForjado.data)
    );
    const rechazarForjado = rechazarConteoSchema.safeParse({
        conteo_id: UUID,
        motivo_rechazo: 'Foto borrosa',
        revisado_por: 'atacante',
        registrado_por: 'atacante',
    });
    check(
        'rechazarConteo ignora revisado_por/registrado_por del cliente',
        rechazarForjado.success &&
            !('revisado_por' in rechazarForjado.data) &&
            !('registrado_por' in rechazarForjado.data)
    );
    check(
        'crearConteoPendiente verifica existencia en la transacción',
        CREAR_SOURCE.includes('tx.get(repuestoRef)') &&
            CREAR_SOURCE.includes('La referencia seleccionada no existe')
    );
    check(
        'aprobarConteo y rechazarConteo usan Transaction tipado',
        APROBAR_SOURCE.includes('tx: Transaction') &&
            RECHAZAR_SOURCE.includes('tx: Transaction') &&
            !APROBAR_SOURCE.includes('tx: any') &&
            !RECHAZAR_SOURCE.includes('tx: any')
    );
    check(
        'el tipado no alteró el ledger append-only',
        APROBAR_SOURCE.includes('tx.create(ledgerRef') &&
            RECHAZAR_SOURCE.includes('tx.create(ledgerRef')
    );
    check(
        'AprobarConteoModal no usa getDoc cliente',
        !APROBAR_MODAL_SOURCE.includes('firebase/firestore') &&
            !APROBAR_MODAL_SOURCE.includes('getDoc(') &&
            APROBAR_MODAL_SOURCE.includes('obtenerRepuestoPorReferencia')
    );
    check(
        'formulario asesor no tiene inputs libres de referencia',
        !FORM_ASESOR_SOURCE.includes('referencia-confirmada') &&
            !FORM_ASESOR_SOURCE.includes('referencia-sugerida') &&
            FORM_ASESOR_SOURCE.includes('SelectorReferenciaRepuesto')
    );
    check(
        'formulario asesor acota el análisis con timeout y libera el submit',
        FORM_ASESOR_SOURCE.includes('conTimeout(') &&
            FORM_ASESOR_SOURCE.includes('TIMEOUT_ANALISIS_MS') &&
            FORM_ASESOR_SOURCE.includes('instanceof TimeoutError') &&
            FORM_ASESOR_SOURCE.includes('setAnalizando(false)')
    );

    const datosAprobacion = datosNuevosAprobacion(
        { stock: 7, ubicacion: 'A-01-05' },
        UUID
    );
    const clavesEstadoAprobacion = Object.keys(datosAprobacion).filter(
        (clave) => clave === 'estado' || clave === 'estado_conteo'
    );
    check(
        'datosNuevosAprobacion produce solo la clave estado',
        clavesEstadoAprobacion.length === 1 &&
            clavesEstadoAprobacion[0] === 'estado' &&
            datosAprobacion.estado === 'aprobado'
    );
    check(
        'datosNuevosAprobacion conserva inventario y conteo_id',
        datosAprobacion.stock === 7 &&
            datosAprobacion.ubicacion === 'A-01-05' &&
            datosAprobacion.conteo_id === UUID
    );

    const correccionCreate = reconciliarDatosNuevosLegado({
        referencia: 'TEST-WEB038-001',
        conteo_id: UUID,
        estado_conteo: 'aprobado',
    });
    check(
        'reconciliacion CREATE corrige estado_conteo a estado',
        correccionCreate !== null &&
            correccionCreate.estado === 'aprobado' &&
            !('estado_conteo' in correccionCreate) &&
            correccionCreate.referencia === 'TEST-WEB038-001'
    );

    const correccionUpdate = reconciliarDatosNuevosLegado({
        stock: 7,
        conteo_id: UUID,
        estado_conteo: 'aprobado',
    });
    check(
        'reconciliacion UPDATE conserva stock y usa estado',
        correccionUpdate !== null &&
            correccionUpdate.stock === 7 &&
            correccionUpdate.estado === 'aprobado' &&
            !('estado_conteo' in correccionUpdate)
    );

    check(
        'reconciliacion de rechazo ya canonico devuelve null',
        reconciliarDatosNuevosLegado({
            estado: 'rechazado',
            motivo_rechazo: 'Conteo con daño en embalaje',
        }) === null
    );

    let ambiguedadDetectada = false;
    try {
        reconciliarDatosNuevosLegado({
            estado: 'aprobado',
            estado_conteo: 'aprobado',
        });
    } catch (error) {
        if (
            !(error instanceof Error) ||
            !error.message.includes('ambiguo')
        ) {
            console.error(
                '[inventario-actions.test] error inesperado en ambiguedad:',
                error
            );
        }
        ambiguedadDetectada =
            error instanceof Error && error.message.includes('ambiguo');
    }
    check('reconciliacion detecta ambas claves como ambiguas', ambiguedadDetectada);

    let estadoInvalidoDetectado = false;
    try {
        reconciliarDatosNuevosLegado({
            estado_conteo: 'aprobado_por_error',
        });
    } catch (error) {
        if (
            !(error instanceof Error) ||
            !error.message.includes('inválido')
        ) {
            console.error(
                '[inventario-actions.test] error inesperado en estado inválido:',
                error
            );
        }
        estadoInvalidoDetectado =
            error instanceof Error && error.message.includes('inválido');
    }
    check('reconciliacion rechaza estado_conteo invalido', estadoInvalidoDetectado);

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
