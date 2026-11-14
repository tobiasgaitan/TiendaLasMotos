/**
 * WEB-PURGA-P6-002 — Vaciado total del módulo de repuestos.
 *
 * Dry-run por defecto. El modo destructivo exige --apply, TTY y la frase:
 *   PURGAR P6 17+5 IRREVERSIBLE
 *
 * Orden:
 *   1. Batch atómico Firestore: 17 deletes.
 *   2. Storage: 5 deletes exactos.
 *
 * No usa consultas abiertas ni patrones. No toca el ledger.
 */
import { execFileSync } from 'node:child_process';
import { hash as cryptoHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const BASE = '/Users/tobiasgaitangallego/opencode-evidence/p6-fase0';
const PROJECT_ID = 'tiendalasmotos';
const BUCKET_NAME = 'tiendalasmotos.appspot.com';
const CONFIRMATION_PHRASE = 'PURGAR P6 17+5 IRREVERSIBLE';
const RATIFICATION_PHRASE = 'RATIFICO PURGA TOTAL P6 17+5 IRREVERSIBLE';

const WHITELIST_PATH = join(BASE, 'whitelist-ratificada.json');
const WHITELIST_SHA = join(BASE, 'whitelist-ratificada.sha256');
const SOURCE_MANIFEST_PATH = join(BASE, 'source-manifest.json');
const SOURCE_MANIFEST_SHA = join(BASE, 'source-manifest.sha256');
const EVIDENCE_PATH = join(BASE, 'ratified-evidence.json');
const EVIDENCE_SHA = join(BASE, 'ratified-evidence.sha256');
const LEDGER_EXPORT_PATH = join(BASE, 'ledger-export.json');
const LEDGER_EXPORT_SHA = join(BASE, 'ledger-export.sha256');
const GATE_PATH = join(BASE, 'materialization-gate.json');
const GATE_SHA = join(BASE, 'materialization-gate.sha256');

const RATIFIED_WHITELIST_SHA256 =
    '440d8d101aa8d50dfc073474ecbd5e49f176e185f62211bdcbb635793dd05286';
const SOURCE_MANIFEST_SHA256 =
    'ddbfe756aa61446885f8c7ea781f8de9d9c3956ca08f3e551963f19be77e2e44';
const RATIFIED_EVIDENCE_SHA256 =
    '658467057076802c67d203b7aca6650a8894856a9ab2a697164c24dd830a761a';
const LEDGER_EXPORT_SHA256 =
    '41c216c5131583aada4fea6c0963f9b84af904a31023640423ba76272f384ca0';
const MATERIALIZATION_GATE_SHA256 =
    'f18d6689312d9065fd991f9a8a9012a6d9307dc197abdbf63b6b28350d0eb537';

const LEDGER_HASH =
    'a83fcb612cdc9d6f71061ed208214b976ae62416ee6d7cb0f25c38f7466ebaa4';
const SEDES_HASH =
    'e449e9af92bbaad880b952622fda79b3f66afef37a56323e9cacb6aaea94672d';

const COLLECTION_INVENTORY = 'inventario_repuestos';
const COLLECTION_COUNTS = 'conteos_pendientes_repuestos';
const COLLECTION_PHOTOS = 'fotos_inventario';

const INVENTORY_IDS = [
    '4n9pncCDJTib83sq7AiM',
    'CXUWXnWkeJxYzvBmrT1D',
    'DMq88Pux4H6jGt1mBN8X',
    'GRP-CF-001',
    'PRUEBABOTON',
    'TEST-WEB044-001',
    'WwYh2N9mrzkWNWJBO8KL',
] as const;

const COUNT_IDS = [
    '354c579f-0b55-406d-8508-82d605e73bd2',
    '37e442f9-fb11-4375-bf82-2e448c448932',
    '5c32b110-3cac-425a-9398-48a29282904d',
    '6abb3dac-4a36-4457-a6b8-53c340bfc9b1',
    'ec47caed-ddf8-4f04-86b2-2979280ac539',
] as const;

const PHOTO_IDS = [
    '354c579f-0b55-406d-8508-82d605e73bd2',
    '37e442f9-fb11-4375-bf82-2e448c448932',
    '5c32b110-3cac-425a-9398-48a29282904d',
    '6abb3dac-4a36-4457-a6b8-53c340bfc9b1',
    'ec47caed-ddf8-4f04-86b2-2979280ac539',
] as const;

const STORAGE_PATHS = [
    'inventario_repuestos/conexion@tiendalasmotos.com/354c579f-0b55-406d-8508-82d605e73bd2.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/37e442f9-fb11-4375-bf82-2e448c448932.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/5c32b110-3cac-425a-9398-48a29282904d.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/6abb3dac-4a36-4457-a6b8-53c340bfc9b1.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/ec47caed-ddf8-4f04-86b2-2979280ac539.jpg',
] as const;

const PROHIBITED_FLAGS = [
    '--prefix',
    '--pattern',
    '--all',
    '--force',
    '--yes',
    '--delete-files',
] as const;

const FIREBASE_STORAGE_PREFIX = 'gs://tiendalasmotos.appspot.com/';
const STORAGE_LISTING_GLOB =
    'gs://tiendalasmotos.appspot.com/inventario_repuestos/**';

interface Whitelist {
    ticket: string;
    scope: string;
    ratified_by: string;
    ratified_at: string;
    source_forensic: {
        ledger: { count: number; hash: string };
        sedes_hash: string;
    };
    inventory_doc_ids: string[];
    count_doc_ids: string[];
    photo_doc_ids: string[];
    storage_paths: string[];
    counts: {
        inventory: number;
        counts: number;
        photos: number;
        storage: number;
    };
    protected_set: string[];
    protected_set_reason: string;
}

interface EvidenceRecord {
    collection: string;
    docId: string;
    fields: Record<string, string | null>;
    fingerprint: string;
}

interface EvidenceFile {
    write_once: boolean;
    source_forensic: string;
    records: EvidenceRecord[];
}

interface LedgerReference {
    entryId: string;
    documento_id: string;
    conteo_id: string;
    referencia: string;
}

interface LedgerExport {
    write_once: boolean;
    ledger_count: number;
    ledger_hash: string;
    entry_ids: string[];
    references_to_deleted: LedgerReference[];
    ratified_at_utc: string;
    exported_at_utc: string;
}

interface SourceManifest {
    write_once: boolean;
    authoritative_source: string;
    source_origin: string;
    files: Record<string, string>;
}

interface MaterializationGate {
    write_once: boolean;
    expected_sha256: string;
    actual_sha256: string;
    status: string;
    source_manifest_sha256: string;
}

interface CliOptions {
    mode: 'live' | 'fixtures';
    whitelist: string;
    evidence: string;
    ledgerExport: string;
    sourceManifest: string;
    project: string;
    bucket: string;
    outDir: string | null;
    apply: boolean;
    fixtures: string | null;
}

interface FixtureSpec {
    cases: Array<{
        name: string;
        case: string;
        expected: string;
    }>;
}

interface ArtifactBundle {
    whitelist: Whitelist;
    evidence: EvidenceFile;
    ledger: LedgerExport;
    sourceManifest: SourceManifest;
    gate: MaterializationGate;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function sha256(value: string | Buffer): string {
    return cryptoHash('sha256', value, 'hex');
}

function readJson<T>(path: string): T {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function fail(code: string, detail: string): never {
    throw new Error(`${code}: ${detail}`);
}

function assertHash(
    path: string,
    expected: string,
    code: string
): void {
    if (!existsSync(path)) {
        fail(code, `archivo ausente: ${path}`);
    }
    const actual = sha256(readFileSync(path));
    if (actual !== expected) {
        fail(
            code,
            `hash no coincide para ${path}\nexpected=${expected}\nactual=${actual}`
        );
    }
}

function assertSibling(
    path: string,
    sibling: string,
    expected: string
): void {
    if (!existsSync(sibling)) {
        fail('ARTIFACT_HASH_MISMATCH', `hermano ausente: ${sibling}`);
    }
    const siblingHash = readFileSync(sibling, 'utf8').trim();
    if (siblingHash !== expected) {
        fail(
            'ARTIFACT_HASH_MISMATCH',
            `hermano no coincide: ${sibling}\nexpected=${expected}\nactual=${siblingHash}`
        );
    }
    assertHash(path, expected, 'ARTIFACT_HASH_MISMATCH');
}

function setEquals(actual: readonly string[], expected: readonly string[]): boolean {
    if (actual.length !== expected.length) return false;
    const a = new Set(actual);
    const b = new Set(expected);
    if (a.size !== b.size) return false;
    for (const value of a) {
        if (!b.has(value)) return false;
    }
    return true;
}

function canonicalValue(value: unknown): unknown {
    if (value === undefined || value === null) return null;
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (typeof value === 'object') {
        const record: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            record[key] = canonicalValue(
                (value as Record<string, unknown>)[key]
            );
        }
        return record;
    }
    return value;
}

function stableStringify(value: unknown): string {
    return JSON.stringify(canonicalValue(value));
}

function fingerprint(fields: Record<string, string | null>): string {
    return sha256(stableStringify(fields));
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

function inventoryFields(data: Record<string, unknown>): Record<string, string | null> {
    return {
        referencia: text(data.referencia),
        descripcion: text(data.descripcion),
        imagen_url_path: extractPathFromFotoUrl(text(data.imagen_url)),
    };
}

function countFields(data: Record<string, unknown>): Record<string, string | null> {
    return {
        referencia_sugerida: text(data.referencia_sugerida),
        referencia_confirmada: text(data.referencia_confirmada),
        descripcion: text(data.descripcion),
        foto_url_path: extractPathFromFotoUrl(text(data.foto_url)),
    };
}

function photoFields(data: Record<string, unknown>): Record<string, string | null> {
    return {
        conteo_id: text(data.conteo_id),
        storage_path: text(data.storage_path),
    };
}

function validateWhitelistObject(whitelist: Whitelist): void {
    if (whitelist.ticket !== 'WEB-PURGA-P6-002') {
        fail('WHITELIST_SET_MISMATCH', 'ticket inesperado');
    }
    if (whitelist.scope !== 'VACIADO_TOTAL_MODULO_REPUESTOS') {
        fail('WHITELIST_SET_MISMATCH', 'scope inesperado');
    }
    if (whitelist.ratified_by !== 'Director') {
        fail('WHITELIST_SET_MISMATCH', 'ratified_by inesperado');
    }
    if (!Array.isArray(whitelist.protected_set) || whitelist.protected_set.length !== 0) {
        fail('PROTECTED_SET_NOT_EMPTY', 'protected_set debe estar vacío');
    }
    if (!setEquals(whitelist.inventory_doc_ids, INVENTORY_IDS)) {
        fail('WHITELIST_SET_MISMATCH', 'inventory_doc_ids no coincide');
    }
    if (!setEquals(whitelist.count_doc_ids, COUNT_IDS)) {
        fail('WHITELIST_SET_MISMATCH', 'count_doc_ids no coincide');
    }
    if (!setEquals(whitelist.photo_doc_ids, PHOTO_IDS)) {
        fail('WHITELIST_SET_MISMATCH', 'photo_doc_ids no coincide');
    }
    if (!setEquals(whitelist.storage_paths, STORAGE_PATHS)) {
        fail('STORAGE_PATH_MISMATCH', 'storage_paths no coincide');
    }
    if (
        whitelist.counts.inventory !== 7 ||
        whitelist.counts.counts !== 5 ||
        whitelist.counts.photos !== 5 ||
        whitelist.counts.storage !== 5
    ) {
        fail('WHITELIST_SET_MISMATCH', 'counts del whitelist incorrectos');
    }
    if (whitelist.source_forensic.ledger.count !== 14) {
        fail('WHITELIST_SET_MISMATCH', 'ledger.count del whitelist incorrecto');
    }
    if (whitelist.source_forensic.ledger.hash !== LEDGER_HASH) {
        fail('LEDGER_HASH_MISMATCH', 'ledger.hash del whitelist incorrecto');
    }
    if (whitelist.source_forensic.sedes_hash !== SEDES_HASH) {
        fail('SEDES_HASH_MISMATCH', 'sedes_hash del whitelist incorrecto');
    }
}

function validateEvidence(
    evidence: EvidenceFile,
    whitelist: Whitelist
): void {
    if (evidence.write_once !== true) {
        fail('EVIDENCE_INVALID', 'write_once debe ser true');
    }
    if (!evidence.source_forensic.startsWith(`${BASE}/source/`)) {
        fail('EVIDENCE_INVALID', 'source_forensic no es la ruta estable');
    }
    if (evidence.records.length !== 17) {
        fail('EVIDENCE_INVALID', `records=${evidence.records.length}, esperado 17`);
    }
    const expectedKeys: string[] = [];
    for (const id of whitelist.inventory_doc_ids) {
        expectedKeys.push(`${COLLECTION_INVENTORY}|${id}`);
    }
    for (const id of whitelist.count_doc_ids) {
        expectedKeys.push(`${COLLECTION_COUNTS}|${id}`);
    }
    for (const id of whitelist.photo_doc_ids) {
        expectedKeys.push(`${COLLECTION_PHOTOS}|${id}`);
    }
    const seen: Record<string, true> = {};
    for (const record of evidence.records) {
        const key = `${record.collection}|${record.docId}`;
        if (!expectedKeys.includes(key)) {
            fail('EVIDENCE_INVALID', `registro inesperado ${key}`);
        }
        if (seen[key]) {
            fail('EVIDENCE_INVALID', `registro duplicado ${key}`);
        }
        seen[key] = true;
        if (!/^[0-9a-f]{64}$/.test(record.fingerprint)) {
            fail('EVIDENCE_INVALID', `fingerprint inválido ${key}`);
        }
    }
    for (const key of expectedKeys) {
        if (!seen[key]) {
            fail('EVIDENCE_INVALID', `registro faltante ${key}`);
        }
    }
}

function validateLedgerExport(ledger: LedgerExport): void {
    if (ledger.write_once !== true) {
        fail('LEDGER_EXPORT_INVALID', 'write_once debe ser true');
    }
    if (ledger.ledger_count !== 14) {
        fail('LEDGER_EXPORT_INVALID', 'ledger_count debe ser 14');
    }
    if (ledger.ledger_hash !== LEDGER_HASH) {
        fail('LEDGER_HASH_MISMATCH', 'ledger_hash incorrecto');
    }
    if (ledger.entry_ids.length !== 14) {
        fail('LEDGER_EXPORT_INVALID', 'entry_ids debe tener 14');
    }
    if (ledger.references_to_deleted.length !== 11) {
        fail('LEDGER_REFERENCES_MISMATCH', 'references_to_deleted debe ser 11');
    }
}

function validateGate(gate: MaterializationGate): void {
    if (gate.write_once !== true) {
        fail('GATE_INVALID', 'write_once debe ser true');
    }
    if (gate.status !== 'PASS') {
        fail('GATE_INVALID', 'materialization gate no está en PASS');
    }
    if (gate.expected_sha256 !== RATIFIED_WHITELIST_SHA256) {
        fail('GATE_INVALID', 'expected_sha256 incorrecto');
    }
    if (gate.actual_sha256 !== RATIFIED_WHITELIST_SHA256) {
        fail('GATE_INVALID', 'actual_sha256 incorrecto');
    }
    if (gate.source_manifest_sha256 !== SOURCE_MANIFEST_SHA256) {
        fail('GATE_INVALID', 'source_manifest_sha256 incorrecto');
    }
}

function validateSourceManifest(manifest: SourceManifest): void {
    if (manifest.write_once !== true) {
        fail('SOURCE_MANIFEST_INVALID', 'write_once debe ser true');
    }
    if (!manifest.authoritative_source.startsWith(`${BASE}/source/`)) {
        fail('SOURCE_MANIFEST_INVALID', 'authoritative_source no es la ruta estable');
    }
    if (manifest.authoritative_source === manifest.source_origin) {
        fail('SOURCE_MANIFEST_INVALID', 'source_origin no puede ser autoritativo');
    }
    const names = Object.keys(manifest.files);
    if (names.length !== 6) {
        fail('SOURCE_MANIFEST_INVALID', `files=${names.length}, esperado 6`);
    }
    for (const name of names) {
        const path = join(manifest.authoritative_source, name);
        if (!existsSync(path)) {
            fail('SOURCE_MANIFEST_INVALID', `archivo fuente ausente ${name}`);
        }
        const actual = sha256(readFileSync(path));
        if (actual !== manifest.files[name]) {
            fail('SOURCE_MANIFEST_INVALID', `hash fuente no coincide ${name}`);
        }
    }
}

function loadAndValidateArtifacts(): ArtifactBundle {
    assertHash(
        WHITELIST_PATH,
        RATIFIED_WHITELIST_SHA256,
        'WHITELIST_HASH_MISMATCH'
    );
    assertSibling(WHITELIST_PATH, WHITELIST_SHA, RATIFIED_WHITELIST_SHA256);
    assertSibling(
        SOURCE_MANIFEST_PATH,
        SOURCE_MANIFEST_SHA,
        SOURCE_MANIFEST_SHA256
    );
    assertSibling(
        EVIDENCE_PATH,
        EVIDENCE_SHA,
        RATIFIED_EVIDENCE_SHA256
    );
    assertSibling(
        LEDGER_EXPORT_PATH,
        LEDGER_EXPORT_SHA,
        LEDGER_EXPORT_SHA256
    );
    assertSibling(GATE_PATH, GATE_SHA, MATERIALIZATION_GATE_SHA256);

    const whitelist = readJson<Whitelist>(WHITELIST_PATH);
    const evidence = readJson<EvidenceFile>(EVIDENCE_PATH);
    const ledger = readJson<LedgerExport>(LEDGER_EXPORT_PATH);
    const sourceManifest = readJson<SourceManifest>(SOURCE_MANIFEST_PATH);
    const gate = readJson<MaterializationGate>(GATE_PATH);

    validateWhitelistObject(whitelist);
    validateEvidence(evidence, whitelist);
    validateLedgerExport(ledger);
    validateSourceManifest(sourceManifest);
    validateGate(gate);

    return { whitelist, evidence, ledger, sourceManifest, gate };
}

function parseArgs(argv: string[]): CliOptions {
    let whitelist = WHITELIST_PATH;
    let evidence = EVIDENCE_PATH;
    let ledgerExport = LEDGER_EXPORT_PATH;
    let sourceManifest = SOURCE_MANIFEST_PATH;
    let project = '';
    let bucket = '';
    let outDir: string | null = null;
    let apply = false;
    let fixtures: string | null = null;

    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            console.log(
                'Uso: --fixtures=<archivo> --out=<dir> | --project=tiendalasmotos --bucket=tiendalasmotos.appspot.com [--apply]'
            );
            throw new Error('HELP_REQUESTED');
        }
        if (PROHIBITED_FLAGS.includes(arg as (typeof PROHIBITED_FLAGS)[number])) {
            fail('FLAG_PROHIBIDO', `${arg} no está permitido; DELETIONS=0`);
        }
        if (arg === '--apply') {
            apply = true;
            continue;
        }
        if (!arg.startsWith('--')) {
            fail('ARG_INVALIDO', arg);
        }
        const [rawKey, rawValue = ''] = arg.slice(2).split('=', 2);
        const key = rawKey.trim();
        const value = rawValue.trim();
        if (key === 'whitelist') {
            whitelist = value;
            continue;
        }
        if (key === 'evidence') {
            evidence = value;
            continue;
        }
        if (key === 'ledger-export') {
            ledgerExport = value;
            continue;
        }
        if (key === 'source-manifest') {
            sourceManifest = value;
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
        if (key === 'fixtures') {
            fixtures = value;
            continue;
        }
        fail('FLAG_NO_RECONOCIDO', `--${key}`);
    }

    if (fixtures && apply) {
        fail('MODO_INVALIDO', '--fixtures y --apply son mutuamente excluyentes');
    }
    if (fixtures) {
        return {
            mode: 'fixtures',
            whitelist,
            evidence,
            ledgerExport,
            sourceManifest,
            project: PROJECT_ID,
            bucket: BUCKET_NAME,
            outDir,
            apply: false,
            fixtures,
        };
    }
    if (project !== PROJECT_ID) {
        fail('PROYECTO_NO_AUTORIZADO', project || '(vacío)');
    }
    if (bucket !== BUCKET_NAME) {
        fail('BUCKET_NO_AUTORIZADO', bucket || '(vacío)');
    }
    return {
        mode: 'live',
        whitelist,
        evidence,
        ledgerExport,
        sourceManifest,
        project,
        bucket,
        outDir,
        apply,
        fixtures: null,
    };
}

function assertOutDirOutsideRepo(outDir: string): string {
    const resolved = resolve(outDir);
    const repo = resolve(process.cwd());
    if (resolved === repo || resolved.startsWith(`${repo}${sep}`)) {
        fail('OUT_DIR_INVALIDO', resolved);
    }
    return resolved;
}

function makeRunId(date: Date): string {
    return date.toISOString().replace(/[:.]/g, '-');
}

function gcloudStoragePaths(): string[] {
    const output = execFileSync(
        'gcloud',
        ['storage', 'ls', '-r', STORAGE_LISTING_GLOB],
        { encoding: 'utf8' }
    );
    return output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) =>
            line.startsWith(FIREBASE_STORAGE_PREFIX)
                ? line.slice(FIREBASE_STORAGE_PREFIX.length)
                : line
        );
}

