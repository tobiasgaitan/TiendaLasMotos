/**
 * WEB-PURGA-O30-001 — Purga selectiva de los 21 blobs huérfanos de O-30.
 *
 * Fuente de verdad:
 *   o30-forensics-20261114T172214Z-final/orphans.csv
 *
 * Invariantes:
 *   - Solo los 21 paths hardcodeados.
 *   - Dry-run por defecto.
 *   - --apply exige confirmación interactiva exacta.
 *   - Sin escrituras en Firestore.
 *   - Sin cambios en reglas.
 *   - Sin acceso a IndexedDB.
 *   - Sin patrones abiertos ni listados masivos.
 *
 * Uso dry-run:
 *   npx tsx scripts/purga-o30-storage-orphans.ts \
 *     --report=<EVID>/orphans.csv \
 *     --blobs-report=<EVID>/blobs.csv \
 *     --summary-report=<EVID>/summary.json \
 *     --project=tiendalasmotos \
 *     --bucket=tiendalasmotos.appspot.com
 *
 * Uso apply:
 *   npx tsx scripts/purga-o30-storage-orphans.ts \
 *     --report=<EVID>/orphans.csv \
 *     --blobs-report=<EVID>/blobs.csv \
 *     --summary-report=<EVID>/summary.json \
 *     --project=tiendalasmotos \
 *     --bucket=tiendalasmotos.appspot.com \
 *     --apply
 */
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import Papa from 'papaparse';

const PROJECT_ID = 'tiendalasmotos';
const BUCKET_NAME = 'tiendalasmotos.appspot.com';
const CONFIRMATION_PHRASE = 'PURGAR O-30 21 IRREVERSIBLE';

const ORPHANS_SHA256 =
    '3b06ffcafc3f1e4dffb719916e5c695a0f2c5b8930fa9ac8db26f983905420aa';
const BLOBS_SHA256 =
    '0b6e3f8717ca3368117ef56f2bc005d3fb493e82a76d866c90926ee130de4cdc';
const SUMMARY_SHA256 =
    '071fa0f1ba361215343db0f73e32c7783540cb954e932e4df0ae1ee2ab5f14b3';

const EXPECTED_ORPHANS = 21;
const EXPECTED_LINKED = 5;
const EXPECTED_TOTAL_FILES = 26;
const EXPECTED_TOTAL_BYTES = 2_590_886;
const EXPECTED_ORPHAN_BYTES = 2_304_479;
const EXPECTED_LINKED_BYTES = 286_407;

const WHITELIST: readonly string[] = [
    'inventario_repuestos/conexion@tiendalasmotos.com/24f5b15e-a3d5-481f-b469-edab435033df.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/3ac0ba0c-a626-4828-b786-cc29954c9ba5.webp',
    'inventario_repuestos/conexion@tiendalasmotos.com/416a9fca-002f-4807-8329-5335b4bc5c7b.webp',
    'inventario_repuestos/conexion@tiendalasmotos.com/55036383-01df-40fe-bb56-05c40676454e.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/61f993ee-42ff-4832-a1b0-824e2760383b.webp',
    'inventario_repuestos/conexion@tiendalasmotos.com/6cf38511-9383-47ab-912c-8c3494cbc434.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/6e993ab8-5458-45d8-8130-3b35409d99ba.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/773f05c5-2771-4544-a50c-d3632840fba9.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/a0ca4f89-34f2-44b0-bde8-0bc44178222d.webp',
    'inventario_repuestos/conexion@tiendalasmotos.com/b79611f4-189e-4b14-ad77-72a520c9fa7e.webp',
    'inventario_repuestos/conexion@tiendalasmotos.com/bf866dd5-0293-4b28-9c72-67a08890db60.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/c0a05f1f-28a9-4ae3-8118-0efd2067a14a.webp',
    'inventario_repuestos/conexion@tiendalasmotos.com/c1ccc497-69d0-41dc-a8c9-6bae0e31a18c.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/ca86196b-6a1d-4385-854d-37c16f5fea1a.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/cae87c8a-05ab-495f-b510-c49de4fb828a.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/cb9c3b91-6705-4ecc-8eec-be6a3352ed94.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/d2465954-2738-4934-b307-5afca8e31df3.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/db23ac08-876f-49d4-89dd-bc5b27dc472b.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/e3b9171b-5ac9-45b5-a754-fb5aec5b81d8.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/f7678934-6f2f-4e85-8457-3ed5dbc56589.webp',
    'inventario_repuestos/conexion@tiendalasmotos.com/fc5ad746-a0f3-4ca3-a7dc-339f3d82283a.jpg',
];

