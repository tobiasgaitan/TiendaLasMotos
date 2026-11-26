/**
 * Tests WEB-INV-044 — cliente puro de conteo multimodal y pre-auth de la
 * Server Action. No toca Firebase ni OpenRouter real.
 * Ejecutar con: npx tsx src/test/utils/vision-multimodal.test.ts
 */
import { readFileSync } from 'node:fs';
import { analizarImagenConVision } from '@/app/admin/inventario-asesor/actions/analizarImagenConVision';
import {
    analizarConteoMultimodal,
    construirPayloadVisionMultimodal,
    extraerJsonVisionMultimodal,
    extraerTextoVisionMultimodal,
    normalizarConteoMultimodal,
    OPENROUTER_ENDPOINT,
    VISION_MULTIMODAL_CONFIANZA_MINIMA,
    VISION_MULTIMODAL_MAX_TOKENS,
} from '@/lib/vision-client';

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

function respuestaOpenRouter(contenido: unknown, finishReason = 'stop') {
    return new Response(
        JSON.stringify({
            choices: [
                {
                    message: { content: contenido },
                    finish_reason: finishReason,
                },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
        {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }
    );
}

function fetchMock(
    handler: (url: string, init: RequestInit) => Response | Promise<Response>
): typeof fetch {
    return (async (
        input: string | URL | Request,
        init?: RequestInit
    ): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();
        return handler(url, init ?? {});
    }) as typeof fetch;
}

async function run() {
    // --- payload ---
    const payload = construirPayloadVisionMultimodal(
        'google/gemini-flash-1.5',
        'QUJD',
        'image/jpeg'
    );
    const mensajes = payload.messages as Array<Record<string, unknown>>;
    const usuario = mensajes[1] as {
        content: Array<Record<string, unknown>>;
    };
    const imagen = usuario.content[1] as {
        image_url: { url: string };
    };
    check(
        'payload usa el modelo configurado',
        payload.model === 'google/gemini-flash-1.5'
    );
    check(
        'payload envía system prompt y temperatura 0',
        mensajes[0].role === 'system' &&
            typeof mensajes[0].content === 'string' &&
            payload.temperature === 0
    );
    check(
        'payload limita max_tokens',
        payload.max_tokens === VISION_MULTIMODAL_MAX_TOKENS
    );
    check(
        'payload envía imagen como data URI',
        imagen.image_url.url === 'data:image/jpeg;base64,QUJD'
    );
    const provider = payload.provider as Record<string, unknown>;
    check(
        'payload prohíbe recolección de datos',
        provider.data_collection === 'deny' &&
            provider.allow_fallbacks === true
    );

    // --- extracción de texto ---
    check(
        'extrae contenido string',
        extraerTextoVisionMultimodal({
            choices: [{ message: { content: '{"a":1}' } }],
        }) === '{"a":1}'
    );
    check(
        'extrae contenido por partes',
        extraerTextoVisionMultimodal({
            choices: [
                {
                    message: {
                        content: [
                            { type: 'text', text: 'parte 1' },
                            { type: 'text', text: 'parte 2' },
                        ],
                    },
                },
            ],
        }) === 'parte 1\nparte 2'
    );
    check(
        'descarta respuesta truncada por length',
        extraerTextoVisionMultimodal({
            choices: [
                {
                    message: { content: '{"a":1}' },
                    finish_reason: 'length',
                },
            ],
        }) === null
    );
    check(
        'descarta error del proveedor',
        extraerTextoVisionMultimodal({
            error: { message: 'boom' },
            choices: [],
        }) === null
    );

    // --- extracción de JSON ---
    check(
        'extrae JSON plano',
        (() => {
            const json = extraerJsonVisionMultimodal('{"x":1}') as {
                x: number;
            };
            return json !== null && json.x === 1;
        })()
    );
    check(
        'extrae JSON con fences markdown',
        (() => {
            const json = extraerJsonVisionMultimodal(
                '```json\n{"x":2}\n```'
            ) as { x: number };
            return json !== null && json.x === 2;
        })()
    );
    check(
        'extrae JSON con texto alrededor',
        (() => {
            const json = extraerJsonVisionMultimodal(
                'Resultado:\n{"x":3}\nFin.'
            ) as { x: number };
            return json !== null && json.x === 3;
        })()
    );
    check(
        'JSON inválido devuelve null',
        extraerJsonVisionMultimodal('no hay json') === null
    );

    // --- normalización ---
    const normal = normalizarConteoMultimodal({
        puede_contar: true,
        cantidad_sugerida: 7,
        justificacion: 'Siete unidades visibles.',
        confidence: 0.82,
        saturada: false,
        motivo_no_conteo: null,
    });
    check(
        'normaliza conteo confiable',
        normal !== null &&
            normal.puede_contar === true &&
            normal.cantidad_sugerida_multimodal === 7 &&
            normal.confidence_multimodal === 0.82 &&
            normal.motivo_no_conteo === null &&
            normal.saturada === false
    );

    const cero = normalizarConteoMultimodal({
        puede_contar: true,
        cantidad_sugerida: 0,
        justificacion: 'No se observan unidades.',
        confidence: 0,
        saturada: false,
    });
    check(
        'normaliza cantidad 0 y confidence 0',
        cero !== null &&
            cero.cantidad_sugerida_multimodal === 0 &&
            cero.confidence_multimodal === 0
    );

    const confianzaPorcentaje = normalizarConteoMultimodal({
        puede_contar: true,
        cantidad_sugerida: '6',
        justificacion: 'Seis unidades.',
        confidence: 82,
        saturada: false,
    });
    check(
        'normaliza confidence porcentual y cantidad string',
        confianzaPorcentaje !== null &&
            confianzaPorcentaje.confidence_multimodal === 0.82 &&
            confianzaPorcentaje.cantidad_sugerida_multimodal === 6
    );

    const bajaConfianza = normalizarConteoMultimodal({
        puede_contar: true,
        cantidad_sugerida: 5,
        justificacion: 'Podrían ser cinco.',
        confidence: VISION_MULTIMODAL_CONFIANZA_MINIMA - 0.01,
        saturada: false,
    });
    check(
        'baja confianza deshabilita autocompletado y conserva cantidad',
        bajaConfianza !== null &&
            bajaConfianza.puede_contar === false &&
            bajaConfianza.motivo_no_conteo === 'confianza_baja' &&
            bajaConfianza.cantidad_sugerida_multimodal === 5
    );

    const saturada = normalizarConteoMultimodal({
        puede_contar: true,
        cantidad_sugerida: 9,
        justificacion: 'Imagen sobreexpuesta.',
        confidence: 0.9,
        saturada: true,
        motivo_no_conteo: 'imagen_saturada',
    });
    check(
        'saturación fuerza cantidad null y deshabilita',
        saturada !== null &&
            saturada.puede_contar === false &&
            saturada.saturada === true &&
            saturada.cantidad_sugerida_multimodal === null &&
            saturada.motivo_no_conteo === 'imagen_saturada'
    );

    const saturadaTexto = normalizarConteoMultimodal({
        puede_contar: 'true',
        cantidad_sugerida: '9',
        justificacion: 'Imagen sobreexpuesta.',
        confidence: '90',
        saturada: 'true',
        motivo_no_conteo: 'imagen_saturada',
    });
    check(
        'saturación textual también deshabilita el autocompletado',
        saturadaTexto !== null &&
            saturadaTexto.saturada === true &&
            saturadaTexto.cantidad_sugerida_multimodal === null &&
            saturadaTexto.puede_contar === false
    );

    const modeloNiega = normalizarConteoMultimodal({
        puede_contar: false,
        cantidad_sugerida: null,
        justificacion: 'Unidades superpuestas.',
        confidence: 0.4,
        saturada: false,
        motivo_no_conteo: 'unidades_superpuestas',
    });
    check(
        'modelo que niega conteo queda deshabilitado',
        modeloNiega !== null &&
            modeloNiega.puede_contar === false &&
            modeloNiega.motivo_no_conteo === 'confianza_baja'
    );

    const sinConfianza = normalizarConteoMultimodal({
        puede_contar: true,
        cantidad_sugerida: 3,
        justificacion: 'Tres unidades.',
        confidence: null,
        saturada: false,
    });
    check(
        'confidence ausente deshabilita autocompletado',
        sinConfianza !== null &&
            sinConfianza.puede_contar === false &&
            sinConfianza.confidence_multimodal === null
    );

    const justificacionLarga = normalizarConteoMultimodal({
        puede_contar: true,
        cantidad_sugerida: 1,
        justificacion: `a${'b'.repeat(600)}`,
        confidence: 0.9,
        saturada: false,
    });
    check(
        'justificación se limita a 500 caracteres',
        justificacionLarga !== null &&
            justificacionLarga.justificacion_multimodal !== null &&
            justificacionLarga.justificacion_multimodal.length === 500
    );

    const sinJustificacion = normalizarConteoMultimodal({
        puede_contar: false,
        cantidad_sugerida: null,
        justificacion: '',
        confidence: 0.9,
        saturada: true,
    });
    check(
        'justificación vacía usa fallback del motivo',
        sinJustificacion !== null &&
            typeof sinJustificacion.justificacion_multimodal === 'string' &&
            sinJustificacion.justificacion_multimodal.length > 0
    );

    check(
        'salida no-objeto devuelve null',
        normalizarConteoMultimodal('texto') === null &&
            normalizarConteoMultimodal([1, 2, 3]) === null
    );

    // --- cliente con fetch inyectado ---
    let urlLlamada = '';
    let initLlamada: RequestInit = {};
    const exito = await analizarConteoMultimodal({
        apiKey: 'sk-test',
        modelo: 'google/gemini-flash-1.5',
        base64: 'QUJD',
        mimeType: 'image/jpeg',
        fetchImpl: fetchMock((url, init) => {
            urlLlamada = url;
            initLlamada = init;
            return respuestaOpenRouter(
                JSON.stringify({
                    puede_contar: true,
                    cantidad_sugerida: 8,
                    justificacion: 'Ocho unidades visibles.',
                    confidence: 0.77,
                    saturada: false,
                    motivo_no_conteo: null,
                })
            );
        }),
    });
    check(
        'cliente llama al endpoint de OpenRouter',
        urlLlamada === OPENROUTER_ENDPOINT
    );
    const headers = initLlamada.headers as Record<string, string>;
    check(
        'cliente envía Authorization y título',
        headers.Authorization === 'Bearer sk-test' &&
            headers['X-Title'] === 'Tienda Las Motos'
    );
    const bodyEnviado = JSON.parse(String(initLlamada.body)) as {
        model: string;
        messages: unknown[];
    };
    check(
        'cliente envía modelo y mensajes',
        bodyEnviado.model === 'google/gemini-flash-1.5' &&
            Array.isArray(bodyEnviado.messages)
    );
    check(
        'cliente devuelve conteo normalizado',
        exito.success === true &&
            exito.conteo.cantidad_sugerida_multimodal === 8 &&
            exito.conteo.puede_contar === true
    );

    const sinApiKey = await analizarConteoMultimodal({
        apiKey: '   ',
        modelo: 'google/gemini-flash-1.5',
        base64: 'QUJD',
        mimeType: 'image/jpeg',
    });
    check('cliente rechaza API key vacía', sinApiKey.success === false);

    const modeloInvalido = await analizarConteoMultimodal({
        apiKey: 'sk-test',
        modelo: 'modelo con espacios',
        base64: 'QUJD',
        mimeType: 'image/jpeg',
    });
    check('cliente rechaza modelo inválido', modeloInvalido.success === false);

    const mimeInvalido = await analizarConteoMultimodal({
        apiKey: 'sk-test',
        modelo: 'google/gemini-flash-1.5',
        base64: 'QUJD',
        mimeType: 'image/gif',
    });
    check('cliente rechaza MIME inválido', mimeInvalido.success === false);

    const rateLimit = await analizarConteoMultimodal({
        apiKey: 'sk-test',
        modelo: 'google/gemini-flash-1.5',
        base64: 'QUJD',
        mimeType: 'image/jpeg',
        fetchImpl: fetchMock(
            () =>
                new Response('rate limited', {
                    status: 429,
                })
        ),
    });
    check(
        'cliente maneja 429 como fallo no bloqueante',
        rateLimit.success === false &&
            rateLimit.message.toLowerCase().includes('ocupado')
    );

    const truncado = await analizarConteoMultimodal({
        apiKey: 'sk-test',
        modelo: 'google/gemini-flash-1.5',
        base64: 'QUJD',
        mimeType: 'image/jpeg',
        fetchImpl: fetchMock(() =>
            respuestaOpenRouter('{"puede_contar":true}', 'length')
        ),
    });
    check('cliente rechaza respuesta truncada', truncado.success === false);

    const jsonInvalido = await analizarConteoMultimodal({
        apiKey: 'sk-test',
        modelo: 'google/gemini-flash-1.5',
        base64: 'QUJD',
        mimeType: 'image/jpeg',
        fetchImpl: fetchMock(() => respuestaOpenRouter('no-json')),
    });
    check('cliente rechaza contenido sin JSON', jsonInvalido.success === false);

    const fetchFalla = await analizarConteoMultimodal({
        apiKey: 'sk-test',
        modelo: 'google/gemini-flash-1.5',
        base64: 'QUJD',
        mimeType: 'image/jpeg',
        fetchImpl: fetchMock(() => {
            throw new Error('network down');
        }),
    });
    check('cliente maneja fallo de red', fetchFalla.success === false);

    // --- Action: rechazo pre-auth / pre-Firebase ---
    const sinActor = await analizarImagenConVision({ foto_url: FOTO_URL }, {});
    check(
        'analizarImagenConVision rechaza actor inválido',
        sinActor.success === false
    );

    const inputInvalido = await analizarImagenConVision(
        {},
        { uid: 'x', idToken: 'x' }
    );
    check(
        'analizarImagenConVision rechaza input inválido antes de Firebase',
        inputInvalido.success === false
    );

    const hostAjeno = await analizarImagenConVision(
        { foto_url: 'https://example.com/foto.jpg' },
        { uid: 'x', idToken: 'x' }
    );
    check(
        'analizarImagenConVision rechaza host ajeno antes de Firebase',
        hostAjeno.success === false
    );

    // --- garantías estáticas ---
    const accion = readFileSync(
        'src/app/admin/inventario-asesor/actions/analizarImagenConVision.ts',
        'utf8'
    );
    const cliente = readFileSync('src/lib/vision-client.ts', 'utf8');
    check('acción declara use server', accion.startsWith("'use server';"));
    check(
        'acción verifica el ID token y exige permiso',
        accion.includes('verifyIdToken') &&
            accion.includes('requirePermiso') &&
            accion.includes("permiso.rol !== 'asesor'")
    );
    check('acción no importa getDb', !accion.includes('getDb'));
    check('acción no usa .collection(', !accion.includes('.collection('));
    check('acción no usa runTransaction', !accion.includes('runTransaction'));
    check(
        'acción no usa escrituras Firestore',
        !/(setDoc|updateDoc|addDoc|deleteDoc)/.test(accion)
    );
    check('acción no usa tx.', !/\btx\s*\./.test(accion));
    check(
        'acción descarga la foto desde Firebase Storage',
        accion.includes('fetch(data.foto_url') &&
            accion.includes('extraerStoragePath') &&
            accion.includes('esStoragePathDeAsesor')
    );
    check(
        'cliente no lee variables de entorno ni escribe Firestore',
        !cliente.includes('process.env') &&
            !cliente.includes('getDb') &&
            !cliente.includes('.collection(') &&
            !cliente.includes('runTransaction')
    );
    check(
        'no existe clave pública de OpenRouter',
        !accion.includes('NEXT_PUBLIC_OPENROUTER_API_KEY') &&
            !cliente.includes('NEXT_PUBLIC_OPENROUTER_API_KEY')
    );

    // --- manifiesto de validación de 27 fotos ---
    const manifiesto = JSON.parse(
        readFileSync(
            'scripts/fixtures/vision-multimodal/manifest.json',
            'utf8'
        )
    ) as Array<Record<string, unknown>>;
    check(
        'manifiesto multimodal tiene exactamente 27 casos',
        Array.isArray(manifiesto) && manifiesto.length === 27
    );
    const edgeCases = new Set(
        manifiesto.map((caso) => String(caso.edge_case))
    );
    check(
        'manifiesto cubre iluminación, ángulos y superposición',
        edgeCases.has('iluminacion_baja') &&
            edgeCases.has('angulo_oblicuo') &&
            edgeCases.has('unidades_superpuestas')
    );
    check(
        'manifiesto tiene IDs y archivos únicos',
        new Set(manifiesto.map((caso) => String(caso.id))).size ===
            manifiesto.length &&
            new Set(manifiesto.map((caso) => String(caso.archivo))).size ===
                manifiesto.length
    );
    check(
        'manifiesto coherencia no_contable/esperado',
        manifiesto.every((caso) =>
            caso.no_contable === true
                ? caso.esperado === null
                : typeof caso.esperado === 'number'
        )
    );
    check(
        'fotos y reporte de validación están ignorados por git',
        readFileSync('.gitignore', 'utf8').includes(
            'scripts/fixtures/vision-multimodal/fotos/'
        ) &&
            readFileSync('.gitignore', 'utf8').includes(
                'scripts/fixtures/vision-multimodal/reporte.md'
            )
    );
}

run()
    .then(() => {
        if (failures > 0) {
            console.error(`\n${failures} test(s) FAILED`);
            process.exit(1);
        }
        console.log('\nvision-multimodal.test.ts: ALL PASSED');
    })
    .catch((error) => {
        console.error('[vision-multimodal.test] Falló la suite:', error);
        process.exit(1);
    });
