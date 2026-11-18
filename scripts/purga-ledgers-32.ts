/**
 * WEB-PURGA-LEDGERS-32-001 — Purga única de los 32 asientos simulados.
 *
 * Dry-run por defecto. El modo destructivo exige --apply, TTY y la frase:
 *   PURGAR LEDGERS 32 IRREVERSIBLE
 *
 * Un solo batch atómico Firestore:
 *   1. historial_auditoria_inventario — 14 deletes.
 *   2. historial_auditoria — 18 deletes.
 *
 * Whitelist cerrada hardcodeada. Sin Storage, sin patrones, sin colecciones
 * de dominio. Reportes únicamente fuera del repo.
 */
import { hash as cryptoHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFirestore } from 'firebase-admin/firestore';
import {
    assertOutDirOutsideRepo,
    initFirebaseGuarded,
    requireConfirmation,
} from './lib/forensic-utils';

const BASE =
    '/Users/tobiasgaitangallego/opencode-evidence/ledgers-purga-20261115T031832Z';
const EXPORT_PATH = join(BASE, 'ledger-export-32.json');
const EXPORT_SHA_PATH = join(BASE, 'ledger-export-32.sha256');
const EXPORT_SHA256 =
    'fe59abf925a2630fb4a3e02d87ccbc7140ae27a83976db288402bac39b6387c4';
const PROJECT_ID = 'tiendalasmotos';
const CONFIRMATION_PHRASE = 'PURGAR LEDGERS 32 IRREVERSIBLE';
const COLLECTION_INVENTORY = 'historial_auditoria_inventario';
const COLLECTION_FINANCIAL = 'historial_auditoria';
const INVENTORY_HASH =
    'a83fcb612cdc9d6f71061ed208214b976ae62416ee6d7cb0f25c38f7466ebaa4';
const FINANCIAL_HASH =
    '1ea682393be7491c390f5dbaa2ed65dd37436c9e571b32a66e1b318c6a5ed241';
const EMPTY_LEDGER_HASH =
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const INVENTORY_IDS = [
    '6KNrSdmewT8KpRLqWKcf',
    'E4kQ0BzPa3ZRYxDuLwdW',
    'EsE03lcXHbYJiMEOT0iv',
    'NLHED7MJJaaNqXPLRGwV',
    'Ogh0e4WP38OmJvrKFCF2',
    'PlCsCqx2d5OL0R34lhgT',
    'TdAaWfyIGyIdvjqSKuUk',
    'cXbDB1aoA6JHvfKoJmz4',
    'clwKxOziAzgBtjlQnNg6',
    'gLxYMUPmrUG76yMP2soB',
    'mJPAL3fnzEFsnI5dyowC',
    'otVXhneCHV72yPA7wfE3',
    'ql26ANQjRS4QL0749xAl',
    'sanRhXulwueetqyAuQ4i',
] as const;

const FINANCIAL_IDS = [
    '0XYWHzO7pQM0OdFSMs3f',
    '4fhwhoqha0597u0ZOGKQ',
    '4xMn2rOcfZzSetvZJ4iT',
    '51uD6i5qpTE3x1AOpp88',
    '5nTsLZSVqHlGvEtKakB6',
    '5saSlmjPGG8kuJWaU6AY',
    '6Nse1BmWCRSmhK1UQsk6',
    'BBHaMlDy07DvPBlxFYg9',
    'Gg6tK4WGpwfMuORm5Ulj',
    'VrBSw6NJIC4Zrkgz0Qv4',
    'WU17iBW6yuZ7uV1HHuk3',
    'XgUAx6Fww1P6LcD6RTcU',
    'fXxsgUFiTVvVMEbuG0KH',
    'krX7RJqHzHmIpeJw4yuf',
    'nNdeDx2NZRxG1lFuewWe',
    'sKlgWhSawlzhIr8h8M9z',
    'vvt8GHq0KkEowHSRrF7D',
    'xtYzY7ou1qQzRL2BI6tq',
] as const;

const PROHIBITED_FLAGS = [
    '--prefix',
    '--pattern',
    '--all',
    '--force',
    '--yes',
] as const;

interface LedgerExportBlock {
    count: number;
    hash: string;
    doc_ids: string[];
}

interface LedgerExport {
    ticket: string;
    write_once: boolean;
    source_forensic: string;
    exported_at_utc: string;
    project_id: string;
    historial_auditoria_inventario: LedgerExportBlock;
    historial_auditoria: LedgerExportBlock;
    total: number;
}