const UUID_WHITELIST: readonly string[] = [
    '24f5b15e-a3d5-481f-b469-edab435033df',
    '3ac0ba0c-a626-4828-b786-cc29954c9ba5',
    '416a9fca-002f-4807-8329-5335b4bc5c7b',
    '55036383-01df-40fe-bb56-05c40676454e',
    '61f993ee-42ff-4832-a1b0-824e2760383b',
    '6cf38511-9383-47ab-912c-8c3494cbc434',
    '6e993ab8-5458-45d8-8130-3b35409d99ba',
    '773f05c5-2771-4544-a50c-d3632840fba9',
    'a0ca4f89-34f2-44b0-bde8-0bc44178222d',
    'b79611f4-189e-4b14-ad77-72a520c9fa7e',
    'bf866dd5-0293-4b28-9c72-67a08890db60',
    'c0a05f1f-28a9-4ae3-8118-0efd2067a14a',
    'c1ccc497-69d0-41dc-a8c9-6bae0e31a18c',
    'ca86196b-6a1d-4385-854d-37c16f5fea1a',
    'cae87c8a-05ab-495f-b510-c49de4fb828a',
    'cb9c3b91-6705-4ecc-8eec-be6a3352ed94',
    'd2465954-2738-4934-b307-5afca8e31df3',
    'db23ac08-876f-49d4-89dd-bc5b27dc472b',
    'e3b9171b-5ac9-45b5-a754-fb5aec5b81d8',
    'f7678934-6f2f-4e85-8457-3ed5dbc56589',
    'fc5ad746-a0f3-4ca3-a7dc-339f3d82283a',
];

const LINKED_DO_NOT_TOUCH: readonly string[] = [
    'inventario_repuestos/conexion@tiendalasmotos.com/354c579f-0b55-406d-8508-82d605e73bd2.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/37e442f9-fb11-4375-bf82-2e448c448932.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/5c32b110-3cac-425a-9398-48a29282904d.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/6abb3dac-4a36-4457-a6b8-53c340bfc9b1.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/ec47caed-ddf8-4f04-86b2-2979280ac539.jpg',
];

interface CliOptions {
    report: string;
    blobsReport: string;
    summaryReport: string;
    project: string;
    bucket: string;
    apply: boolean;
    outDir: string | null;
}

interface OrphanRow {
    storage_path: string;
    conteo_id: string;
    asesor_email: string;
    size_bytes: string;
    content_type: string;
    time_created: string;
    updated: string;
    classification: string;
    foto_doc_id: string;
    conteo_doc_id: string;
    match_method: string;
    reason: string;
}

interface BlobRow {
    storage_path: string;
    conteo_id: string;
    size_bytes: string;
    classification: string;
}

interface SummaryReport {
    storage: {
        filesTotal: number;
        canonicalTotal: number;
        nonCanonicalTotal: number;
        bytesTotal: number;
    };
    classification: Record<string, number>;
    firestore: {
        fotos: number;
        conteos: number;
    };
    orphanBytes: {
        strict: number;
        metadataOnly: number;
        countOnly: number;
    };
}

interface BlobMetadata {
    path: string;
    size: number;
    contentType: string;
    timeCreated: string;
    md5Hash: string;
}

