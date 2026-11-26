/**
 * WEB-INV-CORPUS-VALIDATION-001 — Validador read-only del corpus
 * `inventario_repuestos`.
 *
 * Objetivo:
 * - Leer los 21.256 documentos con paginación por cursor.
 * - Validar la proyección de entrada contra `crearRepuestoSchema`.
 * - Detectar valores persistidos no canónicos (coerción/trim/uppercase/dedup).
 * - Validar metadatos, `import_key` y claves desconocidas.
 * - Escribir un JSON atómico fuera del repositorio.
 *
 * Este script no tiene camino de escritura en Firestore. No agregar aquí
 * operaciones de escritura, transacciones ni batches.
 */

import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
    FieldPath,
    type Query,
    type QueryDocumentSnapshot,
    type QuerySnapshot,
} from 'firebase-admin/firestore';
import {
    assertOutDirOutsideRepo,
    initFirebaseGuarded,
} from './lib/forensic-utils';
import {
    EXPECTED_CREATE,
    PAYLOAD_KEYS,
    PROJECT_ID,
} from './lib/inv-ingesta-apply-utils';
import { crearRepuestoSchema } from '../src/lib/actions/inventario-repuestos-schemas';

const MODO = 'DRY_RUN' as const;
const COLECCION = 'inventario_repuestos';
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 1000;
const DEFAULT_MAX_SAMPLES = 100;
const MAX_SAMPLES = 1000;
const DEFAULT_RETRIES = 4;
const MAX_RETRIES = 10;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 8000;

type PayloadKey = (typeof PAYLOAD_KEYS)[number];
type Layer =
    | 'schema'
    | 'canonicality'
    | 'metadata'
    | 'contract'
    | 'unknown_field'
    | 'import_key';

const CAMPOS_ENTRADA = [
    'referencia',
    'descripcion',
    'sede_id',
    'fabricante',
    'aplica_a',
    'categoria',
    'unidad_medida',
    'precio',
    'ubicacion',
    'stock',
    'stock_minimo',
    'referencias_alternativas',
    'imagen_url',
] as const satisfies readonly PayloadKey[];

const CAMPOS_CONTRATO_REQUERIDOS = [
    'referencia',
    'descripcion',
    'fabricante',
    'aplica_a',
    'categoria',
    'unidad_medida',
    'precio',
    'stock',
    'stock_minimo',
    'referencias_alternativas',
    'imagen_url',
] as const satisfies readonly PayloadKey[];

const CAMPOS_LEGACY_OPCIONALES = [
    'sede_id',
    'ubicacion',
] as const satisfies readonly PayloadKey[];

const CAMPOS_METADATA_TEXTO = [
    'creado_por',
    'actualizado_por',
] as const satisfies readonly PayloadKey[];

const CAMPOS_METADATA_TIMESTAMP = [
    'creado_en',
    'actualizado_en',
] as const satisfies readonly PayloadKey[];

const PAYLOAD_KEYS_SET = new Set<string>(PAYLOAD_KEYS);
const CAMPOS_LEGACY_SET = new Set<string>(CAMPOS_LEGACY_OPCIONALES);

interface Args {
    project: string;
    outDir: string;
    pageSize: number;
    expectedTotal: number;
    maxSamples: number;
    retries: number;
    noJson: boolean;
    allowInvalid: boolean;
    allowCountMismatch: boolean;
}

interface Fallo {
    docId: string;
    referencia: string;
    layer: Layer;
    path: string;
    code: string;
    message: string;
    receivedType?: string;
}

interface Acumulador {
    totalDocs: number;
    validDocs: number;
    invalidDocs: number;
    schemaInvalidDocs: number;
    canonicalityInvalidDocs: number;
    metadataInvalidDocs: number;
    contractInvalidDocs: number;
    unknownFieldDocs: number;
    importKeyInvalidDocs: number;
    issueCount: number;
    byPath: Record<string, number>;
    samples: Fallo[];
    sampleTruncated: boolean;
    maxSamples: number;
    pages: number;
    retries: number;
}

