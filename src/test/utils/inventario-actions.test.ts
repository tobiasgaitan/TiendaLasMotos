/**
 * Tests WEB-038 — pre-auth de Server Actions de inventario.
 *
 * No toca Firebase: todos los casos fallan antes de verifyIdToken o antes
 * de cualquier lectura/escritura.
 * Ejecutar con: npx tsx src/test/utils/inventario-actions.test.ts
 */
import { readFileSync } from 'node:fs';
import { crearConteoPendiente } from '@/app/admin/inventario-asesor/actions/crearConteoPendiente';
import { aprobarConteo } from '@/app/admin/inventario-aprobaciones/actions/aprobarConteo';
import { rechazarConteo } from '@/app/admin/inventario-aprobaciones/actions/rechazarConteo';
import { listarPendientes } from '@/app/admin/inventario-aprobaciones/actions/listarPendientes';
import {
    datosNuevosAprobacion,
    reconciliarDatosNuevosLegado,
} from '@/lib/actions/inventario-ledger';
import {
    aprobarConteoSchema,
    rechazarConteoSchema,
} from '@/lib/actions/inventario-schemas';

const APROBAR_SOURCE = readFileSync(
    'src/app/admin/inventario-aprobaciones/actions/aprobarConteo.ts',
    'utf8'
);
const RECHAZAR_SOURCE = readFileSync(
    'src/app/admin/inventario-aprobaciones/actions/rechazarConteo.ts',
    'utf8'
);
const CREAR_SOURCE = readFileSync(
    'src/app/admin/inventario-asesor/actions/crearConteoPendiente.ts',
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
const APROBACIONES_SOURCE = readFileSync(
    'src/app/admin/inventario-aprobaciones/AprobacionesClient.tsx',
    'utf8'
);
const LISTAR_PENDIENTES_SOURCE = readFileSync(
    'src/app/admin/inventario-aprobaciones/actions/listarPendientes.ts',
    'utf8'
);
const INVENTARIO_SOURCE = readFileSync(
    'src/app/admin/inventario-repuestos/InventarioRepuestosClient.tsx',
    'utf8'
);
const SUGERENCIAS_SOURCE = readFileSync(
    'src/components/inventario/SugerenciasVision.tsx',
    'utf8'
);
const MULTIMODAL_ACTION_SOURCE = readFileSync(
    'src/app/admin/inventario-asesor/actions/analizarImagenConVision.ts',
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
        'crearConteoPendiente resuelve inventario_documento_id en la transacción',
        CREAR_SOURCE.includes('inventario_documento_id') &&
            CREAR_SOURCE.includes('tx.get(repuestoRef)') &&
            CREAR_SOURCE.includes('La referencia no coincide')
    );
    check(
        'acciones de conteos revalidan Aprobaciones, no Motos',
        !CREAR_SOURCE.includes("revalidatePath('/admin/inventory')") &&
            !APROBAR_SOURCE.includes("revalidatePath('/admin/inventory')") &&
            !RECHAZAR_SOURCE.includes("revalidatePath('/admin/inventory')") &&
            CREAR_SOURCE.includes(
                "revalidatePath('/admin/inventario-aprobaciones')"
            ) &&
            APROBAR_SOURCE.includes(
                "revalidatePath('/admin/inventario-aprobaciones')"
            ) &&
            RECHAZAR_SOURCE.includes(
                "revalidatePath('/admin/inventario-aprobaciones')"
            )
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
            FORM_ASESOR_SOURCE.includes("name === 'TimeoutError'") &&
            !FORM_ASESOR_SOURCE.includes('instanceof TimeoutError') &&
            FORM_ASESOR_SOURCE.includes('setAnalizando(false)')
    );
    check(
        'formulario asesor integra sede, documento y autocompletado',
        FORM_ASESOR_SOURCE.includes('listarSedes') &&
            FORM_ASESOR_SOURCE.includes('inventario_documento_id') &&
            FORM_ASESOR_SOURCE.includes('sede_id') &&
            FORM_ASESOR_SOURCE.includes('readOnly') &&
            FORM_ASESOR_SOURCE.includes('fabricante') &&
            FORM_ASESOR_SOURCE.includes('categoria') &&
            FORM_ASESOR_SOURCE.includes('aplicaA')
    );
    const bloqueConteo = CREAR_SOURCE.slice(
        CREAR_SOURCE.indexOf('tx.create(conteoRef'),
        CREAR_SOURCE.indexOf('tx.create(fotoRef')
    );
    const bloqueFoto = CREAR_SOURCE.slice(
        CREAR_SOURCE.indexOf('tx.create(fotoRef'),
        CREAR_SOURCE.indexOf('return { idempotente: false }')
    );
    check(
        'aditivos multimodales se escriben solo en fotos_inventario',
        bloqueConteo.length > 0 &&
            bloqueFoto.length > 0 &&
            bloqueFoto.includes('cantidad_sugerida_multimodal') &&
            bloqueFoto.includes('justificacion_multimodal') &&
            bloqueFoto.includes('confidence_multimodal') &&
            !bloqueConteo.includes('cantidad_sugerida_multimodal') &&
            !bloqueConteo.includes('justificacion_multimodal') &&
            !bloqueConteo.includes('confidence_multimodal')
    );
    check(
        'formulario asesor integra el análisis multimodal paralelo',
        FORM_ASESOR_SOURCE.includes('analizarImagenConVision') &&
            FORM_ASESOR_SOURCE.includes('Promise.allSettled') &&
            FORM_ASESOR_SOURCE.includes('ejecutarAnalisisMultimodal') &&
            FORM_ASESOR_SOURCE.includes('cantidad_sugerida_multimodal') &&
            FORM_ASESOR_SOURCE.includes('onUsarCantidadMultimodal') &&
            FORM_ASESOR_SOURCE.includes('setCantidadOrigen')
    );
    check(
        'formulario asesor integra matching visual on-demand sin autoselección',
        FORM_ASESOR_SOURCE.includes('verificarMatchingVisual') &&
            FORM_ASESOR_SOURCE.includes('onCandidatos') &&
            FORM_ASESOR_SOURCE.includes('ejecutarVerificacionMatching') &&
            FORM_ASESOR_SOURCE.includes('matchingVisual') &&
            FORM_ASESOR_SOURCE.includes('SugerenciasVision')
    );
    check(
        'SugerenciasVision muestra matching visual sin bloquear el conteo',
        SUGERENCIAS_SOURCE.includes('Coincidencia visual (IA)') &&
            SUGERENCIAS_SOURCE.includes('Verificar coincidencia visual') &&
            SUGERENCIAS_SOURCE.includes('Sugerencia no vinculante') &&
            SUGERENCIAS_SOURCE.includes('Confianza baja')
    );
    check(
        'UI multimodal muestra estimación, botón explícito y alertas',
        (() => {
            const texto = SUGERENCIAS_SOURCE.replace(/\s+/g, ' ');
            return (
                texto.includes('Conteo multimodal (IA)') &&
                texto.includes('Usar cantidad sugerida') &&
                texto.includes('No reemplaza tu conteo') &&
                texto.includes('Es una estimación') &&
                texto.includes(
                    'El autocompletado está deshabilitado; cuenta manualmente.'
                ) &&
                texto.includes('La imagen está saturada') &&
                SUGERENCIAS_SOURCE.includes('role="alert"') &&
                SUGERENCIAS_SOURCE.includes('aria-live="polite"')
            );
        })()
    );
    check(
        'acción multimodal es stateless y usa Faraday Cage',
        MULTIMODAL_ACTION_SOURCE.startsWith("'use server';") &&
            MULTIMODAL_ACTION_SOURCE.includes('validarActor(actor)') &&
            MULTIMODAL_ACTION_SOURCE.includes('verifyIdToken') &&
            MULTIMODAL_ACTION_SOURCE.includes('requirePermiso') &&
            MULTIMODAL_ACTION_SOURCE.includes("permiso.rol !== 'asesor'") &&
            MULTIMODAL_ACTION_SOURCE.includes('OPENROUTER_API_KEY') &&
            MULTIMODAL_ACTION_SOURCE.includes('VISION_MODEL_SLUG') &&
            MULTIMODAL_ACTION_SOURCE.includes('analizarConteoMultimodal') &&
            !MULTIMODAL_ACTION_SOURCE.includes('getDb') &&
            !MULTIMODAL_ACTION_SOURCE.includes('.collection(') &&
            !MULTIMODAL_ACTION_SOURCE.includes('runTransaction') &&
            !/(setDoc|updateDoc|addDoc|deleteDoc)/.test(
                MULTIMODAL_ACTION_SOURCE
            ) &&
            !/\btx\s*\./.test(MULTIMODAL_ACTION_SOURCE)
    );
    check(
        'listarPendientes enriquece sede_nombre con fallbacks',
        LISTAR_PENDIENTES_SOURCE.includes('sede_nombre') &&
            LISTAR_PENDIENTES_SOURCE.includes(
                'configuracion/general/sedes'
            ) &&
            LISTAR_PENDIENTES_SOURCE.includes('Sin sede') &&
            LISTAR_PENDIENTES_SOURCE.includes('Sede no disponible') &&
            LISTAR_PENDIENTES_SOURCE.includes(
                'Sede no resuelta en pendiente'
            )
    );
    check(
        'aprobaciones muestra sede, copy correcto y enlace al catálogo',
        APROBACIONES_SOURCE.includes('sede_nombre') &&
            APROBACIONES_SOURCE.includes('arqueo independiente') &&
            APROBACIONES_SOURCE.includes('Ver catálogo') &&
            APROBACIONES_SOURCE.includes('#doc-') &&
            APROBACIONES_SOURCE.includes('Sin vínculo')
    );
    check(
        'catálogo expone anchor y scroll al documento',
        INVENTARIO_SOURCE.includes('id={`doc-${repuesto.documento_id}`}') &&
            INVENTARIO_SOURCE.includes('scrollIntoView')
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