interface ApplyResult {
    path: string;
    status: 'DELETED' | 'FAILED';
    detail: string;
}

function printUsage(): void {
    console.log(`
Uso dry-run:
  npx tsx scripts/purga-o30-storage-orphans.ts \\
    --report=<orphans.csv> \\
    --blobs-report=<blobs.csv> \\
    --summary-report=<summary.json> \\
    --project=tiendalasmotos \\
    --bucket=tiendalasmotos.appspot.com

Uso apply:
  ... --apply

Confirmación interactiva requerida:
  ${CONFIRMATION_PHRASE}
`);
}

function parseArgs(argv: string[]): CliOptions {
    let report = '';
    let blobsReport = '';
    let summaryReport = '';
    let project = '';
    let bucket = '';
    let apply = false;
    let dryRun = false;
    let outDir: string | null = null;

    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            printUsage();
            throw new Error('HELP_REQUESTED');
        }
        if (arg === '--apply') {
            apply = true;
            continue;
        }
        if (arg === '--dry-run') {
            dryRun = true;
            continue;
        }
        if (!arg.startsWith('--')) {
            throw new Error(`Argumento no reconocido: ${arg}`);
        }
        const [rawKey, rawValue = ''] = arg.slice(2).split('=', 2);
        const key = rawKey.trim();
        const value = rawValue.trim();

        if (key === 'report') {
            report = value;
            continue;
        }
        if (key === 'blobs-report') {
            blobsReport = value;
            continue;
        }
        if (key === 'summary-report') {
            summaryReport = value;
            continue;
        }
        if (key === 'project') {
            project = value;
            continue;
        }
        if (key === 'bucket') {
            bucket = value;
            continue;
        }
        if (key === 'out') {
            outDir = value;
            continue;
        }
        throw new Error(`Flag no reconocido: --${key}`);
    }

    if (apply && dryRun) {
        throw new Error('--apply y --dry-run son mutuamente excluyentes.');
    }
    if (project !== PROJECT_ID) {
        throw new Error(
            `Proyecto no autorizado: ${project || '(vacío)'}. Solo ${PROJECT_ID}`
        );
    }
    if (bucket !== BUCKET_NAME) {
        throw new Error(
            `Bucket no autorizado: ${bucket || '(vacío)'}. Solo ${BUCKET_NAME}`
        );
    }
    if (!report || !blobsReport || !summaryReport) {
        throw new Error(
            'Faltan --report, --blobs-report o --summary-report.'
        );
    }

    return {
        report,
        blobsReport,
        summaryReport,
        project,
        bucket,
        apply,
        outDir,
    };
}

function sha256File(path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assertHash(path: string, expected: string, label: string): void {
    const actual = sha256File(path);
    if (actual !== expected) {
        throw new Error(
            `${label} hash no coincide.\nEsperado: ${expected}\nActual:   ${actual}`
        );
    }
}

function parseCsv<T>(path: string): T[] {
    const raw = readFileSync(path, 'utf8');
    const parsed = Papa.parse<T>(raw, {
        header: true,
        skipEmptyLines: true,
    });
    if (parsed.errors.length > 0) {
        throw new Error(
            `CSV inválido: ${parsed.errors
                .map((error) => error.message)
                .join('; ')}`
        );
    }
    return parsed.data;
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const value of a) {
        if (!b.has(value)) return false;
    }
    return true;
}