async function preflightDocs(
    db: ReturnType<typeof getFirestore>,
    evidence: EvidenceFile
): Promise<void> {
    const byKey: Record<string, EvidenceRecord> = {};
    for (const record of evidence.records) {
        byKey[`${record.collection}|${record.docId}`] = record;
    }
    const groups: Array<{
        collection: string;
        ids: readonly string[];
        fields: (data: Record<string, unknown>) => Record<string, string | null>;
    }> = [
        { collection: COLLECTION_INVENTORY, ids: INVENTORY_IDS, fields: inventoryFields },
        { collection: COLLECTION_COUNTS, ids: COUNT_IDS, fields: countFields },
        { collection: COLLECTION_PHOTOS, ids: PHOTO_IDS, fields: photoFields },
    ];
    for (const group of groups) {
        for (const id of group.ids) {
            const snap = await db.collection(group.collection).doc(id).get();
            if (!snap.exists) {
                fail('DRIFT_MISSING_DOC', `${group.collection}/${id}`);
            }
            const data = snap.data() as Record<string, unknown>;
            const current = fingerprint(group.fields(data));
            const expected = byKey[`${group.collection}|${id}`];
            if (!expected) {
                fail('DRIFT_EVIDENCE_MISSING', `${group.collection}/${id}`);
            }
            if (current !== expected.fingerprint) {
                fail(
                    'DRIFT_FINGERPRINT_MISMATCH',
                    `${group.collection}/${id}`
                );
            }
        }
    }
}

