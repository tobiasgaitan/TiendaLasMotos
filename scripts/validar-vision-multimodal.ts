/**
 * WEB-INV-044 — Validación manual del conteo multimodal con 27 fotos reales.
 *
 * Uso:
 *   OPENROUTER_API_KEY=... VISION_MODEL_SLUG=... \
 *   npx tsx scripts/validar-vision-multimodal.ts \
 *     --manifest scripts/fixtures/vision-multimodal/manifest.json \
 *     --fotos scripts/fixtures/vision-multimodal/fotos \
 *     --out scripts/fixtures/vision-multimodal/reporte.md
 *
 * El script NO escribe en Firestore ni Storage. Solo lee fotos locales,
 * llama a OpenRouter de forma secuencial y genera un reporte Markdown.
 */

import {
    existsSync,
    mkdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
    analizarConteoMultimodal,
    type OpcionesVisionMultimodal,
} from '../src/lib/vision-client';
import { VISION_MAX_BYTES } from '../src/lib/actions/vision-mapping';

const MIN_CASOS = 27;
const CONFIANZA_MINIMA = 0.65;

interface CasoManifest {
    id: string;
    archivo: string;
    esperado: number | null;
    edge_case: string;
    no_contable: boolean;
    notas: string;
}

interface ResultadoCaso {
    id: string;
    archivo: string;
    edge_case: string;
    esperado: number | null;
    no_contable: boolean;
    sugerido: number | null;
    puede_contar: boolean;
    confidence: number | null;
    saturada: boolean;
    justificacion: string | null;
    latencia_ms: number;
    error: string | null;
}

function leerManifiesto(ruta: string): CasoManifest[] {
    const raw = JSON.parse(readFileSync(ruta, 'utf8')) as unknown;
    if (!Array.isArray(raw)) {
        throw new Error('El manifiesto debe ser un array de casos.');
    }
    return raw.map((item, indice) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`Caso ${indice + 1}: debe ser un objeto.`);
        }
        const caso = item as Record<string, unknown>;
        const id = typeof caso.id === 'string' ? caso.id.trim() : '';
        const archivo =
            typeof caso.archivo === 'string' ? caso.archivo.trim() : '';
        const edgeCase =
            typeof caso.edge_case === 'string' ? caso.edge_case.trim() : '';
        if (!id) throw new Error(`Caso ${indice + 1}: id vacío.`);
        if (!archivo) throw new Error(`Caso ${id}: archivo vacío.`);
        if (basename(archivo) !== archivo) {
            throw new Error(
                `Caso ${id}: el archivo debe ser un nombre simple, sin rutas.`
            );
        }
        if (!edgeCase) throw new Error(`Caso ${id}: edge_case vacío.`);
        if (
            caso.esperado !== null &&
            (typeof caso.esperado !== 'number' ||
                !Number.isFinite(caso.esperado) ||
                caso.esperado < 0)
        ) {
            throw new Error(`Caso ${id}: esperado inválido.`);
        }
        if (typeof caso.no_contable !== 'boolean') {
            throw new Error(`Caso ${id}: no_contable debe ser booleano.`);
        }
        return {
            id,
            archivo,
            esperado:
                caso.esperado === null ? null : Number(caso.esperado),
            edge_case: edgeCase,
            no_contable: caso.no_contable,
            notas: typeof caso.notas === 'string' ? caso.notas : '',
        };
    });
}

function validarManifiesto(casos: CasoManifest[]): void {
    if (casos.length < MIN_CASOS) {
        throw new Error(
            `El manifiesto debe tener al menos ${MIN_CASOS} casos; tiene ${casos.length}.`
        );
    }
    const ids = new Set<string>();
    const archivos = new Set<string>();
    for (const caso of casos) {
        if (ids.has(caso.id)) {
            throw new Error(`ID duplicado en el manifiesto: ${caso.id}.`);
        }
        ids.add(caso.id);
        if (archivos.has(caso.archivo)) {
            throw new Error(
                `Archivo duplicado en el manifiesto: ${caso.archivo}.`
            );
        }
        archivos.add(caso.archivo);
        if (caso.no_contable && caso.esperado !== null) {
            throw new Error(
                `Caso ${caso.id}: no_contable=true requiere esperado=null.`
            );
        }
        if (!caso.no_contable && caso.esperado === null) {
            throw new Error(
                `Caso ${caso.id}: un caso contable requiere esperado numérico.`
            );
        }
    }

    const edgeCases = new Set(casos.map((caso) => caso.edge_case));
    for (const requerido of [
        'iluminacion_baja',
        'angulo_oblicuo',
        'unidades_superpuestas',
    ]) {
        if (!edgeCases.has(requerido)) {
            throw new Error(
                `El manifiesto debe cubrir el edge case: ${requerido}.`
            );
        }
    }
}

