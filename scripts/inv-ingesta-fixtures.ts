/**
 * WEB-INV-INGESTA-001-F1 — Runner de fixtures sintéticos (MT-1).
 *
 * No importa Firestore, Storage ni escribe archivos. Solo ejecuta el parser
 * puro contra scripts/fixtures/inv-ingesta-fixtures.json y compara.
 *
 * Uso:
 *   npx tsx scripts/inv-ingesta-fixtures.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    clasificarReferencia,
    computeImportKey,
    limpiarCelda,
    parseInventarioRows,
    parseNumeroColombiano,
    procesarTokensPersonalizados,
    verificarHeaders,
    type Bucket,
    type FilaClasificada,
    type FilaOrigen,
    type ResultadoFila,
} from './lib/inv-ingesta-utils';
import {
    aplicarDisposiciones,
    mapearReferenciaMappable,
} from './lib/inv-ingesta-disposiciones';

interface FixtureCase {
    id: string;
    kind: string;
    descripcion: string;
    input: Record<string, any>;
    esperado: unknown;
}

interface FixtureFile {
    ticket: string;
    descripcion: string;
    fixtures: FixtureCase[];
}

function compararSubconjunto(
    actual: unknown,
    esperado: unknown,
    ruta: string,
    errores: string[]
): void {
    if (Array.isArray(esperado)) {
        if (!Array.isArray(actual)) {
            errores.push(`${ruta}: se esperaba un array`);
            return;
        }
        if (actual.length !== esperado.length) {
            errores.push(
                `${ruta}: longitud ${actual.length} != ${esperado.length}`
            );
        }
        const minimo = Math.min(actual.length, esperado.length);
        for (let index = 0; index < minimo; index += 1) {
            compararSubconjunto(
                actual[index],
                esperado[index],
                `${ruta}[${index}]`,
                errores
            );
        }
        return;
    }

    if (esperado !== null && typeof esperado === 'object') {
        if (
            actual === null ||
            typeof actual !== 'object' ||
            Array.isArray(actual)
        ) {
            errores.push(`${ruta}: se esperaba un objeto`);
            return;
        }
        const objeto = actual as Record<string, unknown>;
        for (const [clave, valor] of Object.entries(esperado)) {
            if (clave === '__sinClaves') {
                if (!Array.isArray(valor)) {
                    errores.push(`${ruta}.__sinClaves: se esperaba un array`);
                    continue;
                }
                for (const prohibida of valor) {
                    if (
                        Object.prototype.hasOwnProperty.call(
                            objeto,
                            String(prohibida)
                        )
                    ) {
                        errores.push(
                            `${ruta}: clave prohibida presente: ${String(
                                prohibida
                            )}`
                        );
                    }
                }
                continue;
            }
            if (!(clave in objeto)) {
                errores.push(`${ruta}.${clave}: ausente`);
                continue;
            }
            compararSubconjunto(
                objeto[clave],
                valor,
                `${ruta}.${clave}`,
                errores
            );
        }
        return;
    }

    if (!Object.is(actual, esperado)) {
        errores.push(
            `${ruta}: ${JSON.stringify(actual)} != ${JSON.stringify(esperado)}`
        );
    }
}

function resumirFila(fila: ReturnType<typeof parseInventarioRows>['filas'][number]) {
    return {
        fila: fila.fila,
        resultado: fila.resultado,
        motivos: fila.motivos,
        grupos: fila.grupos,
        categoria: fila.categoria,
        categoriaFuente: fila.categoriaFuente,
        referencia: fila.referencia,
        referenciaBucket: fila.referenciaBucket,
        referenciaMotivo: fila.referenciaMotivo,
        descripcion: fila.descripcion,
        descripcionLongitud: fila.descripcionLongitud,
        metricas: fila.metricas,
        tokens: fila.tokens.map((token) => ({
            crudo: token.crudo,
            normalizado: token.normalizado,
            bucket: token.bucket,
            motivo: token.motivo,
            ean13: token.ean13,
        })),
        referenciasAlternativas: fila.referenciasAlternativas,
        importKeyLength: fila.importKey ? fila.importKey.length : null,
        documentoPropuesto: fila.documentoPropuesto,
    };
}

function resumirDisposiciones(disp: ReturnType<typeof aplicarDisposiciones>) {
    return {
        ...disp.resumen,
        porCategoria: Object.fromEntries(
            disp.resumen.porCategoria.map((categoria) => [
                categoria.categoria,
                categoria,
            ])
        ),
        filas: disp.filas.map((fila) => ({
            fila: fila.fila,
            referencia: fila.referencia,
            referenciaOriginal: fila.referenciaOriginal,
            referenciaCruda: fila.referenciaCruda,
            disposicion: fila.disposicion,
            motivo: fila.motivo,
            mapeo: fila.mapeo,
            importKey: fila.importKey,
            documentoPropuesto: fila.documentoPropuesto,
        })),
        filasMapeadas: disp.mapeo,
        mapeoCuarentena: disp.mapeoCuarentena,
    };
}

/**
 * Construye una FilaClasificada sintética para cubrir ramas defensivas que el
 * parser real no puede producir (p. ej. una alternativa no-EAN inyectada).
 * Solo existe en el runner de fixtures; no se usa en producción.
 */