async function preflightStorage(
    bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>
): Promise<void> {
    for (const path of STORAGE_PATHS) {
        try {
            await bucket.file(path).getMetadata();
        } catch {
            fail('DRIFT_MISSING_BLOB', path);
        }
    }
    const paths = gcloudStoragePaths();
    if (paths.length !== 5) {
        fail('STORAGE_SET_MISMATCH', `gcloud count=${paths.length}`);
    }
    if (!setEquals(paths, STORAGE_PATHS)) {
        fail('STORAGE_SET_MISMATCH', 'el set de 5 blobs no coincide');
    }
}

function printList(): void {
    console.log('[purga] Inventory IDs:');
    for (const id of INVENTORY_IDS) console.log(`  ${id}`);
    console.log('[purga] Count IDs:');
    for (const id of COUNT_IDS) console.log(`  ${id}`);
    console.log('[purga] Photo IDs:');
    for (const id of PHOTO_IDS) console.log(`  ${id}`);
    console.log('[purga] Storage paths:');
    for (const path of STORAGE_PATHS) console.log(`  ${path}`);
}

async function applyAll(
    db: ReturnType<typeof getFirestore>,
    bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>,
    bundle: ArtifactBundle,
    outDir: string
): Promise<void> {
    const startedAt = new Date().toISOString();
    let firestoreDeleted = 0;
    let storageDeleted = 0;
    let failed = 0;
    const failures: Array<{ stage: string; detail: string }> = [];
    let remainingFirestore = 17;
    let remainingStorage = 5;
    let batchCommitted = false;

    try {
        const batch = db.batch();
        for (const id of PHOTO_IDS) {
            batch.delete(db.collection(COLLECTION_PHOTOS).doc(id));
        }
        for (const id of COUNT_IDS) {
            batch.delete(db.collection(COLLECTION_COUNTS).doc(id));
        }
        for (const id of INVENTORY_IDS) {
            batch.delete(db.collection(COLLECTION_INVENTORY).doc(id));
        }
        await batch.commit();
        batchCommitted = true;
        firestoreDeleted = 17;
    } catch (error) {
        failed += 1;
        failures.push({
            stage: 'firestore_batch',
            detail: error instanceof Error ? error.message : String(error),
        });
    }

    if (batchCommitted) {
        for (const path of STORAGE_PATHS) {
            try {
                await bucket.file(path).delete();
                storageDeleted += 1;
            } catch (error) {
                failed += 1;
                failures.push({
                    stage: 'storage_delete',
                    detail: `${path}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                });
                break;
            }
        }
    }

    remainingFirestore = 0;
    for (const id of INVENTORY_IDS) {
        const snap = await db.collection(COLLECTION_INVENTORY).doc(id).get();
        if (snap.exists) remainingFirestore += 1;
    }
    for (const id of COUNT_IDS) {
        const snap = await db.collection(COLLECTION_COUNTS).doc(id).get();
        if (snap.exists) remainingFirestore += 1;
    }
    for (const id of PHOTO_IDS) {
        const snap = await db.collection(COLLECTION_PHOTOS).doc(id).get();
        if (snap.exists) remainingFirestore += 1;
    }

    remainingStorage = 0;
    for (const path of STORAGE_PATHS) {
        const [exists] = await bucket.file(path).exists();
        if (exists) remainingStorage += 1;
    }

    const appliedAt = new Date().toISOString();
    const manifest = {
        ticket: 'WEB-PURGA-P6-002',
        mode: 'apply',
        batched: true,
        batch_committed: batchCommitted,
        firestore_deleted: firestoreDeleted,
        storage_deleted: storageDeleted,
        failed,
        failures,
        remaining_firestore: remainingFirestore,
        remaining_storage: remainingStorage,
        ledger_writes: 0,
        imagen_url_links: 0,
        ratification_phrase: RATIFICATION_PHRASE,
        apply_confirmation_phrase: CONFIRMATION_PHRASE,
        ratified_at_utc: bundle.ledger.ratified_at_utc,
        started_at_utc: startedAt,
        applied_at_utc: appliedAt,
        authorization_source: {
            whitelist: WHITELIST_PATH,
            whitelist_sha256: RATIFIED_WHITELIST_SHA256,
            materialization_gate_sha256: MATERIALIZATION_GATE_SHA256,
            protected_set: bundle.whitelist.protected_set,
        },
    };
    writeJson(join(outDir, 'purge-p6-apply.json'), manifest);
    writeFileSync(
        join(outDir, 'deleted-firestore-ids.txt'),
        `${[...PHOTO_IDS, ...COUNT_IDS, ...INVENTORY_IDS].join('\n')}\n`,
        'utf8'
    );
    writeFileSync(
        join(outDir, 'deleted-storage-paths.txt'),
        `${STORAGE_PATHS.join('\n')}\n`,
        'utf8'
    );

    console.log(`FIRESTORE_DELETED=${firestoreDeleted}`);
    console.log(`STORAGE_DELETED=${storageDeleted}`);
    console.log(`FAILED=${failed}`);
    console.log('LEDGER_WRITES=0');
    console.log('IMAGEN_URL_LINKS=0');

    if (
        firestoreDeleted !== 17 ||
        storageDeleted !== 5 ||
        failed !== 0 ||
        remainingFirestore !== 0 ||
        remainingStorage !== 0
    ) {
        process.exitCode = 1;
    }
}

async function runLive(options: CliOptions): Promise<void> {
    const bundle = loadAndValidateArtifacts();
    const app =
        getApps()[0] ??
        initializeApp({
            projectId: PROJECT_ID,
            storageBucket: BUCKET_NAME,
        });
    if (app.options.projectId && app.options.projectId !== PROJECT_ID) {
        fail('PROYECTO_NO_AUTORIZADO', app.options.projectId);
    }
    const db = getFirestore(app);
    const bucket = getStorage(app).bucket(BUCKET_NAME);
    if (bucket.name !== BUCKET_NAME) {
        fail('BUCKET_NO_AUTORIZADO', bucket.name);
    }

    await preflightDocs(db, bundle.evidence);
    await preflightStorage(bucket);

    const runId = makeRunId(new Date());
    const outDir = assertOutDirOutsideRepo(
        options.outDir ?? join(BASE, `apply-${runId}`)
    );
    mkdirSync(outDir, { recursive: true });

    if (!options.apply) {
        const checkedAt = new Date().toISOString();
        printList();
        console.log('INVENTORY_DELETES=7');
        console.log('COUNT_DELETES=5');
        console.log('PHOTO_DELETES=5');
        console.log('STORAGE_DELETES=5');
        console.log('TOTAL_DELETES=22');
        console.log('DELETIONS=0');
        writeJson(join(outDir, 'purge-p6-dry-run.json'), {
            ticket: 'WEB-PURGA-P6-002',
            mode: 'dry-run',
            inventory_deletes: 7,
            count_deletes: 5,
            photo_deletes: 5,
            storage_deletes: 5,
            total_deletes: 22,
            deletions: 0,
            checked_at_utc: checkedAt,
            whitelist_sha256: RATIFIED_WHITELIST_SHA256,
            evidence_sha256: RATIFIED_EVIDENCE_SHA256,
            ledger_export_sha256: LEDGER_EXPORT_SHA256,
            gate_sha256: MATERIALIZATION_GATE_SHA256,
            inventory_doc_ids: [...INVENTORY_IDS],
            count_doc_ids: [...COUNT_IDS],
            photo_doc_ids: [...PHOTO_IDS],
            storage_paths: [...STORAGE_PATHS],
        });
        return;
    }

    if (!process.stdin.isTTY) {
        fail(
            'TTY_REQUIRED',
            '--apply exige una terminal interactiva; DELETIONS=0'
        );
    }

    console.log('\n[purga] MODO DESTRUCTIVO');
    console.log('Se eliminarán 17 documentos y 5 blobs.');
    console.log('El batch Firestore se ejecuta primero; Storage después.');
    console.log('Escribe exactamente la frase:');
    console.log(CONFIRMATION_PHRASE);
    const rl = createInterface({ input, output });
    const answer = await rl.question('> ');
    rl.close();

    if (answer.trim() !== CONFIRMATION_PHRASE) {
        const abortedAt = new Date().toISOString();
        writeJson(join(outDir, 'purge-p6-apply.json'), {
            ticket: 'WEB-PURGA-P6-002',
            mode: 'apply',
            aborted: true,
            reason: 'confirmación incorrecta',
            deletions: 0,
            firestore_deleted: 0,
            storage_deleted: 0,
            failed: 0,
            ledger_writes: 0,
            imagen_url_links: 0,
            ratified_at_utc: bundle.ledger.ratified_at_utc,
            attempted_at_utc: abortedAt,
        });
        console.log('DELETIONS=0');
        process.exitCode = 2;
        return;
    }

    await applyAll(db, bucket, bundle, outDir);
}

function runFixtures(options: CliOptions): void {
    const bundle = loadAndValidateArtifacts();
    const spec = readJson<FixtureSpec>(options.fixtures as string);
    const results: Array<{
        name: string;
        expected: string;
        actual: string;
        pass: boolean;
    }> = [];

    for (const item of spec.cases) {
        let actual = 'NO_ERROR';
        try {
            if (item.case === 'extra_inventory_id') {
                const mutated = JSON.parse(
                    JSON.stringify(bundle.whitelist)
                ) as Whitelist;
                mutated.inventory_doc_ids.push('EXTRA-ID');
                validateWhitelistObject(mutated);
            } else if (item.case === 'missing_inventory_id') {
                const mutated = JSON.parse(
                    JSON.stringify(bundle.whitelist)
                ) as Whitelist;
                mutated.inventory_doc_ids = mutated.inventory_doc_ids.slice(1);
                validateWhitelistObject(mutated);
            } else if (item.case === 'altered_whitelist_hash') {
                assertHash(
                    WHITELIST_PATH,
                    '0000000000000000000000000000000000000000000000000000000000000000',
                    'WHITELIST_HASH_MISMATCH'
                );
            } else if (item.case === 'wrong_confirmation') {
                const accepted =
                    'NO PURGAR'.trim() === CONFIRMATION_PHRASE;
                if (!accepted) {
                    actual = 'CONFIRMATION_REJECTED';
                }
            } else if (item.case === 'extra_storage_path') {
                const mutated = JSON.parse(
                    JSON.stringify(bundle.whitelist)
                ) as Whitelist;
                mutated.storage_paths.push('inventario_repuestos/otro.jpg');
                validateWhitelistObject(mutated);
            } else {
                actual = 'CASE_UNKNOWN';
            }
        } catch (error) {
            actual =
                error instanceof Error
                    ? error.message.split(':')[0]
                    : String(error);
        }
        results.push({
            name: item.name,
            expected: item.expected,
            actual,
            pass: actual === item.expected,
        });
    }

    const passed = results.filter((item) => item.pass).length;
    const runId = makeRunId(new Date());
    const outDir = assertOutDirOutsideRepo(
        options.outDir ?? join(BASE, `fixtures-${runId}`)
    );
    mkdirSync(outDir, { recursive: true });
    writeJson(join(outDir, 'purge-p6-fixtures.json'), {
        ticket: 'WEB-PURGA-P6-002',
        mode: 'fixtures',
        passed,
        total: results.length,
        results,
    });
    console.log(`FIXTURES=${passed}/${results.length}`);
    for (const result of results) {
        console.log(
            `${result.pass ? 'PASS' : 'FAIL'} ${result.name}: expected=${result.expected} actual=${result.actual}`
        );
    }
    if (passed !== results.length) {
        process.exitCode = 1;
    }
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
        runFixtures(options);
        return;
    }
    await runLive(options);
}

main().catch((error) => {
    console.error(
        '[purga] ERROR:',
        error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
});