interface CliOptions {
    export: string;
    project: string;
    outDir: string;
    apply: boolean;
}

interface LedgerRead {
    ledger: string;
    count: number;
    hash: string;
    docIds: string[];
}

function sha256(value: string): string {
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

function serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(serializeValue);
    if (typeof value === 'object') {
        const candidate = value as { toDate?: () => Date };
        if (typeof candidate.toDate === 'function') {
            return candidate.toDate().toISOString();
        }
        const record: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            record[key] = serializeValue(
                (value as Record<string, unknown>)[key]
            );
        }
        return record;
    }
    return value;
}

function stableStringify(value: unknown): string {
    return JSON.stringify(serializeValue(value));
}

function sorted(values: readonly string[]): string[] {
    return [...values].sort();
}

function arraysEqual(
    actual: readonly string[],
    expected: readonly string[]
): boolean {
    if (actual.length !== expected.length) return false;
    const a = sorted(actual);
    const b = sorted(expected);
    for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return false;
    }
    return true;
}

function hasDuplicates(values: readonly string[]): boolean {
    return new Set(values).size !== values.length;
}

function assertExportIntegrity(exportPath: string): LedgerExport {
    if (!existsSync(exportPath)) {
        fail('EXPORT_AUSENTE', exportPath);
    }
    const raw = readFileSync(exportPath, 'utf8');
    const actualHash = sha256(raw);
    if (actualHash !== EXPORT_SHA256) {
        fail(
            'EXPORT_HASH_MISMATCH',
            `expected=${EXPORT_SHA256} actual=${actualHash}`
        );
    }
    if (!existsSync(EXPORT_SHA_PATH)) {
        fail('EXPORT_SIBLING_AUSENTE', EXPORT_SHA_PATH);
    }
    const sibling = readFileSync(EXPORT_SHA_PATH, 'utf8').trim();
    if (sibling !== EXPORT_SHA256) {
        fail(
            'EXPORT_SIBLING_MISMATCH',
            `expected=${EXPORT_SHA256} actual=${sibling}`
        );
    }

    const parsed = JSON.parse(raw) as LedgerExport;
    if (parsed.ticket !== 'WEB-PURGA-LEDGERS-32-001') {
        fail('EXPORT_INVALIDO', 'ticket inesperado');
    }
    if (parsed.write_once !== true) {
        fail('EXPORT_INVALIDO', 'write_once distinto de true');
    }
    if (parsed.project_id !== PROJECT_ID) {
        fail('EXPORT_INVALIDO', 'project_id inesperado');
    }
    if (parsed.total !== 32) {
        fail('EXPORT_INVALIDO', `total=${parsed.total}`);
    }

    const inventory = parsed.historial_auditoria_inventario;
    const financial = parsed.historial_auditoria;
    if (inventory.count !== 14 || inventory.hash !== INVENTORY_HASH) {
        fail(
            'EXPORT_INVENTORY_MISMATCH',
            `count=${inventory.count} hash=${inventory.hash}`
        );
    }
    if (financial.count !== 18 || financial.hash !== FINANCIAL_HASH) {
        fail(
            'EXPORT_FINANCIAL_MISMATCH',
            `count=${financial.count} hash=${financial.hash}`
        );
    }
    if (inventory.doc_ids.length !== 14 || financial.doc_ids.length !== 18) {
        fail(
            'EXPORT_IDS_LENGTH_MISMATCH',
            `inventory=${inventory.doc_ids.length} financial=${financial.doc_ids.length}`
        );
    }
    if (hasDuplicates(inventory.doc_ids) || hasDuplicates(financial.doc_ids)) {
        fail('EXPORT_IDS_DUPLICATED', 'docIds repetidos');
    }
    if (!arraysEqual(inventory.doc_ids, INVENTORY_IDS)) {
        fail('EXPORT_IDS_MISMATCH', 'inventario no coincide con whitelist');
    }
    if (!arraysEqual(financial.doc_ids, FINANCIAL_IDS)) {
        fail('EXPORT_IDS_MISMATCH', 'financiero no coincide con whitelist');
    }

    return parsed;
}