function validateOrphans(rows: OrphanRow[]): void {
    if (rows.length !== EXPECTED_ORPHANS) {
        throw new Error(
            `orphans.csv: se esperaban ${EXPECTED_ORPHANS} filas, hay ${rows.length}.`
        );
    }

    const paths = rows.map((row) => row.storage_path);
    const uuids = rows.map((row) => row.conteo_id);

    if (new Set(paths).size !== EXPECTED_ORPHANS) {
        throw new Error('orphans.csv: paths duplicados.');
    }
    if (new Set(uuids).size !== EXPECTED_ORPHANS) {
        throw new Error('orphans.csv: UUIDs duplicados.');
    }
    if (!setEquals(new Set(paths), new Set(WHITELIST))) {
        throw new Error(
            'orphans.csv: el conjunto de paths no coincide con la whitelist hardcodeada.'
        );
    }
    if (!setEquals(new Set(uuids), new Set(UUID_WHITELIST))) {
        throw new Error(
            'orphans.csv: el conjunto de UUIDs no coincide con la whitelist hardcodeada.'
        );
    }

    let total = 0;
    for (const row of rows) {
        if (row.classification !== 'ORPHAN_NO_FIRESTORE') {
            throw new Error(
                `${row.storage_path}: clasificación inesperada ${row.classification}.`
            );
        }
        if (row.asesor_email !== 'conexion@tiendalasmotos.com') {
            throw new Error(
                `${row.storage_path}: email inesperado ${row.asesor_email}.`
            );
        }
        if (row.foto_doc_id !== '' || row.conteo_doc_id !== '') {
            throw new Error(
                `${row.storage_path}: tiene documento Firestore asociado.`
            );
        }
        if (row.match_method !== 'NONE') {
            throw new Error(
                `${row.storage_path}: match_method inesperado ${row.match_method}.`
            );
        }
        if (row.reason !== 'sin fotos_inventario ni conteo') {
            throw new Error(
                `${row.storage_path}: razón inesperada ${row.reason}.`
            );
        }
        const size = Number(row.size_bytes);
        if (!Number.isInteger(size) || size <= 0) {
            throw new Error(
                `${row.storage_path}: size_bytes inválido ${row.size_bytes}.`
            );
        }
        total += size;

        const extension = row.storage_path.endsWith('.webp') ? 'webp' : 'jpg';
        const expectedPath = `inventario_repuestos/conexion@tiendalasmotos.com/${row.conteo_id}.${extension}`;
        if (row.storage_path !== expectedPath) {
            throw new Error(
                `${row.storage_path}: no coincide con el path canónico esperado ${expectedPath}.`
            );
        }
    }

    if (total !== EXPECTED_ORPHAN_BYTES) {
        throw new Error(
            `orphans.csv: bytes esperados ${EXPECTED_ORPHAN_BYTES}, encontrados ${total}.`
        );
    }
}

function validateBlobs(rows: BlobRow[]): void {
    const linked = rows.filter((row) => row.classification === 'LINKED');
    if (linked.length !== EXPECTED_LINKED) {
        throw new Error(
            `blobs.csv: se esperaban ${EXPECTED_LINKED} LINKED, hay ${linked.length}.`
        );
    }
    const linkedPaths = linked.map((row) => row.storage_path);
    if (!setEquals(new Set(linkedPaths), new Set(LINKED_DO_NOT_TOUCH))) {
        throw new Error(
            'blobs.csv: los LINKED no coinciden con el set intocable hardcodeado.'
        );
    }
    const linkedBytes = linked.reduce(
        (total, row) => total + Number(row.size_bytes),
        0
    );
    if (linkedBytes !== EXPECTED_LINKED_BYTES) {
        throw new Error(
            `blobs.csv: bytes LINKED esperados ${EXPECTED_LINKED_BYTES}, encontrados ${linkedBytes}.`
        );
    }
    const whitelist = new Set(WHITELIST);
    for (const path of linkedPaths) {
        if (whitelist.has(path)) {
            throw new Error(
                `${path}: un LINKED no puede estar en la whitelist de purga.`
            );
        }
    }
}