interface Reporte {
    meta: {
        ticket: string;
        projectId: string;
        collection: string;
        schema: string;
        mode: typeof MODO;
        readOnly: true;
        writes: 0;
        startedAt: string;
        finishedAt: string;
        durationMs: number;
        pageSize: number;
        pages: number;
        expectedTotal: number | null;
        countMatchesExpected: boolean;
        consistentSnapshot: false;
        retries: number;
        nodeVersion: string;
    };
    counts: {
        totalDocs: number;
        validDocs: number;
        invalidDocs: number;
        invalidRate: number;
        schemaInvalidDocs: number;
        canonicalityInvalidDocs: number;
        metadataInvalidDocs: number;
        contractInvalidDocs: number;
        unknownFieldDocs: number;
        importKeyInvalidDocs: number;
    };
    failures: {
        byPath: Array<{ path: string; count: number }>;
        samples: Fallo[];
        sampleLimit: number;
        sampleTruncated: boolean;
    };
}

function usage(): string {
    return [
        'Uso: npx tsx scripts/validate-inventory-corpus.ts [opciones]',
        '',
        'Valida inventario_repuestos en modo DRY_RUN estricto (solo lecturas).',
        '',
        'Opciones:',
        '  --project <id>              Proyecto Firestore (default: tiendalasmotos)',
        '  --out-dir <ruta>            Directorio del JSON, fuera del repo',
        '  --page-size <n>             Documentos por página (default: 500, máx: 1000)',
        '  --expected-total <n>        Total esperado (default: 21256; 0 desactiva)',
        '  --max-samples <n>           Fallos muestreados (default: 100, máx: 1000)',
        '  --retries <n>               Reintentos por lectura (default: 4, máx: 10)',
        '  --no-json                   Solo consola, sin archivo',
        '  --allow-invalid             No fallar si hay documentos inválidos',
        '  --allow-count-mismatch      No fallar si el total no coincide',
        '  --help                      Muestra esta ayuda sin inicializar Firestore',
        '',
        'Este script rechaza --apply, --write y --fix. No modifica Firestore.',
    ].join('\n');
}

function expandirHome(ruta: string): string {
    if (ruta === '~') return homedir();
    if (ruta.startsWith('~/')) return join(homedir(), ruta.slice(2));
    return ruta;
}

function defaultOutDir(): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return join(
        homedir(),
        'tiendalasmotos-reports',
        'inventory-corpus',
        stamp
    );
}

function leerEntero(
    nombre: string,
    valor: string | boolean | undefined,
    porDefecto: number,
    minimo: number,
    maximo: number
): number {
    if (valor === undefined) return porDefecto;
    if (typeof valor !== 'string' || !/^\d+$/.test(valor)) {
        throw new Error(`${nombre} debe ser un entero entre ${minimo} y ${maximo}.`);
    }
    const numero = Number(valor);
    if (!Number.isSafeInteger(numero) || numero < minimo || numero > maximo) {
        throw new Error(`${nombre} debe ser un entero entre ${minimo} y ${maximo}.`);
    }
    return numero;
}

function parseCli(): Args | null {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            project: { type: 'string' },
            'out-dir': { type: 'string' },
            'page-size': { type: 'string' },
            'expected-total': { type: 'string' },
            'max-samples': { type: 'string' },
            retries: { type: 'string' },
            'no-json': { type: 'boolean' },
            'allow-invalid': { type: 'boolean' },
            'allow-count-mismatch': { type: 'boolean' },
            help: { type: 'boolean' },
            apply: { type: 'boolean' },
            write: { type: 'boolean' },
            fix: { type: 'boolean' },
        },
        strict: true,
        allowPositionals: false,
    });

    if (values.help === true) {
        console.log(usage());
        return null;
    }

    if (values.apply === true || values.write === true || values.fix === true) {
        throw new Error(
            'DRY_RUN_ONLY: este validador no admite escrituras, actualizaciones ni borrados.'
        );
    }

    const project =
        typeof values.project === 'string' && values.project.trim()
            ? values.project.trim()
            : PROJECT_ID;

    const outDir =
        typeof values['out-dir'] === 'string' && values['out-dir'].trim()
            ? values['out-dir'].trim()
            : defaultOutDir();

    return {
        project,
        outDir,
        pageSize: leerEntero(
            '--page-size',
            values['page-size'],
            DEFAULT_PAGE_SIZE,
            1,
            MAX_PAGE_SIZE
        ),
        expectedTotal: leerEntero(
            '--expected-total',
            values['expected-total'],
            EXPECTED_CREATE,
            0,
            Number.MAX_SAFE_INTEGER
        ),
        maxSamples: leerEntero(
            '--max-samples',
            values['max-samples'],
            DEFAULT_MAX_SAMPLES,
            1,
            MAX_SAMPLES
        ),
        retries: leerEntero(
            '--retries',
            values.retries,
            DEFAULT_RETRIES,
            0,
            MAX_RETRIES
        ),
        noJson: values['no-json'] === true,
        allowInvalid: values['allow-invalid'] === true,
        allowCountMismatch: values['allow-count-mismatch'] === true,
    };
}