function parseArgs(argv: string[]): CliOptions {
    let exportPath = EXPORT_PATH;
    let project = PROJECT_ID;
    let outDir = BASE;
    let apply = false;

    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            console.log(
                'Uso: --export=<archivo> --project=tiendalasmotos --out=<dir> [--apply]'
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
        if (key === 'export') {
            exportPath = value;
            continue;
        }
        if (key === 'project') {
            project = value;
            continue;
        }
        if (key === 'out') {
            outDir = value;
            continue;
        }
        fail('FLAG_NO_RECONOCIDO', `--${key}`);
    }

    if (project !== PROJECT_ID) {
        fail('PROYECTO_NO_AUTORIZADO', project || '(vacío)');
    }
    return { export: exportPath, project, outDir, apply };
}

async function readLedger(
    db: ReturnType<typeof getFirestore>,
    ledger: string
): Promise<LedgerRead> {
    if (ledger !== COLLECTION_INVENTORY && ledger !== COLLECTION_FINANCIAL) {
        fail('COLECCION_NO_AUTORIZADA', ledger);
    }
    const snap = await db.collection(ledger).get();
    const docs = snap.docs
        .map((doc) => ({
            docId: doc.id,
            data: doc.data() as Record<string, unknown>,
        }))
        .sort((a, b) => (a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0));
    const lines = docs
        .map(({ docId, data }) => `${docId}:${stableStringify(data)}`)
        .sort();
    return {
        ledger,
        count: snap.size,
        hash: sha256(lines.join('\n')),
        docIds: docs.map((doc) => doc.docId),
    };
}

async function preflight(
    db: ReturnType<typeof getFirestore>
): Promise<{ inventory: LedgerRead; financial: LedgerRead }> {
    const inventory = await readLedger(db, COLLECTION_INVENTORY);
    const financial = await readLedger(db, COLLECTION_FINANCIAL);

    if (inventory.count !== 14 || inventory.hash !== INVENTORY_HASH) {
        fail(
            'DRIFT_INVENTORY',
            `count=${inventory.count} hash=${inventory.hash}`
        );
    }
    if (financial.count !== 18 || financial.hash !== FINANCIAL_HASH) {
        fail(
            'DRIFT_FINANCIAL',
            `count=${financial.count} hash=${financial.hash}`
        );
    }
    if (!arraysEqual(inventory.docIds, INVENTORY_IDS)) {
        fail('DRIFT_INVENTORY_IDS', 'el set live no coincide con la whitelist');
    }
    if (!arraysEqual(financial.docIds, FINANCIAL_IDS)) {
        fail('DRIFT_FINANCIAL_IDS', 'el set live no coincide con la whitelist');
    }

    return { inventory, financial };
}

async function postVerify(
    db: ReturnType<typeof getFirestore>
): Promise<{ inventory: LedgerRead; financial: LedgerRead }> {
    const inventory = await readLedger(db, COLLECTION_INVENTORY);
    const financial = await readLedger(db, COLLECTION_FINANCIAL);
    return { inventory, financial };
}

function buildBaseReport(
    mode: 'dry-run' | 'apply',
    exported: LedgerExport
): Record<string, unknown> {
    return {
        ticket: 'WEB-PURGA-LEDGERS-32-001',
        mode,
        batched: true,
        batch_order: [COLLECTION_INVENTORY, COLLECTION_FINANCIAL],
        export_path: EXPORT_PATH,
        export_sha256: EXPORT_SHA256,
        export_exported_at_utc: exported.exported_at_utc,
        inventory_doc_ids: [...INVENTORY_IDS],
        financial_doc_ids: [...FINANCIAL_IDS],
        total_whitelist: 32,
        storage_operations: 0,
        domain_collections_accessed: [],
        rules_modified: false,
        indexes_modified: false,
    };
}