function validateSummary(summary: SummaryReport): void {
    if (summary.storage.filesTotal !== EXPECTED_TOTAL_FILES) {
        throw new Error(
            `summary.json: filesTotal esperado ${EXPECTED_TOTAL_FILES}, encontrado ${summary.storage.filesTotal}.`
        );
    }
    if (summary.storage.bytesTotal !== EXPECTED_TOTAL_BYTES) {
        throw new Error(
            `summary.json: bytesTotal esperado ${EXPECTED_TOTAL_BYTES}, encontrado ${summary.storage.bytesTotal}.`
        );
    }
    if (summary.classification.LINKED !== EXPECTED_LINKED) {
        throw new Error('summary.json: LINKED inesperado.');
    }
    if (summary.classification.ORPHAN_NO_FIRESTORE !== EXPECTED_ORPHANS) {
        throw new Error('summary.json: ORPHAN_NO_FIRESTORE inesperado.');
    }
    for (const key of [
        'ORPHAN_METADATA_ONLY',
        'ORPHAN_COUNT_ONLY',
        'NON_CANONICAL',
    ]) {
        if (summary.classification[key] !== 0) {
            throw new Error(`summary.json: ${key} debe ser 0.`);
        }
    }
    if (summary.firestore.fotos !== 5 || summary.firestore.conteos !== 5) {
        throw new Error('summary.json: Firestore debe seguir en 5/5.');
    }
    if (summary.orphanBytes.strict !== EXPECTED_ORPHAN_BYTES) {
        throw new Error('summary.json: orphanBytes.strict inesperado.');
    }
}

function resolveConfiguredBucket(): string | null {
    const envBucket =
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
    if (envBucket) return envBucket;

    const configPath = resolve(process.cwd(), 'firebase_config.json');
    if (!existsSync(configPath)) return null;

    try {
        const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as {
            sdkConfig?: { storageBucket?: unknown };
            result?: { sdkConfig?: { storageBucket?: unknown } };
        };
        const candidate =
            parsed.sdkConfig?.storageBucket ??
            parsed.result?.sdkConfig?.storageBucket;
        return typeof candidate === 'string' && candidate.trim()
            ? candidate.trim()
            : null;
    } catch {
        return null;
    }
}

function assertOutDirOutsideRepo(outDir: string): string {
    const resolved = resolve(outDir);
    const repo = resolve(process.cwd());
    if (resolved === repo || resolved.startsWith(`${repo}${sep}`)) {
        throw new Error(
            `--out no puede estar dentro del repositorio: ${resolved}`
        );
    }
    return resolved;
}

async function readMetadata(
    bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>,
    path: string
): Promise<BlobMetadata> {
    const file = bucket.file(path);
    const [metadata] = await file.getMetadata();
    return {
        path,
        size: Number(metadata.size ?? 0),
        contentType: String(metadata.contentType ?? ''),
        timeCreated: String(metadata.timeCreated ?? ''),
        md5Hash: String(metadata.md5Hash ?? ''),
    };
}

async function preflight(
    bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>,
    rows: OrphanRow[]
): Promise<BlobMetadata[]> {
    const metadata: BlobMetadata[] = [];
    for (const row of rows) {
        const item = await readMetadata(bucket, row.storage_path);
        if (item.size !== Number(row.size_bytes)) {
            throw new Error(
                `${row.storage_path}: size ${item.size} != ${row.size_bytes}.`
            );
        }
        if (item.contentType !== row.content_type) {
            throw new Error(
                `${row.storage_path}: content_type ${item.contentType} != ${row.content_type}.`
            );
        }
        if (
            item.timeCreated &&
            row.time_created &&
            new Date(item.timeCreated).toISOString() !==
                new Date(row.time_created).toISOString()
        ) {
            throw new Error(
                `${row.storage_path}: timeCreated no coincide con el reporte.`
            );
        }
        metadata.push(item);
    }

    for (const path of LINKED_DO_NOT_TOUCH) {
        await readMetadata(bucket, path);
    }

    return metadata;
}

