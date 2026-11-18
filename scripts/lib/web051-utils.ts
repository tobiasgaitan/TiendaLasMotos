/**
 * WEB-051-P1 — Utilidades puras de la purga de simulacros.
 *
 * Sin Firestore, sin Auth y sin filesystem: se pueden probar con fixtures.
 * La whitelist versionada es la única fuente de IDs de borrado.
 */
import { hash as cryptoHash } from 'node:crypto';

export const TICKET = 'WEB-051-P1';
export const PROJECT_ID = 'tiendalasmotos';

export const E2E_EMAIL = 'prueba@prueba.com';
export const E2E_UID = 't05KiQCGQgUWFARvczn3nuXp9Qz2';
export const E2E_WINDOW_START_UTC = '2026-11-17T00:00:00.000Z';
export const DIRECTOR_EMAIL = 'tobiasgaitan@gmail.com';

export const COLLECTION_CREDITOS = 'creditos';
export const COLLECTION_CLIENTES = 'clientes_credito';
export const COLLECTION_PAGOS_MULTAS = 'pagos_y_multas';
export const COLLECTION_REMISIONES = 'remisiones_dinero';
export const COLLECTION_PAGOS_INVERSORES = 'pagos_inversores';
export const COLLECTION_SYS_ADMIN_USERS = 'sys_admin_users';
export const COLLECTION_LEDGER = 'historial_auditoria';
export const COLLECTION_LEDGER_INVENTARIO = 'historial_auditoria_inventario';
export const COLLECTION_USUARIOS = 'usuarios';

export const COUNTER_PATH = 'configuracion/counters';
export const COUNTER_FIELD = 'creditoCount';
export const COUNTER_YEAR_FIELD = 'creditoYear';

export const CONFIRMATION_PHRASE = 'PURGAR WEB051 SIMULACROS IRREVERSIBLE';

export const BASE_CREDIT_IDS = [
    'Qw54o4ebHx5qxSzSxZJp',
    'ltezdKf6P3nG4tBZRTx3',
] as const;

export const BASE_CLIENT_IDS = ['cpGYSKqffu4evPHqoTTh'] as const;

export const CANDIDATE_CLIENT_IDS = [
    'jHTQNJvFbECaDAj98Pvo',
    'qbx10kbQsk3yd9YiVwwl',
] as const;

export const CANDIDATE_PAYMENT_IDS = ['RKqUf3oZjLXuVXqMZdQ6'] as const;

export const CANDIDATE_REMISION_IDS = ['6eJcPQiLqw0HTaYvzk03'] as const;

export const REFERENCE_IDS = [
    ...BASE_CREDIT_IDS,
    ...BASE_CLIENT_IDS,
    ...CANDIDATE_CLIENT_IDS,
    ...CANDIDATE_PAYMENT_IDS,
    ...CANDIDATE_REMISION_IDS,
    'CRE-2026-0001',
] as const;

export const E2E_COLLECTIONS = [
    COLLECTION_CLIENTES,
    COLLECTION_CREDITOS,
    COLLECTION_SYS_ADMIN_USERS,
] as const;

export const PROHIBITED_EMAILS = [
    'tobiasgaitan@gmail.com',
    'admin@tiendalasmotos.com',
    'admin.creditos@tiendalasmotos.com',
    'conexion@tiendalasmotos.com',
    'janer.mendoza146@gmail.com',
    'test_admin@tiendalasmotos.com',
    'web038.s7@tiendalasmotos.com',
    'zlorenamartinez1608@gmail.com',
] as const;

export const ALLOWED_DELETE_COLLECTIONS = [
    COLLECTION_CREDITOS,
    COLLECTION_CLIENTES,
    COLLECTION_PAGOS_MULTAS,
    COLLECTION_REMISIONES,
    COLLECTION_SYS_ADMIN_USERS,
    COLLECTION_LEDGER,
] as const;

export const PROTECTED_COLLECTIONS = [
    COLLECTION_LEDGER_INVENTARIO,
    'prospectos',
    'inventario_repuestos',
    'conteos_pendientes_repuestos',
    'fotos_inventario',
    'financial_config',
    'sys_permissions_matrix',
    'pagina',
    'llm_runtime',
    'processed_webhooks',
] as const;

