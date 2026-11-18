/**
 * WEB-051-P1 — Fase B/C: purgador del clúster de simulacros.
 *
 * Dry-run por defecto. `--apply` exige whitelist ratificada, hash pinned,
 * inventario aprobado, TTY, frase de confirmación y `--approval-sha256`.
 *
 * No usa consultas abiertas para borrar: solo docIds de la whitelist.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
    assertOutDirOutsideRepo,
    initFirebaseGuarded,
    requireConfirmation,
    writeManifestAndReport,
} from './lib/forensic-utils';
import {
    BASE_CLIENT_IDS,
    BASE_CREDIT_IDS,
    CANDIDATE_CLIENT_IDS,
    CANDIDATE_PAYMENT_IDS,
    CANDIDATE_REMISION_IDS,
    COLLECTION_CLIENTES,
    COLLECTION_CREDITOS,
    COLLECTION_LEDGER,
    COLLECTION_LEDGER_INVENTARIO,
    COLLECTION_PAGOS_INVERSORES,
    COLLECTION_PAGOS_MULTAS,
    COLLECTION_REMISIONES,
    COLLECTION_SYS_ADMIN_USERS,
    COLLECTION_USUARIOS,
    CONFIRMATION_PHRASE,
    COUNTER_FIELD,
    COUNTER_PATH,
    COUNTER_YEAR_FIELD,
    DIRECTOR_EMAIL,
    E2E_EMAIL,
    E2E_UID,
    PROJECT_ID,
    PROHIBITED_FLAGS,
    SYS_ADMIN_TEST_EMAILS,
    TICKET,
    assertAllowedDeleteCollection,
    assertProject,
    collectionOf,
    collectReferenceMatches,
    computeWhitelistHash,
    fail,
    fingerprintData,
    hashDocs,
    isProhibitedEmail,
    normalizeEmail,
    num,
    serializeValue,
    sha256,
    text,
    timestampOf,
    toIso,
    validateWhitelist,
    type WhitelistFile,
} from './lib/web051-utils';

const PINNED_WHITELIST_SHA256 =
    '2be656d2e27f6d086ca98de724f2724877e66c606f56d16f2f095cf76dd09954';
const PINNED_INVENTORY_SHA256 =
    '9ade5a7105b02a86dc580aec03cf42e223ff12da44c720185f56d9abf1fbb0e7';
const DEFAULT_WHITELIST = 'scripts/fixtures/web051-whitelist.json';

const USAGE = [
    'Dry-run:',
    '  npx tsx scripts/web051-purga-simulacros.ts --project=tiendalasmotos \\',
    '    --whitelist=scripts/fixtures/web051-whitelist.json \\',
    '    --inventory=<ruta>/inventory.json --out=<fuera-del-repo>',
    '',
    'Apply (NO ejecutar sin aprobación de Fase C):',
    '  ... --approval-sha256=<hash> --apply',
    '',
    'Fixtures:',
    '  npx tsx scripts/web051-purga-simulacros.ts \\',
    '    --fixtures=scripts/fixtures/web051-purge-fixtures.json --out=<fuera-del-repo>',
].join('\n');

interface CliOptions {
    project: string;
    whitelistPath: string;
    inventoryPath: string;
    outDir: string;
    approvalSha256: string;
    apply: boolean;
    fixtures: string | null;
}

interface DocRecord {
    id: string;
    exists: boolean;
    data: Record<string, unknown>;
    serialized: Record<string, unknown>;
    fingerprint: string;
}

interface UniverseRow {
    collection: string;
    total: number;
    whitelist: number;
    extra: string[];
    status: string;
}

interface Row {
    status: 'APPROVED' | 'ABSENT' | 'REJECTED' | 'NOOP';
    action: string;
    path: string;
    fields: Record<string, unknown>;
    risk: string | null;
}

interface LiveState {
    creditos: DocRecord[];
    clientes: DocRecord[];
    pagos: DocRecord[];
    remisiones: DocRecord[];
    sysAdmin: DocRecord[];
    ledger: DocRecord[];
    ledgerInventario: DocRecord[];
    pagosInversores: DocRecord[];
    counter: DocRecord;
    authTargets: AuthTargetState[];
    authByUid: {
        found: boolean;
        email: string | null;
        error: string | null;
    };
    usuariosE2E: DocRecord;
    protectedLedger: {
        count: number;
        hash: string;
        referenceCount: number;
    };
}

interface AuthTargetState {
    email: string;
    expected_uid: string | null;
    whitelist_status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'ABSENT';
    found: boolean;
    uid: string | null;
    resolved_email: string | null;
    error: string | null;
    usuarios: DocRecord | null;
}

function parseArgs(argv: string[]): CliOptions {
    let project = '';
    let whitelistPath = DEFAULT_WHITELIST;
    let inventoryPath = '';
    let outDir = '';
    let approvalSha256 = '';
    let apply = false;
    let fixtures: string | null = null;

    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            console.log(USAGE);
            throw new Error('HELP_REQUESTED');
        }
        if (arg === '--apply') {
            apply = true;
            continue;
        }
        if (
            PROHIBITED_FLAGS.includes(
                arg as (typeof PROHIBITED_FLAGS)[number]
            )
        ) {
            fail('FLAG_PROHIBIDO', `${arg} no está permitido; DELETIONS=0`);
        }
        if (!arg.startsWith('--')) {
            fail('ARG_INVALIDO', arg);
        }
        const [rawKey, rawValue = ''] = arg.slice(2).split('=', 2);
        const key = rawKey.trim();
        const value = rawValue.trim();
        if (key === 'project') {
            project = value;
            continue;
        }
        if (key === 'whitelist') {
            whitelistPath = value;
            continue;
        }
        if (key === 'inventory') {
            inventoryPath = value;
            continue;
        }
        if (key === 'out') {
            outDir = value;
            continue;
        }
        if (key === 'approval-sha256') {
            approvalSha256 = value;
            continue;
        }
        if (key === 'fixtures') {
            fixtures = value;
            continue;
        }
        fail('FLAG_NO_RECONOCIDO', `--${key}`);
    }

    if (fixtures && apply) {
        fail('MODO_INVALIDO', '--fixtures y --apply son excluyentes');
    }
    if (!fixtures) {
        assertProject(project);
        if (!inventoryPath) fail('INVENTORY_REQUIRED', '--inventory=<archivo>');
        if (!outDir) fail('OUT_REQUIRED', '<fuera-del-repo>');
    }

    return {
        project,
        whitelistPath,
        inventoryPath,
        outDir,
        approvalSha256,
        apply,
        fixtures,
    };
}

function toDocRecord(snap: {
    id: string;
    exists?: boolean;
    data: () => Record<string, unknown> | undefined;
}): DocRecord {
    const exists = snap.exists !== false;
    const data = exists ? (snap.data() as Record<string, unknown>) : {};
    return {
        id: snap.id,
        exists,
        data,
        serialized: serializeValue(data) as Record<string, unknown>,
        fingerprint: exists ? fingerprintData(data) : '',
    };
}

function collectionRecords(snap: {
    docs: Array<{
        id: string;
        exists?: boolean;
        data: () => Record<string, unknown> | undefined;
    }>;
}): DocRecord[] {
    return snap.docs.map((doc) => toDocRecord(doc));
}

function findDoc(records: DocRecord[], docId: string): DocRecord | null {
    return records.find((record) => record.id === docId) ?? null;
}

function display(value: unknown): string {
    if (value === null || value === undefined || value === '') return 'AUSENTE';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return JSON.stringify(serializeValue(value));
}

function fieldsLine(fields: Record<string, unknown>): string {
    return Object.entries(fields)
        .map(([key, value]) => `${key}=${display(value)}`)
        .join(' | ');
}

function fieldOrNull(record: DocRecord | null, field: string): unknown {
    if (!record || !record.exists) return null;
    return record.data[field] ?? null;
}

function rowLine(row: Row): string {
    const risk = row.risk ? ` | RIESGO=${row.risk}` : '';
    return `[${row.status}] ${row.action} ${row.path} | ${fieldsLine(
        row.fields
    )}${risk}`;
}

function readJson<T>(path: string): { value: T; rawHash: string } {
    const raw = readFileSync(path, 'utf8');
    return {
        value: JSON.parse(raw) as T,
        rawHash: sha256(raw),
    };
}

function loadWhitelist(path: string): {
    whitelist: WhitelistFile;
    hash: string;
} {
    const { value, rawHash } = readJson<WhitelistFile>(path);
    validateWhitelist(value, { requireRatified: true });
    const hash = computeWhitelistHash(value);
    if (hash !== PINNED_WHITELIST_SHA256) {
        fail(
            'WHITELIST_HASH_MISMATCH',
            `expected=${PINNED_WHITELIST_SHA256} actual=${hash} raw=${rawHash}`
        );
    }
    return { whitelist: value, hash };
}

function loadInventory(
    path: string,
    whitelist: WhitelistFile
): { inventory: Record<string, unknown>; hash: string } {
    const { value, rawHash } = readJson<Record<string, unknown>>(path);
    if (rawHash !== PINNED_INVENTORY_SHA256) {
        fail(
            'INVENTORY_HASH_MISMATCH',
            `expected=${PINNED_INVENTORY_SHA256} actual=${rawHash}`
        );
    }
    if (whitelist.source_inventory_sha256 !== rawHash) {
        fail(
            'INVENTORY_HASH_MISMATCH',
            `whitelist.source=${whitelist.source_inventory_sha256} actual=${rawHash}`
        );
    }
    if (value.ticket !== TICKET) {
        fail('INVENTORY_INVALID', `ticket=${String(value.ticket)}`);
    }
    if (value.project_id !== PROJECT_ID) {
        fail('INVENTORY_INVALID', `project=${String(value.project_id)}`);
    }
    if (value.read_only !== true) {
        fail('INVENTORY_INVALID', 'read_only distinto de true');
    }
    return { inventory: value, hash: rawHash };
}

function buildUniverse(
    live: LiveState,
    whitelist: WhitelistFile
): UniverseRow[] {
    const group = (collection: string) =>
        whitelist.firestore.find((item) => item.collection === collection) ??
        null;
    const approvedIds = (collection: string): string[] =>
        (group(collection)?.docs ?? [])
            .filter((doc) => doc.status === 'APPROVED')
            .map((doc) => doc.doc_id);

    const rows: UniverseRow[] = [];
    const add = (
        collection: string,
        records: DocRecord[],
        whitelistIds: string[],
        statusOverride?: string
    ) => {
        const ids = new Set(records.map((record) => record.id));
        const present = whitelistIds.filter((id) => ids.has(id));
        const extra = records
            .map((record) => record.id)
            .filter((id) => !whitelistIds.includes(id));
        let status = statusOverride ?? 'OK';
        if (!statusOverride && extra.length > 0) status = 'EXTRA_DOCS';
        if (!statusOverride && present.length !== whitelistIds.length) {
            status = 'TARGET_MISSING';
        }
        rows.push({
            collection,
            total: records.length,
            whitelist: present.length,
            extra,
            status,
        });
    };

    add(COLLECTION_CREDITOS, live.creditos, approvedIds(COLLECTION_CREDITOS));
    add(COLLECTION_CLIENTES, live.clientes, approvedIds(COLLECTION_CLIENTES));
    add(
        COLLECTION_PAGOS_MULTAS,
        live.pagos,
        approvedIds(COLLECTION_PAGOS_MULTAS)
    );
    add(
        COLLECTION_REMISIONES,
        live.remisiones,
        approvedIds(COLLECTION_REMISIONES)
    );
    add(
        COLLECTION_SYS_ADMIN_USERS,
        live.sysAdmin,
        approvedIds(COLLECTION_SYS_ADMIN_USERS),
        'TARGET_ONLY'
    );
    add(
        COLLECTION_LEDGER,
        live.ledger,
        approvedIds(COLLECTION_LEDGER),
        'TARGETED'
    );
    add(
        COLLECTION_LEDGER_INVENTARIO,
        live.ledgerInventario,
        live.ledgerInventario.map((record) => record.id),
        'PROTECTED'
    );
    rows.push({
        collection: COLLECTION_PAGOS_INVERSORES,
        total: live.pagosInversores.length,
        whitelist: 0,
        extra: live.pagosInversores.map((record) => record.id),
        status: live.pagosInversores.length === 0 ? 'ABSENT' : 'NOT_EMPTY',
    });
    return rows;
}

async function buildLiveState(
    project: string,
    outDir: string,
    whitelist: WhitelistFile
): Promise<LiveState> {
    const { db } = initFirebaseGuarded({
        outDir,
        projectId: project,
    });
    const app = getApps()[0];
    if (!app) fail('FIREBASE_APP_MISSING', 'sin app Admin');
    const auth = getAuth(app);

    const creditos = collectionRecords(
        await db.collection(COLLECTION_CREDITOS).get()
    );
    const clientes = collectionRecords(
        await db.collection(COLLECTION_CLIENTES).get()
    );
    const pagos = collectionRecords(
        await db.collection(COLLECTION_PAGOS_MULTAS).get()
    );
    const remisiones = collectionRecords(
        await db.collection(COLLECTION_REMISIONES).get()
    );
    const sysAdmin = collectionRecords(
        await db.collection(COLLECTION_SYS_ADMIN_USERS).get()
    );
    const ledger = collectionRecords(
        await db.collection(COLLECTION_LEDGER).get()
    );
    const ledgerInventario = collectionRecords(
        await db.collection(COLLECTION_LEDGER_INVENTARIO).get()
    );
    const pagosInversores = collectionRecords(
        await db.collection(COLLECTION_PAGOS_INVERSORES).limit(1).get()
    );
    const counter = toDocRecord(await db.doc(COUNTER_PATH).get());

    const targetDefs = [
        {
            email: whitelist.auth.email,
            expected_uid: whitelist.auth.expected_uid,
            whitelist_status: whitelist.auth.status,
        },
        ...(whitelist.auth.targets ?? []).map((target) => ({
            email: target.email,
            expected_uid: target.expected_uid,
            whitelist_status: target.status,
        })),
    ];

    const authTargets: AuthTargetState[] = [];
    for (const def of targetDefs) {
        let found = false;
        let uid: string | null = null;
        let resolvedEmail: string | null = null;
        let targetError: string | null = null;
        try {
            const user = await auth.getUserByEmail(def.email);
            found = true;
            uid = user.uid;
            resolvedEmail = user.email ?? null;
        } catch (error) {
            const code =
                typeof error === 'object' &&
                error !== null &&
                'code' in error
                    ? String((error as { code?: unknown }).code)
                    : '';
            targetError =
                code === 'auth/user-not-found'
                    ? 'AUTH_USER_NOT_FOUND'
                    : error instanceof Error
                      ? error.message
                      : 'Error desconocido en Auth';
        }
        const usuarios =
            uid !== null
                ? toDocRecord(
                      await db.collection(COLLECTION_USUARIOS).doc(uid).get()
                  )
                : null;
        authTargets.push({
            email: def.email,
            expected_uid: def.expected_uid,
            whitelist_status: def.whitelist_status,
            found,
            uid,
            resolved_email: resolvedEmail,
            error: targetError,
            usuarios,
        });
    }

    let authByUidFound = false;
    let authByUidEmail: string | null = null;
    let authByUidError: string | null = null;
    try {
        const user = await auth.getUser(E2E_UID);
        authByUidFound = true;
        authByUidEmail = user.email ?? null;
    } catch (error) {
        const code =
            typeof error === 'object' && error !== null && 'code' in error
                ? String((error as { code?: unknown }).code)
                : '';
        authByUidError =
            code === 'auth/user-not-found'
                ? 'AUTH_USER_NOT_FOUND'
                : error instanceof Error
                  ? error.message
                  : 'Error desconocido en Auth';
    }

    const usuariosE2E = toDocRecord(
        await db.collection(COLLECTION_USUARIOS).doc(E2E_UID).get()
    );
    const protectedLedger = hashDocs(
        ledgerInventario.map((record) => ({
            id: record.id,
            data: record.data,
        }))
    );
    const protectedRefs = ledgerInventario.flatMap((record) =>
        collectReferenceMatches(record.data)
    );

    return {
        creditos,
        clientes,
        pagos,
        remisiones,
        sysAdmin,
        ledger,
        ledgerInventario,
        pagosInversores,
        counter,
        authTargets,
        authByUid: {
            found: authByUidFound,
            email: authByUidEmail,
            error: authByUidError,
        },
        usuariosE2E,
        protectedLedger: {
            count: protectedLedger.count,
            hash: protectedLedger.hash,
            referenceCount: protectedRefs.length,
        },
    };
}

function buildRows(
    live: LiveState,
    whitelist: WhitelistFile
): { rows: Row[]; noop: Row[]; blocked: string[] } {
    const rows: Row[] = [];
    const noop: Row[] = [];
    const blocked: string[] = [];
    const fieldsFor = (collection: string, doc: DocRecord): Record<string, unknown> => {
        if (collection === COLLECTION_CLIENTES) {
            return {
                cedula: doc.data.cedula,
                nombres: doc.data.nombres,
                celular: doc.data.celular,
                fecha_registro: timestampOf(doc.data).iso,
            };
        }
        if (collection === COLLECTION_CREDITOS) {
            return {
                numero_credito: doc.data.numero_credito,
                id_cliente: doc.data.id_cliente,
                fecha_registro:
                    toIso(doc.data.fecha_registro) ??
                    timestampOf(doc.data).iso,
            };
        }
        if (collection === COLLECTION_PAGOS_MULTAS) {
            return {
                id_credito: doc.data.id_credito,
                valor_neto_empresa: doc.data.valor_neto_empresa,
            };
        }
        if (collection === COLLECTION_REMISIONES) {
            return {
                monto: doc.data.monto,
                id_credito: doc.data.id_credito,
            };
        }
        if (collection === COLLECTION_SYS_ADMIN_USERS) {
            return {
                name: doc.data.name,
                email: doc.data.email,
                active: doc.data.active,
            };
        }
        if (collection === COLLECTION_LEDGER) {
            return {
                coleccion: collectionOf(doc.data),
                operacion: doc.data.operacion,
                timestamp: timestampOf(doc.data).iso,
            };
        }
        return doc.serialized;
    };
    const recordFor = (collection: string): DocRecord[] => {
        if (collection === COLLECTION_CREDITOS) return live.creditos;
        if (collection === COLLECTION_CLIENTES) return live.clientes;
        if (collection === COLLECTION_PAGOS_MULTAS) return live.pagos;
        if (collection === COLLECTION_REMISIONES) return live.remisiones;
        if (collection === COLLECTION_SYS_ADMIN_USERS) return live.sysAdmin;
        if (collection === COLLECTION_LEDGER) return live.ledger;
        return [];
    };

    for (const group of whitelist.firestore) {
        assertAllowedDeleteCollection(group.collection);
        for (const doc of group.docs) {
            if (doc.status !== 'APPROVED') continue;
            const liveDoc = findDoc(recordFor(group.collection), doc.doc_id);
            if (!liveDoc || !liveDoc.exists) {
                rows.push({
                    status: 'ABSENT',
                    action: 'DELETE',
                    path: `${group.collection}/${doc.doc_id}`,
                    fields: {},
                    risk: 'ALREADY_ABSENT',
                });
                continue;
            }
            if (doc.fingerprint && liveDoc.fingerprint !== doc.fingerprint) {
                rows.push({
                    status: 'REJECTED',
                    action: 'DELETE',
                    path: `${group.collection}/${doc.doc_id}`,
                    fields: fieldsFor(group.collection, liveDoc),
                    risk: 'FINGERPRINT_DRIFT',
                });
                blocked.push(`FINGERPRINT_DRIFT:${group.collection}/${doc.doc_id}`);
                continue;
            }
            rows.push({
                status: 'APPROVED',
                action:
                    group.collection === COLLECTION_LEDGER
                        ? 'LEDGER_DELETE'
                        : 'DELETE',
                path: `${group.collection}/${doc.doc_id}`,
                fields: fieldsFor(group.collection, liveDoc),
                risk: doc.risk ?? null,
            });
        }
    }

    const counterCount = num(fieldOrNull(live.counter, COUNTER_FIELD));
    if (!live.counter.exists) {
        noop.push({
            status: 'ABSENT',
            action: 'COUNTER_ABSENT',
            path: COUNTER_PATH,
            fields: {},
            risk: null,
        });
    } else if (counterCount === null) {
        rows.push({
            status: 'REJECTED',
            action: 'COUNTER_RESET',
            path: COUNTER_PATH,
            fields: {
                creditoCount: counterCount,
                creditoYear: fieldOrNull(live.counter, COUNTER_YEAR_FIELD),
            },
            risk: 'COUNTER_INVALID',
        });
        blocked.push('COUNTER_INVALID');
    } else {
        rows.push({
            status: 'APPROVED',
            action: 'COUNTER_RESET',
            path: COUNTER_PATH,
            fields: {
                creditoCount: counterCount,
                creditoYear: fieldOrNull(live.counter, COUNTER_YEAR_FIELD),
            },
            risk: null,
        });
    }

    for (const target of live.authTargets) {
        if (target.whitelist_status === 'ABSENT') {
            if (target.found) {
                rows.push({
                    status: 'REJECTED',
                    action: 'AUTH_DELETE',
                    path: `auth/${target.email}`,
                    fields: { uid: target.uid, email: target.resolved_email },
                    risk: 'AUTH_STATE_DRIFT',
                });
                blocked.push(`AUTH_STATE_DRIFT:${target.email}`);
            } else {
                noop.push({
                    status: 'ABSENT',
                    action: 'AUTH_ALREADY_ABSENT',
                    path: `auth/${target.email}`,
                    fields: { error: target.error },
                    risk: null,
                });
            }
            continue;
        }
        if (target.whitelist_status !== 'APPROVED') continue;
        if (!target.found) {
            rows.push({
                status: 'REJECTED',
                action: 'AUTH_DELETE',
                path: `auth/${target.email}`,
                fields: { error: target.error },
                risk: 'AUTH_EMAIL_NOT_FOUND',
            });
            blocked.push(`AUTH_EMAIL_NOT_FOUND:${target.email}`);
            continue;
        }
        if (
            normalizeEmail(target.resolved_email) !==
            normalizeEmail(target.email)
        ) {
            rows.push({
                status: 'REJECTED',
                action: 'AUTH_DELETE',
                path: `auth/${target.email}`,
                fields: {
                    uid: target.uid,
                    email: target.resolved_email,
                },
                risk: 'AUTH_EMAIL_MISMATCH',
            });
            blocked.push(`AUTH_EMAIL_MISMATCH:${target.email}`);
            continue;
        }
        if (
            target.expected_uid &&
            target.uid !== target.expected_uid
        ) {
            rows.push({
                status: 'REJECTED',
                action: 'AUTH_DELETE',
                path: `auth/${target.email}`,
                fields: {
                    uid: target.uid,
                    expected_uid: target.expected_uid,
                },
                risk: 'AUTH_UID_MISMATCH',
            });
            blocked.push(`AUTH_UID_MISMATCH:${target.email}`);
            continue;
        }
        rows.push({
            status: 'APPROVED',
            action: 'AUTH_DELETE',
            path: `auth/${target.email}`,
            fields: { uid: target.uid, email: target.resolved_email },
            risk: null,
        });
        const usuariosEmail = fieldOrNull(target.usuarios, 'email');
        if (target.usuarios?.exists && isProhibitedEmail(usuariosEmail)) {
            blocked.push(`AUTH_UID_SHARED_WITH_REAL_USER:${target.email}`);
        }
    }

    if (live.authByUid.found) {
        const realUser =
            normalizeEmail(live.authByUid.email) !== E2E_EMAIL;
        noop.push({
            status: 'NOOP',
            action: 'AUTH_UID_PRESERVED',
            path: `auth/${E2E_UID}`,
            fields: { email: live.authByUid.email },
            risk: realUser ? 'AUTH_UID_REAL_USER' : null,
        });
    }

    const usuariosE2EEmail = fieldOrNull(live.usuariosE2E, 'email');
    if (live.usuariosE2E.exists && isProhibitedEmail(usuariosE2EEmail)) {
        blocked.push('AUTH_UID_SHARED_WITH_REAL_USER');
    }

    if (live.pagosInversores.length > 0) {
        blocked.push('PAGOS_INVERSORES_NOT_EMPTY');
    }
    if (live.protectedLedger.referenceCount > 0) {
        blocked.push('PROTECTED_LEDGER_REFERENCES');
    }
    noop.push({
        status: 'NOOP',
        action: 'PAGOS_INVERSORES_ABSENT',
        path: COLLECTION_PAGOS_INVERSORES,
        fields: { total: live.pagosInversores.length },
        risk:
            live.pagosInversores.length === 0
                ? null
                : 'PAGOS_INVERSORES_NOT_EMPTY',
    });
    noop.push({
        status: 'NOOP',
        action: 'PROTECTED_LEDGER',
        path: COLLECTION_LEDGER_INVENTARIO,
        fields: {
            count: live.protectedLedger.count,
            hash: live.protectedLedger.hash,
            reference_count: live.protectedLedger.referenceCount,
        },
        risk:
            live.protectedLedger.referenceCount === 0
                ? null
                : 'PROTECTED_LEDGER_REFERENCES',
    });

    return { rows, noop, blocked };
}

function buildDryRunReport(
    whitelist: WhitelistFile,
    inventory: Record<string, unknown>,
    live: LiveState,
    whitelistHash: string,
    inventoryHash: string
): {
    text: string;
    universe: UniverseRow[];
    rows: Row[];
    noop: Row[];
    blocked: string[];
} {
    const universe = buildUniverse(live, whitelist);
    const { rows, noop, blocked } = buildRows(live, whitelist);
    const pending = whitelist.firestore.flatMap((group) =>
        group.docs.filter((doc) => doc.status === 'PENDING')
    ).length;
    const lines: string[] = [];
    lines.push('WEB-051-P1 — DRY RUN');
    lines.push(`PROJECT=${PROJECT_ID}`);
    lines.push('MODE=DRY-RUN');
    lines.push(`WHITELIST_SHA256=${whitelistHash}`);
    lines.push(`INVENTORY_SHA256=${inventoryHash}`);
    lines.push(`RATIFIED=${whitelist.ratified ? 'true' : 'false'}`);
    lines.push(`PENDING=${pending}`);
    lines.push('DELETIONS=0');
    lines.push('WRITES=0');
    lines.push('');
    lines.push('UNIVERSE');
    for (const row of universe) {
        lines.push(
            `${row.collection} total=${row.total} whitelist=${row.whitelist} extra=${row.extra.length} status=${row.status}`
        );
    }
    lines.push('');
    lines.push('ROWS');
    if (rows.length === 0) lines.push('NINGUNO');
    for (const row of rows) lines.push(rowLine(row));
    lines.push('');
    lines.push('NOOP');
    if (noop.length === 0) lines.push('NINGUNO');
    for (const row of noop) lines.push(rowLine(row));
    lines.push('');
    lines.push('EXPECTED_POST_STATE');
    lines.push('creditos=0');
    lines.push('clientes_credito=0');
    lines.push('pagos_y_multas=0');
    lines.push('remisiones_dinero=0');
    lines.push('pagos_inversores=0');
    lines.push(
        'sys_admin_users: sin prueba@prueba.com, admin@tiendalasmotos.com, test_admin@tiendalasmotos.com, admin.creditos@tiendalasmotos.com, web038.s7@tiendalasmotos.com'
    );
    lines.push('historial_auditoria: sin asientos E2E ni referencias');
    lines.push('historial_auditoria_inventario: count/hash sin cambios');
    lines.push('creditoCount=0');
    lines.push(
        'auth: not-found para prueba@prueba.com, admin@tiendalasmotos.com, test_admin@tiendalasmotos.com, admin.creditos@tiendalasmotos.com, web038.s7@tiendalasmotos.com'
    );
    lines.push('');
    lines.push(`BLOCKED=${blocked.length === 0 ? 'false' : 'true'}`);
    for (const item of blocked) lines.push(`BLOCK=${item}`);
    lines.push('DELETIONS=0');
    lines.push('WRITES=0');
    const text = lines.join('\n');
    return { text, universe, rows, noop, blocked };
}

function mutationClone(whitelist: WhitelistFile): WhitelistFile {
    return JSON.parse(JSON.stringify(whitelist)) as WhitelistFile;
}

function groupOf(
    whitelist: WhitelistFile,
    collection: string
): WhitelistFile['firestore'][number] {
    const group = whitelist.firestore.find(
        (item) => item.collection === collection
    );
    if (!group) fail('WHITELIST_INVALID', `grupo ausente: ${collection}`);
    return group;
}

function errorCode(error: unknown): string {
    if (error instanceof Error) return error.message.split(':')[0];
    return String(error);
}

function runFixtures(
    fixturesPath: string,
    whitelistPath: string,
    outDir: string
): void {
    const fixtures = readJson<{
        ticket: string;
        base_whitelist: string;
        cases: Array<{ name: string; case: string; expected: string }>;
    }>(fixturesPath).value;
    if (fixtures.ticket !== TICKET) {
        fail('FIXTURES_INVALID', `ticket=${fixtures.ticket}`);
    }
    const base = readJson<WhitelistFile>(whitelistPath).value;
    validateWhitelist(base, { requireRatified: true });
    const results: Array<{
        name: string;
        expected: string;
        actual: string;
        pass: boolean;
    }> = [];

    for (const item of fixtures.cases) {
        let actual = 'NO_ERROR';
        try {
            const clone = mutationClone(base);
            if (item.case === 'extra_credit_id') {
                groupOf(clone, COLLECTION_CREDITOS).docs.push({
                    doc_id: 'EXTRA-ID',
                    status: 'APPROVED',
                    justification: 'fixture',
                });
                validateWhitelist(clone, { requireRatified: true });
            } else if (item.case === 'missing_base_client') {
                const group = groupOf(clone, COLLECTION_CLIENTES);
                group.docs = group.docs.filter(
                    (doc) => doc.doc_id !== BASE_CLIENT_IDS[0]
                );
                validateWhitelist(clone, { requireRatified: true });
            } else if (item.case === 'protected_ledger_collection') {
                const group = groupOf(clone, COLLECTION_LEDGER);
                group.collection = COLLECTION_LEDGER_INVENTARIO;
                validateWhitelist(clone, { requireRatified: true });
            } else if (item.case === 'real_user_email') {
                const group = groupOf(clone, COLLECTION_SYS_ADMIN_USERS);
                group.docs[0].doc_id = 'tobiasgaitan@gmail.com';
                validateWhitelist(clone, { requireRatified: true });
            } else if (item.case === 'counter_wrong_path') {
                clone.counter.path = 'configuracion/otro';
                validateWhitelist(clone, { requireRatified: true });
            } else if (item.case === 'counter_wrong_field') {
                clone.counter.field = 'otro';
                validateWhitelist(clone, { requireRatified: true });
            } else if (item.case === 'pending_candidate_apply') {
                const group = groupOf(clone, COLLECTION_CLIENTES);
                const candidate = group.docs.find(
                    (doc) => doc.doc_id === CANDIDATE_CLIENT_IDS[0]
                );
                if (!candidate) fail('FIXTURES_INVALID', 'candidato ausente');
                candidate.status = 'PENDING';
                validateWhitelist(clone, { requireRatified: true });
            } else if (item.case === 'pagos_inversores_nonempty') {
                clone.pagos_inversores.status =
                    'PRESENT' as unknown as 'ABSENT';
                validateWhitelist(clone, { requireRatified: true });
            } else if (item.case === 'subcollection_not_approved') {
                clone.subcollections.push({
                    parent: `${COLLECTION_CLIENTES}/${CANDIDATE_CLIENT_IDS[0]}`,
                    collection: 'subcoleccion-test',
                    status: 'PENDING',
                });
                validateWhitelist(clone, { requireRatified: true });
            } else if (item.case === 'project_mismatch') {
                assertProject('proyecto-no-autorizado');
            } else {
                fail('FIXTURES_INVALID', `caso desconocido=${item.case}`);
            }
        } catch (error) {
            actual = errorCode(error);
        }
        results.push({
            name: item.name,
            expected: item.expected,
            actual,
            pass: actual === item.expected,
        });
    }

    const passed = results.filter((result) => result.pass).length;
    console.log(`FIXTURES=${passed}/${results.length}`);
    for (const result of results) {
        console.log(
            `${result.pass ? 'PASS' : 'FAIL'} ${result.name}: expected=${result.expected} actual=${result.actual}`
        );
    }
    if (outDir) {
        const out = assertOutDirOutsideRepo(outDir);
        writeManifestAndReport(
            out,
            'fixtures.json',
            {
                ticket: TICKET,
                mode: 'fixtures',
                passed,
                total: results.length,
                results,
            },
            `FIXTURES=${passed}/${results.length}\n${results
                .map(
                    (result) =>
                        `${result.pass ? 'PASS' : 'FAIL'} ${result.name}: expected=${result.expected} actual=${result.actual}`
                )
                .join('\n')}`,
            {},
            {
                ticket: TICKET,
                mode: 'fixtures',
                project_id: PROJECT_ID,
            }
        );
    }
    if (passed !== results.length) {
        process.exitCode = 1;
    }
}

async function applyPurge(
    options: CliOptions,
    whitelist: WhitelistFile,
    inventory: Record<string, unknown>,
    live: LiveState,
    whitelistHash: string,
    inventoryHash: string,
    outDir: string
): Promise<void> {
    if (!whitelist.ratified) {
        fail('APPLY_BLOCKED', 'whitelist no ratificada; DELETIONS=0');
    }
    if (whitelistHash !== PINNED_WHITELIST_SHA256) {
        fail('APPLY_BLOCKED', 'whitelist hash mismatch; DELETIONS=0');
    }
    const approvalHashes = new Set([
        PINNED_WHITELIST_SHA256,
        PINNED_INVENTORY_SHA256,
    ]);
    if (!approvalHashes.has(options.approvalSha256)) {
        fail('APPLY_BLOCKED', 'approval-sha256 mismatch; DELETIONS=0');
    }
    if (inventoryHash !== PINNED_INVENTORY_SHA256) {
        fail('APPLY_BLOCKED', 'inventory hash mismatch; DELETIONS=0');
    }
    if (!process.stdin.isTTY) {
        fail('TTY_REQUIRED', '--apply exige TTY; DELETIONS=0');
    }
    const confirmed = await requireConfirmation(
        '[web051] MODO DESTRUCTIVO: se eliminarán 18 documentos, se borrará el usuario Auth si existe y se reseteará creditoCount.\n' +
            'El ledger historial_auditoria_inventario no se toca.',
        CONFIRMATION_PHRASE
    );
    if (!confirmed) {
        console.log('DELETIONS=0');
        process.exitCode = 2;
        return;
    }

    const dryRun = buildDryRunReport(
        whitelist,
        inventory,
        live,
        whitelistHash,
        inventoryHash
    );
    if (dryRun.blocked.length > 0) {
        fail(
            'APPLY_BLOCKED',
            `preflight bloqueado: ${dryRun.blocked.join(', ')}; DELETIONS=0`
        );
    }

    const { db } = initFirebaseGuarded({
        outDir,
        projectId: PROJECT_ID,
    });
    const app = getApps()[0];
    if (!app) fail('FIREBASE_APP_MISSING', 'sin app Admin');
    const auth = getAuth(app);

    const startedAt = new Date().toISOString();
    let batchDeletes = 0;
    let recursiveDeletes = 0;
    let alreadyAbsent = 0;
    const batch = db.batch();

    for (const group of whitelist.firestore) {
        assertAllowedDeleteCollection(group.collection);
        for (const doc of group.docs) {
            if (doc.status !== 'APPROVED') continue;
            const ref = db.collection(group.collection).doc(doc.doc_id);
            const snap = await ref.get();
            if (!snap.exists) {
                alreadyAbsent += 1;
                continue;
            }
            if (group.collection === COLLECTION_LEDGER) {
                batch.delete(ref);
                batchDeletes += 1;
                continue;
            }
            const subcollections = await ref.listCollections();
            if (subcollections.length > 0) {
                for (const sub of subcollections) {
                    const key = `${group.collection}/${doc.doc_id}/${sub.id}`;
                    const approved = whitelist.subcollections.some(
                        (item) =>
                            item.status === 'APPROVED' &&
                            `${item.parent}/${item.collection}` === key
                    );
                    if (!approved) {
                        fail('SUBCOLLECTION_NOT_APPROVED', key);
                    }
                }
                await db.recursiveDelete(ref);
                recursiveDeletes += 1;
            } else {
                batch.delete(ref);
                batchDeletes += 1;
            }
        }
    }

    if (batchDeletes > 0) {
        await batch.commit();
    }

    const authDeletedEmails: string[] = [];
    const authAlreadyAbsentEmails: string[] = [];
    const authNotFoundEmails: string[] = [];

    for (const target of live.authTargets) {
        if (target.whitelist_status === 'ABSENT') {
            if (target.found) {
                fail(
                    'AUTH_STATE_DRIFT',
                    `${target.email}: whitelist ABSENT pero Auth existe; DELETIONS parciales`
                );
            }
            authAlreadyAbsentEmails.push(target.email);
            continue;
        }
        if (target.whitelist_status !== 'APPROVED') {
            fail(
                'APPROVAL_PENDING',
                `${target.email}: status=${target.whitelist_status}`
            );
        }
        if (!target.found || !target.uid) {
            authNotFoundEmails.push(target.email);
            fail(
                'AUTH_EMAIL_NOT_FOUND',
                `${target.email}; DELETIONS parciales`
            );
        }
        if (
            normalizeEmail(target.resolved_email) !==
            normalizeEmail(target.email)
        ) {
            fail(
                'AUTH_EMAIL_MISMATCH',
                `${target.email}; DELETIONS parciales`
            );
        }
        if (target.expected_uid && target.uid !== target.expected_uid) {
            fail(
                'AUTH_UID_MISMATCH',
                `${target.email}; DELETIONS parciales`
            );
        }
        if (
            target.usuarios?.exists &&
            isProhibitedEmail(fieldOrNull(target.usuarios, 'email'))
        ) {
            fail(
                'AUTH_UID_SHARED_WITH_REAL_USER',
                `${target.email}; DELETIONS parciales`
            );
        }
        await auth.deleteUser(target.uid);
        authDeletedEmails.push(target.email);
    }

    if (
        live.usuariosE2E.exists &&
        isProhibitedEmail(fieldOrNull(live.usuariosE2E, 'email'))
    ) {
        fail(
            'AUTH_UID_SHARED_WITH_REAL_USER',
            `usuarios/${E2E_UID}; DELETIONS parciales`
        );
    }

    let counterBefore = num(fieldOrNull(live.counter, COUNTER_FIELD));
    if (live.counter.exists && counterBefore !== null && counterBefore > 0) {
        await db.doc(COUNTER_PATH).set(
            { [COUNTER_FIELD]: 0 },
            { merge: true }
        );
    }
    const after = await buildLiveState(PROJECT_ID, outDir, whitelist);
    const afterCounter = num(fieldOrNull(after.counter, COUNTER_FIELD));
    const remainingTargets: string[] = [];
    for (const group of whitelist.firestore) {
        for (const doc of group.docs) {
            if (doc.status !== 'APPROVED') continue;
            const ref = db.collection(group.collection).doc(doc.doc_id);
            const snap = await ref.get();
            if (snap.exists) remainingTargets.push(`${group.collection}/${doc.doc_id}`);
        }
    }
    const parity =
        remainingTargets.length === 0 &&
        after.creditos.length === 0 &&
        after.clientes.length === 0 &&
        after.pagos.length === 0 &&
        after.remisiones.length === 0 &&
        after.pagosInversores.length === 0 &&
        !after.sysAdmin.some((doc) =>
            (SYS_ADMIN_TEST_EMAILS as readonly string[]).includes(doc.id)
        ) &&
        after.authTargets.every((target) => !target.found) &&
        after.protectedLedger.count === live.protectedLedger.count &&
        after.protectedLedger.hash === live.protectedLedger.hash &&
        afterCounter === 0;
    const appliedAt = new Date().toISOString();
    const report = {
        ticket: TICKET,
        mode: 'apply',
        project_id: PROJECT_ID,
        whitelist_sha256: whitelistHash,
        inventory_sha256: inventoryHash,
        started_at_utc: startedAt,
        applied_at_utc: appliedAt,
        batch_deletes: batchDeletes,
        recursive_deletes: recursiveDeletes,
        already_absent: alreadyAbsent,
        failed: 0,
        auth_deleted: authDeletedEmails,
        auth_deleted_count: authDeletedEmails.length,
        auth_already_absent: authAlreadyAbsentEmails,
        auth_not_found: authNotFoundEmails,
        auth_targets_after: after.authTargets.map((target) => ({
            email: target.email,
            found: target.found,
        })),
        real_uid_preserved: after.authByUid.found,
        counter_before: counterBefore,
        counter_after: afterCounter,
        remaining_targets: remainingTargets,
        protected_ledger_before: live.protectedLedger,
        protected_ledger_after: after.protectedLedger,
        parity: parity ? 'PASS' : 'FAIL',
    };
    writeManifestAndReport(
        outDir,
        'apply.json',
        report,
        [
            'WEB-051-P1 — APPLY',
            `PARITY=${report.parity}`,
            `BATCH_DELETES=${batchDeletes}`,
            `RECURSIVE_DELETES=${recursiveDeletes}`,
            `ALREADY_ABSENT=${alreadyAbsent}`,
            `FAILED=0`,
            `AUTH_DELETED=${authDeletedEmails.length}`,
            `AUTH_DELETED_EMAILS=${authDeletedEmails.join(',')}`,
            `AUTH_ALREADY_ABSENT=${authAlreadyAbsentEmails.length}`,
            `AUTH_ALREADY_ABSENT_EMAILS=${authAlreadyAbsentEmails.join(',')}`,
            `AUTH_NOT_FOUND=${authNotFoundEmails.length}`,
            `REAL_UID_PRESERVED=${after.authByUid.found}`,
            `COUNTER_BEFORE=${display(counterBefore)}`,
            `COUNTER_AFTER=${display(afterCounter)}`,
            `REMAINING_TARGETS=${remainingTargets.length}`,
            `PROTECTED_LEDGER_COUNT=${after.protectedLedger.count}`,
            `PROTECTED_LEDGER_HASH=${after.protectedLedger.hash}`,
        ].join('\n'),
        {},
        {
            ticket: TICKET,
            mode: 'apply',
            project_id: PROJECT_ID,
            whitelist_sha256: whitelistHash,
            inventory_sha256: inventoryHash,
        }
    );
    console.log(`PARITY=${report.parity}`);
    console.log(`BATCH_DELETES=${batchDeletes}`);
    console.log(`RECURSIVE_DELETES=${recursiveDeletes}`);
    console.log(`ALREADY_ABSENT=${alreadyAbsent}`);
    console.log(`FAILED=0`);
    console.log(`AUTH_DELETED=${authDeletedEmails.length}`);
    console.log(`AUTH_DELETED_EMAILS=${authDeletedEmails.join(',')}`);
    console.log(`AUTH_ALREADY_ABSENT=${authAlreadyAbsentEmails.length}`);
    console.log(`AUTH_NOT_FOUND=${authNotFoundEmails.length}`);
    console.log(`REAL_UID_PRESERVED=${after.authByUid.found}`);
    console.log(`COUNTER_BEFORE=${display(counterBefore)}`);
    console.log(`COUNTER_AFTER=${display(afterCounter)}`);
    console.log(`REMAINING_TARGETS=${remainingTargets.length}`);
    if (!parity) process.exitCode = 1;
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));

    if (options.fixtures) {
        runFixtures(
            options.fixtures,
            options.whitelistPath,
            options.outDir
        );
        return;
    }

    const { whitelist, hash: whitelistHash } = loadWhitelist(
        options.whitelistPath
    );
    const { inventory, hash: inventoryHash } = loadInventory(
        options.inventoryPath,
        whitelist
    );
    const outDir = assertOutDirOutsideRepo(options.outDir);
    const live = await buildLiveState(PROJECT_ID, outDir, whitelist);
    const dryRun = buildDryRunReport(
        whitelist,
        inventory,
        live,
        whitelistHash,
        inventoryHash
    );

    if (options.apply) {
        await applyPurge(
            options,
            whitelist,
            inventory,
            live,
            whitelistHash,
            inventoryHash,
            outDir
        );
        return;
    }

    writeManifestAndReport(
        outDir,
        'dry-run.json',
        {
            ticket: TICKET,
            mode: 'dry-run',
            project_id: PROJECT_ID,
            whitelist_sha256: whitelistHash,
            inventory_sha256: inventoryHash,
            ratified: whitelist.ratified,
            pending: whitelist.firestore
                .flatMap((group) => group.docs)
                .filter((doc) => doc.status === 'PENDING').length,
            deletions: 0,
            writes: 0,
            rows: dryRun.rows,
            noop: dryRun.noop,
            universe: dryRun.universe,
            blocked: dryRun.blocked,
            expected_post_state: {
                creditos: 0,
                clientes_credito: 0,
                pagos_y_multas: 0,
                remisiones_dinero: 0,
                pagos_inversores: 0,
                sys_admin_users_target: false,
                ledger_targeted: 0,
                protected_ledger_unchanged: true,
                credito_count: 0,
                auth: 'not-found',
            },
        },
        dryRun.text,
        {
            'rows.json': dryRun.rows,
            'noop.json': dryRun.noop,
            'universe.json': dryRun.universe,
        },
        {
            ticket: TICKET,
            mode: 'dry-run',
            project_id: PROJECT_ID,
            whitelist_sha256: whitelistHash,
            inventory_sha256: inventoryHash,
            ratified: whitelist.ratified,
            deletions: 0,
            writes: 0,
            blocked: dryRun.blocked,
        }
    );
    console.log(dryRun.text);
}

main().catch((error) => {
    console.error(
        '[web051-purga] ERROR:',
        error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
});