function hasOwn(objeto: Record<string, unknown>, clave: string): boolean {
    return Object.prototype.hasOwnProperty.call(objeto, clave);
}

function valorEnPath(
    objeto: unknown,
    path: ReadonlyArray<string | number>
): unknown {
    let actual: unknown = objeto;
    for (const segmento of path) {
        if (actual === null || actual === undefined) return undefined;
        if (typeof segmento === 'number') {
            if (!Array.isArray(actual)) return undefined;
            actual = actual[segmento];
        } else {
            if (typeof actual !== 'object') return undefined;
            actual = (actual as Record<string, unknown>)[segmento];
        }
    }
    return actual;
}

function tipoRecibido(valor: unknown): string {
    if (valor === null) return 'null';
    if (valor === undefined) return 'undefined';
    if (Array.isArray(valor)) return 'array';
    return typeof valor;
}

function mismoValor(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((item, index) => mismoValor(item, b[index]));
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        try {
            return JSON.stringify(a) === JSON.stringify(b);
        } catch {
            return false;
        }
    }
    return false;
}

function esTimestamp(valor: unknown): boolean {
    if (valor instanceof Date) {
        return !Number.isNaN(valor.getTime());
    }
    if (typeof valor !== 'object' || valor === null) return false;
    const conToDate = valor as { toDate?: unknown };
    if (typeof conToDate.toDate !== 'function') return false;
    try {
        const fecha = (valor as { toDate: () => Date }).toDate();
        return fecha instanceof Date && !Number.isNaN(fecha.getTime());
    } catch {
        return false;
    }
}

function crearAcumulador(maxSamples: number): Acumulador {
    return {
        totalDocs: 0,
        validDocs: 0,
        invalidDocs: 0,
        schemaInvalidDocs: 0,
        canonicalityInvalidDocs: 0,
        metadataInvalidDocs: 0,
        contractInvalidDocs: 0,
        unknownFieldDocs: 0,
        importKeyInvalidDocs: 0,
        issueCount: 0,
        byPath: {},
        samples: [],
        sampleTruncated: false,
        maxSamples,
        pages: 0,
        retries: 0,
    };
}