function makeBaseManifest(
    mode: 'dry-run' | 'apply',
    options: CliOptions,
    outDir: string,
    startedAt: string,
    finishedAt: string
): Record<string, unknown> {
    return {
        ticket: 'WEB-PURGA-O30-001',
        mode,
        projectId: options.project,
        bucket: options.bucket,
        reportHashes: {
            orphans: ORPHANS_SHA256,
            blobs: BLOBS_SHA256,
            summary: SUMMARY_SHA256,
        },
        whitelistCount: EXPECTED_ORPHANS,
        linkedCount: EXPECTED_LINKED,
        orphanBytes: EXPECTED_ORPHAN_BYTES,
        linkedBytes: EXPECTED_LINKED_BYTES,
        outDir,
        startedAt,
        finishedAt,
    };
}

async function run(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const reportPath = resolve(options.report);
    const blobsPath = resolve(options.blobsReport);
    const summaryPath = resolve(options.summaryReport);

    assertHash(reportPath, ORPHANS_SHA256, 'orphans.csv');
    assertHash(blobsPath, BLOBS_SHA256, 'blobs.csv');
    assertHash(summaryPath, SUMMARY_SHA256, 'summary.json');

    const orphans = parseCsv<OrphanRow>(reportPath);
    const blobs = parseCsv<BlobRow>(blobsPath);
    const summary = JSON.parse(
        readFileSync(summaryPath, 'utf8')
    ) as SummaryReport;

    validateOrphans(orphans);
    validateBlobs(blobs);
    validateSummary(summary);

    const configuredBucket = resolveConfiguredBucket();
    if (configuredBucket && configuredBucket !== BUCKET_NAME) {
        throw new Error(
            `Bucket configurado no autorizado: ${configuredBucket}. Solo ${BUCKET_NAME}`
        );
    }

    const app =
        getApps()[0] ??
        initializeApp({
            projectId: PROJECT_ID,
            storageBucket: BUCKET_NAME,
        });
    if (app.options.projectId && app.options.projectId !== PROJECT_ID) {
        throw new Error(
            `App Firebase inicializada con proyecto no autorizado: ${app.options.projectId}`
        );
    }

    const bucket = getStorage(app).bucket(options.bucket);
    if (bucket.name !== BUCKET_NAME) {
        throw new Error(
            `Bucket resuelto no autorizado: ${bucket.name}. Solo ${BUCKET_NAME}`
        );
    }

    const startedAt = new Date().toISOString();
    const outDir = assertOutDirOutsideRepo(
        options.outDir ?? dirname(reportPath)
    );
    mkdirSync(outDir, { recursive: true });

    console.log(`[purga] bucket=${bucket.name} project=${PROJECT_ID}`);
    console.log(`[purga] orphans.csv=${reportPath}`);
    console.log(`[purga] whitelist=${WHITELIST.length}`);

    const metadata = await preflight(bucket, orphans);
    const metadataByPath: Record<string, BlobMetadata> = {};
    for (const item of metadata) {
        metadataByPath[item.path] = item;
    }

    if (!options.apply) {
        console.log('\n[purga] MODE=DRY-RUN');
        for (let index = 0; index < WHITELIST.length; index += 1) {
            const path = WHITELIST[index];
            const item = metadataByPath[path];
            if (!item) {
                throw new Error(`${path}: sin metadata en preflight.`);
            }
            console.log(
                `${index + 1}\t${path}\t${item.size}\t${item.contentType}\t${item.timeCreated}`
            );
        }
        console.log(`WHITELIST=${WHITELIST.length}`);
        console.log(`LINKED_DO_NOT_TOUCH=${LINKED_DO_NOT_TOUCH.length}`);
        console.log('MISSING=0');
        console.log('DELETIONS=0');

        const finishedAt = new Date().toISOString();
        const manifest = {
            ...makeBaseManifest(
                'dry-run',
                options,
                outDir,
                startedAt,
                finishedAt
            ),
            deletions: 0,
            paths: metadata.map((item) => ({
                path: item.path,
                size: item.size,
                contentType: item.contentType,
                timeCreated: item.timeCreated,
                md5Hash: item.md5Hash,
            })),
        };
        writeFileSync(
            join(outDir, 'purge-dry-run.json'),
            `${JSON.stringify(manifest, null, 2)}\n`,
            'utf8'
        );
        return;
    }

    if (!process.stdin.isTTY) {
        throw new Error(
            '--apply exige una terminal interactiva (TTY). No se ejecutó ningún borrado.'
        );
    }

    console.log('\n[purga] MODE=APPLY');
    console.log(
        `[purga] Se eliminarán ${WHITELIST.length} blobs (${EXPECTED_ORPHAN_BYTES} bytes).`
    );
    console.log(
        '[purga] El bucket no tiene versionado. La eliminación será permanente.'
    );
    console.log('[purga] Escribe exactamente la frase de confirmación:');
    console.log(CONFIRMATION_PHRASE);
    const rl = createInterface({ input, output });
    const answer = await rl.question('> ');
    rl.close();

    if (answer.trim() !== CONFIRMATION_PHRASE) {
        const finishedAt = new Date().toISOString();
        const manifest = {
            ...makeBaseManifest(
                'apply',
                options,
                outDir,
                startedAt,
                finishedAt
            ),
            aborted: true,
            reason: 'confirmación incorrecta',
            deletedCount: 0,
            failedCount: 0,
            remainingWhitelist: WHITELIST.length,
            linkedPresent: LINKED_DO_NOT_TOUCH.length,
            results: [],
        };
        writeFileSync(
            join(outDir, 'purge-apply.json'),
            `${JSON.stringify(manifest, null, 2)}\n`,
            'utf8'
        );
        console.log('DELETIONS=0');
        process.exitCode = 2;
        return;
    }

    const results: ApplyResult[] = [];
    for (const path of WHITELIST) {
        try {
            await bucket.file(path).delete();
            results.push({
                path,
                status: 'DELETED',
                detail: 'ok',
            });
            console.log(`DELETED ${path}`);
        } catch (error) {
            results.push({
                path,
                status: 'FAILED',
                detail:
                    error instanceof Error ? error.message : String(error),
            });
            console.error(`FAILED ${path}`);
            break;
        }
    }

    let remainingWhitelist = 0;
    for (const path of WHITELIST) {
        const [exists] = await bucket.file(path).exists();
        if (exists) remainingWhitelist += 1;
    }

    let linkedPresent = 0;
    for (const path of LINKED_DO_NOT_TOUCH) {
        const [exists] = await bucket.file(path).exists();
        if (exists) linkedPresent += 1;
    }

    const deleted = results.filter((item) => item.status === 'DELETED');
    const failed = results.filter((item) => item.status === 'FAILED');
    const finishedAt = new Date().toISOString();

    const manifest = {
        ...makeBaseManifest(
            'apply',
            options,
            outDir,
            startedAt,
            finishedAt
        ),
        aborted: false,
        deletedCount: deleted.length,
        failedCount: failed.length,
        remainingWhitelist,
        linkedPresent,
        results,
    };
    writeFileSync(
        join(outDir, 'purge-apply.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
    );
    writeFileSync(
        join(outDir, 'deleted-paths.txt'),
        `${deleted.map((item) => item.path).join('\n')}\n`,
        'utf8'
    );

    console.log(`DELETED=${deleted.length}`);
    console.log(`FAILED=${failed.length}`);
    console.log(`REMAINING_WHITELIST=${remainingWhitelist}`);
    console.log(`LINKED_PRESENT=${linkedPresent}`);

    if (
        deleted.length !== EXPECTED_ORPHANS ||
        failed.length !== 0 ||
        remainingWhitelist !== 0 ||
        linkedPresent !== EXPECTED_LINKED
    ) {
        process.exitCode = 1;
    }
}

run().catch((error) => {
    if (error instanceof Error && error.message === 'HELP_REQUESTED') {
        return;
    }
    console.error(
        '[purga] ERROR:',
        error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
});
