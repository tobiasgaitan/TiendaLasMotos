/**
 * WEB-INV-INGESTA-001-F1 — MT-2: dry-run read-only de la ingesta.
 *
 * No escribe en Firestore ni en Storage. Solo lee un snapshot live y escribe
 * evidencia fuera del repositorio. `--apply` y cualquier bandera de escritura
 * están prohibidas: Fase 1 termina antes de cualquier mutación.
 *
 * Uso:
 *   npx tsx scripts/inv-ingesta-dry-run.ts \
 *     --out=/ruta/fuera/del/repo [--source=<xlsx>] [--project=tiendalasmotos]
 */
import {
    copyFileSync,
    mkdirSync,
    readFileSync,
    statSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Firestore } from 'firebase-admin/firestore';
import {
    assertOutDirOutsideRepo,
    initFirebaseGuarded,
    writeManifestAndReport,
} from './lib/forensic-utils';
import {
    SOURCE_PATH_DEFAULT,
    SOFFICE_DEFAULT,
    IngestaError,
    convertirCsv,
    prepararCsv,
    sha256Archivo,
    sha256Json,
    sha256Texto,
} from './lib/inv-ingesta-source';
import {
    MT5_DISPOSICIONES,
    aplicarDisposiciones,
    type ResultadoDisposiciones,
} from './lib/inv-ingesta-disposiciones';
import {
    SOURCE_BYTES,
    SOURCE_DATA_ROWS,
    SOURCE_SHA256,
    SOURCE_SHEET,
    TICKET,
    parseInventarioRows,
    type Bucket,
    type HeaderCheck,
    type ResultadoParseo,
} from './lib/inv-ingesta-utils';

const PROJECT_ID_DEFAULT = 'tiendalasmotos';

const USAGE =
    'Uso: npx tsx scripts/inv-ingesta-dry-run.ts --out=<fuera-del-repo> ' +
    '[--source=<xlsx>] [--project=tiendalasmotos] [--soffice=<binario>]';

const PROHIBITED_FLAGS = [
    '--apply',
    '--force',
    '--yes',
    '--delete',
    '--write',
    '--commit',
    '--set',
    '--update',
    '--upload',
];