function filaClasificadaSintetica(
    spec: Record<string, any>
): FilaClasificada {
    const referencia = String(spec.referencia ?? '');
    const descripcion = String(spec.descripcion ?? 'SINTETICA');
    return {
        fila: Number(spec.fila),
        resultado: spec.resultado as ResultadoFila,
        motivos: (spec.motivos as string[]) ?? [],
        grupos: {
            grupoUno: '',
            descGrupoUno: '',
            grupoDos: '',
            descGrupoDos: '',
        },
        categoria: String(spec.categoria ?? ''),
        categoriaFuente: 'DescGrupoDos',
        disposicionCategoria: 'INGRESA',
        referenciaCruda: String(spec.referenciaCruda ?? referencia),
        referencia,
        referenciaBucket: (spec.referenciaBucket as Bucket) ?? 'CLEAN',
        referenciaMotivo:
            (spec.referenciaMotivo as string | null | undefined) ?? null,
        descripcion,
        descripcionLongitud: descripcion.length,
        unidadMedida: '',
        metricas: {
            precio1: null,
            precio2: null,
            precio3: null,
            precio4: null,
            iva: null,
            existencias: null,
        },
        tokens: [],
        referenciasAlternativas:
            (spec.referenciasAlternativas as string[]) ?? [],
        importKey: referencia ? computeImportKey(referencia) : null,
        documentoPropuesto: null,
    };
}

function ejecutar(caso: FixtureCase): unknown {
    switch (caso.kind) {
        case 'headers':
            return verificarHeaders(caso.input.headers as string[]);
        case 'reference':
            return clasificarReferencia(caso.input.raw);
        case 'numeros':
            return (caso.input.valores as unknown[]).map(
                parseNumeroColombiano
            );
        case 'limpieza':
            return { valor: limpiarCelda(caso.input.raw) };
        case 'tokens': {
            const resultado = procesarTokensPersonalizados(
                caso.input.textos as unknown[],
                {
                    blocklist: caso.input.blocklist as
                        | string[]
                        | undefined,
                    masters: caso.input.masters as string[] | undefined,
                }
            );
            return {
                tokens: resultado.tokens.map((token) => ({
                    crudo: token.crudo,
                    normalizado: token.normalizado,
                    bucket: token.bucket,
                    motivo: token.motivo,
                    ean13: token.ean13,
                })),
                alternativas: resultado.alternativas,
                resumen: resultado.resumen,
            };
        }
        case 'parse': {
            const resultado = parseInventarioRows(
                caso.input.filas as FilaOrigen[],
                {
                    blocklist: caso.input.blocklist as
                        | string[]
                        | undefined,
                    masters: caso.input.masters as string[] | undefined,
                }
            );
            return {
                totalFilas: resultado.resumen.totalFilas,
                parsedRows: resultado.resumen.parsedRows,
                skippedRows: resultado.resumen.skippedRows,
                porResultado: resultado.resumen.porResultado,
                porBucket: resultado.resumen.porBucket,
                tokens: resultado.resumen.tokens,
                metricasResumen: resultado.resumen.metricas,
                filas: resultado.filas.map(resumirFila),
            };
        }
        case 'importKey': {
            const refs = caso.input.refs as string[];
            const keys = refs.map(computeImportKey);
            return {
                keys,
                iguales: keys[0] === keys[1],
                distintos: keys[0] !== keys[2],
                longitudes: keys.map((key) => key.length),
            };
        }
        case 'disposiciones': {
            const resultado = parseInventarioRows(
                caso.input.filas as FilaOrigen[],
                {
                    blocklist: caso.input.blocklist as
                        | string[]
                        | undefined,
                    masters: caso.input.masters as string[] | undefined,
                }
            );
            return resumirDisposiciones(
                aplicarDisposiciones(resultado.filas)
            );
        }
        case 'disposicionesClasificadas': {
            const filas = (caso.input.filas as Record<string, any>[]).map(
                filaClasificadaSintetica
            );
            return resumirDisposiciones(aplicarDisposiciones(filas));
        }
        case 'mapeoReferencia': {
            return (caso.input.valores as string[]).map((valor) =>
                mapearReferenciaMappable(valor)
            );
        }
        default:
            throw new Error(`KIND_DESCONOCIDO: ${String(caso.kind)}`);
    }
}

function main(): void {
    const rutaFixtures = join(
        process.cwd(),
        'scripts/fixtures/inv-ingesta-fixtures.json'
    );
    const archivo = JSON.parse(
        readFileSync(rutaFixtures, 'utf8')
    ) as FixtureFile;

    let aprobados = 0;
    const fallidos: string[] = [];

    for (const caso of archivo.fixtures) {
        const errores: string[] = [];
        try {
            const actual = ejecutar(caso);
            compararSubconjunto(actual, caso.esperado, caso.id, errores);
        } catch (error) {
            errores.push(
                `excepción: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }

        if (errores.length === 0) {
            aprobados += 1;
            console.log(`[PASS] ${caso.id} — ${caso.descripcion}`);
        } else {
            fallidos.push(caso.id);
            console.log(`[FAIL] ${caso.id} — ${caso.descripcion}`);
            for (const error of errores) {
                console.log(`       ${error}`);
            }
        }
    }

    const total = archivo.fixtures.length;
    console.log('');
    console.log(`FIXTURES=${aprobados}/${total}`);
    console.log(`FIRESTORE_WRITES=0`);
    console.log(`STORAGE_WRITES=0`);
    console.log(`FIREBASE_IMPORTS=0`);
    console.log(`RESULT=${aprobados === total ? 'PASS' : 'FAIL'}`);
    if (fallidos.length > 0) {
        console.log(`FALLIDOS=${fallidos.join(',')}`);
        process.exitCode = 1;
    }
}

main();