async function ejecutarPurgaLedgers32(options: CliOptions): Promise<void> {
    const exported = assertExportIntegrity(options.export);
    const outDir = assertOutDirOutsideRepo(options.outDir);
    const { db } = initFirebaseGuarded({
        outDir,
        projectId: PROJECT_ID,
    });

    const before = await preflight(db);

    if (!options.apply) {
        const checkedAt = new Date().toISOString();
        console.log(`INVENTORY_COUNT=${before.inventory.count}`);
        console.log(`INVENTORY_HASH=${before.inventory.hash}`);
        console.log(`FINANCIAL_COUNT=${before.financial.count}`);
        console.log(`FINANCIAL_HASH=${before.financial.hash}`);
        console.log('INVENTORY_DELETES=14');
        console.log('FINANCIAL_DELETES=18');
        console.log('TOTAL_DELETES=32');
        console.log('DELETIONS=0');
        writeJson(join(outDir, 'purga-ledgers-32-dry-run.json'), {
            ...buildBaseReport('dry-run', exported),
            checked_at_utc: checkedAt,
            preflight_inventory_count: before.inventory.count,
            preflight_inventory_hash: before.inventory.hash,
            preflight_financial_count: before.financial.count,
            preflight_financial_hash: before.financial.hash,
            inventory_deletes: 14,
            financial_deletes: 18,
            total_deletes: 32,
            deletions: 0,
        });
        return;
    }

    if (!process.stdin.isTTY) {
        fail(
            'TTY_REQUIRED',
            '--apply exige una terminal interactiva; DELETIONS=0'
        );
    }

    const confirmed = await requireConfirmation(
        '[purga] MODO DESTRUCTIVO: se eliminarán 32 asientos simulados en un solo batch atómico.\n' +
            'Orden: historial_auditoria_inventario (14) → historial_auditoria (18).\n' +
            'Escribe exactamente la frase:',
        CONFIRMATION_PHRASE
    );

    if (!confirmed) {
        const abortedAt = new Date().toISOString();
        writeJson(join(outDir, 'purga-ledgers-32-apply.json'), {
            ...buildBaseReport('apply', exported),
            aborted: true,
            reason: 'confirmación incorrecta',
            deletions: 0,
            inventory_deleted: 0,
            financial_deleted: 0,
            failed: 0,
            attempted_at_utc: abortedAt,
        });
        console.log('DELETIONS=0');
        process.exitCode = 2;
        return;
    }

    const startedAt = new Date().toISOString();
    let inventoryDeleted = 0;
    let financialDeleted = 0;
    let failed = 0;
    let batchCommitted = false;
    const failures: Array<{ stage: string; detail: string }> = [];

    try {
        const batch = db.batch();
        for (const id of INVENTORY_IDS) {
            batch.delete(db.collection(COLLECTION_INVENTORY).doc(id));
        }
        for (const id of FINANCIAL_IDS) {
            batch.delete(db.collection(COLLECTION_FINANCIAL).doc(id));
        }
        await batch.commit();
        batchCommitted = true;
        inventoryDeleted = INVENTORY_IDS.length;
        financialDeleted = FINANCIAL_IDS.length;
    } catch (error) {
        failed += 1;
        failures.push({
            stage: 'firestore_batch',
            detail: error instanceof Error ? error.message : String(error),
        });
    }

    const after = await postVerify(db);
    const inventoryEmpty =
        after.inventory.count === 0 && after.inventory.hash === EMPTY_LEDGER_HASH;
    const financialEmpty =
        after.financial.count === 0 && after.financial.hash === EMPTY_LEDGER_HASH;
    const appliedAt = new Date().toISOString();

    writeJson(join(outDir, 'purga-ledgers-32-apply.json'), {
        ...buildBaseReport('apply', exported),
        aborted: false,
        batched: true,
        batch_committed: batchCommitted,
        batch_order: [COLLECTION_INVENTORY, COLLECTION_FINANCIAL],
        inventory_deleted: inventoryDeleted,
        financial_deleted: financialDeleted,
        total_deleted: inventoryDeleted + financialDeleted,
        failed,
        failures,
        inventory_count: after.inventory.count,
        inventory_hash: after.inventory.hash,
        financial_count: after.financial.count,
        financial_hash: after.financial.hash,
        collections_preserved: inventoryEmpty && financialEmpty,
        started_at_utc: startedAt,
        applied_at_utc: appliedAt,
        confirmation_phrase: CONFIRMATION_PHRASE,
    });

    console.log(`INVENTORY_DELETED=${inventoryDeleted}`);
    console.log(`FINANCIAL_DELETED=${financialDeleted}`);
    console.log(`FAILED=${failed}`);
    console.log(`INVENTORY_COUNT=${after.inventory.count}`);
    console.log(`INVENTORY_HASH=${after.inventory.hash}`);
    console.log(`FINANCIAL_COUNT=${after.financial.count}`);
    console.log(`FINANCIAL_HASH=${after.financial.hash}`);
    console.log(
        `COLLECTIONS_PRESERVED=${inventoryEmpty && financialEmpty ? 'true' : 'false'}`
    );

    if (
        !batchCommitted ||
        inventoryDeleted !== 14 ||
        financialDeleted !== 18 ||
        failed !== 0 ||
        !inventoryEmpty ||
        !financialEmpty
    ) {
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
    await ejecutarPurgaLedgers32(options);
}

main().catch((error) => {
    console.error(
        '[purga-ledgers] ERROR:',
        error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
});