function mimeDesdeArchivo(archivo: string): string | null {
    const extension = extname(archivo).toLowerCase();
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
    if (extension === '.png') return 'image/png';
    if (extension === '.webp') return 'image/webp';
    return null;
}

function mediana(valores: number[]): number {
    if (valores.length === 0) return 0;
    const ordenados = [...valores].sort((a, b) => a - b);
    const medio = Math.floor(ordenados.length / 2);
    if (ordenados.length % 2 === 1) return ordenados[medio];
    return (ordenados[medio - 1] + ordenados[medio]) / 2;
}

function percentil(valores: number[], p: number): number {
    if (valores.length === 0) return 0;
    const ordenados = [...valores].sort((a, b) => a - b);
    const indice = Math.min(
        ordenados.length - 1,
        Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1)
    );
    return ordenados[indice];
}

function formatearNumero(value: number | null, decimales = 2): string {
    if (value === null || !Number.isFinite(value)) return '—';
    return value.toFixed(decimales);
}

function escaparCelda(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * Carga `.env.local` para ejecuciones locales sin dependencias extra.
 * Las variables ya presentes en el entorno tienen prioridad.
 */
function cargarEnvLocal(ruta = '.env.local'): void {
    if (!existsSync(ruta)) return;
    const contenido = readFileSync(ruta, 'utf8');
    for (const linea of contenido.split(/\r?\n/)) {
        const limpia = linea.trim();
        if (!limpia || limpia.startsWith('#')) continue;
        const sinExport = limpia.startsWith('export ')
            ? limpia.slice('export '.length).trim()
            : limpia;
        const indice = sinExport.indexOf('=');
        if (indice <= 0) continue;
        const clave = sinExport.slice(0, indice).trim();
        if (!clave || process.env[clave] !== undefined) continue;
        let valor = sinExport.slice(indice + 1).trim();
        if (
            (valor.startsWith('"') && valor.endsWith('"')) ||
            (valor.startsWith("'") && valor.endsWith("'"))
        ) {
            valor = valor.slice(1, -1);
        }
        process.env[clave] = valor;
    }
}

async function ejecutarCaso(
    caso: CasoManifest,
    carpetaFotos: string,
    opciones: OpcionesVisionMultimodal
): Promise<ResultadoCaso> {
    const ruta = join(carpetaFotos, caso.archivo);
    const base: ResultadoCaso = {
        id: caso.id,
        archivo: caso.archivo,
        edge_case: caso.edge_case,
        esperado: caso.esperado,
        no_contable: caso.no_contable,
        sugerido: null,
        puede_contar: false,
        confidence: null,
        saturada: false,
        justificacion: null,
        latencia_ms: 0,
        error: null,
    };

    if (!existsSync(ruta)) {
        return { ...base, error: 'Archivo no encontrado.' };
    }

    const stat = statSync(ruta);
    if (stat.size <= 0 || stat.size > VISION_MAX_BYTES) {
        return {
            ...base,
            error: `Tamaño inválido: ${stat.size} bytes (máx ${VISION_MAX_BYTES}).`,
        };
    }

    const mimeType = mimeDesdeArchivo(caso.archivo);
    if (!mimeType) {
        return { ...base, error: 'Extensión no permitida (JPG, PNG, WEBP).' };
    }

    const base64 = readFileSync(ruta).toString('base64');
    const inicio = performance.now();
    const resultado = await analizarConteoMultimodal({
        ...opciones,
        base64,
        mimeType,
    });
    const latencia = performance.now() - inicio;

    if (!resultado.success) {
        return { ...base, latencia_ms: latencia, error: resultado.message };
    }

    return {
        ...base,
        sugerido: resultado.conteo.cantidad_sugerida_multimodal,
        puede_contar: resultado.conteo.puede_contar,
        confidence: resultado.conteo.confidence_multimodal,
        saturada: resultado.conteo.saturada,
        justificacion: resultado.conteo.justificacion_multimodal,
        latencia_ms: latencia,
    };
}

function generarReporte(
    casos: ResultadoCaso[],
    modelo: string
): { markdown: string; fallos: string[] } {
    const errores = casos.filter((caso) => caso.error !== null);
    const conResultado = casos.filter((caso) => caso.error === null);
    const contables = conResultado.filter(
        (caso) => caso.esperado !== null
    );
    const conSugerencia = contables.filter(
        (caso) => caso.sugerido !== null
    );
    const exactos = contables.filter(
        (caso) =>
            caso.sugerido !== null && caso.sugerido === caso.esperado
    ).length;
    const dentroDeUno = contables.filter(
        (caso) =>
            caso.sugerido !== null &&
            caso.esperado !== null &&
            Math.abs(caso.sugerido - caso.esperado) <= 1
    ).length;
    const mae =
        conSugerencia.length === 0
            ? null
            : conSugerencia.reduce(
                  (suma, caso) =>
                      suma +
                      Math.abs(
                          (caso.sugerido as number) -
                              (caso.esperado as number)
                      ),
                  0
              ) / conSugerencia.length;
    const noContables = casos.filter((caso) => caso.no_contable);
    const autocompletadosInseguros = noContables.filter(
        (caso) => caso.puede_contar
    );
    const casosSaturados = casos.filter(
        (caso) => caso.edge_case === 'imagen_saturada'
    );
    const saturacionDetectada = casosSaturados.filter(
        (caso) => caso.saturada
    ).length;
    const latencias = conResultado.map((caso) => caso.latencia_ms);
    const medianaMs = mediana(latencias);
    const p95Ms = percentil(latencias, 95);

    const fallos: string[] = [];
    if (casos.length < MIN_CASOS) {
        fallos.push(`Menos de ${MIN_CASOS} casos procesados.`);
    }
    if (errores.length > 0) {
        fallos.push(`${errores.length} caso(s) con error.`);
    }
    if (autocompletadosInseguros.length > 0) {
        fallos.push(
            `${autocompletadosInseguros.length} autocompletado(s) inseguro(s).`
        );
    }
    if (contables.length === 0) {
        fallos.push('No hay casos contables evaluados.');
    } else {
        if (dentroDeUno / contables.length < 0.8) {
            fallos.push('Menos de 80% de aciertos dentro de ±1.');
        }
        if (exactos / contables.length < 0.6) {
            fallos.push('Menos de 60% de aciertos exactos.');
        }
    }
    if (medianaMs > 10_000) {
        fallos.push('Latencia mediana superior a 10 s.');
    }
    if (p95Ms > 25_000) {
        fallos.push('Latencia p95 superior a 25 s.');
    }

    const filas = casos
        .map((caso) => {
            const estado = caso.error
                ? `ERROR: ${escaparCelda(caso.error)}`
                : caso.puede_contar
                  ? 'Autocompletable'
                  : caso.saturada
                    ? 'Saturada'
                    : 'Manual';
            return `| ${caso.id} | ${escaparCelda(caso.archivo)} | ${caso.edge_case} | ${formatearNumero(caso.esperado, 0)} | ${formatearNumero(caso.sugerido, 0)} | ${estado} | ${formatearNumero(caso.confidence)} | ${Math.round(caso.latencia_ms)} ms | ${escaparCelda(caso.justificacion ?? '—')} |`;
        })
        .join('\n');

    const markdown = `# Reporte de validación multimodal

- Modelo: \`${modelo}\`
- Casos: ${casos.length}
- Errores: ${errores.length}
- Casos contables evaluados: ${contables.length}
- Con sugerencia: ${conSugerencia.length}
- Sin sugerencia: ${contables.length - conSugerencia.length}
- Exactos: ${exactos} (${contables.length > 0 ? Math.round((exactos / contables.length) * 100) : 0}%)
- Dentro de ±1: ${dentroDeUno} (${contables.length > 0 ? Math.round((dentroDeUno / contables.length) * 100) : 0}%)
- MAE: ${formatearNumero(mae)}
- Autocompletados inseguros: ${autocompletadosInseguros.length}
- Saturación detectada: ${saturacionDetectada}/${casosSaturados.length}
- Latencia mediana: ${Math.round(medianaMs)} ms
- Latencia p95: ${Math.round(p95Ms)} ms
- Umbral de confianza para autocompletar: ${CONFIANZA_MINIMA}

${fallos.length > 0 ? `## Fallos\n\n${fallos.map((fallo) => `- ${fallo}`).join('\n')}\n` : '## Resultado\n\nTodos los gates aprobaron.\n'}

## Detalle

| ID | Archivo | Edge case | Esperado | Sugerido | Estado | Confianza | Latencia | Justificación |
|---|---|---|---:|---:|---|---:|---:|---|
${filas}
`;

    return { markdown, fallos };
}

async function main(): Promise<void> {
    cargarEnvLocal();
    const { values } = parseArgs({
        options: {
            manifest: { type: 'string' },
            fotos: { type: 'string' },
            out: { type: 'string' },
        },
        allowPositionals: false,
    });

    const manifestPath =
        values.manifest ??
        'scripts/fixtures/vision-multimodal/manifest.json';
    const fotosPath =
        values.fotos ?? 'scripts/fixtures/vision-multimodal/fotos';
    const outPath =
        values.out ?? 'scripts/fixtures/vision-multimodal/reporte.md';

    const apiKey = process.env.OPENROUTER_API_KEY;
    const modelo = process.env.VISION_MODEL_SLUG;
    if (!apiKey || !apiKey.trim()) {
        throw new Error('Falta OPENROUTER_API_KEY en el entorno.');
    }
    if (!modelo || !modelo.trim()) {
        throw new Error('Falta VISION_MODEL_SLUG en el entorno.');
    }
    if (!existsSync(manifestPath)) {
        throw new Error(`No existe el manifiesto: ${manifestPath}`);
    }
    if (!existsSync(fotosPath)) {
        throw new Error(`No existe la carpeta de fotos: ${fotosPath}`);
    }

    const casos = leerManifiesto(manifestPath);
    validarManifiesto(casos);

    const resultados: ResultadoCaso[] = [];
    for (const caso of casos) {
        console.log(`[vision-multimodal] Procesando ${caso.id}...`);
        try {
            resultados.push(
                await ejecutarCaso(caso, fotosPath, {
                    apiKey: apiKey.trim(),
                    modelo: modelo.trim(),
                    base64: '',
                    mimeType: 'image/jpeg',
                })
            );
        } catch (error) {
            resultados.push({
                id: caso.id,
                archivo: caso.archivo,
                edge_case: caso.edge_case,
                esperado: caso.esperado,
                no_contable: caso.no_contable,
                sugerido: null,
                puede_contar: false,
                confidence: null,
                saturada: false,
                justificacion: null,
                latencia_ms: 0,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Error desconocido.',
            });
        }
    }

    const { markdown, fallos } = generarReporte(
        resultados,
        modelo.trim()
    );
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, markdown, 'utf8');

    console.log(`\nReporte: ${basename(outPath)}`);
    console.log(`Casos: ${resultados.length}`);
    console.log(
        `Autocompletados inseguros: ${
            resultados.filter(
                (caso) => caso.no_contable && caso.puede_contar
            ).length
        }`
    );
    if (fallos.length > 0) {
        console.error(`\nGates fallidos:\n- ${fallos.join('\n- ')}`);
        process.exit(1);
    }
    console.log('\nTodos los gates aprobaron.');
}

main().catch((error) => {
    console.error(
        '[vision-multimodal] Validación falló:',
        error instanceof Error ? error.message : error
    );
    process.exit(1);
});