const WRITE_API_PATTERNS: ReadonlyArray<{
    nombre: string;
    patron: RegExp;
}> = [
    {
        nombre: 'firestore.batch',
        patron: /(?:^|[^A-Za-z0-9_])db\s*\.\s*batch\s*\(/,
    },
    {
        nombre: 'firestore.runTransaction',
        patron: /(?:^|[^A-Za-z0-9_])db\s*\.\s*runTransaction\s*\(/,
    },
    {
        nombre: 'firestore.doc.write',
        patron: /\.doc\s*\([^)]*\)\s*\.\s*(?:set|update|delete|create)\s*\(/,
    },
    {
        nombre: 'firestore.collection.add',
        patron: /\.collection\s*\([^)]*\)\s*\.\s*add\s*\(/,
    },
    {
        nombre: 'storage.bucket',
        patron: /\.bucket\s*\(/,
    },
    {
        nombre: 'storage.upload',
        patron: /\.upload\s*\(/,
    },
    {
        nombre: 'storage.save',
        patron: /\.save\s*\(/,
    },
    {
        nombre: 'storage.remove',
        patron: /\.remove\s*\(/,
    },
];

const SCRIPT_SOURCE = readFileSync(new URL(import.meta.url), 'utf8');
const WRITE_API_HITS = WRITE_API_PATTERNS.filter((item) =>
    item.patron.test(SCRIPT_SOURCE)
).map((item) => item.nombre);

interface CliOptions {
    outDir: string;
    source: string;
    project: string;
    soffice: string;
}

interface SourceEvidence {
    ruta: string;
    sha256_esperado: string;
    sha256_antes?: string;
    sha256_despues?: string;
    bytes?: number;
    mtime?: string;
    copia_trabajo?: string;
    copia_sha256_antes?: string;
    copia_sha256_despues?: string;
    csv?: {
        ruta: string;
        sha256: string;
        bytes: number;
        filas_csv: number;
        filas_vacias_finales: number;
    };
    hoja?: string;
    headers?: HeaderCheck;
    filas_datos?: number;
    filas_datos_esperadas?: number;
}

interface Evidence {
    ticket: string;
    phase: string;
    generated_at: string;
    read_only: true;
    project: string;
    source: SourceEvidence;
    snapshot: unknown;
    parse: unknown;
    disposiciones: unknown;
    gates: Record<string, string | number>;
    write_api_hits: string[];
    status?: 'PASS' | 'FAIL';
    fail_code?: string;
    fail_message?: string;
    fail_detail?: unknown;
}

interface DisposicionesEvidence {
    config: typeof MT5_DISPOSICIONES;
    config_sha256: string;
    resumen: ResultadoDisposiciones['resumen'];
    mapeo: ResultadoDisposiciones['mapeo'];
    mapeoCuarentena: ResultadoDisposiciones['mapeoCuarentena'];
    overrides: ResultadoDisposiciones['overrides'];
}

interface SnapshotEvidencia {
    inventario_repuestos: {
        total: number;
        referencias_unicas: number;
        referencias_duplicadas: number;
        con_import_key: number;
        con_unidad_medida: number;
        categorias: Record<string, number>;
        precio_cero: number;
        stock_cero: number;
        maestras_sha256: string;
        maestras_count: number;
    };
    conteos_pendientes_repuestos: {
        total: number;
        por_estado: Record<string, number>;
        fk_unicos: number;
        fk_huerfanos: string[];
        fk_sin_id: number;
    };
    historial_auditoria_inventario: {
        total: number;
        por_operacion: Record<string, number>;
        desconocidas: number;
        count_mismatch: boolean;
    };
}

interface SnapshotLeido {
    evidencia: SnapshotEvidencia;
    fkMap: Record<string, number>;
    masters: string[];
}

interface CensoCategoria {
    categoria: string;
    total: number;
    porResultado: Record<string, number>;
    porBucket: Record<Bucket, number>;
    fuentes: Record<string, number>;
}

interface Censo {
    categorias: CensoCategoria[];
    resultados: Record<string, number>;
    buckets: Record<Bucket, number>;
    tokens: ResultadoParseo['resumen']['tokens'];
    referencias: {
        duplicadas: number;
        unicas: number;
    };
    incidencias: Record<string, number>;
}

interface CensoCompleto {
    censo: Censo;
    cuarentena: unknown[];
    tokensFrecuencia: unknown[];
    referenciasDuplicadas: unknown[];
}

function parseArgs(argv: string[]): CliOptions {
    let outDir = '';
    let source = SOURCE_PATH_DEFAULT;
    let project = PROJECT_ID_DEFAULT;
    let soffice = SOFFICE_DEFAULT;

    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            console.log(USAGE);
            process.exit(0);
        }
        if (
            PROHIBITED_FLAGS.some(
                (flag) => arg === flag || arg.startsWith(`${flag}=`)
            )
        ) {
            throw new IngestaError(
                'FLAG_PROHIBIDO',
                `${arg} no está permitido: Fase 1 es read-only.`
            );
        }
        if (!arg.startsWith('--')) {
            throw new IngestaError('ARG_INVALIDO', arg);
        }
        const [rawKey = '', rawValue = ''] = arg.slice(2).split('=', 2);
        const key = rawKey.trim();
        const value = rawValue.trim();
        if (key === 'out') {
            outDir = value;
            continue;
        }
        if (key === 'source') {
            source = value;
            continue;
        }
        if (key === 'project') {
            project = value;
            continue;
        }
        if (key === 'soffice') {
            soffice = value;
            continue;
        }
        throw new IngestaError('FLAG_NO_RECONOCIDO', `--${key}`);
    }

    if (!outDir) {
        throw new IngestaError('OUT_REQUIRED', '<fuera-del-repo>');
    }
    if (!source) {
        throw new IngestaError('SOURCE_REQUIRED', '<xlsx>');
    }
    if (!project) {
        throw new IngestaError('PROJECT_REQUIRED', 'tiendalasmotos');
    }

    return { outDir, source, project, soffice };
}

function baseEvidence(
    options: CliOptions,
    generatedAt: string
): Evidence {
    return {
        ticket: TICKET,
        phase: 'F1',
        generated_at: generatedAt,
        read_only: true,
        project: options.project,
        source: {
            ruta: options.source,
            sha256_esperado: SOURCE_SHA256,
        },
        snapshot: null,
        parse: null,
        disposiciones: null,
        gates: {
            SOURCE_HASH: 'PENDIENTE',
            SOURCE_SCHEMA: 'PENDIENTE',
            DATA_ROWS: 'PENDIENTE',
            PARSED_ROWS_PLUS_SKIPPED_ROWS: 'PENDIENTE',
            RECONCILIACION: 'PENDIENTE',
            CREATE_FINAL: 0,
            CENSAR_FINAL: 0,
            EXCLUIR_FINAL: 0,
            CUARENTENA_FINAL: 0,
            SKIP_CONFLICTO_FINAL: 0,
            PARSED_FINAL: 0,
            MAPEO_FILAS: 0,
            MAPEO_CAMBIOS: 0,
            MAPEO_COLISIONES: 0,
            MAPEO_INVALIDAS: 0,
            MAPEO_D1_FILAS: 0,
            MAPEO_D1_CAMBIOS: 0,
            MAPEO_D5_CHARSET_TOTAL: 0,
            MAPEO_D5_CANDIDATAS: 0,
            MAPEO_D5_ELEGIBLES: 0,
            MAPEO_D5_CREADAS: 0,
            MAPEO_D5_SKIP_CONFLICTO: 0,
            MAPEO_D5_TEXTO_LIBRE: 0,
            MAPEO_D5_SIMBOLO_INVALIDO: 0,
            MAPEO_D5_OTRO_DEFECTO: 0,
            MAPEO_D5_FUERA_DE_ALCANCE: 0,
            MAPEO_D5_COLISIONES: 0,
            MAPEO_D5_IDENTIDAD: 'PENDIENTE',
            FIRESTORE_WRITES: 0,
            STORAGE_WRITES: 0,
            DELETIONS: 0,
            WRITE_APIS: WRITE_API_HITS.length,
            DRY_RUN: 'PENDIENTE',
        },
        write_api_hits: WRITE_API_HITS,
    };
}

async function contarColeccion(
    db: Firestore,
    coleccion: string
): Promise<number> {
    const snapshot = await db.collection(coleccion).count().get();
    return snapshot.data().count;
}

async function contarOperacion(
    db: Firestore,
    coleccion: string,
    operacion: string
): Promise<number> {
    const snapshot = await db
        .collection(coleccion)
        .where('operacion', '==', operacion)
        .count()
        .get();
    return snapshot.data().count;
}

async function leerSnapshot(db: Firestore): Promise<SnapshotLeido> {
    const [inventario, conteos, ledgerTotal] = await Promise.all([
        db.collection('inventario_repuestos').get(),
        db.collection('conteos_pendientes_repuestos').get(),
        contarColeccion(db, 'historial_auditoria_inventario'),
    ]);

    const referencias = new Map<string, number>();
    const categorias: Record<string, number> = {};
    let conImportKey = 0;
    let conUnidadMedida = 0;
    let precioCero = 0;
    let stockCero = 0;

    for (const doc of inventario.docs) {
        const referencia = String(doc.get('referencia') ?? '')
            .trim()
            .toUpperCase();
        if (referencia) {
            referencias.set(
                referencia,
                (referencias.get(referencia) ?? 0) + 1
            );
        }
        const categoria =
            String(doc.get('categoria') ?? '').trim().toUpperCase() ||
            'CATEGORIA_AUSENTE';
        categorias[categoria] = (categorias[categoria] ?? 0) + 1;
        if (String(doc.get('import_key') ?? '').trim()) conImportKey += 1;
        if (String(doc.get('unidad_medida') ?? '').trim()) conUnidadMedida += 1;
        if (doc.get('precio') === 0) precioCero += 1;
        if (doc.get('stock') === 0) stockCero += 1;
    }

    const inventarioIds = new Set(inventario.docs.map((doc) => doc.id));
    const fkMap = new Map<string, number>();
    const estados: Record<string, number> = {};
    let fkSinId = 0;
    for (const doc of conteos.docs) {
        const fk = String(doc.get('inventario_documento_id') ?? '').trim();
        if (fk) {
            fkMap.set(fk, (fkMap.get(fk) ?? 0) + 1);
        } else {
            fkSinId += 1;
        }
        const estado =
            String(doc.get('estado') ?? '').trim().toUpperCase() ||
            'SIN_ESTADO';
        estados[estado] = (estados[estado] ?? 0) + 1;
    }

    const fkHuerfanos = [...fkMap.keys()]
        .filter((fk) => !inventarioIds.has(fk))
        .sort();

    const [creates, updates, deletes] = await Promise.all([
        contarOperacion(db, 'historial_auditoria_inventario', 'CREATE'),
        contarOperacion(db, 'historial_auditoria_inventario', 'UPDATE'),
        contarOperacion(db, 'historial_auditoria_inventario', 'DELETE'),
    ]);
    const conocidas = creates + updates + deletes;
    const masters = [...referencias.keys()].sort();

    return {
        evidencia: {
            inventario_repuestos: {
                total: inventario.size,
                referencias_unicas: referencias.size,
                referencias_duplicadas: [...referencias.values()].filter(
                    (cantidad) => cantidad > 1
                ).length,
                con_import_key: conImportKey,
                con_unidad_medida: conUnidadMedida,
                categorias,
                precio_cero: precioCero,
                stock_cero: stockCero,
                maestras_sha256: sha256Texto(masters.join('\n')),
                maestras_count: masters.length,
            },
            conteos_pendientes_repuestos: {
                total: conteos.size,
                por_estado: estados,
                fk_unicos: fkMap.size,
                fk_huerfanos: fkHuerfanos,
                fk_sin_id: fkSinId,
            },
            historial_auditoria_inventario: {
                total: ledgerTotal,
                por_operacion: {
                    CREATE: creates,
                    UPDATE: updates,
                    DELETE: deletes,
                },
                desconocidas: Math.max(0, ledgerTotal - conocidas),
                count_mismatch: conocidas > ledgerTotal,
            },
        },
        fkMap: Object.fromEntries(
            [...fkMap.entries()].sort(([a], [b]) => a.localeCompare(b))
        ),
        masters,
    };
}

function construirCenso(resultado: ResultadoParseo): CensoCompleto {
    const categorias = new Map<string, CensoCategoria>();
    const tokens = new Map<
        string,
        {
            token: string;
            bucket: Bucket;
            motivo: string | null;
            ocurrencias: number;
            filas: Set<number>;
        }
    >();
    const referencias = new Map<
        string,
        {
            referencia: string;
            ocurrencias: number;
            filas: Array<{
                fila: number;
                categoria: string;
                descripcion: string;
                resultado: string;
            }>;
        }
    >();
    const incidencias = new Map<string, number>();
    const cuarentena: unknown[] = [];

    for (const fila of resultado.filas) {
        const claveCategoria = fila.categoria || 'CATEGORIA_AUSENTE';
        const categoria =
            categorias.get(claveCategoria) ??
            ({
                categoria: claveCategoria,
                total: 0,
                porResultado: {
                    INGRESA: 0,
                    CENSAR: 0,
                    MAPPABLE: 0,
                    CUARENTENA: 0,
                    OMITIDA: 0,
                },
                porBucket: {
                    CLEAN: 0,
                    NORMALIZABLE: 0,
                    MAPPABLE: 0,
                    QUARANTINE: 0,
                    EAN13: 0,
                },
                fuentes: {
                    DescGrupoDos: 0,
                    DescGrupoUno: 0,
                    AUSENTE: 0,
                },
            } satisfies CensoCategoria);
        categoria.total += 1;
        categoria.porResultado[fila.resultado] += 1;
        categoria.porBucket[fila.referenciaBucket] += 1;
        categoria.fuentes[fila.categoriaFuente] += 1;
        categorias.set(claveCategoria, categoria);

        for (const token of fila.tokens) {
            const actual = tokens.get(token.normalizado);
            if (actual) {
                actual.ocurrencias += 1;
                actual.filas.add(fila.fila);
            } else {
                tokens.set(token.normalizado, {
                    token: token.normalizado,
                    bucket: token.bucket,
                    motivo: token.motivo,
                    ocurrencias: 1,
                    filas: new Set<number>([fila.fila]),
                });
            }
        }

        if (fila.referencia) {
            const actual = referencias.get(fila.referencia);
            const registro = {
                fila: fila.fila,
                categoria: fila.categoria,
                descripcion: fila.descripcion,
                resultado: fila.resultado,
            };
            if (actual) {
                actual.ocurrencias += 1;
                actual.filas.push(registro);
            } else {
                referencias.set(fila.referencia, {
                    referencia: fila.referencia,
                    ocurrencias: 1,
                    filas: [registro],
                });
            }
        }

        if (
            fila.resultado === 'CUARENTENA' ||
            fila.resultado === 'MAPPABLE' ||
            fila.resultado === 'CENSAR'
        ) {
            cuarentena.push({
                fila: fila.fila,
                resultado: fila.resultado,
                motivos: fila.motivos,
                categoria: fila.categoria,
                categoriaFuente: fila.categoriaFuente,
                referencia: fila.referencia,
                referenciaCruda: fila.referenciaCruda,
                referenciaBucket: fila.referenciaBucket,
                referenciaMotivo: fila.referenciaMotivo,
                descripcion: fila.descripcion,
                descripcionLongitud: fila.descripcionLongitud,
                importKey: fila.importKey,
                tokensCuarentena: fila.tokens
                    .filter(
                        (token) =>
                            token.bucket === 'QUARANTINE' ||
                            token.bucket === 'MAPPABLE'
                    )
                    .map((token) => ({
                        token: token.normalizado,
                        bucket: token.bucket,
                        motivo: token.motivo,
                    })),
            });
        }
    }

    for (const incidencia of resultado.incidencias) {
        incidencias.set(
            incidencia.codigo,
            (incidencias.get(incidencia.codigo) ?? 0) + 1
        );
    }

    const referenciasDuplicadas = [...referencias.values()]
        .filter((referencia) => referencia.ocurrencias > 1)
        .sort((a, b) => b.ocurrencias - a.ocurrencias);

    return {
        censo: {
            categorias: [...categorias.values()].sort(
                (a, b) => b.total - a.total
            ),
            resultados: resultado.resumen.porResultado,
            buckets: resultado.resumen.porBucket,
            tokens: resultado.resumen.tokens,
            referencias: {
                duplicadas: referenciasDuplicadas.length,
                unicas: referencias.size,
            },
            incidencias: Object.fromEntries(
                [...incidencias.entries()].sort((a, b) => b[1] - a[1])
            ),
        },
        cuarentena,
        tokensFrecuencia: [...tokens.values()]
            .map((registro) => ({
                token: registro.token,
                bucket: registro.bucket,
                motivo: registro.motivo,
                ocurrencias: registro.ocurrencias,
                filas: [...registro.filas].sort((a, b) => a - b),
            }))
            .sort((a, b) => b.ocurrencias - a.ocurrencias),
        referenciasDuplicadas,
    };
}

function construirReporte(evidence: Evidence): string {
    const lineas: string[] = [
        `# ${TICKET} — Dry-run Fase 1`,
        '',
        `- Estado: **${evidence.status ?? 'PENDIENTE'}**`,
        `- Generado: ${evidence.generated_at}`,
        `- Proyecto: ${evidence.project}`,
        `- Modo: read-only (sin escrituras Firestore/Storage)`,
        '',
    ];

    if (evidence.fail_code) {
        lineas.push(
            '## Fallo',
            '',
            `- Código: \`${evidence.fail_code}\``,
            `- Mensaje: ${evidence.fail_message ?? ''}`,
            ''
        );
    }

    lineas.push('## Gates', '', '| Gate | Resultado |', '| --- | --- |');
    for (const [gate, valor] of Object.entries(evidence.gates)) {
        lineas.push(`| ${gate} | ${String(valor)} |`);
    }
    lineas.push('');

    const source = evidence.source;
    lineas.push(
        '## Fuente',
        '',
        `- Ruta: \`${source.ruta}\``,
        `- SHA-256 esperado: \`${source.sha256_esperado}\``,
        `- SHA-256 antes: \`${source.sha256_antes ?? 'N/D'}\``,
        `- SHA-256 después: \`${source.sha256_despues ?? 'N/D'}\``,
        `- Bytes: ${source.bytes ?? 'N/D'}`,
        `- mtime: ${source.mtime ?? 'N/D'}`,
        `- Hoja: ${source.hoja ?? 'N/D'}`,
        `- Filas de datos: ${source.filas_datos ?? 'N/D'}`,
        ''
    );

    const snapshot = evidence.snapshot as SnapshotEvidencia | null;
    if (snapshot) {
        lineas.push(
            '## Snapshot live',
            '',
            `- inventario_repuestos: ${snapshot.inventario_repuestos.total} docs; ` +
                `${snapshot.inventario_repuestos.referencias_unicas} referencias únicas; ` +
                `${snapshot.inventario_repuestos.referencias_duplicadas} duplicadas`,
            `- conteos_pendientes_repuestos: ${snapshot.conteos_pendientes_repuestos.total} docs; ` +
                `${snapshot.conteos_pendientes_repuestos.fk_unicos} FK únicas; ` +
                `${snapshot.conteos_pendientes_repuestos.fk_huerfanos.length} FK huérfanas`,
            `- historial_auditoria_inventario: ${snapshot.historial_auditoria_inventario.total} docs`,
            ''
        );
    }

    const parse = evidence.parse as
        | {
              total_filas: number;
              parsed_rows: number;
              skipped_rows: number;
              por_resultado: Record<string, number>;
              por_bucket: Record<string, number>;
              tokens: { total: number; unicos: number };
              parse_hash: string;
          }
        | null;
    if (parse) {
        lineas.push(
            '## Parse',
            '',
            `- Filas totales: ${parse.total_filas}`,
            `- PARSED_ROWS: ${parse.parsed_rows}`,
            `- SKIPPED_ROWS: ${parse.skipped_rows}`,
            `- Resultados: \`${JSON.stringify(parse.por_resultado)}\``,
            `- Buckets: \`${JSON.stringify(parse.por_bucket)}\``,
            `- Tokens: ${parse.tokens.total} ocurrencias, ${parse.tokens.unicos} únicos`,
            `- Parse hash: \`${parse.parse_hash}\``,
            ''
        );
    }

    const disposiciones = evidence.disposiciones as
        | DisposicionesEvidence
        | null;
    if (disposiciones) {
        const r = disposiciones.resumen;
        lineas.push(
            '## Disposiciones MT-5',
            '',
            `- Config: \`${disposiciones.config.ticket}\` v${disposiciones.config.version}`,
            `- Ratificada por: ${disposiciones.config.ratified_by} (${disposiciones.config.ratified_at})`,
            `- SHA-256 de la config: \`${disposiciones.config_sha256}\``,
            `- Overrides aplicados: ${r.overridesAplicados}`,
            '',
            '| Categoría | Total | CREATE | CENSAR | EXCLUIR | CUARENTENA | SKIP_CONFLICTO | OMITIDA |',
            '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
        );
        for (const categoria of r.porCategoria) {
            lineas.push(
                `| ${categoria.categoria} | ${categoria.total} | ${categoria.CREATE} | ${categoria.CENSAR} | ${categoria.EXCLUIR} | ${categoria.CUARENTENA} | ${categoria.SKIP_CONFLICTO} | ${categoria.OMITIDA} |`
            );
        }
        lineas.push(
            `| **Total** | **${r.total}** | **${r.CREATE}** | **${r.CENSAR}** | **${r.EXCLUIR}** | **${r.CUARENTENA}** | **${r.SKIP_CONFLICTO}** | **${r.OMITIDA}** |`,
            '',
            `- Reconciliación: ${r.parsed} = ${r.CREATE} + ${r.CENSAR} + ${r.EXCLUIR} + ${r.CUARENTENA} + ${r.SKIP_CONFLICTO} → \`${r.reconciliacion}\`; residuo ${r.residuo}.`,
            ''
        );

        lineas.push(
            '### Mapeo D-1 / D-5',
            '',
            `- D-1 filas MAPPABLE: ${r.mapeo.d1.filas}`,
            `- D-1 con sustitución: ${r.mapeo.d1.conCambios}`,
            `- D-1 sin cambios: ${r.mapeo.d1.sinCambios}`,
            `- D-1 filas con colisión post-mapeo: ${r.mapeo.d1.colisiones}`,
            `- Total filas mapeadas (D-1 + D-5 elegibles): ${r.mapeo.filas}`,
            `- Total con sustitución: ${r.mapeo.conCambios}`,
            `- Total con colisión post-mapeo: ${r.mapeo.colisiones}`,
            '- Reglas: `/` → `-`; espacio → `-`; el crudo se conserva en `mapeo.json`.',
            ''
        );

        const d5 = r.mapeo.d5;
        lineas.push(
            '#### D-5 saneamiento de CUARENTENA por charset',
            '',
            `- Charset total: ${d5.charsetTotal}`,
            `- Candidatas (seis categorías INGESTA): ${d5.candidatas}`,
            `- Elegibles: ${d5.elegibles}`,
            `- Creadas: ${d5.creadas}`,
            `- SKIP_CONFLICTO: ${d5.skipConflicto}`,
            `- Texto libre (permanece CUARENTENA): ${d5.textoLibre}`,
            `- Símbolo inválido (permanece CUARENTENA): ${d5.simboloInvalido}`,
            `- Otro defecto (permanece CUARENTENA): ${d5.otroDefecto}`,
            `- Fuera de alcance (CENSAR/OMITIDA): ${d5.fueraDeAlcance}`,
            `- Filas elegibles con colisión: ${d5.colisiones}`,
            '',
            '| Categoría | Charset | Candidatas | Elegibles | Creadas | SKIP_CONFLICTO | Texto libre | Símbolo inválido | Otro defecto | Fuera de alcance | Colisiones |',
            '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
        );
        for (const categoria of d5.porCategoria) {
            lineas.push(
                `| ${categoria.categoria} | ${categoria.charsetTotal} | ${categoria.candidatas} | ${categoria.elegibles} | ${categoria.creadas} | ${categoria.skipConflicto} | ${categoria.textoLibre} | ${categoria.simboloInvalido} | ${categoria.otroDefecto} | ${categoria.fueraDeAlcance} | ${categoria.colisiones} |`
            );
        }
        lineas.push(
            `| **Total** | **${d5.charsetTotal}** | **${d5.candidatas}** | **${d5.elegibles}** | **${d5.creadas}** | **${d5.skipConflicto}** | **${d5.textoLibre}** | **${d5.simboloInvalido}** | **${d5.otroDefecto}** | **${d5.fueraDeAlcance}** | **${d5.colisiones}** |`,
            ''
        );

        const repuestosMapeo = disposiciones.mapeo.filter(
            (fila) =>
                fila.origen === 'D1' && fila.categoria === 'REPUESTOS'
        );
        if (repuestosMapeo.length > 0) {
            lineas.push(
                '#### MAPPABLE de REPUESTOS (D-4)',
                '',
                '| Fila | Crudo | Referencia | Motivo original | Reglas | Disposición | Motivo final |',
                '| ---: | --- | --- | --- | --- | --- | --- |'
            );
            for (const fila of repuestosMapeo) {
                lineas.push(
                    `| ${fila.fila} | \`${fila.referenciaCruda}\` | \`${fila.referenciaOriginal}\` | ${fila.motivoOriginal ?? '—'} | ${fila.reglas.length > 0 ? fila.reglas.join(', ') : '—'} | ${fila.disposicion} | ${fila.motivo ?? '—'} |`
                );
            }
            lineas.push('');
        }

        const mapeoD5 = disposiciones.mapeo.filter(
            (fila) => fila.origen === 'D5'
        );
        if (mapeoD5.length > 0) {
            lineas.push(
                '#### D-5 filas elegibles: raw → sanitizada',
                '',
                '| Fila | Categoría | Raw | Sanitizada | Reglas | Disposición | Motivo final |',
                '| ---: | --- | --- | --- | --- | --- | --- |'
            );
            for (const fila of mapeoD5) {
                lineas.push(
                    `| ${fila.fila} | ${fila.categoria} | \`${fila.referenciaCruda}\` | \`${fila.referenciaMapeada}\` | ${fila.reglas.join(', ')} | ${fila.disposicion} | ${fila.motivo ?? '—'} |`
                );
            }
            lineas.push('');
        }

        const d5Excluidas = disposiciones.mapeoCuarentena.filter(
            (fila) => !fila.elegible
        );
        if (d5Excluidas.length > 0) {
            lineas.push('#### D-5 filas no elegibles (sin cambio de disposición)', '');
            const grupos = new Map<string, typeof d5Excluidas>();
            for (const fila of d5Excluidas) {
                const grupo = grupos.get(fila.motivo) ?? [];
                grupo.push(fila);
                grupos.set(fila.motivo, grupo);
            }
            for (const [motivo, filasGrupo] of grupos) {
                const detalle =
                    filasGrupo.length <= 20
                        ? ` (${filasGrupo.map((fila) => fila.fila).join(', ')})`
                        : '';
                lineas.push(
                    `- \`${motivo}\`: ${filasGrupo.length} filas${detalle}`
                );
            }
            lineas.push('');
        }

        const mapeoColisiones = disposiciones.mapeo.filter(
            (fila) => fila.colisiones.length > 0
        );
        if (mapeoColisiones.length > 0) {
            lineas.push('#### Colisiones post-mapeo', '');
            for (const fila of mapeoColisiones) {
                lineas.push(
                    `- [${fila.origen}] fila ${fila.fila} \`${fila.referenciaOriginal}\` → \`${fila.referenciaMapeada}\` (import_key \`${fila.importKey ?? '—'}\`): ` +
                        fila.colisiones
                            .map(
                                (colision) =>
                                    `fila ${colision.fila} (${colision.tipo})`
                            )
                            .join(', ') +
                        `; disposición ${fila.disposicion}.`
                );
            }
            lineas.push('');
        }

        if (disposiciones.overrides.length > 0) {
            lineas.push('### Overrides por motivo', '');
            for (const override of disposiciones.overrides) {
                const detalle =
                    override.filas.length <= 10
                        ? ` (${override.filas.join(', ')})`
                        : '';
                lineas.push(
                    `- \`${override.motivo}\`: ${override.total} filas${detalle}`
                );
            }
            lineas.push('');
        }
    }

    lineas.push(
        '## Evidencia',
        '',
        'Este reporte y sus JSON viven fuera del repositorio. El .xlsx, el CSV ' +
            'derivado y las filas reales no se commitean.',
        '',
        '### Artefactos y granularidad',
        '',
        '- `cuarentena.json` es **por fila de origen**: cada registro incluye ' +
            '`fila`, resultado, motivos y los tokens que la afectaron. Es el ' +
            'manifiesto de disposición para MT-5.',
        '- `mapeo.json` es el **manifiesto por fila mapeada (D-1 y D-5)**: ' +
            'conserva `origen`, `referenciaCruda`, referencia original y ' +
            'mapeada, reglas, colisiones, `import_key` y disposición final. ' +
            '`disposiciones.json` agrega el resumen, la config y los ' +
            'overrides agrupados por motivo.',
        '- `mapeo-cuarentena.json` es el **censo D-5 por fila charset**: ' +
            'incluye las 356 candidatas de las seis categorías INGESTA y las ' +
            'filas fuera de alcance. Cada registro conserva raw, sanitizada, ' +
            'motivo (`D5_TEXTO_LIBRE`, `D5_SIMBOLO_INVALIDO`, ' +
            '`D5_OTRO_DEFECTO`, `D5_CATEGORIA_NO_INGESTA`) y disposición.',
        '- `tokens-frecuencia.json` es el **manifiesto G3 por token**, no por ' +
            'fila: agrupa ocurrencias por token normalizado y conserva en ' +
            '`filas` todas las filas de origen donde aparece. Un mismo token ' +
            'puede aparecer en varias filas y en varios resultados; para la ' +
            'disposición individual hay que cruzar con `cuarentena.json`.',
        '- `filas` lista cada fila una sola vez aunque el token se repita ' +
            'dentro de ella (por ejemplo en `txtPersonalizado1` y ' +
            '`txtPersonalizado2`); por eso `ocurrencias` puede ser mayor que ' +
            '`filas.length`.',
        ''
    );

    return lineas.join('\n');
}

function escribirEvidencia(
    outDir: string,
    evidence: Evidence,
    extras: Record<string, unknown>
): void {
    writeManifestAndReport(
        outDir,
        'dry-run.json',
        evidence,
        construirReporte(evidence),
        extras,
        {
            ticket: TICKET,
            phase: 'F1',
            generated_at: evidence.generated_at,
            read_only: true,
            project: evidence.project,
            source_sha256_esperado: evidence.source.sha256_esperado,
            source_sha256_antes: evidence.source.sha256_antes ?? null,
            gates: evidence.gates,
        },
        'hashes'
    );
}

function imprimirGates(evidence: Evidence): void {
    console.log(`SOURCE_SCHEMA=${evidence.gates.SOURCE_SCHEMA}`);
    console.log(`SOURCE_HASH=${evidence.gates.SOURCE_HASH}`);
    console.log(`DATA_ROWS=${evidence.source.filas_datos ?? 0}`);
    const parse = evidence.parse as
        | { parsed_rows: number; skipped_rows: number; total_filas: number }
        | null;
    if (parse) {
        console.log(`PARSED_ROWS=${parse.parsed_rows}`);
        console.log(`SKIPPED_ROWS=${parse.skipped_rows}`);
        console.log(`TOTAL_CLASSIFIED_ROWS=${parse.total_filas}`);
        console.log(
            `PARSED_ROWS_PLUS_SKIPPED_ROWS=${
                parse.parsed_rows + parse.skipped_rows === parse.total_filas
                    ? 'PASS'
                    : 'FAIL'
            }`
        );
    }
    console.log(`FIRESTORE_WRITES=${evidence.gates.FIRESTORE_WRITES}`);
    console.log(`STORAGE_WRITES=${evidence.gates.STORAGE_WRITES}`);
    console.log(`DELETIONS=${evidence.gates.DELETIONS}`);
    console.log(`WRITE_APIS=${evidence.gates.WRITE_APIS}`);
    console.log(`RECONCILIACION=${evidence.gates.RECONCILIACION}`);
    console.log(`PARSED_FINAL=${evidence.gates.PARSED_FINAL}`);
    console.log(`CREATE_FINAL=${evidence.gates.CREATE_FINAL}`);
    console.log(`CENSAR_FINAL=${evidence.gates.CENSAR_FINAL}`);
    console.log(`EXCLUIR_FINAL=${evidence.gates.EXCLUIR_FINAL}`);
    console.log(`CUARENTENA_FINAL=${evidence.gates.CUARENTENA_FINAL}`);
    console.log(`SKIP_CONFLICTO_FINAL=${evidence.gates.SKIP_CONFLICTO_FINAL}`);
    console.log(`MAPEO_FILAS=${evidence.gates.MAPEO_FILAS}`);
    console.log(`MAPEO_CAMBIOS=${evidence.gates.MAPEO_CAMBIOS}`);
    console.log(`MAPEO_COLISIONES=${evidence.gates.MAPEO_COLISIONES}`);
    console.log(`MAPEO_INVALIDAS=${evidence.gates.MAPEO_INVALIDAS}`);
    console.log(`MAPEO_D1_FILAS=${evidence.gates.MAPEO_D1_FILAS}`);
    console.log(`MAPEO_D1_CAMBIOS=${evidence.gates.MAPEO_D1_CAMBIOS}`);
    console.log(
        `MAPEO_D5_CHARSET_TOTAL=${evidence.gates.MAPEO_D5_CHARSET_TOTAL}`
    );
    console.log(`MAPEO_D5_CANDIDATAS=${evidence.gates.MAPEO_D5_CANDIDATAS}`);
    console.log(`MAPEO_D5_ELEGIBLES=${evidence.gates.MAPEO_D5_ELEGIBLES}`);
    console.log(`MAPEO_D5_CREADAS=${evidence.gates.MAPEO_D5_CREADAS}`);
    console.log(
        `MAPEO_D5_SKIP_CONFLICTO=${evidence.gates.MAPEO_D5_SKIP_CONFLICTO}`
    );
    console.log(`MAPEO_D5_TEXTO_LIBRE=${evidence.gates.MAPEO_D5_TEXTO_LIBRE}`);
    console.log(
        `MAPEO_D5_SIMBOLO_INVALIDO=${evidence.gates.MAPEO_D5_SIMBOLO_INVALIDO}`
    );
    console.log(
        `MAPEO_D5_OTRO_DEFECTO=${evidence.gates.MAPEO_D5_OTRO_DEFECTO}`
    );
    console.log(
        `MAPEO_D5_FUERA_DE_ALCANCE=${evidence.gates.MAPEO_D5_FUERA_DE_ALCANCE}`
    );
    console.log(
        `MAPEO_D5_COLISIONES=${evidence.gates.MAPEO_D5_COLISIONES}`
    );
    console.log(`MAPEO_D5_IDENTIDAD=${evidence.gates.MAPEO_D5_IDENTIDAD}`);
    console.log(`DRY_RUN=${evidence.gates.DRY_RUN}`);
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const outDir = assertOutDirOutsideRepo(options.outDir);
    const generatedAt = new Date().toISOString();
    const runId = generatedAt.replace(/[:.]/g, '-');
    const workDir = join(outDir, `work-${runId}`);
    mkdirSync(workDir, { recursive: true });

    const evidence = baseEvidence(options, generatedAt);

    try {
        const sourceStat = statSync(options.source);
        evidence.source.bytes = sourceStat.size;
        evidence.source.mtime = sourceStat.mtime.toISOString();
        evidence.source.sha256_antes = sha256Archivo(options.source);

        if (evidence.source.sha256_antes !== SOURCE_SHA256) {
            throw new IngestaError(
                'SOURCE_HASH_MISMATCH',
                'El hash de la fuente no coincide con la fuente congelada.',
                {
                    esperado: SOURCE_SHA256,
                    obtenido: evidence.source.sha256_antes,
                }
            );
        }
        if (sourceStat.size !== SOURCE_BYTES) {
            throw new IngestaError(
                'SOURCE_BYTES_MISMATCH',
                'El tamaño de la fuente no coincide con la fuente congelada.',
                { esperado: SOURCE_BYTES, obtenido: sourceStat.size }
            );
        }

        const xlsxCopia = join(workDir, 'source.xlsx');
        copyFileSync(options.source, xlsxCopia);
        evidence.source.copia_trabajo = xlsxCopia;
        evidence.source.copia_sha256_antes = sha256Archivo(xlsxCopia);
        if (evidence.source.copia_sha256_antes !== SOURCE_SHA256) {
            throw new IngestaError(
                'SOURCE_COPY_HASH_MISMATCH',
                'La copia de trabajo no coincide con la fuente.',
                {
                    esperado: SOURCE_SHA256,
                    obtenido: evidence.source.copia_sha256_antes,
                }
            );
        }

        const { csvPath } = convertirCsv(
            xlsxCopia,
            workDir,
            options.soffice
        );
        evidence.source.copia_sha256_despues = sha256Archivo(xlsxCopia);
        if (evidence.source.copia_sha256_despues !== SOURCE_SHA256) {
            throw new IngestaError(
                'SOURCE_COPY_MUTATED',
                'La copia de trabajo cambió durante la conversión CSV.',
                {
                    antes: evidence.source.copia_sha256_antes,
                    despues: evidence.source.copia_sha256_despues,
                }
            );
        }

        const csv = prepararCsv(csvPath);
        evidence.source.csv = {
            ruta: csvPath,
            sha256: sha256Archivo(csvPath),
            bytes: statSync(csvPath).size,
            filas_csv: csv.filasCsv,
            filas_vacias_finales: csv.filasVaciasFinales,
        };
        evidence.source.hoja = SOURCE_SHEET;
        evidence.source.headers = csv.headerCheck;
        evidence.source.filas_datos = csv.filas.length;
        evidence.source.filas_datos_esperadas = SOURCE_DATA_ROWS;

        if (!csv.headerCheck.pass) {
            throw new IngestaError(
                'SOURCE_SCHEMA_MISMATCH',
                'Los headers no coinciden con los 18 esperados; cero parsing.',
                csv.headerCheck
            );
        }
        evidence.gates.SOURCE_SCHEMA = 'PASS';

        if (csv.filas.length !== SOURCE_DATA_ROWS) {
            throw new IngestaError(
                'DATA_ROWS_MISMATCH',
                `Filas de datos ${csv.filas.length} != ${SOURCE_DATA_ROWS}.`,
                {
                    esperado: SOURCE_DATA_ROWS,
                    obtenido: csv.filas.length,
                }
            );
        }
        evidence.gates.DATA_ROWS = 'PASS';

        const { db } = initFirebaseGuarded({
            projectId: options.project,
            outDir,
        });
        const snapshot = await leerSnapshot(db);
        evidence.snapshot = snapshot.evidencia;

        evidence.source.sha256_despues = sha256Archivo(options.source);
        const sourceIntegra =
            evidence.source.sha256_despues === SOURCE_SHA256 &&
            evidence.source.copia_sha256_antes === SOURCE_SHA256 &&
            evidence.source.copia_sha256_despues === SOURCE_SHA256;
        evidence.gates.SOURCE_HASH = sourceIntegra ? 'PASS' : 'FAIL';
        if (!sourceIntegra) {
            throw new IngestaError(
                'SOURCE_HASH_CHANGED',
                'La fuente o su copia cambiaron durante el dry-run.',
                {
                    antes: evidence.source.sha256_antes,
                    despues: evidence.source.sha256_despues,
                    copia_antes: evidence.source.copia_sha256_antes,
                    copia_despues: evidence.source.copia_sha256_despues,
                }
            );
        }

        const resultado = parseInventarioRows(csv.filas, {
            masters: snapshot.masters,
        });
        const censo = construirCenso(resultado);
        const disposiciones = aplicarDisposiciones(resultado.filas);
        const disposicionesEvidence: DisposicionesEvidence = {
            config: MT5_DISPOSICIONES,
            config_sha256: sha256Json(MT5_DISPOSICIONES),
            resumen: disposiciones.resumen,
            mapeo: disposiciones.mapeo,
            mapeoCuarentena: disposiciones.mapeoCuarentena,
            overrides: disposiciones.overrides,
        };
        const parseHash = sha256Json({
            filas: resultado.filas,
            resumen: resultado.resumen,
        });
        const parsedPlusSkipped =
            resultado.resumen.parsedRows +
                resultado.resumen.skippedRows ===
                resultado.resumen.totalFilas &&
            resultado.resumen.totalFilas === csv.filas.length;

        evidence.gates.PARSED_ROWS_PLUS_SKIPPED_ROWS = parsedPlusSkipped
            ? 'PASS'
            : 'FAIL';
        evidence.disposiciones = disposicionesEvidence;
        evidence.gates.RECONCILIACION =
            disposiciones.resumen.reconciliacion;
        evidence.gates.CREATE_FINAL = disposiciones.resumen.CREATE;
        evidence.gates.CENSAR_FINAL = disposiciones.resumen.CENSAR;
        evidence.gates.EXCLUIR_FINAL = disposiciones.resumen.EXCLUIR;
        evidence.gates.CUARENTENA_FINAL = disposiciones.resumen.CUARENTENA;
        evidence.gates.SKIP_CONFLICTO_FINAL =
            disposiciones.resumen.SKIP_CONFLICTO;
        evidence.gates.MAPEO_FILAS = disposiciones.resumen.mapeo.filas;
        evidence.gates.MAPEO_CAMBIOS =
            disposiciones.resumen.mapeo.conCambios;
        evidence.gates.MAPEO_COLISIONES =
            disposiciones.resumen.mapeo.colisiones;
        evidence.gates.MAPEO_INVALIDAS = disposiciones.mapeo.filter(
            (fila) => fila.motivo === 'D1_MAPEO_INVALIDO'
        ).length;

        const d1 = disposiciones.resumen.mapeo.d1;
        const d5 = disposiciones.resumen.mapeo.d5;
        evidence.gates.MAPEO_D1_FILAS = d1.filas;
        evidence.gates.MAPEO_D1_CAMBIOS = d1.conCambios;
        evidence.gates.MAPEO_D5_CHARSET_TOTAL = d5.charsetTotal;
        evidence.gates.MAPEO_D5_CANDIDATAS = d5.candidatas;
        evidence.gates.MAPEO_D5_ELEGIBLES = d5.elegibles;
        evidence.gates.MAPEO_D5_CREADAS = d5.creadas;
        evidence.gates.MAPEO_D5_SKIP_CONFLICTO = d5.skipConflicto;
        evidence.gates.MAPEO_D5_TEXTO_LIBRE = d5.textoLibre;
        evidence.gates.MAPEO_D5_SIMBOLO_INVALIDO = d5.simboloInvalido;
        evidence.gates.MAPEO_D5_OTRO_DEFECTO = d5.otroDefecto;
        evidence.gates.MAPEO_D5_FUERA_DE_ALCANCE = d5.fueraDeAlcance;
        evidence.gates.MAPEO_D5_COLISIONES = d5.colisiones;
        const d5Identidad =
            d5.candidatas + d5.fueraDeAlcance === d5.charsetTotal &&
            d5.elegibles +
                d5.textoLibre +
                d5.simboloInvalido +
                d5.otroDefecto ===
                d5.candidatas &&
            d5.creadas + d5.skipConflicto === d5.elegibles &&
            d5.colisiones === d5.skipConflicto;
        evidence.gates.MAPEO_D5_IDENTIDAD = d5Identidad ? 'PASS' : 'FAIL';

        evidence.gates.PARSED_FINAL = disposiciones.resumen.parsed;
        evidence.parse = {
            total_filas: resultado.resumen.totalFilas,
            parsed_rows: resultado.resumen.parsedRows,
            skipped_rows: resultado.resumen.skippedRows,
            por_resultado: resultado.resumen.porResultado,
            por_bucket: resultado.resumen.porBucket,
            categorias: resultado.resumen.categorias,
            tokens: resultado.resumen.tokens,
            metricas: resultado.resumen.metricas,
            incidencias: censo.censo.incidencias,
            referencias_duplicadas: censo.censo.referencias.duplicadas,
            cuarentena_filas: censo.cuarentena.length,
            parse_hash: parseHash,
        };

        const gatesOk =
            evidence.gates.SOURCE_HASH === 'PASS' &&
            evidence.gates.SOURCE_SCHEMA === 'PASS' &&
            evidence.gates.DATA_ROWS === 'PASS' &&
            evidence.gates.PARSED_ROWS_PLUS_SKIPPED_ROWS === 'PASS' &&
            evidence.gates.RECONCILIACION === 'PASS' &&
            evidence.gates.MAPEO_D5_IDENTIDAD === 'PASS' &&
            evidence.gates.FIRESTORE_WRITES === 0 &&
            evidence.gates.STORAGE_WRITES === 0 &&
            evidence.gates.DELETIONS === 0 &&
            evidence.gates.WRITE_APIS === 0;
        evidence.status = gatesOk ? 'PASS' : 'FAIL';
        evidence.gates.DRY_RUN = gatesOk ? 'PASS' : 'FAIL';

        escribirEvidencia(outDir, evidence, {
            'snapshot.json': {
                ...snapshot.evidencia,
                conteos_pendientes_repuestos: {
                    ...snapshot.evidencia.conteos_pendientes_repuestos,
                    fk_map: snapshot.fkMap,
                },
            },
            'censo.json': censo.censo,
            'cuarentena.json': censo.cuarentena,
            'tokens-frecuencia.json': censo.tokensFrecuencia,
            'referencias-duplicadas.json': censo.referenciasDuplicadas,
            'disposiciones.json': disposicionesEvidence,
            'mapeo.json': disposicionesEvidence.mapeo,
            'mapeo-cuarentena.json':
                disposicionesEvidence.mapeoCuarentena,
        });

        imprimirGates(evidence);
        console.log(`PARSE_HASH=${parseHash}`);
        console.log(`OUT_DIR=${outDir}`);
        if (!gatesOk) process.exitCode = 1;
    } catch (error) {
        const dryRunError =
            error instanceof IngestaError
                ? error
                : new IngestaError(
                      'DRY_RUN_EXCEPTION',
                      error instanceof Error ? error.message : String(error)
                  );
        evidence.status = 'FAIL';
        evidence.fail_code = dryRunError.code;
        evidence.fail_message = dryRunError.message;
        evidence.fail_detail = dryRunError.detail ?? null;
        evidence.gates.DRY_RUN = 'FAIL';

        try {
            escribirEvidencia(outDir, evidence, {});
        } catch (writeError) {
            console.error(
                'No se pudo escribir la evidencia de fallo:',
                writeError
            );
        }
        console.error(`DRY_RUN=FAIL`);
        console.error(`FAIL_CODE=${dryRunError.code}`);
        console.error(`FAIL_MESSAGE=${dryRunError.message}`);
        process.exitCode = 1;
    }
}

main();