function validarDocumento(
    doc: QueryDocumentSnapshot,
    acumulador: Acumulador
): void {
    const raw = doc.data() as Record<string, unknown>;
    const referencia =
        typeof raw.referencia === 'string' && raw.referencia.trim()
            ? raw.referencia
            : '(sin referencia)';

    const capas = {
        schema: false,
        canonicality: false,
        metadata: false,
        contract: false,
        unknown_field: false,
        import_key: false,
    };

    let hayIssue = false;

    const registrar = (
        layer: Layer,
        path: string,
        code: string,
        message: string,
        receivedType?: string
    ): void => {
        hayIssue = true;
        capas[layer] = true;
        acumulador.issueCount += 1;
        const ruta = path || '(root)';
        acumulador.byPath[ruta] = (acumulador.byPath[ruta] ?? 0) + 1;
        if (acumulador.samples.length < acumulador.maxSamples) {
            acumulador.samples.push({
                docId: doc.id,
                referencia,
                layer,
                path: ruta,
                code,
                message,
                ...(receivedType ? { receivedType } : {}),
            });
        } else {
            acumulador.sampleTruncated = true;
        }
    };

    const entrada: Record<string, unknown> = {};
    for (const clave of CAMPOS_ENTRADA) {
        if (!hasOwn(raw, clave)) continue;
        // `sede_id` y `ubicacion` son legacy opcionales. El corpus F2 los
        // persiste como '' por default; para el schema de entrada equivalen
        // a ausentes y no deben producir un fallo de `min(1)`.
        if (CAMPOS_LEGACY_SET.has(clave) && raw[clave] === '') continue;
        entrada[clave] = raw[clave];
    }

    const parsed = crearRepuestoSchema.safeParse(entrada);

    if (!parsed.success) {
        for (const issue of parsed.error.issues) {
            const valor = valorEnPath(raw, issue.path);
            registrar(
                'schema',
                issue.path.join('.'),
                issue.code,
                issue.message,
                tipoRecibido(valor)
            );
        }
    } else {
        const normalizado = parsed.data as Record<string, unknown>;
        for (const clave of CAMPOS_ENTRADA) {
            if (!hasOwn(entrada, clave)) continue;
            if (!mismoValor(raw[clave], normalizado[clave])) {
                registrar(
                    'canonicality',
                    clave,
                    'not_canonical',
                    `Valor persistido no canónico para ${clave}; el schema lo normalizaría.`
                );
            }
        }

        if (hasOwn(raw, 'imagen_url') && raw.imagen_url === null) {
            registrar(
                'canonicality',
                'imagen_url',
                'not_canonical',
                'imagen_url null no es la forma persistida canónica; se espera string.'
            );
        }
    }

    for (const clave of CAMPOS_METADATA_TEXTO) {
        if (
            !hasOwn(raw, clave) ||
            typeof raw[clave] !== 'string' ||
            !(raw[clave] as string).trim()
        ) {
            registrar(
                'metadata',
                clave,
                'missing_or_invalid',
                'Campo de auditoría ausente o vacío.'
            );
        }
    }

    for (const clave of CAMPOS_METADATA_TIMESTAMP) {
        if (!hasOwn(raw, clave) || !esTimestamp(raw[clave])) {
            registrar(
                'metadata',
                clave,
                'missing_or_invalid',
                'Timestamp de auditoría ausente o inválido.'
            );
        }
    }

    for (const clave of CAMPOS_CONTRATO_REQUERIDOS) {
        if (!hasOwn(raw, clave)) {
            registrar(
                'contract',
                clave,
                'missing_persisted_field',
                'Campo persistido esperado ausente.'
            );
        }
    }

    for (const clave of Object.keys(raw)) {
        if (!PAYLOAD_KEYS_SET.has(clave)) {
            registrar(
                'unknown_field',
                clave,
                'unknown_key',
                'Campo no declarado en PAYLOAD_KEYS.'
            );
        }
    }

    if (hasOwn(raw, 'import_key')) {
        const importKey = raw.import_key;
        if (
            typeof importKey !== 'string' ||
            !/^[a-f0-9]{64}$/.test(importKey)
        ) {
            registrar(
                'import_key',
                'import_key',
                'invalid_format',
                'import_key debe ser SHA-256 hex de 64 caracteres.'
            );
        }
    }

    acumulador.totalDocs += 1;

    if (hayIssue) {
        acumulador.invalidDocs += 1;
        if (capas.schema) acumulador.schemaInvalidDocs += 1;
        if (capas.canonicality) acumulador.canonicalityInvalidDocs += 1;
        if (capas.metadata) acumulador.metadataInvalidDocs += 1;
        if (capas.contract) acumulador.contractInvalidDocs += 1;
        if (capas.unknown_field) acumulador.unknownFieldDocs += 1;
        if (capas.import_key) acumulador.importKeyInvalidDocs += 1;
    } else {
        acumulador.validDocs += 1;
    }
}

