/**
 * WEB-051-P1 — Fase A, MT-0: inventario read-only del clúster de simulacros.
 *
 * No escribe en Firestore, Storage ni Auth. Solo escribe evidencia fuera del
 * repositorio (inventory.json, report.md y manifest.json con hashes).
 *
 * Uso:
 *   npx tsx scripts/web051-inventario-simulacros.ts \
 *     --project=tiendalasmotos --out=<directorio-fuera-del-repo>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
    assertOutDirOutsideRepo,
    initFirebaseGuarded,
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
    COUNTER_FIELD,
    COUNTER_PATH,
    COUNTER_YEAR_FIELD,
    E2E_EMAIL,
    E2E_UID,
    E2E_WINDOW_START_UTC,
    PROJECT_ID,
    PROHIBITED_FLAGS,
    TICKET,
    assertProject,
    collectionOf,
    collectReferenceMatches,
    computeWhitelistHash,
    fail,
    fingerprintData,
    hashDocs,
    isE2eWindowEntry,
    isProhibitedEmail,
    normalizeEmail,
    num,
    serializeValue,
    text,
    timestampOf,
    validateWhitelist,
    type WhitelistFile,
} from './lib/web051-utils';

const USAGE =
    'Uso: npx tsx scripts/web051-inventario-simulacros.ts --project=tiendalasmotos --out=<fuera-del-repo>';

interface CliOptions {
    project: string;
    outDir: string;
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

interface CandidateRow {
    collection: string;
    doc_id: string;
    status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'ABSENT' | 'NOOP';
    action:
        | 'DELETE'
        | 'AUTH_DELETE'
        | 'COUNTER_RESET'
        | 'LEDGER_DELETE'
        | 'NONE';
    justification: string;
    fields: Record<string, unknown>;
    risk: string | null;
}

function parseArgs(argv: string[]): CliOptions {
    let project = '';
    let outDir = '';

    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            console.log(USAGE);
            throw new Error('HELP_REQUESTED');
        }
        if (
            PROHIBITED_FLAGS.includes(
                arg as (typeof PROHIBITED_FLAGS)[number]
            )
        ) {
            fail('FLAG_PROHIBIDO', `${arg} no está permitido; WRITES=0`);
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
        if (key === 'out') {
            outDir = value;
            continue;
        }
        fail('FLAG_NO_RECONOCIDO', `--${key}`);
    }

    assertProject(project);
    if (!outDir) {
        fail('OUT_REQUIRED', '<fuera-del-repo>');
    }
    return { project, outDir };
}

function toDocRecord(snap: {
    id: string;
    exists?: boolean;
    data: () => Record<string, unknown> | undefined;
}): DocRecord {
    const exists = snap.exists !== false;
    const data = exists
        ? (snap.data() as Record<string, unknown>)
        : {};
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

function fieldOrNull(
    record: DocRecord | null,
    field: string
): unknown {
    if (!record || !record.exists) return null;
    return record.data[field] ?? null;
}

function buildUniverseRow(
    collection: string,
    records: DocRecord[],
    whitelistIds: readonly string[],
    statusOverride?: string
): UniverseRow {
    const ids = new Set(records.map((record) => record.id));
    const whitelist = whitelistIds.filter((id) => ids.has(id)).length;
    const extra = records
        .map((record) => record.id)
        .filter((id) => !whitelistIds.includes(id));
    let status = 'OK';
    if (statusOverride) {
        status = statusOverride;
    } else if (extra.length > 0) {
        status = 'EXTRA_DOCS';
    } else if (whitelist !== whitelistIds.length) {
        status = 'TARGET_MISSING';
    }
    return {
        collection,
        total: records.length,
        whitelist,
        extra,
        status,
    };
}

function lineForCandidate(row: CandidateRow): string {
    const risk = row.risk ? ` | RIESGO=${row.risk}` : '';
    return `[${row.status}] ${row.action} ${row.collection}/${row.doc_id} | ${fieldsLine(
        row.fields
    )}${risk} | ${row.justification}`;
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const outDir = assertOutDirOutsideRepo(options.outDir);
    const { db } = initFirebaseGuarded({
        outDir,
        projectId: PROJECT_ID,
    });
    const app = getApps()[0];
    if (!app) {
        fail('FIREBASE_APP_MISSING', 'no hay app de Firebase Admin');
    }
    const auth = getAuth(app);

    const whitelistPath = join(
        process.cwd(),
        'scripts/fixtures/web051-whitelist.json'
    );
    const whitelist = JSON.parse(
        readFileSync(whitelistPath, 'utf8')
    ) as WhitelistFile;
    validateWhitelist(whitelist);
    const whitelistHash = computeWhitelistHash(whitelist);

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
    const sysAdminUsers = collectionRecords(
        await db.collection(COLLECTION_SYS_ADMIN_USERS).get()
    );
    const ledger = collectionRecords(
        await db.collection(COLLECTION_LEDGER).get()
    );
    const ledgerInventario = collectionRecords(
        await db.collection(COLLECTION_LEDGER_INVENTARIO).get()
    );
    const pagosInversoresSnap = await db
        .collection(COLLECTION_PAGOS_INVERSORES)
        .limit(1)
        .get();
    const pagosInversores = collectionRecords(pagosInversoresSnap);

    let authFound = false;
    let authUid: string | null = null;
    let authEmail: string | null = null;
    let authDisplayName: string | null = null;
    let authDisabled: boolean | null = null;
    let authCreated: string | null = null;
    let authLastSignIn: string | null = null;
    let authError: string | null = null;
    let authUidLookupFound = false;
    let authUidLookupEmail: string | null = null;
    let authUidLookupError: string | null = null;

    try {
        const user = await auth.getUserByEmail(E2E_EMAIL);
        authFound = true;
        authUid = user.uid;
        authEmail = user.email ?? null;
        authDisplayName = user.displayName ?? null;
        authDisabled = user.disabled;
        authCreated = user.metadata.creationTime ?? null;
        authLastSignIn = user.metadata.lastSignInTime ?? null;
    } catch (error) {
        const code =
            typeof error === 'object' && error !== null && 'code' in error
                ? String((error as { code?: unknown }).code)
                : '';
        if (code === 'auth/user-not-found') {
            authError = 'AUTH_USER_NOT_FOUND';
        } else {
            authError =
                error instanceof Error
                    ? error.message
                    : 'Error desconocido en Auth';
        }
    }

    try {
        const userByUid = await auth.getUser(E2E_UID);
        authUidLookupFound = true;
        authUidLookupEmail = userByUid.email ?? null;
    } catch (error) {
        const code =
            typeof error === 'object' && error !== null && 'code' in error
                ? String((error as { code?: unknown }).code)
                : '';
        authUidLookupError =
            code === 'auth/user-not-found'
                ? 'AUTH_USER_NOT_FOUND'
                : error instanceof Error
                  ? error.message
                  : 'Error desconocido en Auth';
    }

    const authUidMatches = authUid === E2E_UID;
    const usuariosRecord =
        authUid !== null
            ? toDocRecord(
                  await db.collection(COLLECTION_USUARIOS).doc(authUid).get()
              )
            : null;
    const usuariosEmail = fieldOrNull(usuariosRecord, 'email');
    const usuariosHardStop =
        usuariosRecord?.exists === true && isProhibitedEmail(usuariosEmail);
    const usuariosE2E = toDocRecord(
        await db.collection(COLLECTION_USUARIOS).doc(E2E_UID).get()
    );
    const usuariosE2EEmail = fieldOrNull(usuariosE2E, 'email');
    const usuariosE2EHardStop =
        usuariosE2E.exists && isProhibitedEmail(usuariosE2EEmail);

    const sysAdminTarget = findDoc(sysAdminUsers, E2E_EMAIL);
    const sysAdminFields: Record<string, unknown> = sysAdminTarget
        ? {
              name: fieldOrNull(sysAdminTarget, 'name'),
              email: fieldOrNull(sysAdminTarget, 'email'),
              uid: fieldOrNull(sysAdminTarget, 'uid'),
              role: fieldOrNull(sysAdminTarget, 'role'),
              active: fieldOrNull(sysAdminTarget, 'active'),
              createdAt: fieldOrNull(sysAdminTarget, 'createdAt'),
          }
        : {};

    const payment = findDoc(pagos, CANDIDATE_PAYMENT_IDS[0]);
    const paymentFields: Record<string, unknown> = payment
        ? {
              id_credito: fieldOrNull(payment, 'id_credito'),
              monto: fieldOrNull(payment, 'monto'),
              fecha: fieldOrNull(payment, 'fecha'),
              tipo: fieldOrNull(payment, 'tipo'),
              estado: fieldOrNull(payment, 'estado'),
              valor_neto_empresa: fieldOrNull(
                  payment,
                  'valor_neto_empresa'
              ),
          }
        : {};
    const paymentFkOk =
        payment !== null &&
        text(paymentFields.id_credito) === BASE_CREDIT_IDS[1];

    const remision = findDoc(remisiones, CANDIDATE_REMISION_IDS[0]);
    const remisionFields: Record<string, unknown> = remision
        ? {
              monto: fieldOrNull(remision, 'monto'),
              fecha: fieldOrNull(remision, 'fecha'),
              id_credito: fieldOrNull(remision, 'id_credito'),
              valor_neto_empresa: fieldOrNull(
                  remision,
                  'valor_neto_empresa'
              ),
          }
        : {};
    const remisionMonto = num(remisionFields.monto);
    const paymentNeto = num(paymentFields.valor_neto_empresa);
    const remisionMatch =
        remisionMonto !== null &&
        paymentNeto !== null &&
        remisionMonto === paymentNeto;

    const clientRows = [...BASE_CLIENT_IDS, ...CANDIDATE_CLIENT_IDS].map(
        (docId) => {
            const record = findDoc(clientes, docId);
            return {
                doc_id: docId,
                exists: record?.exists ?? false,
                cedula: fieldOrNull(record ?? null, 'cedula'),
                nombres: fieldOrNull(record ?? null, 'nombres'),
                celular: fieldOrNull(record ?? null, 'celular'),
                fecha_registro: fieldOrNull(record ?? null, 'fecha_registro'),
                email: fieldOrNull(record ?? null, 'email'),
                registrado_por: fieldOrNull(record ?? null, 'registrado_por'),
                creado_en: fieldOrNull(record ?? null, 'creado_en'),
                fingerprint: record?.fingerprint ?? '',
            };
        }
    );

    const creditRows = [...BASE_CREDIT_IDS].map((docId) => {
        const record = findDoc(creditos, docId);
        return {
            doc_id: docId,
            exists: record?.exists ?? false,
            numero_credito: fieldOrNull(record ?? null, 'numero_credito'),
            id_cliente: fieldOrNull(record ?? null, 'id_cliente'),
            fecha_registro: fieldOrNull(record ?? null, 'fecha_registro'),
            activo: fieldOrNull(record ?? null, 'activo'),
            registrado_por: fieldOrNull(record ?? null, 'registrado_por'),
            created_at: fieldOrNull(record ?? null, 'created_at'),
            creado_en: fieldOrNull(record ?? null, 'creado_en'),
            fingerprint: record?.fingerprint ?? '',
        };
    });

    const windowEntries: Array<Record<string, unknown>> = [];
    const referenceEntries: Array<Record<string, unknown>> = [];
    for (const record of ledger) {
        const data = record.data;
        const timestamp = timestampOf(data);
        if (isE2eWindowEntry(data)) {
            windowEntries.push({
                doc_id: record.id,
                coleccion: collectionOf(data),
                operacion: text(data.operacion),
                registrado_por: text(data.registrado_por),
                documento_id: text(data.documento_id),
                timestamp_field: timestamp.field,
                timestamp_utc: timestamp.iso,
                fingerprint: record.fingerprint,
            });
        }
        const matches = collectReferenceMatches(data);
        if (matches.length > 0) {
            referenceEntries.push({
                doc_id: record.id,
                coleccion: collectionOf(data),
                operacion: text(data.operacion),
                matches,
                timestamp_field: timestamp.field,
                timestamp_utc: timestamp.iso,
                fingerprint: record.fingerprint,
            });
        }
    }

    const protectedRefs = ledgerInventario.flatMap((record) =>
        collectReferenceMatches(record.data).map((match) => ({
            doc_id: record.id,
            match,
        }))
    );
    const protectedLedger = hashDocs(
        ledgerInventario.map((record) => ({
            id: record.id,
            data: record.data,
        }))
    );
    const ledgerTargetIds = new Set<string>([
        ...windowEntries.map((entry) => text(entry.doc_id)),
        ...referenceEntries.map((entry) => text(entry.doc_id)),
    ]);

    const counterSnap = await db.doc(COUNTER_PATH).get();
    const counterRecord = toDocRecord(counterSnap);
    const counterCount = fieldOrNull(counterRecord, COUNTER_FIELD);
    const counterYear = fieldOrNull(counterRecord, COUNTER_YEAR_FIELD);
    const counterStatus = !counterRecord.exists
        ? 'ABSENT'
        : num(counterCount) === 0
          ? 'ALREADY_0'
          : num(counterCount) === null
            ? 'INVALID'
            : 'RESET_REQUIRED';

    const creditWhitelist = [...BASE_CREDIT_IDS];
    const clientWhitelist = [...BASE_CLIENT_IDS, ...CANDIDATE_CLIENT_IDS];
    const paymentWhitelist = [...CANDIDATE_PAYMENT_IDS];
    const remisionWhitelist = [...CANDIDATE_REMISION_IDS];
    const sysAdminWhitelist = [E2E_EMAIL];

    const universe: UniverseRow[] = [
        buildUniverseRow(
            COLLECTION_CREDITOS,
            creditos,
            creditWhitelist
        ),
        buildUniverseRow(
            COLLECTION_CLIENTES,
            clientes,
            clientWhitelist
        ),
        buildUniverseRow(
            COLLECTION_PAGOS_MULTAS,
            pagos,
            paymentWhitelist
        ),
        buildUniverseRow(
            COLLECTION_REMISIONES,
            remisiones,
            remisionWhitelist
        ),
        {
            collection: COLLECTION_PAGOS_INVERSORES,
            total: pagosInversores.length,
            whitelist: 0,
            extra: pagosInversores.map((record) => record.id),
            status:
                pagosInversores.length === 0 ? 'ABSENT' : 'NOT_EMPTY',
        },
        {
            collection: COLLECTION_SYS_ADMIN_USERS,
            total: sysAdminUsers.length,
            whitelist: sysAdminTarget ? 1 : 0,
            extra: sysAdminTarget
                ? sysAdminUsers
                      .map((record) => record.id)
                      .filter((id) => id !== E2E_EMAIL)
                : sysAdminUsers.map((record) => record.id),
            status: 'TARGET_ONLY',
        },
        {
            collection: COLLECTION_LEDGER,
            total: ledger.length,
            whitelist: ledgerTargetIds.size,
            extra: [],
            status: 'TARGETED',
        },
        {
            collection: COLLECTION_LEDGER_INVENTARIO,
            total: ledgerInventario.length,
            whitelist: ledgerInventario.length,
            extra: [],
            status: 'PROTECTED',
        },
    ];

    const candidates: CandidateRow[] = [];
    for (const credit of creditRows) {
        candidates.push({
            collection: COLLECTION_CREDITOS,
            doc_id: credit.doc_id,
            status: credit.exists ? 'APPROVED' : 'ABSENT',
            action: 'DELETE',
            justification: 'whitelist base',
            fields: {
                numero_credito: credit.numero_credito,
                id_cliente: credit.id_cliente,
                fecha_registro: credit.fecha_registro,
            },
            risk: null,
        });
    }
    for (const client of clientRows) {
        const base = (BASE_CLIENT_IDS as readonly string[]).includes(
            client.doc_id
        );
        candidates.push({
            collection: COLLECTION_CLIENTES,
            doc_id: client.doc_id,
            status: !client.exists
                ? 'ABSENT'
                : base
                  ? 'APPROVED'
                  : 'PENDING',
            action: 'DELETE',
            justification: base
                ? 'whitelist base'
                : 'candidato 16-oct; requiere aprobación por ítem',
            fields: {
                cedula: client.cedula,
                nombres: client.nombres,
                celular: client.celular,
                fecha_registro: client.fecha_registro,
            },
            risk:
                client.doc_id === CANDIDATE_CLIENT_IDS[0]
                    ? 'REAL_ID_EN_FORENSE_PREVIO'
                    : null,
        });
    }
    candidates.push({
        collection: COLLECTION_PAGOS_MULTAS,
        doc_id: CANDIDATE_PAYMENT_IDS[0],
        status: payment ? 'PENDING' : 'ABSENT',
        action: 'DELETE',
        justification: 'FK explícita id_credito=ltezdKf6P3nG4tBZRTx3',
        fields: paymentFields,
        risk: paymentFkOk ? null : 'FK_MISMATCH',
    });
    candidates.push({
        collection: COLLECTION_REMISIONES,
        doc_id: CANDIDATE_REMISION_IDS[0],
        status: remision ? 'PENDING' : 'ABSENT',
        action: 'DELETE',
        justification:
            'misma sesión 16-oct; monto 585000 == valor_neto_empresa del pago',
        fields: remisionFields,
        risk: remisionMatch
            ? 'SIN_FK_EXPLICITA'
            : 'SIN_FK_EXPLICITA_MONTO_NO_COINCIDE',
    });
    candidates.push({
        collection: COLLECTION_SYS_ADMIN_USERS,
        doc_id: E2E_EMAIL,
        status: sysAdminTarget ? 'APPROVED' : 'ABSENT',
        action: 'DELETE',
        justification: 'usuario Auth temporal E2E WEB051',
        fields: sysAdminFields,
        risk: null,
    });
    candidates.push({
        collection: 'auth',
        doc_id: E2E_EMAIL,
        status: !authFound
            ? 'ABSENT'
            : authUidMatches
              ? 'APPROVED'
              : 'PENDING',
        action: authFound ? 'AUTH_DELETE' : 'NONE',
        justification: 'deleteUser del usuario temporal E2E WEB051',
        fields: {
            uid: authUid,
            email: authEmail,
            uid_match: authUidMatches,
            disabled: authDisabled,
        },
        risk: authFound && !authUidMatches ? 'AUTH_UID_MISMATCH' : null,
    });
    if (authUidLookupFound) {
        candidates.push({
            collection: 'auth',
            doc_id: E2E_UID,
            status: 'NOOP',
            action: 'NONE',
            justification:
                'uid hint de la whitelist; pertenece a un usuario real y se preserva',
            fields: {
                email: authUidLookupEmail,
                error: authUidLookupError,
            },
            risk:
                normalizeEmail(authUidLookupEmail) === E2E_EMAIL
                    ? null
                    : 'AUTH_UID_REAL_USER',
        });
    }
    candidates.push({
        collection: 'configuracion',
        doc_id: 'counters',
        status: counterStatus === 'ABSENT' ? 'ABSENT' : 'APPROVED',
        action: counterStatus === 'ABSENT' ? 'NONE' : 'COUNTER_RESET',
        justification: 'reset de creditoCount; creditoYear preservado',
        fields: {
            path: COUNTER_PATH,
            creditoCount: counterCount,
            creditoYear: counterYear,
            status: counterStatus,
        },
        risk: counterStatus === 'INVALID' ? 'COUNTER_INVALID' : null,
    });
    const ledgerCandidates = new Map<string, CandidateRow>();
    for (const entry of windowEntries) {
        const docId = text(entry.doc_id);
        ledgerCandidates.set(docId, {
            collection: COLLECTION_LEDGER,
            doc_id: docId,
            status: 'PENDING',
            action: 'LEDGER_DELETE',
            justification: 'asiento de la ventana E2E 2026-11-17',
            fields: {
                coleccion: entry.coleccion,
                operacion: entry.operacion,
                timestamp_utc: entry.timestamp_utc,
            },
            risk: null,
        });
    }
    for (const entry of referenceEntries) {
        const docId = text(entry.doc_id);
        const existing = ledgerCandidates.get(docId);
        if (existing) {
            existing.risk = existing.risk
                ? `${existing.risk},REFERENCIA_CLUSTER`
                : 'REFERENCIA_CLUSTER';
            existing.justification =
                'asiento de la ventana E2E y referencia al clúster';
            existing.fields = {
                ...existing.fields,
                matches: entry.matches,
            };
        } else {
            ledgerCandidates.set(docId, {
                collection: COLLECTION_LEDGER,
                doc_id: docId,
                status: 'PENDING',
                action: 'LEDGER_DELETE',
                justification:
                    'asiento que referencia el clúster de simulacros',
                fields: {
                    coleccion: entry.coleccion,
                    operacion: entry.operacion,
                    matches: entry.matches,
                },
                risk: 'REFERENCIA_CLUSTER',
            });
        }
    }
    candidates.push(...ledgerCandidates.values());
    candidates.push({
        collection: COLLECTION_PAGOS_INVERSORES,
        doc_id: '(colección)',
        status: pagosInversores.length === 0 ? 'NOOP' : 'PENDING',
        action: 'NONE',
        justification:
            pagosInversores.length === 0
                ? 'colección ausente / query vacía'
                : 'colección con documentos; requiere decisión',
        fields: {
            total: pagosInversores.length,
            doc_ids: pagosInversores.map((record) => record.id),
        },
        risk: pagosInversores.length === 0 ? null : 'UNIVERSE_DRIFT',
    });
    candidates.push({
        collection: COLLECTION_LEDGER_INVENTARIO,
        doc_id: '(protegido)',
        status: 'NOOP',
        action: 'NONE',
        justification: 'ledger de repuestos protegido; solo lectura de paridad',
        fields: {
            count: protectedLedger.count,
            hash: protectedLedger.hash,
            reference_count: protectedRefs.length,
        },
        risk: protectedRefs.length > 0 ? 'PROTECTED_LEDGER_REFERENCES' : null,
    });
    if (usuariosRecord?.exists) {
        candidates.push({
            collection: COLLECTION_USUARIOS,
            doc_id: authUid ?? '(sin uid)',
            status: 'NOOP',
            action: 'NONE',
            justification:
                'doc fuera de whitelist; solo verificación de seguridad',
            fields: {
                email: usuariosEmail,
                role: fieldOrNull(usuariosRecord, 'role'),
                active: fieldOrNull(usuariosRecord, 'active'),
            },
            risk: usuariosHardStop ? 'AUTH_UID_SHARED_WITH_REAL_USER' : null,
        });
    }
    if (usuariosE2E.exists && usuariosE2E.id !== usuariosRecord?.id) {
        candidates.push({
            collection: COLLECTION_USUARIOS,
            doc_id: E2E_UID,
            status: 'NOOP',
            action: 'NONE',
            justification:
                'doc fuera de whitelist; chequeo de uid E2E compartido',
            fields: {
                email: usuariosE2EEmail,
                role: fieldOrNull(usuariosE2E, 'role'),
                active: fieldOrNull(usuariosE2E, 'active'),
            },
            risk: usuariosE2EHardStop
                ? 'AUTH_UID_SHARED_WITH_REAL_USER'
                : null,
        });
    }

    const hardStops: string[] = [];
    if (authFound && !authUidMatches) {
        hardStops.push('AUTH_UID_MISMATCH');
    }
    if (usuariosHardStop || usuariosE2EHardStop) {
        hardStops.push('AUTH_UID_SHARED_WITH_REAL_USER');
    }
    if (
        authUidLookupFound &&
        normalizeEmail(authUidLookupEmail) !== E2E_EMAIL
    ) {
        hardStops.push('AUTH_UID_REAL_USER');
    }
    if (
        authUidLookupFound &&
        normalizeEmail(authUidLookupEmail) === E2E_EMAIL &&
        !authFound
    ) {
        hardStops.push('AUTH_LOOKUP_INCONSISTENT');
    }
    if (pagosInversores.length > 0) {
        hardStops.push('PAGOS_INVERSORES_NOT_EMPTY');
    }
    if (protectedRefs.length > 0) {
        hardStops.push('PROTECTED_LEDGER_REFERENCES');
    }
    if (
        universe.some(
            (row) =>
                row.status === 'EXTRA_DOCS' &&
                row.collection !== COLLECTION_SYS_ADMIN_USERS &&
                row.collection !== COLLECTION_LEDGER
        )
    ) {
        hardStops.push('COLLECTION_UNIVERSE_EXTRA_DOCS');
    }
    if (payment && !paymentFkOk) {
        hardStops.push('PAYMENT_FK_MISMATCH');
    }
    if (remision && !remisionMatch) {
        hardStops.push('REMISION_AMOUNT_MISMATCH');
    }
    if (counterStatus === 'INVALID') {
        hardStops.push('COUNTER_INVALID');
    }
    for (const client of clientRows) {
        if (client.email && isProhibitedEmail(client.email)) {
            hardStops.push(`CLIENT_EMAIL_PROHIBITED:${client.doc_id}`);
        }
    }

    const generatedAt = new Date().toISOString();
    const inventory = {
        ticket: TICKET,
        project_id: PROJECT_ID,
        generated_at: generatedAt,
        window_start_utc: E2E_WINDOW_START_UTC,
        read_only: true,
        writes: 0,
        deletions: 0,
        expected_uid: E2E_UID,
        expected_email: E2E_EMAIL,
        whitelist_template: whitelistPath,
        whitelist_template_sha256: whitelistHash,
        collection_universe: universe,
        creditos: creditRows,
        clientes_credito: clientRows,
        pagos_y_multas: {
            doc_id: CANDIDATE_PAYMENT_IDS[0],
            exists: payment !== null,
            fields: paymentFields,
            fk_ok: paymentFkOk,
        },
        remisiones_dinero: {
            doc_id: CANDIDATE_REMISION_IDS[0],
            exists: remision !== null,
            fields: remisionFields,
            monto_match: remisionMatch,
        },
        pagos_inversores: {
            collection: COLLECTION_PAGOS_INVERSORES,
            total: pagosInversores.length,
            absent: pagosInversores.length === 0,
            doc_ids: pagosInversores.map((record) => record.id),
        },
        sys_admin_users: {
            doc_id: E2E_EMAIL,
            exists: sysAdminTarget !== null,
            fields: sysAdminFields,
        },
        auth: {
            found: authFound,
            uid: authUid,
            email: authEmail,
            display_name: authDisplayName,
            disabled: authDisabled,
            created_at: authCreated,
            last_sign_in: authLastSignIn,
            uid_matches_expected: authUidMatches,
            uid_lookup: {
                found: authUidLookupFound,
                email: authUidLookupEmail,
                error: authUidLookupError,
            },
            error: authError,
        },
        usuarios_uid: usuariosRecord
            ? {
                  doc_id: usuariosRecord.id,
                  exists: usuariosRecord.exists,
                  fields: usuariosRecord.serialized,
              }
            : null,
        usuarios_e2e_uid: {
            doc_id: E2E_UID,
            exists: usuariosE2E.exists,
            fields: usuariosE2E.serialized,
        },
        counter: {
            path: COUNTER_PATH,
            exists: counterRecord.exists,
            credito_count: counterCount,
            credito_year: counterYear,
            status: counterStatus,
            fields: counterRecord.serialized,
        },
        ledger_window: windowEntries,
        ledger_references: referenceEntries,
        protected_ledger: {
            collection: COLLECTION_LEDGER_INVENTARIO,
            count: protectedLedger.count,
            hash: protectedLedger.hash,
            reference_count: protectedRefs.length,
            references: protectedRefs,
        },
        candidates,
        hard_stops: hardStops,
    };

    const lines: string[] = [];
    lines.push('WEB-051-P1 — INVENTARIO READ-ONLY');
    lines.push(`PROJECT=${PROJECT_ID}`);
    lines.push(
        `MODE=READ-ONLY  WRITES=0  DELETIONS=0  READ_ONLY=true`
    );
    lines.push(`GENERATED_AT=${generatedAt}`);
    lines.push(`WHITELIST_TEMPLATE_SHA256=${whitelistHash}`);
    lines.push('');
    lines.push('=== a) CLIENTES_CREDITO ===');
    for (const client of clientRows) {
        lines.push(
            `${client.exists ? 'EXISTS' : 'AUSENTE'} ${COLLECTION_CLIENTES}/${client.doc_id}`
        );
        lines.push(
            `  cedula=${display(client.cedula)} nombres=${display(
                client.nombres
            )} celular=${display(client.celular)} fecha_registro=${display(
                client.fecha_registro
            )}`
        );
        lines.push(
            `  email=${display(client.email)} registrado_por=${display(
                client.registrado_por
            )} fingerprint=${client.fingerprint || 'AUSENTE'}`
        );
    }
    lines.push('');
    lines.push('=== b) HISTORIAL_AUDITORIA — VENTANA E2E ===');
    if (windowEntries.length === 0) {
        lines.push('NINGUNO');
    } else {
        for (const entry of windowEntries) {
            lines.push(
                `[PENDING] ${COLLECTION_LEDGER}/${display(
                    entry.doc_id
                )} operacion=${display(
                    entry.operacion
                )} coleccion=${display(entry.coleccion)} timestamp=${display(
                    entry.timestamp_utc
                )}`
            );
        }
    }
    lines.push(`LEDGER_WINDOW_COUNT=${windowEntries.length}`);
    lines.push('');
    lines.push('=== c) HISTORIAL_AUDITORIA — REFERENCIAS AL CLÚSTER ===');
    if (referenceEntries.length === 0) {
        lines.push('NINGUNO');
    } else {
        for (const entry of referenceEntries) {
            lines.push(
                `[PENDING] ${COLLECTION_LEDGER}/${display(
                    entry.doc_id
                )} coleccion=${display(entry.coleccion)} matches=${display(
                    entry.matches
                )}`
            );
        }
    }
    lines.push(`LEDGER_REFERENCE_COUNT=${referenceEntries.length}`);
    lines.push('');
    lines.push('=== d) CONFIGURACION/COUNTERS ===');
    lines.push(
        `CREDITO_COUNT=${display(counterCount)} CREDITO_YEAR=${display(
            counterYear
        )} STATUS=${counterStatus}`
    );
    lines.push('');
    lines.push('=== e) AUTH ===');
    lines.push(
        `AUTH_FOUND=${authFound} AUTH_UID=${display(
            authUid
        )} AUTH_EMAIL=${display(
            authEmail
        )} UID_MATCH=${authUidMatches} ERROR=${display(authError)}`
    );
    lines.push(
        `AUTH_UID_LOOKUP=${E2E_UID} found=${
            authUidLookupFound ? 'true' : 'false'
        } email=${display(
            authUidLookupEmail
        )} error=${display(authUidLookupError)}`
    );
    lines.push(
        `SYS_ADMIN_USERS/${E2E_EMAIL} exists=${
            sysAdminTarget ? 'true' : 'false'
        } fields=${fieldsLine(sysAdminFields)}`
    );
    lines.push(
        `USUARIOS_UID/${display(authUid)} exists=${
            usuariosRecord?.exists === true ? 'true' : 'false'
        } fields=${fieldsLine(
            usuariosRecord ? usuariosRecord.serialized : {}
        )}`
    );
    lines.push(
        `USUARIOS_E2E_UID/${E2E_UID} exists=${
            usuariosE2E.exists ? 'true' : 'false'
        } fields=${fieldsLine(usuariosE2E.serialized)}`
    );
    lines.push('');
    lines.push('=== UNIVERSO ===');
    for (const row of universe) {
        lines.push(
            `${row.collection} total=${row.total} whitelist=${
                row.whitelist
            } extra=${row.extra.length} status=${row.status}`
        );
    }
    lines.push('');
    lines.push('=== CANDIDATOS ===');
    for (const candidate of candidates) {
        lines.push(lineForCandidate(candidate));
    }
    lines.push('');
    lines.push('=== LEDGER INVENTARIO (PROTEGIDO, SOLO LECTURA) ===');
    lines.push(
        `count=${protectedLedger.count} hash=${protectedLedger.hash} reference_count=${protectedRefs.length}`
    );
    lines.push('');
    lines.push('=== HARD STOPS ===');
    if (hardStops.length === 0) {
        lines.push('NINGUNO');
    } else {
        for (const stop of hardStops) {
            lines.push(stop);
        }
    }
    lines.push('');
    lines.push('READ_ONLY=true');
    lines.push('WRITES=0');
    lines.push('DELETIONS=0');
    lines.push(`HARD_STOP_COUNT=${hardStops.length}`);
    lines.push(`OUT=${outDir}`);

    const reportText = lines.join('\n');
    const result = writeManifestAndReport(
        outDir,
        'inventory.json',
        inventory,
        reportText,
        {
            'candidates.json': candidates,
            'universe.json': universe,
            'ledger.json': {
                window: windowEntries,
                references: referenceEntries,
                protected: inventory.protected_ledger,
            },
        },
        {
            ticket: TICKET,
            project_id: PROJECT_ID,
            mode: 'read-only',
            generated_at: generatedAt,
            read_only: true,
            writes: 0,
            deletions: 0,
            whitelist_template: whitelistPath,
            whitelist_template_sha256: whitelistHash,
            expected_uid: E2E_UID,
            hard_stop_count: hardStops.length,
        }
    );

    console.log(reportText);
    console.log('');
    console.log('=== MANIFEST HASHES ===');
    for (const [name, hash] of Object.entries(result.hashes)) {
        console.log(`${name}=${hash}`);
    }
    console.log(`INVENTORY_SHA256=${result.hashes['inventory.json'] ?? ''}`);
}

main().catch((error) => {
    console.error(
        '[web051-inventario] ERROR:',
        error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
});