export const PROHIBITED_FLAGS = [
    '--apply',
    '--force',
    '--yes',
    '--all',
    '--prefix',
    '--pattern',
    '--delete-files',
] as const;

export type ApprovalStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'ABSENT';

export interface ReferenceMatch {
    id: string;
    path: string;
}

export interface WhitelistDoc {
    doc_id: string;
    status: ApprovalStatus;
    justification: string;
    risk?: string | null;
    fingerprint?: string | null;
}

export interface WhitelistCollection {
    collection: string;
    docs: WhitelistDoc[];
}

export interface WhitelistFile {
    ticket: string;
    project_id: string;
    ratified: boolean;
    ratified_by: string | null;
    ratified_at: string | null;
    qwen_verdict: string | null;
    approval_reference: string | null;
    source_inventory_sha256: string | null;
    firestore: WhitelistCollection[];
    auth: {
        email: string;
        expected_uid: string;
        uid: string | null;
        status: ApprovalStatus;
    };
    counter: {
        path: string;
        field: string;
        target: number;
        status: ApprovalStatus;
    };
    pagos_inversores: {
        collection: string;
        status: 'ABSENT';
        doc_ids: string[];
    };
    subcollections: Array<{
        parent: string;
        collection: string;
        status: ApprovalStatus;
    }>;
    protected_set: string[];
}

export interface PurgeFixtureCase {
    name: string;
    case: string;
    expected: string;
}

export interface PurgeFixtureFile {
    ticket: string;
    base_whitelist: string;
    cases: PurgeFixtureCase[];
}

export function fail(code: string, detail: string): never {
    throw new Error(`${code}: ${detail}`);
}

export function sha256(value: string | Buffer): string {
    return cryptoHash('sha256', value, 'hex');
}