function esErrorReintentable(error: unknown): boolean {
    const codeRaw = (error as { code?: unknown } | null)?.code;
    const code =
        typeof codeRaw === 'string' && /^\d+$/.test(codeRaw)
            ? Number(codeRaw)
            : codeRaw;

    if (typeof code === 'number') {
        return [4, 8, 10, 13, 14].includes(code);
    }

    if (typeof code === 'string') {
        const normalizado = code.toUpperCase();
        if (
            [
                'PERMISSION_DENIED',
                'UNAUTHENTICATED',
                'NOT_FOUND',
                'INVALID_ARGUMENT',
                'FAILED_PRECONDITION',
            ].includes(normalizado)
        ) {
            return false;
        }
        return true;
    }

    return true;
}

async function leerConReintentos(
    query: Query,
    reintentos: number,
    acumulador: Acumulador
): Promise<QuerySnapshot> {
    let ultimoError: unknown;

    for (let intento = 0; intento <= reintentos; intento += 1) {
        try {
            return await query.get();
        } catch (error) {
            ultimoError = error;

            if (intento >= reintentos || !esErrorReintentable(error)) {
                throw error;
            }

            acumulador.retries += 1;
            const espera =
                Math.min(RETRY_BASE_MS * 2 ** intento, RETRY_MAX_MS) +
                Math.floor(Math.random() * 250);
            const mensaje =
                error instanceof Error ? error.message : String(error);

            console.warn(
                `[validate-inventory-corpus] query.get falló (intento ${
                    intento + 1
                }/${reintentos + 1}); reintento en ${espera} ms: ${mensaje}`
            );

            await new Promise((resolve) => setTimeout(resolve, espera));
        }
    }

    throw ultimoError;
}

function construirReporte(
    args: Args,
    acumulador: Acumulador,
    startedAt: string,
    startedMs: number
): Reporte {
    const finishedMs = Date.now();
    const countMatchesExpected =
        args.expectedTotal === 0 ||
        acumulador.totalDocs === args.expectedTotal;

    const byPath = Object.entries(acumulador.byPath)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));

    return {
        meta: {
            ticket: 'WEB-INV-CORPUS-VALIDATION-001',
            projectId: args.project,
            collection: COLECCION,
            schema:
                'crearRepuestoSchema (proyección 13 campos) + canonicalidad + envoltorio documental',
            mode: MODO,
            readOnly: true,
            writes: 0,
            startedAt,
            finishedAt: new Date(finishedMs).toISOString(),
            durationMs: finishedMs - startedMs,
            pageSize: args.pageSize,
            pages: acumulador.pages,
            expectedTotal:
                args.expectedTotal > 0 ? args.expectedTotal : null,
            countMatchesExpected,
            consistentSnapshot: false,
            retries: acumulador.retries,
            nodeVersion: process.version,
        },
        counts: {
            totalDocs: acumulador.totalDocs,
            validDocs: acumulador.validDocs,
            invalidDocs: acumulador.invalidDocs,
            invalidRate:
                acumulador.totalDocs > 0
                    ? acumulador.invalidDocs / acumulador.totalDocs
                    : 0,
            schemaInvalidDocs: acumulador.schemaInvalidDocs,
            canonicalityInvalidDocs: acumulador.canonicalityInvalidDocs,
            metadataInvalidDocs: acumulador.metadataInvalidDocs,
            contractInvalidDocs: acumulador.contractInvalidDocs,
            unknownFieldDocs: acumulador.unknownFieldDocs,
            importKeyInvalidDocs: acumulador.importKeyInvalidDocs,
        },
        failures: {
            byPath,
            samples: acumulador.samples,
            sampleLimit: args.maxSamples,
            sampleTruncated: acumulador.sampleTruncated,
        },
    };
}

function escribirReporte(outDir: string, reporte: Reporte): string {
    const finalPath = join(outDir, 'validation.json');
    const tmpPath = join(outDir, `.validation.${process.pid}.tmp`);
    const serializado = `${JSON.stringify(reporte, null, 2)}\n`;

    writeFileSync(tmpPath, serializado, 'utf8');
    renameSync(tmpPath, finalPath);

    return finalPath;
}

