/**
 * WEB-FORENSE-O30-001 — Clasificador read-only de blobs huérfanos.
 *
 * Alcance:
 *   - Lista blobs bajo `inventario_repuestos/`.
 *   - Lee `fotos_inventario` y `conteos_pendientes_repuestos`.
 *   - Clasifica y exporta evidencia forense.
 *
 * Invariantes:
 *   - Sin borrado de blobs.
 *   - Sin escrituras en Firestore.
 *   - Sin acceso a IndexedDB.
 *   - Sin descarga de blobs.
 *   - Solo lectura + reporte local en el directorio de evidencias.
 *
 * Uso live:
 *   npx tsx scripts/forense-o30-storage-orphans.ts \
 *     --project=tiendalasmotos \
 *     --prefix=inventario_repuestos/ \
 *     --out=/private/var/folders/.../T/opencode/o30-forensics-<UTC>
 *
 * Uso fixtures:
 *   npx tsx scripts/forense-o30-storage-orphans.ts \
 *     --fixtures=scripts/fixtures/o30-forensics-fixtures.json \
 *     --out=<temp>/o30-fixtures
 *
 * PROHIBIDO importar este archivo desde Server Actions o código de la app.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
    assertOutDirOutsideRepo,
    initFirebaseGuarded,
    writeManifestAndReport,
} from './lib/forensic-utils';

const PROJECT_ID = 'tiendalasmotos';
const PREFIX = 'inventario_repuestos/';
const COLLECTION_FOTOS = 'fotos_inventario';
const COLLECTION_CONTEOS = 'conteos_pendientes_repuestos';
const DEFAULT_OUT_ROOT =
    '/private/var/folders/wv/332j5kzn75d7kjnsj6l_3hhc0000gn/T/opencode';
const MAX_FILES_DEFAULT = 100_000;

const FOTO_FIELDS = [
    'conteo_id',
    'asesor_email',
    'asesor_uid',
    'foto_url',
    'storage_path',
    'nombre_archivo',
    'mime_type',
    'tamano_bytes',
    'creado_en',
] as const;

const CONTEO_FIELDS = [
    'foto_url',
    'asesor_email',
    'asesor_uid',
    'creado_en',
    'estado',
    'inventario_documento_id',
    'sede_id',
] as const;

const DESTRUCTIVE_FLAGS = [
    '--apply',
    '--delete',
    '--purge',
    '--fix',
    '--write',
    '--yes',
] as const;

type BlobClassification =
    | 'LINKED'
    | 'ORPHAN_NO_FIRESTORE'
    | 'ORPHAN_METADATA_ONLY'
    | 'ORPHAN_COUNT_ONLY'
    | 'NON_CANONICAL';

type MatchMethod = 'STORAGE_PATH' | 'DOC_ID' | 'NONE';

interface CliOptions {
    mode: 'live' | 'fixtures';
    projectId: string;
    prefix: string;
    outDir: string | null;
    bucket: string | null;
    fixturesPath: string | null;
    maxFiles: number;
}

interface BlobInput {
    storagePath: string;
    sizeBytes: number;
    contentType: string;
    timeCreated: string;
    updated: string;
    md5Hash: string;
}

interface FotoInput {
    docId: string;
    conteoId: string;
    asesorEmail: string;
    asesorUid: string;
    fotoUrl: string;
    storagePath: string;
    nombreArchivo: string;
    mimeType: string;
    tamanoBytes: number | null;
    creadoEn: string | null;
}

interface ConteoInput {
    docId: string;
    fotoUrl: string;
    fotoPath: string | null;
    asesorEmail: string;
    asesorUid: string;
    creadoEn: string | null;
    estado: string;
    inventarioDocumentoId: string;
    sedeId: string;
}

interface BlobResult extends BlobInput {
    classification: BlobClassification;
    conteoId: string | null;
    asesorEmail: string | null;
    fotoDocId: string | null;
    conteoDocId: string | null;
    matchMethod: MatchMethod;
    reason: string;
    inconsistencies: string[];
}

interface MissingBlobResult {
    source: 'fotos_inventario' | 'conteos_pendientes_repuestos';
    docId: string;
    storagePath: string;
    reason: string;
}

interface InconsistencyResult {
    type:
        | 'NAMING_LOCK_DRIFT'
        | 'PATH_MISMATCH'
        | 'DUPLICATE_REFERENCE'
        | 'METADATA_WITHOUT_COUNT'
        | 'COUNT_WITHOUT_METADATA';
    collection: string;
    docId: string;
    detail: string;
}

interface ClassificationSummary {
    filesTotal: number;
    canonicalTotal: number;
    nonCanonicalTotal: number;
    bytesTotal: number;
    classification: Record<BlobClassification, number>;
    orphanStrictCount: number;
    orphanStrictBytes: number;
    orphanMetadataOnlyCount: number;
    orphanMetadataOnlyBytes: number;
    orphanCountOnlyCount: number;
    orphanCountOnlyBytes: number;
    missingBlobFromFoto: number;
    missingBlobFromConteos: number;
    metadataWithoutCount: number;
    countWithoutMetadata: number;
    namingLockDrift: number;
    pathMismatch: number;
    duplicateReference: number;
}

interface ClassificationResult {
    blobs: BlobResult[];
    missingBlobs: MissingBlobResult[];
    inconsistencies: InconsistencyResult[];
    summary: ClassificationSummary;
}

interface RunContext {
    mode: 'live' | 'fixtures';
    projectId: string;
    bucket: string;
    bucketSource: 'default' | 'explicit' | 'fixture' | 'config';
    defaultBucket: string | null;
    bucketLocation: string;
    bucketStorageClass: string;
    prefix: string;
    startedAt: string;
    finishedAt: string;
    runId: string;
    outDir: string;
    command: string;
}

interface FixtureFile {
    blobs: BlobInput[];
    fotos: FotoInput[];
    conteos: Array<Omit<ConteoInput, 'fotoPath'>>;
    expected?: Partial<ClassificationSummary>;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function toIso(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (typeof value === 'object') {
        const candidate = value as { toDate?: () => Date };
        if (typeof candidate.toDate === 'function') {
            const date = candidate.toDate();
            return date instanceof Date && !Number.isNaN(date.getTime())
                ? date.toISOString()
                : null;
        }
    }
    return null;
}

function parseArgs(argv: string[]): CliOptions {
    let mode: 'live' | 'fixtures' = 'live';
    let projectId = '';
    let prefix = PREFIX;
    let outDir: string | null = null;
    let bucket: string | null = null;
    let fixturesPath: string | null = null;
    let maxFiles = MAX_FILES_DEFAULT;

    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            printUsage();
            throw new Error('HELP_REQUESTED');
        }
        if (DESTRUCTIVE_FLAGS.some((flag) => arg === flag)) {
            throw new Error(
                `Flag destructivo rechazado: ${arg}. Este script es read-only.`
            );
        }
        if (!arg.startsWith('--')) {
            throw new Error(`Argumento no reconocido: ${arg}`);
        }
        const [rawKey, rawValue = ''] = arg.slice(2).split('=', 2);
        const key = rawKey.trim();
        const value = rawValue.trim();

        if (key === 'project') {
            projectId = value;
            continue;
        }
        if (key === 'prefix') {
            prefix = value;
            continue;
        }
        if (key === 'out') {
            outDir = value;
            continue;
        }
        if (key === 'bucket') {
            bucket = value;
            continue;
        }
        if (key === 'fixtures') {
            fixturesPath = value;
            mode = 'fixtures';
            continue;
        }
        if (key === 'max-files') {
            const parsed = Number(value);
            if (!Number.isInteger(parsed) || parsed <= 0) {
                throw new Error(`--max-files inválido: ${value}`);
            }
            maxFiles = parsed;
            continue;
        }
        throw new Error(`Flag no reconocido: --${key}`);
    }

    if (prefix !== PREFIX) {
        throw new Error(
            `Prefijo no autorizado: ${prefix}. Solo ${PREFIX}`
        );
    }
    if (mode === 'live') {
        if (projectId !== PROJECT_ID) {
            throw new Error(
                `Proyecto no autorizado: ${projectId || '(vacío)'}. Solo ${PROJECT_ID}`
            );
        }
        if (fixturesPath) {
            throw new Error('--fixtures es exclusivo del modo fixtures.');
        }
    } else {
        if (!fixturesPath) {
            throw new Error('Modo fixtures exige --fixtures=<archivo>.');
        }
        if (projectId && projectId !== PROJECT_ID) {
            throw new Error(
                `Proyecto no autorizado: ${projectId}. Solo ${PROJECT_ID}`
            );
        }
        projectId = PROJECT_ID;
        if (bucket) {
            throw new Error('--bucket no aplica en modo fixtures.');
        }
    }

    return {
        mode,
        projectId,
        prefix,
        outDir,
        bucket,
        fixturesPath,
        maxFiles,
    };
}

function printUsage(): void {
    console.log(`
Uso live:
  npx tsx scripts/forense-o30-storage-orphans.ts \\
    --project=tiendalasmotos \\
    --prefix=inventario_repuestos/ \\
    --out=<directorio-fuera-del-repo>

Uso fixtures:
  npx tsx scripts/forense-o30-storage-orphans.ts \\
    --fixtures=<archivo.json> \\
    --out=<directorio-fuera-del-repo>

Opcionales:
  --bucket=<nombre>   solo si el bucket default no es el correcto
  --max-files=<n>     aborta si el prefijo excede el límite

Prohibido: --apply --delete --purge --fix --write --yes
`);
}

function makeRunId(date: Date): string {
    return date.toISOString().replace(/[:.]/g, '-');
}

function parseCanonicalPath(
    storagePath: string
): { email: string; conteoId: string; ext: string } | null {
    const match = storagePath.match(
        /^inventario_repuestos\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|jpeg|png|webp)$/i
    );
    if (!match) return null;
    return {
        email: match[1],
        conteoId: match[2].toLowerCase(),
        ext: match[3].toLowerCase(),
    };
}

function extractPathFromFotoUrl(fotoUrl: string): string | null {
    try {
        const url = new URL(fotoUrl);
        if (url.host !== 'firebasestorage.googleapis.com') return null;
        const marker = '/o/';
        const index = url.pathname.indexOf(marker);
        if (index < 0) return null;
        const encoded = url.pathname.slice(index + marker.length);
        if (!encoded) return null;
        return decodeURIComponent(encoded);
    } catch {
        return null;
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

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
    const seen: Record<string, T> = {};
    for (const item of items) {
        const k = key(item);
        if (!(k in seen)) seen[k] = item;
    }
    return Object.values(seen);
}

function pushRecord<T>(
    record: Record<string, T[]>,
    key: string,
    value: T
): void {
    const list = record[key] ?? [];
    list.push(value);
    record[key] = list;
}

function addInconsistency(
    list: InconsistencyResult[],
    seen: Record<string, true>,
    item: InconsistencyResult
): void {
    const key = `${item.type}|${item.collection}|${item.docId}|${item.detail}`;
    if (seen[key]) return;
    seen[key] = true;
    list.push(item);
}

function classify(input: {
    blobs: BlobInput[];
    fotos: FotoInput[];
    conteos: ConteoInput[];
}): ClassificationResult {
    const fotosByPath: Record<string, FotoInput[]> = {};
    const fotosByDocId: Record<string, FotoInput[]> = {};
    const conteosByDocId: Record<string, ConteoInput[]> = {};
    const conteosByPath: Record<string, ConteoInput[]> = {};
    const blobPaths = new Set(input.blobs.map((blob) => blob.storagePath));

    for (const foto of input.fotos) {
        if (foto.storagePath) {
            pushRecord(fotosByPath, foto.storagePath, foto);
        }
        pushRecord(fotosByDocId, foto.docId, foto);
    }

    for (const conteo of input.conteos) {
        pushRecord(conteosByDocId, conteo.docId, conteo);
        if (conteo.fotoPath) {
            pushRecord(conteosByPath, conteo.fotoPath, conteo);
        }
    }

    const inconsistencies: InconsistencyResult[] = [];
    const inconsistencySeen: Record<string, true> = {};

    for (const foto of input.fotos) {
        if (foto.docId !== foto.conteoId) {
            addInconsistency(inconsistencies, inconsistencySeen, {
                type: 'NAMING_LOCK_DRIFT',
                collection: COLLECTION_FOTOS,
                docId: foto.docId,
                detail: `docId != conteo_id (${foto.conteoId || '(vacío)'})`,
            });
        }

        const countByDoc = conteosByDocId[foto.conteoId] ?? [];
        const countByPath = conteosByPath[foto.storagePath] ?? [];
        const counts = uniqueBy(
            [...countByDoc, ...countByPath],
            (item) => item.docId
        );

        if (counts.length === 0) {
            addInconsistency(inconsistencies, inconsistencySeen, {
                type: 'METADATA_WITHOUT_COUNT',
                collection: COLLECTION_FOTOS,
                docId: foto.docId,
                detail: `sin conteo para ${foto.conteoId || '(vacío)'}`,
            });
        } else if (
            foto.storagePath &&
            counts.some(
                (count) =>
                    count.fotoPath !== null &&
                    count.fotoPath !== foto.storagePath
            )
        ) {
            addInconsistency(inconsistencies, inconsistencySeen, {
                type: 'PATH_MISMATCH',
                collection: COLLECTION_FOTOS,
                docId: foto.docId,
                detail: `storage_path=${foto.storagePath} vs foto_url_path=${counts
                    .map((count) => count.fotoPath ?? '(null)')
                    .join(',')}`,
            });
        }
    }

    for (const conteo of input.conteos) {
        const fotoByDoc = fotosByDocId[conteo.docId] ?? [];
        const fotoByPath = conteo.fotoPath
            ? fotosByPath[conteo.fotoPath] ?? []
            : [];
        const fotos = uniqueBy(
            [...fotoByDoc, ...fotoByPath],
            (item) => item.docId
        );
        if (fotos.length === 0) {
            addInconsistency(inconsistencies, inconsistencySeen, {
                type: 'COUNT_WITHOUT_METADATA',
                collection: COLLECTION_CONTEOS,
                docId: conteo.docId,
                detail: `sin fotos_inventario para ${conteo.fotoPath ?? '(sin foto_url)'}`,
            });
        }
    }

    for (const [path, list] of Object.entries(fotosByPath)) {
        if (list.length > 1) {
            addInconsistency(inconsistencies, inconsistencySeen, {
                type: 'DUPLICATE_REFERENCE',
                collection: COLLECTION_FOTOS,
                docId: path,
                detail: `${list.length} documentos comparten storage_path`,
            });
        }
    }
    for (const [path, list] of Object.entries(conteosByPath)) {
        if (list.length > 1) {
            addInconsistency(inconsistencies, inconsistencySeen, {
                type: 'DUPLICATE_REFERENCE',
                collection: COLLECTION_CONTEOS,
                docId: path,
                detail: `${list.length} documentos comparten foto_url_path`,
            });
        }
    }

    const classification: Record<BlobClassification, number> = {
        LINKED: 0,
        ORPHAN_NO_FIRESTORE: 0,
        ORPHAN_METADATA_ONLY: 0,
        ORPHAN_COUNT_ONLY: 0,
        NON_CANONICAL: 0,
    };

    let orphanStrictCount = 0;
    let orphanStrictBytes = 0;
    let orphanMetadataOnlyCount = 0;
    let orphanMetadataOnlyBytes = 0;
    let orphanCountOnlyCount = 0;
    let orphanCountOnlyBytes = 0;

    const blobs: BlobResult[] = input.blobs.map((blob) => {
        const parsed = parseCanonicalPath(blob.storagePath);
        if (!parsed) {
            classification.NON_CANONICAL += 1;
            return {
                ...blob,
                classification: 'NON_CANONICAL',
                conteoId: null,
                asesorEmail: null,
                fotoDocId: null,
                conteoDocId: null,
                matchMethod: 'NONE',
                reason: 'path fuera del patrón canónico',
                inconsistencies: [],
            };
        }

        const fotoByPath = fotosByPath[blob.storagePath] ?? [];
        const fotoByDoc = fotosByDocId[parsed.conteoId] ?? [];
        const fotos = uniqueBy(
            [...fotoByPath, ...fotoByDoc],
            (item) => item.docId
        );

        const conteoByDoc = conteosByDocId[parsed.conteoId] ?? [];
        const conteoByPath = conteosByPath[blob.storagePath] ?? [];
        const conteos = uniqueBy(
            [...conteoByDoc, ...conteoByPath],
            (item) => item.docId
        );

        const foto = fotos[0] ?? null;
        const conteo = conteos[0] ?? null;
        let category: BlobClassification;
        let reason: string;

        if (foto && conteo) {
            category = 'LINKED';
            reason = 'foto + conteo';
            classification.LINKED += 1;
        } else if (foto && !conteo) {
            category = 'ORPHAN_METADATA_ONLY';
            reason = 'foto sin conteo';
            classification.ORPHAN_METADATA_ONLY += 1;
            orphanMetadataOnlyCount += 1;
            orphanMetadataOnlyBytes += blob.sizeBytes;
        } else if (!foto && conteo) {
            category = 'ORPHAN_COUNT_ONLY';
            reason = 'conteo sin foto';
            classification.ORPHAN_COUNT_ONLY += 1;
            orphanCountOnlyCount += 1;
            orphanCountOnlyBytes += blob.sizeBytes;
        } else {
            category = 'ORPHAN_NO_FIRESTORE';
            reason = 'sin fotos_inventario ni conteo';
            classification.ORPHAN_NO_FIRESTORE += 1;
            orphanStrictCount += 1;
            orphanStrictBytes += blob.sizeBytes;
        }

        const matchMethod: MatchMethod =
            fotoByPath.length > 0 || conteoByPath.length > 0
                ? 'STORAGE_PATH'
                : fotos.length > 0 || conteos.length > 0
                  ? 'DOC_ID'
                  : 'NONE';

        const blobInconsistencies: string[] = [];
        if (fotos.length > 1 || conteos.length > 1) {
            blobInconsistencies.push('DUPLICATE_REFERENCE');
        }
        if (
            foto &&
            conteo &&
            conteo.fotoPath !== null &&
            foto.storagePath !== conteo.fotoPath
        ) {
            blobInconsistencies.push('PATH_MISMATCH');
        }

        return {
            ...blob,
            classification: category,
            conteoId: parsed.conteoId,
            asesorEmail:
                foto?.asesorEmail ||
                conteo?.asesorEmail ||
                parsed.email ||
                null,
            fotoDocId: foto?.docId ?? null,
            conteoDocId: conteo?.docId ?? null,
            matchMethod,
            reason,
            inconsistencies: blobInconsistencies,
        };
    });

    const missingBlobs: MissingBlobResult[] = [];
    for (const foto of input.fotos) {
        if (foto.storagePath && !blobPaths.has(foto.storagePath)) {
            missingBlobs.push({
                source: COLLECTION_FOTOS,
                docId: foto.docId,
                storagePath: foto.storagePath,
                reason: 'fotos_inventario referencia un blob ausente',
            });
        }
    }
    for (const conteo of input.conteos) {
        if (conteo.fotoPath && !blobPaths.has(conteo.fotoPath)) {
            missingBlobs.push({
                source: COLLECTION_CONTEOS,
                docId: conteo.docId,
                storagePath: conteo.fotoPath,
                reason: 'conteo referencia un blob ausente',
            });
        }
    }

    const countType = (type: InconsistencyResult['type']): number =>
        inconsistencies.filter((item) => item.type === type).length;

    const summary: ClassificationSummary = {
        filesTotal: input.blobs.length,
        canonicalTotal:
            classification.LINKED +
            classification.ORPHAN_NO_FIRESTORE +
            classification.ORPHAN_METADATA_ONLY +
            classification.ORPHAN_COUNT_ONLY,
        nonCanonicalTotal: classification.NON_CANONICAL,
        bytesTotal: input.blobs.reduce(
            (total, blob) => total + blob.sizeBytes,
            0
        ),
        classification,
        orphanStrictCount,
        orphanStrictBytes,
        orphanMetadataOnlyCount,
        orphanMetadataOnlyBytes,
        orphanCountOnlyCount,
        orphanCountOnlyBytes,
        missingBlobFromFoto: missingBlobs.filter(
            (item) => item.source === COLLECTION_FOTOS
        ).length,
        missingBlobFromConteos: missingBlobs.filter(
            (item) => item.source === COLLECTION_CONTEOS
        ).length,
        metadataWithoutCount: countType('METADATA_WITHOUT_COUNT'),
        countWithoutMetadata: countType('COUNT_WITHOUT_METADATA'),
        namingLockDrift: countType('NAMING_LOCK_DRIFT'),
        pathMismatch: countType('PATH_MISMATCH'),
        duplicateReference: countType('DUPLICATE_REFERENCE'),
    };

    return {
        blobs: blobs.sort((a, b) =>
            a.storagePath.localeCompare(b.storagePath)
        ),
        missingBlobs: missingBlobs.sort((a, b) =>
            `${a.source}|${a.docId}`.localeCompare(`${b.source}|${b.docId}`)
        ),
        inconsistencies: inconsistencies.sort((a, b) =>
            `${a.type}|${a.collection}|${a.docId}`.localeCompare(
                `${b.type}|${b.collection}|${b.docId}`
            )
        ),
        summary,
    };
}

function csvEscape(value: unknown): string {
    const raw = value === null || value === undefined ? '' : String(value);
    return `"${raw.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
    return [
        headers.map(csvEscape).join(','),
        ...rows.map((row) => row.map(csvEscape).join(',')),
    ].join('\n');
}

function markdownTable(headers: string[], rows: Array<Array<unknown>>): string {
    const escape = (value: unknown): string =>
        String(value ?? '')
            .replace(/\|/g, '\\|')
            .replace(/\n/g, ' ');
    return [
        `| ${headers.map(escape).join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
    ].join('\n');
}

function buildReport(
    context: RunContext,
    result: ClassificationResult,
    firestoreCounts: { fotos: number; conteos: number }
): string {
    const strict = result.blobs.filter(
        (blob) => blob.classification === 'ORPHAN_NO_FIRESTORE'
    );
    const metadataOnly = result.blobs.filter(
        (blob) => blob.classification === 'ORPHAN_METADATA_ONLY'
    );
    const countOnly = result.blobs.filter(
        (blob) => blob.classification === 'ORPHAN_COUNT_ONLY'
    );
    const nonCanonical = result.blobs.filter(
        (blob) => blob.classification === 'NON_CANONICAL'
    );

    const orphanRows = [...strict, ...metadataOnly, ...countOnly].map(
        (blob) => [
            blob.storagePath,
            blob.conteoId ?? '',
            blob.asesorEmail ?? '',
            blob.sizeBytes,
            blob.timeCreated,
            blob.classification,
            blob.reason,
        ]
    );

    const missingRows = result.missingBlobs.map((item) => [
        item.source,
        item.docId,
        item.storagePath,
        item.reason,
    ]);

    const inconsistencyRows = result.inconsistencies.map((item) => [
        item.type,
        item.collection,
        item.docId,
        item.detail,
    ]);

    const lines: string[] = [
        '# O-30 — Forense read-only de blobs huérfanos',
        '',
        `**Ticket:** WEB-FORENSE-O30-001`,
        `**Modo:** ${context.mode}`,
        `**Proyecto:** ${context.projectId}`,
        `**Bucket:** \`${context.bucket}\``,
        `**Fuente del bucket:** ${context.bucketSource}`,
        `**Bucket default:** ${context.defaultBucket ?? '(no aplica)'}`,
        `**Ubicación:** ${context.bucketLocation || '(no disponible)'}`,
        `**Storage class:** ${context.bucketStorageClass || '(no disponible)'}`,
        `**Prefijo:** \`${context.prefix}\``,
        `**Inicio:** ${context.startedAt}`,
        `**Fin:** ${context.finishedAt}`,
        '',
        '## Whitelist',
        '',
        `- Proyecto: \`${PROJECT_ID}\``,
        `- Bucket: el resuelto por Admin SDK, contrastado con la lista del proyecto`,
        `- Prefijo: \`${PREFIX}\``,
        `- Colecciones: \`${COLLECTION_FOTOS}\`, \`${COLLECTION_CONTEOS}\``,
        `- Sin escrituras en Firestore, Storage ni IndexedDB`,
        `- Sin descarga de blobs`,
        '',
        '## Totales',
        '',
        markdownTable(
            ['Métrica', 'Valor'],
            [
                ['Blobs listados', result.summary.filesTotal],
                ['Blobs canónicos', result.summary.canonicalTotal],
                ['Blobs no canónicos', result.summary.nonCanonicalTotal],
                ['Bytes totales', result.summary.bytesTotal],
                ['Documentos fotos_inventario', firestoreCounts.fotos],
                ['Documentos conteos_pendientes_repuestos', firestoreCounts.conteos],
                ['Huérfanos estrictos', result.summary.orphanStrictCount],
                ['Bytes huérfanos estrictos', result.summary.orphanStrictBytes],
                ['Metadata-only', result.summary.orphanMetadataOnlyCount],
                ['Bytes metadata-only', result.summary.orphanMetadataOnlyBytes],
                ['Count-only', result.summary.orphanCountOnlyCount],
                ['Bytes count-only', result.summary.orphanCountOnlyBytes],
                ['Bloques faltantes desde fotos', result.summary.missingBlobFromFoto],
                ['Bloques faltantes desde conteos', result.summary.missingBlobFromConteos],
                ['Metadata sin conteo', result.summary.metadataWithoutCount],
                ['Conteo sin metadata', result.summary.countWithoutMetadata],
                ['NAMING_LOCK_DRIFT', result.summary.namingLockDrift],
                ['PATH_MISMATCH', result.summary.pathMismatch],
                ['DUPLICATE_REFERENCE', result.summary.duplicateReference],
            ]
        ),
        '',
        '## Clasificación de blobs',
        '',
        markdownTable(
            ['Clase', 'Cantidad'],
            Object.entries(result.summary.classification).map(
                ([key, value]) => [key, value]
            )
        ),
        '',
        '## Huérfanos estrictos',
        '',
        strict.length
            ? markdownTable(
                  [
                      'storage_path',
                      'conteo_id',
                      'asesor_email',
                      'bytes',
                      'creado',
                      'razón',
                  ],
                  orphanRows
                      .slice(0, strict.length)
                      .map((row) => row.filter((_, index) => index !== 5))
              )
            : 'Sin huérfanos estrictos.',
        '',
        '## Metadata-only',
        '',
        metadataOnly.length
            ? markdownTable(
                  [
                      'storage_path',
                      'conteo_id',
                      'asesor_email',
                      'bytes',
                      'creado',
                      'razón',
                  ],
                  metadataOnly.map((blob) => [
                      blob.storagePath,
                      blob.conteoId ?? '',
                      blob.asesorEmail ?? '',
                      blob.sizeBytes,
                      blob.timeCreated,
                      blob.reason,
                  ])
              )
            : 'Sin blobs metadata-only.',
        '',
        '## Count-only',
        '',
        countOnly.length
            ? markdownTable(
                  [
                      'storage_path',
                      'conteo_id',
                      'asesor_email',
                      'bytes',
                      'creado',
                      'razón',
                  ],
                  countOnly.map((blob) => [
                      blob.storagePath,
                      blob.conteoId ?? '',
                      blob.asesorEmail ?? '',
                      blob.sizeBytes,
                      blob.timeCreated,
                      blob.reason,
                  ])
              )
            : 'Sin blobs count-only.',
        '',
        '## Blobs no canónicos',
        '',
        nonCanonical.length
            ? markdownTable(
                  ['storage_path', 'bytes', 'creado', 'razón'],
                  nonCanonical.map((blob) => [
                      blob.storagePath,
                      blob.sizeBytes,
                      blob.timeCreated,
                      blob.reason,
                  ])
              )
            : 'Sin blobs no canónicos.',
        '',
        '## Referencias sin blob',
        '',
        missingRows.length
            ? markdownTable(
                  ['origen', 'docId', 'storage_path', 'razón'],
                  missingRows
              )
            : 'Sin referencias sin blob.',
        '',
        '## Inconsistencias Firestore',
        '',
        inconsistencyRows.length
            ? markdownTable(
                  ['tipo', 'colección', 'docId', 'detalle'],
                  inconsistencyRows
              )
            : 'Sin inconsistencias Firestore.',
        '',
        '## Atestación de no escritura',
        '',
        '- Sin borrado de blobs.',
        '- Sin escrituras en Firestore.',
        '- Sin acceso a IndexedDB.',
        '- Sin descarga de blobs.',
        '- Sin tokens de descarga en este reporte.',
        '- Resultados: snapshot de la ejecución; no son una remediación.',
        '',
        '## Artefactos',
        '',
        '- `summary.json` — resumen máquina-legible.',
        '- `orphans.json` — huérfanos separados por categoría.',
        '- `orphans.csv` — lista completa de huérfanos.',
        '- `blobs.csv` — todos los blobs clasificados.',
        '- `missing-blobs.csv` — referencias sin blob.',
        '- `inconsistencies.csv` — inconsistencias Firestore.',
        '- `manifest.json` — contexto de ejecución y whitelist.',
        '',
    ];

    return lines.join('\n');
}

function writeReports(
    context: RunContext,
    result: ClassificationResult,
    firestoreCounts: { fotos: number; conteos: number }
): void {
    const summary = {
        runId: context.runId,
        mode: context.mode,
        projectId: context.projectId,
        bucket: context.bucket,
        bucketSource: context.bucketSource,
        defaultBucket: context.defaultBucket,
        bucketLocation: context.bucketLocation,
        bucketStorageClass: context.bucketStorageClass,
        prefix: context.prefix,
        startedAt: context.startedAt,
        finishedAt: context.finishedAt,
        firestore: firestoreCounts,
        storage: {
            filesTotal: result.summary.filesTotal,
            canonicalTotal: result.summary.canonicalTotal,
            nonCanonicalTotal: result.summary.nonCanonicalTotal,
            bytesTotal: result.summary.bytesTotal,
        },
        classification: result.summary.classification,
        orphanBytes: {
            strict: result.summary.orphanStrictBytes,
            metadataOnly: result.summary.orphanMetadataOnlyBytes,
            countOnly: result.summary.orphanCountOnlyBytes,
        },
        missingBlobs: {
            fromFoto: result.summary.missingBlobFromFoto,
            fromConteos: result.summary.missingBlobFromConteos,
        },
        inconsistencies: {
            metadataWithoutCount: result.summary.metadataWithoutCount,
            countWithoutMetadata: result.summary.countWithoutMetadata,
            namingLockDrift: result.summary.namingLockDrift,
            pathMismatch: result.summary.pathMismatch,
            duplicateReference: result.summary.duplicateReference,
        },
        whitelist: {
            projectId: PROJECT_ID,
            bucket: 'resolved-at-runtime',
            prefix: PREFIX,
            collections: [COLLECTION_FOTOS, COLLECTION_CONTEOS],
            writes: 'none',
            downloads: 'none',
        },
    };

    const orphans = {
        strict: result.blobs.filter(
            (blob) => blob.classification === 'ORPHAN_NO_FIRESTORE'
        ),
        metadataOnly: result.blobs.filter(
            (blob) => blob.classification === 'ORPHAN_METADATA_ONLY'
        ),
        countOnly: result.blobs.filter(
            (blob) => blob.classification === 'ORPHAN_COUNT_ONLY'
        ),
        nonCanonical: result.blobs.filter(
            (blob) => blob.classification === 'NON_CANONICAL'
        ),
    };

    const orphanRows = [
        ...orphans.strict,
        ...orphans.metadataOnly,
        ...orphans.countOnly,
    ];

    const orphansCsv = toCsv(
        [
            'storage_path',
            'conteo_id',
            'asesor_email',
            'size_bytes',
            'content_type',
            'time_created',
            'updated',
            'classification',
            'foto_doc_id',
            'conteo_doc_id',
            'match_method',
            'reason',
        ],
        orphanRows.map((blob) => [
            blob.storagePath,
            blob.conteoId,
            blob.asesorEmail,
            blob.sizeBytes,
            blob.contentType,
            blob.timeCreated,
            blob.updated,
            blob.classification,
            blob.fotoDocId,
            blob.conteoDocId,
            blob.matchMethod,
            blob.reason,
        ])
    );

    const blobsCsv = toCsv(
        [
            'storage_path',
            'conteo_id',
            'asesor_email',
            'size_bytes',
            'content_type',
            'time_created',
            'updated',
            'classification',
            'foto_doc_id',
            'conteo_doc_id',
            'match_method',
            'reason',
        ],
        result.blobs.map((blob) => [
            blob.storagePath,
            blob.conteoId,
            blob.asesorEmail,
            blob.sizeBytes,
            blob.contentType,
            blob.timeCreated,
            blob.updated,
            blob.classification,
            blob.fotoDocId,
            blob.conteoDocId,
            blob.matchMethod,
            blob.reason,
        ])
    );

    const missingCsv = toCsv(
        ['source', 'doc_id', 'storage_path', 'reason'],
        result.missingBlobs.map((item) => [
            item.source,
            item.docId,
            item.storagePath,
            item.reason,
        ])
    );

    const inconsistenciesCsv = toCsv(
        ['type', 'collection', 'doc_id', 'detail'],
        result.inconsistencies.map((item) => [
            item.type,
            item.collection,
            item.docId,
            item.detail,
        ])
    );

    writeManifestAndReport(
        context.outDir,
        'summary.json',
        summary,
        buildReport(context, result, firestoreCounts),
        {
            'orphans.json': orphans,
            'orphans.csv': orphansCsv,
            'blobs.csv': blobsCsv,
            'missing-blobs.csv': missingCsv,
            'inconsistencies.csv': inconsistenciesCsv,
        },
        {
            ticket: 'WEB-FORENSE-O30-001',
            script: 'scripts/forense-o30-storage-orphans.ts',
            mode: context.mode,
            command: context.command,
            projectId: context.projectId,
            bucket: context.bucket,
            bucketSource: context.bucketSource,
            defaultBucket: context.defaultBucket,
            prefix: context.prefix,
            whitelist: summary.whitelist,
            startedAt: context.startedAt,
            finishedAt: context.finishedAt,
            readOnly: true,
        }
    );
}

function loadFixtures(path: string): FixtureFile {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as FixtureFile;
    if (!Array.isArray(parsed.blobs)) {
        throw new Error('Fixture inválido: blobs debe ser array.');
    }
    if (!Array.isArray(parsed.fotos)) {
        throw new Error('Fixture inválido: fotos debe ser array.');
    }
    if (!Array.isArray(parsed.conteos)) {
        throw new Error('Fixture inválido: conteos debe ser array.');
    }
    return parsed;
}

function assertExpected(
    summary: ClassificationSummary,
    expected: Partial<ClassificationSummary> | undefined
): void {
    if (!expected) return;
    const mismatches: string[] = [];
    const compare = (key: keyof ClassificationSummary): void => {
        if (expected[key] === undefined) return;
        const actual = summary[key];
        if (JSON.stringify(actual) !== JSON.stringify(expected[key])) {
            mismatches.push(
                `${key}: esperado=${JSON.stringify(expected[key])} actual=${JSON.stringify(actual)}`
            );
        }
    };
    (
        [
            'filesTotal',
            'canonicalTotal',
            'nonCanonicalTotal',
            'bytesTotal',
            'classification',
            'orphanStrictCount',
            'orphanStrictBytes',
            'orphanMetadataOnlyCount',
            'orphanMetadataOnlyBytes',
            'orphanCountOnlyCount',
            'orphanCountOnlyBytes',
            'missingBlobFromFoto',
            'missingBlobFromConteos',
            'metadataWithoutCount',
            'countWithoutMetadata',
            'namingLockDrift',
            'pathMismatch',
            'duplicateReference',
        ] as const
    ).forEach(compare);

    if (mismatches.length > 0) {
        throw new Error(
            `Fixtures no coinciden:\n${mismatches.join('\n')}`
        );
    }
}

function makeContext(
    mode: 'live' | 'fixtures',
    projectId: string,
    bucket: string,
    bucketSource: 'default' | 'explicit' | 'fixture' | 'config',
    defaultBucket: string | null,
    bucketLocation: string,
    bucketStorageClass: string,
    outDir: string,
    startedAt: Date,
    finishedAt: Date
): RunContext {
    return {
        mode,
        projectId,
        bucket,
        bucketSource,
        defaultBucket,
        bucketLocation,
        bucketStorageClass,
        prefix: PREFIX,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        runId: makeRunId(startedAt),
        outDir,
        command: process.argv.join(' '),
    };
}

async function runFixtures(options: CliOptions): Promise<void> {
    const startedAt = new Date();
    const fixture = loadFixtures(options.fixturesPath as string);
    const conteos: ConteoInput[] = fixture.conteos.map((conteo) => ({
        ...conteo,
        fotoPath: extractPathFromFotoUrl(conteo.fotoUrl),
    }));
    const result = classify({
        blobs: fixture.blobs,
        fotos: fixture.fotos,
        conteos,
    });
    assertExpected(result.summary, fixture.expected);

    const outDir = assertOutDirOutsideRepo(
        options.outDir ??
            join(DEFAULT_OUT_ROOT, `o30-fixtures-${makeRunId(startedAt)}`)
    );
    const finishedAt = new Date();
    const context = makeContext(
        'fixtures',
        PROJECT_ID,
        'fixture-bucket',
        'fixture',
        null,
        'fixture',
        'fixture',
        outDir,
        startedAt,
        finishedAt
    );
    writeReports(context, result, {
        fotos: fixture.fotos.length,
        conteos: fixture.conteos.length,
    });
    printResult(context, result);
}

async function ejecutarForenseO30(options: CliOptions): Promise<void> {
    const startedAt = new Date();
    const configuredBucket = resolveConfiguredBucket();
    const outDirCandidate =
        options.outDir ??
        join(DEFAULT_OUT_ROOT, `o30-forensics-${makeRunId(startedAt)}`);
    const { db, storage } = initFirebaseGuarded({
        outDir: outDirCandidate,
        projectId: PROJECT_ID,
    });

    let defaultBucket: string | null = null;
    try {
        defaultBucket = storage.bucket().name;
    } catch {
        defaultBucket = null;
    }
    const bucketName = options.bucket ?? configuredBucket ?? defaultBucket;
    if (!bucketName) {
        throw new Error(
            'No se pudo resolver el bucket. Usa --bucket=<nombre> tras confirmarlo con gcloud storage buckets list.'
        );
    }
    const bucket = storage.bucket(bucketName);
    const [bucketMetadata] = await bucket.getMetadata();
    const bucketSource = options.bucket
        ? 'explicit'
        : configuredBucket
          ? 'config'
          : 'default';

    console.log(
        `[forense] bucket=${bucket.name} source=${bucketSource} default=${defaultBucket ?? '(no resuelto)'} configured=${configuredBucket ?? '(no configurado)'}`
    );

    const [files] = await bucket.getFiles({
        prefix: options.prefix,
        autoPaginate: true,
    });

    if (files.length === 0) {
        throw new Error(
            `El prefijo ${options.prefix} devolvió 0 blobs en ${bucket.name}. ` +
                'No se concluye 0 huérfanos: confirma el bucket con --bucket.'
        );
    }
    if (files.length > options.maxFiles) {
        throw new Error(
            `El prefijo devolvió ${files.length} blobs, sobre --max-files=${options.maxFiles}. ` +
                'Aumenta el límite o acota el prefijo.'
        );
    }

    const blobs: BlobInput[] = [];
    for (const file of files) {
        const metadata =
            file.metadata ?? (await file.getMetadata())[0];
        blobs.push({
            storagePath: file.name,
            sizeBytes: Number(metadata.size ?? 0),
            contentType: String(metadata.contentType ?? ''),
            timeCreated: String(metadata.timeCreated ?? ''),
            updated: String(metadata.updated ?? ''),
            md5Hash: String(metadata.md5Hash ?? ''),
        });
    }

    const fotosSnap = await db
        .collection(COLLECTION_FOTOS)
        .select(...FOTO_FIELDS)
        .get();
    const conteosSnap = await db
        .collection(COLLECTION_CONTEOS)
        .select(...CONTEO_FIELDS)
        .get();

    const fotos: FotoInput[] = fotosSnap.docs.map((doc) => {
        const data = doc.data();
        return {
            docId: doc.id,
            conteoId: text(data.conteo_id),
            asesorEmail: text(data.asesor_email),
            asesorUid: text(data.asesor_uid),
            fotoUrl: text(data.foto_url),
            storagePath: text(data.storage_path),
            nombreArchivo: text(data.nombre_archivo),
            mimeType: text(data.mime_type),
            tamanoBytes: num(data.tamano_bytes),
            creadoEn: toIso(data.creado_en),
        };
    });

    const conteos: ConteoInput[] = conteosSnap.docs.map((doc) => {
        const data = doc.data();
        const fotoUrl = text(data.foto_url);
        return {
            docId: doc.id,
            fotoUrl,
            fotoPath: extractPathFromFotoUrl(fotoUrl),
            asesorEmail: text(data.asesor_email),
            asesorUid: text(data.asesor_uid),
            creadoEn: toIso(data.creado_en),
            estado: text(data.estado),
            inventarioDocumentoId: text(data.inventario_documento_id),
            sedeId: text(data.sede_id),
        };
    });

    const result = classify({ blobs, fotos, conteos });
    const outDir = assertOutDirOutsideRepo(outDirCandidate);
    const finishedAt = new Date();
    const context = makeContext(
        'live',
        options.projectId,
        bucket.name,
        bucketSource,
        defaultBucket,
        String(bucketMetadata.location ?? ''),
        String(bucketMetadata.storageClass ?? ''),
        outDir,
        startedAt,
        finishedAt
    );
    writeReports(context, result, {
        fotos: fotos.length,
        conteos: conteos.length,
    });
    printResult(context, result);
}

function printResult(
    context: RunContext,
    result: ClassificationResult
): void {
    console.log('\n[forense] Resumen');
    console.log(
        JSON.stringify(
            {
                bucket: context.bucket,
                bucketSource: context.bucketSource,
                prefix: context.prefix,
                filesTotal: result.summary.filesTotal,
                canonicalTotal: result.summary.canonicalTotal,
                nonCanonicalTotal: result.summary.nonCanonicalTotal,
                classification: result.summary.classification,
                orphanStrictCount: result.summary.orphanStrictCount,
                orphanStrictBytes: result.summary.orphanStrictBytes,
                orphanMetadataOnlyCount:
                    result.summary.orphanMetadataOnlyCount,
                orphanCountOnlyCount: result.summary.orphanCountOnlyCount,
                missingBlobFromFoto: result.summary.missingBlobFromFoto,
                missingBlobFromConteos:
                    result.summary.missingBlobFromConteos,
                namingLockDrift: result.summary.namingLockDrift,
                pathMismatch: result.summary.pathMismatch,
                duplicateReference: result.summary.duplicateReference,
                outDir: context.outDir,
            },
            null,
            2
        )
    );
}

async function main(): Promise<void> {
    let options: CliOptions;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        if (error instanceof Error && error.message === 'HELP_REQUESTED') {
            return;
        }
        throw error;
    }

    if (options.mode === 'fixtures') {
        await runFixtures(options);
        return;
    }
    await ejecutarForenseO30(options);
}

main().catch((error) => {
    console.error('[forense] ERROR:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