export function text(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

export function num(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

export function bool(value: unknown): boolean {
    return value === true;
}

export function normalizeEmail(value: unknown): string {
    return text(value).trim().toLowerCase();
}

export function isProhibitedEmail(value: unknown): boolean {
    return (PROHIBITED_EMAILS as readonly string[]).includes(
        normalizeEmail(value)
    );
}

export function toIso(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    if (typeof value === 'object') {
        const candidate = value as { toDate?: () => Date };
        if (typeof candidate.toDate === 'function') {
            try {
                const date = candidate.toDate();
                return date instanceof Date && !Number.isNaN(date.getTime())
                    ? date.toISOString()
                    : null;
            } catch {
                return null;
            }
        }
    }
    return null;
}

export function serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(serializeValue);
    if (typeof value === 'object') {
        const candidate = value as { toDate?: () => Date };
        if (typeof candidate.toDate === 'function') {
            const iso = toIso(candidate);
            return iso ?? null;
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

export function stableStringify(value: unknown): string {
    return JSON.stringify(serializeValue(value));
}

export function fingerprintData(data: Record<string, unknown>): string {
    return sha256(stableStringify(data));
}

export function timestampOf(data: Record<string, unknown>): {
    field: string;
    iso: string | null;
} {
    const candidates: Array<{ field: string; value: unknown }> = [
        { field: 'creado_en', value: data.creado_en },
        { field: 'created_at', value: data.created_at },
        { field: 'fecha_registro', value: data.fecha_registro },
        {
            field: 'datos_nuevos.fecha_registro',
            value:
                data.datos_nuevos &&
                typeof data.datos_nuevos === 'object'
                    ? (data.datos_nuevos as Record<string, unknown>)
                          .fecha_registro
                    : undefined,
        },
        {
            field: 'datos_anteriores.fecha_registro',
            value:
                data.datos_anteriores &&
                typeof data.datos_anteriores === 'object'
                    ? (data.datos_anteriores as Record<string, unknown>)
                          .fecha_registro
                    : undefined,
        },
    ];
    for (const candidate of candidates) {
        const iso = toIso(candidate.value);
        if (iso) return { field: candidate.field, iso };
    }
    return { field: 'TIMESTAMP_MISSING', iso: null };
}

export function collectionOf(data: Record<string, unknown>): string {
    return (
        text(data.coleccion_afectada).trim() ||
        text(data.coleccion).trim()
    );
}

export function isE2eWindowEntry(data: Record<string, unknown>): boolean {
    if (text(data.registrado_por).trim() !== E2E_UID) return false;
    const collection = collectionOf(data);
    if (
        !(E2E_COLLECTIONS as readonly string[]).includes(collection)
    ) {
        return false;
    }
    const timestamp = timestampOf(data).iso;
    return timestamp !== null && timestamp >= E2E_WINDOW_START_UTC;
}

export function walkReferences(
    value: unknown,
    path: string,
    output: ReferenceMatch[]
): void {
    if (typeof value === 'string') {
        if ((REFERENCE_IDS as readonly string[]).includes(value)) {
            output.push({ id: value, path });
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            walkReferences(item, `${path}[${index}]`, output);
        });
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(
        value as Record<string, unknown>
    )) {
        const next = path ? `${path}.${key}` : key;
        if ((REFERENCE_IDS as readonly string[]).includes(key)) {
            output.push({ id: key, path: next });
        }
        walkReferences(item, next, output);
    }
}

export function collectReferenceMatches(
    data: Record<string, unknown>
): ReferenceMatch[] {
    const output: ReferenceMatch[] = [];
    walkReferences(data, '', output);
    const seen: Record<string, true> = {};
    return output.filter((item) => {
        const key = `${item.id}|${item.path}`;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
}

export function assertProject(project: string): void {
    if (project !== PROJECT_ID) {
        fail('PROYECTO_NO_AUTORIZADO', project || '(vacío)');
    }
}

export function assertAllowedDeleteCollection(collection: string): void {
    if (collection === COLLECTION_LEDGER_INVENTARIO) {
        fail('PROTECTED_LEDGER', collection);
    }
    if ((PROTECTED_COLLECTIONS as readonly string[]).includes(collection)) {
        fail('PROHIBITED_COLLECTION', collection);
    }
    if (
        !(ALLOWED_DELETE_COLLECTIONS as readonly string[]).includes(collection)
    ) {
        fail('PROHIBITED_COLLECTION', collection);
    }
}

function assertDocStatus(
    doc: WhitelistDoc,
    collection: string,
    requireRatified: boolean
): void {
    const docId = text(doc.doc_id).trim();
    if (!docId) fail('WHITELIST_INVALID', `${collection}: doc_id vacío`);
    const statuses: ApprovalStatus[] = [
        'APPROVED',
        'PENDING',
        'REJECTED',
        'ABSENT',
    ];
    if (!statuses.includes(doc.status)) {
        fail(
            'WHITELIST_INVALID',
            `${collection}/${docId}: status=${String(doc.status)}`
        );
    }
    if (!text(doc.justification).trim()) {
        fail(
            'WHITELIST_INVALID',
            `${collection}/${docId}: justification vacía`
        );
    }
    if (doc.status === 'PENDING' && requireRatified) {
        fail('APPROVAL_PENDING', `${collection}/${docId}`);
    }
    if (
        requireRatified &&
        doc.status !== 'APPROVED' &&
        doc.status !== 'REJECTED' &&
        doc.status !== 'ABSENT'
    ) {
        fail(
            'APPROVAL_PENDING',
            `${collection}/${docId}: status=${doc.status}`
        );
    }
}

export function validateWhitelist(
    whitelist: WhitelistFile,
    options: { requireRatified?: boolean } = {}
): void {
    const requireRatified = options.requireRatified === true;
    if (whitelist.ticket !== TICKET) {
        fail('WHITELIST_INVALID', `ticket=${whitelist.ticket}`);
    }
    if (whitelist.project_id !== PROJECT_ID) {
        fail('PROYECTO_NO_AUTORIZADO', whitelist.project_id);
    }
    if (requireRatified && !whitelist.ratified) {
        fail('APPROVAL_PENDING', 'whitelist no ratificada');
    }
    if (whitelist.ratified) {
        if (
            whitelist.ratified_by !== 'Director' &&
            whitelist.ratified_by !== DIRECTOR_EMAIL
        ) {
            fail(
                'WHITELIST_INVALID',
                'ratified_by distinto de Director/tobiasgaitan@gmail.com'
            );
        }
        if (!text(whitelist.ratified_at).trim()) {
            fail('WHITELIST_INVALID', 'ratified_at vacío');
        }
        if (whitelist.qwen_verdict !== 'APROBADO') {
            fail('WHITELIST_INVALID', 'qwen_verdict distinto de APROBADO');
        }
        if (!text(whitelist.approval_reference).trim()) {
            fail('WHITELIST_INVALID', 'approval_reference vacío');
        }
    }
    if (!Array.isArray(whitelist.firestore)) {
        fail('WHITELIST_INVALID', 'firestore no es array');
    }

    const byCollection: Record<string, WhitelistCollection> = {};
    for (const group of whitelist.firestore) {
        const collection = text(group.collection).trim();
        assertAllowedDeleteCollection(collection);
        if (byCollection[collection]) {
            fail('WHITELIST_INVALID', `colección duplicada: ${collection}`);
        }
        const seen: Record<string, true> = {};
        for (const doc of group.docs ?? []) {
            assertDocStatus(doc, collection, requireRatified);
            const docId = text(doc.doc_id).trim();
            if (seen[docId]) {
                fail('WHITELIST_INVALID', `${collection}/${docId} duplicado`);
            }
            seen[docId] = true;
            if (
                collection === COLLECTION_SYS_ADMIN_USERS &&
                isProhibitedEmail(docId)
            ) {
                fail('PROHIBITED_USER', `${collection}/${docId}`);
            }
        }
        byCollection[collection] = group;
    }

    for (const collection of ALLOWED_DELETE_COLLECTIONS) {
        if (!byCollection[collection]) {
            fail('WHITELIST_INVALID', `colección ausente: ${collection}`);
        }
    }

    const requireId = (
        collection: string,
        docId: string,
        failure: string
    ): void => {
        const group = byCollection[collection];
        if (!group.docs.some((doc) => doc.doc_id === docId)) {
            fail(failure, `${collection}/${docId}`);
        }
    };
    for (const id of BASE_CREDIT_IDS) {
        requireId(COLLECTION_CREDITOS, id, 'WHITELIST_SET_MISMATCH');
    }
    for (const id of BASE_CLIENT_IDS) {
        requireId(COLLECTION_CLIENTES, id, 'WHITELIST_SET_MISMATCH');
    }
    for (const id of CANDIDATE_CLIENT_IDS) {
        requireId(COLLECTION_CLIENTES, id, 'WHITELIST_SET_MISMATCH');
    }
    for (const id of CANDIDATE_PAYMENT_IDS) {
        requireId(COLLECTION_PAGOS_MULTAS, id, 'WHITELIST_SET_MISMATCH');
    }
    for (const id of CANDIDATE_REMISION_IDS) {
        requireId(COLLECTION_REMISIONES, id, 'WHITELIST_SET_MISMATCH');
    }
    requireId(
        COLLECTION_SYS_ADMIN_USERS,
        E2E_EMAIL,
        'WHITELIST_SET_MISMATCH'
    );

    const allowedCredits = new Set<string>(BASE_CREDIT_IDS);
    const allowedClients = new Set<string>([
        ...BASE_CLIENT_IDS,
        ...CANDIDATE_CLIENT_IDS,
    ]);
    const allowedPayments = new Set<string>(CANDIDATE_PAYMENT_IDS);
    const allowedRemisiones = new Set<string>(CANDIDATE_REMISION_IDS);
    for (const doc of byCollection[COLLECTION_CREDITOS].docs) {
        if (!allowedCredits.has(doc.doc_id)) {
            fail('WHITELIST_SET_MISMATCH', `creditos/${doc.doc_id}`);
        }
    }
    for (const doc of byCollection[COLLECTION_CLIENTES].docs) {
        if (!allowedClients.has(doc.doc_id)) {
            fail('WHITELIST_SET_MISMATCH', `clientes_credito/${doc.doc_id}`);
        }
    }
    for (const doc of byCollection[COLLECTION_PAGOS_MULTAS].docs) {
        if (!allowedPayments.has(doc.doc_id)) {
            fail('WHITELIST_SET_MISMATCH', `pagos_y_multas/${doc.doc_id}`);
        }
    }
    for (const doc of byCollection[COLLECTION_REMISIONES].docs) {
        if (!allowedRemisiones.has(doc.doc_id)) {
            fail('WHITELIST_SET_MISMATCH', `remisiones_dinero/${doc.doc_id}`);
        }
    }
    for (const doc of byCollection[COLLECTION_SYS_ADMIN_USERS].docs) {
        if (doc.doc_id !== E2E_EMAIL) {
            fail(
                'WHITELIST_SET_MISMATCH',
                `sys_admin_users/${doc.doc_id}`
            );
        }
    }

    if (whitelist.auth.email !== E2E_EMAIL) {
        fail('WHITELIST_INVALID', `auth.email=${whitelist.auth.email}`);
    }
    if (whitelist.auth.expected_uid !== E2E_UID) {
        fail(
            'WHITELIST_INVALID',
            `auth.expected_uid=${whitelist.auth.expected_uid}`
        );
    }
    if (isProhibitedEmail(whitelist.auth.email)) {
        fail('PROHIBITED_USER', whitelist.auth.email);
    }
    if (requireRatified) {
        if (whitelist.auth.status === 'APPROVED') {
            if (!text(whitelist.auth.uid).trim()) {
                fail('WHITELIST_INVALID', 'auth.uid vacío');
            }
        } else if (whitelist.auth.status !== 'ABSENT') {
            fail('APPROVAL_PENDING', 'auth');
        }
    }

    if (whitelist.counter.path !== COUNTER_PATH) {
        fail(
            'COUNTER_SCOPE_VIOLATION',
            `counter.path=${whitelist.counter.path}`
        );
    }
    if (whitelist.counter.field !== COUNTER_FIELD) {
        fail(
            'COUNTER_SCOPE_VIOLATION',
            `counter.field=${whitelist.counter.field}`
        );
    }
    if (whitelist.counter.target !== 0) {
        fail(
            'COUNTER_SCOPE_VIOLATION',
            `counter.target=${whitelist.counter.target}`
        );
    }
    if (whitelist.counter.status !== 'APPROVED') {
        fail('APPROVAL_PENDING', 'counter');
    }

    if (whitelist.pagos_inversores.collection !== COLLECTION_PAGOS_INVERSORES) {
        fail(
            'WHITELIST_INVALID',
            `pagos_inversores.collection=${whitelist.pagos_inversores.collection}`
        );
    }
    if (whitelist.pagos_inversores.status !== 'ABSENT') {
        fail('UNIVERSE_DRIFT', 'pagos_inversores.status distinto de ABSENT');
    }
    if (whitelist.pagos_inversores.doc_ids.length > 0) {
        fail('PAGOS_INVERSORES_NOT_EMPTY', 'doc_ids no vacío');
    }

    if (!whitelist.protected_set.includes(COLLECTION_LEDGER_INVENTARIO)) {
        fail(
            'PROTECTED_LEDGER',
            'protected_set no incluye historial_auditoria_inventario'
        );
    }

    for (const sub of whitelist.subcollections ?? []) {
        const parent = text(sub.parent).trim();
        if (!parent.includes('/')) {
            fail('WHITELIST_INVALID', `subcollection parent=${parent}`);
        }
        if (
            (PROTECTED_COLLECTIONS as readonly string[]).includes(
                text(sub.collection)
            )
        ) {
            fail('PROHIBITED_COLLECTION', sub.collection);
        }
        if (requireRatified && sub.status !== 'APPROVED') {
            fail(
                'SUBCOLLECTION_NOT_APPROVED',
                `${parent}/${sub.collection}`
            );
        }
    }
}

export function computeWhitelistHash(whitelist: WhitelistFile): string {
    return sha256(stableStringify(whitelist));
}

export function hashDocs(
    docs: Array<{ id: string; data: Record<string, unknown> }>
): { count: number; hash: string } {
    const lines = docs
        .map((doc) => `${doc.id}:${stableStringify(doc.data)}`)
        .sort();
    return {
        count: docs.length,
        hash: sha256(lines.join('\n')),
    };
}