function imprimirResumen(reporte: Reporte, reportPath: string | null): void {
    const { meta, counts, failures } = reporte;
    const porcentaje = (counts.invalidRate * 100).toFixed(2);

    console.log('[validate-inventory-corpus] DRY_RUN · read-only · writes=0');
    console.log(
        `project=${meta.projectId} collection=${meta.collection}`
    );
    console.log(
        `pages=${meta.pages} pageSize=${meta.pageSize} total=${counts.totalDocs} valid=${counts.validDocs} invalid=${counts.invalidDocs} (${porcentaje}%)`
    );
    console.log(
        `schemaInvalid=${counts.schemaInvalidDocs} canonicalityInvalid=${counts.canonicalityInvalidDocs} metadataInvalid=${counts.metadataInvalidDocs} contractInvalid=${counts.contractInvalidDocs} unknownFields=${counts.unknownFieldDocs} importKeyInvalid=${counts.importKeyInvalidDocs}`
    );
    console.log(
        `expected=${meta.expectedTotal ?? '(sin expectativa)'} countMatches=${meta.countMatchesExpected} retries=${meta.retries}`
    );
    console.log(`report=${reportPath ?? '(no-json)'}`);

    if (failures.byPath.length > 0) {
        const top = failures.byPath
            .slice(0, 10)
            .map((item) => `${item.path}=${item.count}`)
            .join(', ');
        console.log(`top paths: ${top}`);
    }

    if (failures.samples.length > 0) {
        console.log('samples:');
        for (const sample of failures.samples.slice(0, 20)) {
            const recibido = sample.receivedType
                ? ` (recibido: ${sample.receivedType})`
                : '';
            console.log(
                `  - ${sample.docId} | ${sample.referencia} | ${sample.layer} | ${sample.path} | ${sample.code} | ${sample.message}${recibido}`
            );
        }
    }

    if (failures.sampleTruncated) {
        console.log(
            `samples truncados: se muestran ${failures.sampleLimit}; el total de issues es ${counts.invalidDocs >= failures.sampleLimit ? 'mayor' : 'acotado'}.`
        );
    }
}

async function main(): Promise<void> {
    const startedMs = Date.now();
    const startedAt = new Date(startedMs).toISOString();

    let args: Args | null;
    try {
        args = parseCli();
    } catch (error) {
        console.error(
            '[validate-inventory-corpus] argumentos inválidos:',
            error instanceof Error ? error.message : error
        );
        console.error(usage());
        process.exitCode = 2;
        return;
    }

    if (!args) return;

    try {
        const outDir = assertOutDirOutsideRepo(expandirHome(args.outDir));
        const { db } = initFirebaseGuarded({
            outDir,
            projectId: args.project,
        });

        const acumulador = crearAcumulador(args.maxSamples);
        const coleccion = db.collection(COLECCION);

        let ultimo: QueryDocumentSnapshot | null = null;

        while (true) {
            let query = coleccion
                .orderBy(FieldPath.documentId())
                .limit(args.pageSize);

            if (ultimo) {
                query = query.startAfter(ultimo);
            }

            const snap = await leerConReintentos(
                query,
                args.retries,
                acumulador
            );

            if (snap.empty) break;

            acumulador.pages += 1;

            for (const doc of snap.docs) {
                validarDocumento(doc, acumulador);
            }

            ultimo = snap.docs[snap.docs.length - 1];

            if (snap.size < args.pageSize) break;
        }

        const reporte = construirReporte(
            args,
            acumulador,
            startedAt,
            startedMs
        );

        let reportPath: string | null = null;
        if (!args.noJson) {
            reportPath = escribirReporte(outDir, reporte);
        }

        imprimirResumen(reporte, reportPath);

        if (acumulador.invalidDocs > 0 && !args.allowInvalid) {
            process.exitCode = 1;
        }

        if (
            !reporte.meta.countMatchesExpected &&
            !args.allowCountMismatch
        ) {
            process.exitCode = 1;
        }
    } catch (error) {
        console.error(
            '[validate-inventory-corpus] FATAL:',
            error instanceof Error ? error.message : error
        );
        process.exitCode = 2;
    }
}

void main();
