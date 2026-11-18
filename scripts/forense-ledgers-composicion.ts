/**
 * WEB-FORENSE-LEDGERS-001 — Composición read-only de ambos ledgers.
 *
 * Lee exclusivamente:
 *   - historial_auditoria_inventario
 *   - historial_auditoria
 *
 * No accede a colecciones de dominio. No escribe en Firestore.
 * Reportes únicamente en el directorio de evidencias fuera del repo.
 */
import { hash as cryptoHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFirestore } from 'firebase-admin/firestore';
import {
    assertOutDirOutsideRepo,
    initFirebaseGuarded,
    writeManifestAndReport,
} from './lib/forensic-utils';

const PROJECT_ID = 'tiendalasmotos';
const LEDGER_INVENTORY = 'historial_auditoria_inventario';
const LEDGER_FINANCIAL = 'historial_auditoria';
const INVENTORY_LEDGER_HASH_ANCHOR =
    'a83fcb612cdc9d6f71061ed208214b976ae62416ee6d7cb0f25c38f7466ebaa4';
const REAL_IDS = [
    'ltezdKf6P3nG4tBZRTx3',
    'jHTQNJvFbECaDAj98Pvo',
] as const;
const DEFAULT_OUT_ROOT = '/Users/tobiasgaitangallego/opencode-evidence';

const SCOPE_NOTE =
    'La búsqueda de data real se limita a ltezdKf6P3nG4tBZRTx3 y jHTQNJvFbECaDAj98Pvo. NOT_FOUND no demuestra ausencia de otra data real. El script establece composición y candidatos de corte; el Director decide la frontera configuración/operación.';

const INVENTORY_COLLECTIONS = new Set<string>([
    'inventario_repuestos',
    'conteos_pendientes_repuestos',
    'fotos_inventario',
]);
const FINANCIAL_COLLECTIONS = new Set<string>([
    'clientes_credito',
    'creditos',
    'pagos_y_multas',
    'pagos_inversores',
    'remisiones_dinero',
]);
const REFERENCED_KEYS = new Set<string>([
    'documento_id',
    'conteo_id',
    'id',
    'id_credito',
    'id_cliente',
    'credito_id',
    'cliente_id',
    'inventario_documento_id',
    'pago_id',
    'giro_id',
    'remision_id',
    'user_id',
    'uid',
]);
const KNOWN_OPERATIONS = new Set<string>([
    'CREATE',
    'UPDATE',
    'SOFT_DELETE',
]);

type LedgerName = typeof LEDGER_INVENTORY | typeof LEDGER_FINANCIAL;
type Domain =
    | 'inventario'
    | 'sys_admin_users'
    | 'creditos_financiero'
    | 'otro';

interface ReferencedId {
    id: string;
    path: string;
}

interface NormalizedEntry {
    ledger: LedgerName;
    docId: string;
    coleccion_afectada: string;
    domain: Domain;
    operacion: string;
    operacion_raw: unknown;
    registrado_por: string;
    registrado_por_email: string;
    timestamp_field: string;
    timestamp_utc: string | null;
    timestamp_bogota: string | null;
    timestamp_missing: boolean;
    documento_id: string;
    conteo_id: string;
    referencia: string;
    referenced_doc_ids: ReferencedId[];
    real_data_matches: ReferencedId[];
    raw: unknown;
}

interface RawLedgerDoc {
    docId: string;
    data: Record<string, unknown>;
}

interface LedgerRead {
    ledger: LedgerName;
    count: number;
    hash: string;
    entries: NormalizedEntry[];
    rawDocs: RawLedgerDoc[];
}

interface FieldInfo {
    present: number;
    missing: number;
    types: string[];
}

interface FieldInventory {
    ledger: LedgerName;
    count: number;
    fields: Record<string, FieldInfo>;
    operations: Record<string, number>;
    unknown_operation_values: Array<{
        value: unknown;
        missing: boolean;
        count: number;
        docIds: string[];
    }>;
}

interface RealDataEntryRef {
    ledger: LedgerName;
    docId: string;
    coleccion_afectada: string;
    operacion: string;
    timestamp_utc: string | null;
    registrado_por: string;
    json_paths: string[];
}

interface RealDataResult {
    id: string;
    found: boolean;
    count: number;
    entries: RealDataEntryRef[];
}

interface Gap {
    before_docId: string;
    after_docId: string;
    before_utc: string;
    after_utc: string;
    gap_hours: number;
}

interface CutoffCandidate extends Gap {
    before_count: number;
    after_count: number;
    domain_mix_before: Record<string, number>;
    domain_mix_after: Record<string, number>;
    actor_mix_before: Record<string, number>;
    actor_mix_after: Record<string, number>;
}

interface Timeline {
    ledger: LedgerName;
    min_utc: string | null;
    max_utc: string | null;
    min_bogota: string | null;
    max_bogota: string | null;
    span_days: number | null;
    by_day_utc: Record<string, number>;
    by_day_bogota: Record<string, number>;
    by_month: Record<string, number>;
    largest_gaps: Gap[];
    cutoff_candidates: CutoffCandidate[];
    timestamp_missing: string[];
}

interface DomainStats {
    count: number;
    collections: Record<string, number>;
    operations: Record<string, number>;
    actors: Record<string, number>;
}

interface DomainBreakdown {
    ledgers: Record<
        LedgerName,
        {
            count: number;
            domains: Record<Domain, DomainStats>;
        }
    >;
    totals: Record<Domain, number>;
}

interface ActorStats {
    registrado_por: string;
    registrado_por_email: string;
    count: number;
    first_utc: string | null;
    last_utc: string | null;
}

interface FixtureFile {
    canonicalization: {
        input: unknown;
        expected: string;
    };
    inventory: Array<{ docId: string; data: Record<string, unknown> }>;
    financial: Array<{ docId: string; data: Record<string, unknown> }>;
    expected_real_ids: Record<
        string,
        { found: boolean; count: number }
    >;
}

interface CliOptions {
    mode: 'fixtures' | 'live';
    fixtures: string | null;
    project: string;
    outDir: string;
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

function sha256(value: string): string {
    return cryptoHash('sha256', value, 'hex');
}

function text(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function fail(code: string, detail: string): never {
    throw new Error(`${code}: ${detail}`);
}

function toIso(value: unknown): string | null {
    if (!value) return null;
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
            const date = candidate.toDate();
            return date instanceof Date && !Number.isNaN(date.getTime())
                ? date.toISOString()
                : null;
        }
    }
    return null;
}

function bogotaIso(iso: string): string {
    const parts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(new Date(iso));
    const get = (type: string): string =>
        parts.find((part) => part.type === type)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}-05:00`;
}

function domainOf(coleccion: string): Domain {
    if (INVENTORY_COLLECTIONS.has(coleccion)) return 'inventario';
    if (coleccion === 'sys_admin_users') return 'sys_admin_users';
    if (FINANCIAL_COLLECTIONS.has(coleccion)) return 'creditos_financiero';
    return 'otro';
}

function typeOf(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'timestamp';
    if (typeof value === 'object') {
        const candidate = value as { toDate?: () => Date };
        if (typeof candidate.toDate === 'function') return 'timestamp';
        return 'object';
    }
    return typeof value;
}

function nestedValue(
    value: unknown,
    key: string
): unknown {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
}

function timestampOf(
    data: Record<string, unknown>
): { field: string; iso: string | null } {
    const candidates: Array<{ field: string; value: unknown }> = [
        { field: 'creado_en', value: data.creado_en },
        { field: 'created_at', value: data.created_at },
        { field: 'fecha_registro', value: data.fecha_registro },
        {
            field: 'datos_nuevos.fecha_registro',
            value: nestedValue(data.datos_nuevos, 'fecha_registro'),
        },
        {
            field: 'datos_anteriores.fecha_registro',
            value: nestedValue(data.datos_anteriores, 'fecha_registro'),
        },
    ];
    for (const candidate of candidates) {
        const iso = toIso(candidate.value);
        if (iso) return { field: candidate.field, iso };
    }
    return { field: 'TIMESTAMP_MISSING', iso: null };
}

function walkReferenced(
    value: unknown,
    path: string,
    output: ReferencedId[]
): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            walkReferenced(item, `${path}[${index}]`, output);
        });
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(
        value as Record<string, unknown>
    )) {
        const next = path ? `${path}.${key}` : key;
        if (REFERENCED_KEYS.has(key) && typeof item === 'string' && item.trim()) {
            output.push({ id: item.trim(), path: next });
        }
        walkReferenced(item, next, output);
    }
}

function referencedDocIds(
    data: Record<string, unknown>
): ReferencedId[] {
    const output: ReferencedId[] = [];
    walkReferenced(data, '', output);
    const seen: Record<string, true> = {};
    return output.filter((item) => {
        const key = `${item.id}|${item.path}`;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
}

function walkRealIds(
    value: unknown,
    path: string,
    output: ReferencedId[]
): void {
    if (typeof value === 'string') {
        if ((REAL_IDS as readonly string[]).includes(value)) {
            output.push({ id: value, path });
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            walkRealIds(item, `${path}[${index}]`, output);
        });
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(
        value as Record<string, unknown>
    )) {
        const next = path ? `${path}.${key}` : key;
        walkRealIds(item, next, output);
    }
}

function realDataMatches(
    data: Record<string, unknown>
): ReferencedId[] {
    const output: ReferencedId[] = [];
    walkRealIds(data, '', output);
    const seen: Record<string, true> = {};
    return output.filter((item) => {
        const key = `${item.id}|${item.path}`;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
}

function normalizeEntry(
    ledger: LedgerName,
    docId: string,
    data: Record<string, unknown>
): NormalizedEntry {
    const coleccion = text(data.coleccion_afectada);
    const operacionRaw = data.operacion;
    const operacion =
        typeof operacionRaw === 'string' ? operacionRaw : 'UNKNOWN';
    const timestamp = timestampOf(data);
    return {
        ledger,
        docId,
        coleccion_afectada: coleccion,
        domain: domainOf(coleccion),
        operacion,
        operacion_raw:
            operacionRaw === undefined ? null : serializeValue(operacionRaw),
        registrado_por: text(data.registrado_por),
        registrado_por_email: text(data.registrado_por_email),
        timestamp_field: timestamp.field,
        timestamp_utc: timestamp.iso,
        timestamp_bogota: timestamp.iso
            ? bogotaIso(timestamp.iso)
            : null,
        timestamp_missing: timestamp.iso === null,
        documento_id: text(data.documento_id),
        conteo_id: text(data.conteo_id),
        referencia: text(data.referencia),
        referenced_doc_ids: referencedDocIds(data),
        real_data_matches: realDataMatches(data),
        raw: serializeValue(data),
    };
}

function buildFieldInventory(
    ledger: LedgerName,
    rawDocs: RawLedgerDoc[]
): FieldInventory {
    const count = rawDocs.length;
    const fields: Record<string, FieldInfo> = {};
    const operations: Record<string, number> = {
        CREATE: 0,
        UPDATE: 0,
        SOFT_DELETE: 0,
        UNKNOWN: 0,
    };
    const unknownMap: Record<
        string,
        { value: unknown; missing: boolean; docIds: string[] }
    > = {};

    for (const { docId, data } of rawDocs) {
        for (const key of Object.keys(data)) {
            const current = fields[key] ?? {
                present: 0,
                missing: 0,
                types: [],
            };
            current.present += 1;
            const type = typeOf(data[key]);
            if (!current.types.includes(type)) current.types.push(type);
            fields[key] = current;
        }

        const rawOp = data.operacion;
        if (typeof rawOp === 'string' && KNOWN_OPERATIONS.has(rawOp)) {
            operations[rawOp] += 1;
        } else {
            operations.UNKNOWN += 1;
            const missing = rawOp === undefined;
            const key = `${missing ? '(missing)' : String(rawOp)}`;
            const current = unknownMap[key] ?? {
                value: missing ? null : serializeValue(rawOp),
                missing,
                docIds: [],
            };
            current.docIds.push(docId);
            unknownMap[key] = current;
        }
    }

    for (const [key, info] of Object.entries(fields)) {
        info.missing = count - info.present;
        info.types.sort();
        fields[key] = info;
    }

    const unknownOperationValues = Object.values(unknownMap).map((item) => ({
        value: item.value,
        missing: item.missing,
        count: item.docIds.length,
        docIds: item.docIds.sort(),
    }));
    unknownOperationValues.sort((a, b) =>
        `${String(a.value)}|${a.missing}`.localeCompare(
            `${String(b.value)}|${b.missing}`
        )
    );

    const operationTotal = Object.values(operations).reduce(
        (total, value) => total + value,
        0
    );
    if (operationTotal !== count) {
        fail(
            'FIELD_INVENTORY_INCOHERENT',
            `${ledger}: operaciones ${operationTotal} != ${count}`
        );
    }

    return {
        ledger,
        count,
        fields,
        operations,
        unknown_operation_values: unknownOperationValues,
    };
}

function buildRealDataResults(
    entries: NormalizedEntry[]
): Record<string, RealDataResult> {
    const results: Record<string, RealDataResult> = {};
    for (const id of REAL_IDS) {
        const matched = entries.filter((entry) =>
            entry.real_data_matches.some((match) => match.id === id)
        );
        const refs: RealDataEntryRef[] = matched.map((entry) => ({
            ledger: entry.ledger,
            docId: entry.docId,
            coleccion_afectada: entry.coleccion_afectada,
            operacion: entry.operacion,
            timestamp_utc: entry.timestamp_utc,
            registrado_por: entry.registrado_por,
            json_paths: entry.real_data_matches
                .filter((match) => match.id === id)
                .map((match) => match.path),
        }));
        const result: RealDataResult = {
            id,
            found: refs.length > 0,
            count: refs.length,
            entries: refs,
        };
        if (result.found !== (result.count > 0)) {
            fail('REAL_DATA_INCOHERENT', `${id}: found/count`);
        }
        if (result.count !== result.entries.length) {
            fail('REAL_DATA_INCOHERENT', `${id}: count/entries`);
        }
        results[id] = result;
    }
    return results;
}

function buildDomainBreakdown(
    entries: NormalizedEntry[]
): DomainBreakdown {
    const emptyDomain = (): DomainStats => ({
        count: 0,
        collections: {},
        operations: {},
        actors: {},
    });
    const ledgers: DomainBreakdown['ledgers'] = {
        [LEDGER_INVENTORY]: {
            count: 0,
            domains: {
                inventario: emptyDomain(),
                sys_admin_users: emptyDomain(),
                creditos_financiero: emptyDomain(),
                otro: emptyDomain(),
            },
        },
        [LEDGER_FINANCIAL]: {
            count: 0,
            domains: {
                inventario: emptyDomain(),
                sys_admin_users: emptyDomain(),
                creditos_financiero: emptyDomain(),
                otro: emptyDomain(),
            },
        },
    };
    const totals: Record<Domain, number> = {
        inventario: 0,
        sys_admin_users: 0,
        creditos_financiero: 0,
        otro: 0,
    };

    for (const entry of entries) {
        const ledger = ledgers[entry.ledger];
        ledger.count += 1;
        const stats = ledger.domains[entry.domain];
        stats.count += 1;
        stats.collections[entry.coleccion_afectada || '(empty)'] =
            (stats.collections[entry.coleccion_afectada || '(empty)'] ?? 0) +
            1;
        stats.operations[entry.operacion] =
            (stats.operations[entry.operacion] ?? 0) + 1;
        const actor =
            entry.registrado_por ||
            entry.registrado_por_email ||
            '(missing)';
        stats.actors[actor] = (stats.actors[actor] ?? 0) + 1;
        totals[entry.domain] += 1;
    }

    return { ledgers, totals };
}

function buildActors(entries: NormalizedEntry[]): Record<LedgerName, ActorStats[]> {
    const result: Record<LedgerName, ActorStats[]> = {
        [LEDGER_INVENTORY]: [],
        [LEDGER_FINANCIAL]: [],
    };
    for (const ledger of [LEDGER_INVENTORY, LEDGER_FINANCIAL] as const) {
        const map: Record<string, ActorStats> = {};
        for (const entry of entries.filter((item) => item.ledger === ledger)) {
            const key = `${entry.registrado_por}|${entry.registrado_por_email}`;
            const current = map[key] ?? {
                registrado_por: entry.registrado_por,
                registrado_por_email: entry.registrado_por_email,
                count: 0,
                first_utc: null,
                last_utc: null,
            };
            current.count += 1;
            if (entry.timestamp_utc) {
                if (!current.first_utc || entry.timestamp_utc < current.first_utc) {
                    current.first_utc = entry.timestamp_utc;
                }
                if (!current.last_utc || entry.timestamp_utc > current.last_utc) {
                    current.last_utc = entry.timestamp_utc;
                }
            }
            map[key] = current;
        }
        result[ledger] = Object.values(map).sort(
            (a, b) => b.count - a.count
        );
    }
    return result;
}

function buildTimeline(
    ledger: LedgerName,
    entries: NormalizedEntry[]
): Timeline {
    const withTime = entries
        .filter((entry) => entry.timestamp_utc !== null)
        .sort((a, b) =>
            String(a.timestamp_utc).localeCompare(String(b.timestamp_utc))
        );
    const byDayUtc: Record<string, number> = {};
    const byDayBogota: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    for (const entry of withTime) {
        const utc = entry.timestamp_utc as string;
        const bogota = entry.timestamp_bogota as string;
        byDayUtc[utc.slice(0, 10)] = (byDayUtc[utc.slice(0, 10)] ?? 0) + 1;
        byDayBogota[bogota.slice(0, 10)] =
            (byDayBogota[bogota.slice(0, 10)] ?? 0) + 1;
        byMonth[utc.slice(0, 7)] = (byMonth[utc.slice(0, 7)] ?? 0) + 1;
    }

    const gaps: Gap[] = [];
    for (let index = 1; index < withTime.length; index += 1) {
        const before = withTime[index - 1];
        const after = withTime[index];
        const beforeMs = new Date(before.timestamp_utc as string).getTime();
        const afterMs = new Date(after.timestamp_utc as string).getTime();
        gaps.push({
            before_docId: before.docId,
            after_docId: after.docId,
            before_utc: before.timestamp_utc as string,
            after_utc: after.timestamp_utc as string,
            gap_hours: Number(((afterMs - beforeMs) / 3600000).toFixed(2)),
        });
    }
    const largestGaps = gaps
        .sort((a, b) => b.gap_hours - a.gap_hours)
        .slice(0, 10);

    const cutoffCandidates: CutoffCandidate[] = [];
    for (const gap of gaps) {
        if (gap.gap_hours < 24) continue;
        const beforeIndex = withTime.findIndex(
            (entry) => entry.docId === gap.before_docId
        );
        const afterIndex = withTime.findIndex(
            (entry) => entry.docId === gap.after_docId
        );
        const beforeEntries = withTime.slice(0, beforeIndex + 1);
        const afterEntries = withTime.slice(afterIndex);
        const mix = (items: NormalizedEntry[], key: 'domain' | 'actor') => {
            const output: Record<string, number> = {};
            for (const item of items) {
                const value =
                    key === 'domain'
                        ? item.domain
                        : item.registrado_por ||
                          item.registrado_por_email ||
                          '(missing)';
                output[value] = (output[value] ?? 0) + 1;
            }
            return output;
        };
        cutoffCandidates.push({
            ...gap,
            before_count: beforeEntries.length,
            after_count: afterEntries.length,
            domain_mix_before: mix(beforeEntries, 'domain'),
            domain_mix_after: mix(afterEntries, 'domain'),
            actor_mix_before: mix(beforeEntries, 'actor'),
            actor_mix_after: mix(afterEntries, 'actor'),
        });
    }
    cutoffCandidates.sort((a, b) => b.gap_hours - a.gap_hours);

    const min = withTime[0] ?? null;
    const max = withTime[withTime.length - 1] ?? null;
    const spanDays =
        min && max
            ? Number(
                  (
                      (new Date(max.timestamp_utc as string).getTime() -
                          new Date(min.timestamp_utc as string).getTime()) /
                      86400000
                  ).toFixed(2)
              )
            : null;

    return {
        ledger,
        min_utc: min ? min.timestamp_utc : null,
        max_utc: max ? max.timestamp_utc : null,
        min_bogota: min ? min.timestamp_bogota : null,
        max_bogota: max ? max.timestamp_bogota : null,
        span_days: spanDays,
        by_day_utc: byDayUtc,
        by_day_bogota: byDayBogota,
        by_month: byMonth,
        largest_gaps: largestGaps,
        cutoff_candidates: cutoffCandidates,
        timestamp_missing: entries
            .filter((entry) => entry.timestamp_missing)
            .map((entry) => entry.docId)
            .sort(),
    };
}

function readJson<T>(path: string): T {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeRunId(date: Date): string {
    return date.toISOString().replace(/[:.]/g, '-');
}

async function readLedger(
    db: ReturnType<typeof getFirestore>,
    ledger: LedgerName
): Promise<LedgerRead> {
    const snap = await db.collection(ledger).get();
    const rawDocs: RawLedgerDoc[] = snap.docs.map((doc) => ({
        docId: doc.id,
        data: doc.data() as Record<string, unknown>,
    }));
    const entries = rawDocs.map(({ docId, data }) =>
        normalizeEntry(ledger, docId, data)
    );
    const lines = rawDocs
        .map(({ docId, data }) => `${docId}:${stableStringify(data)}`)
        .sort();
    const hash = sha256(lines.join('\n'));
    return { ledger, count: snap.size, hash, entries, rawDocs };
}

function buildReport(summary: Record<string, unknown>): string {
    const ledgers = summary.ledgers as Record<
        string,
        { count: number; hash: string }
    >;
    const domains = summary.domain_totals as Record<string, number>;
    const realData = summary.real_data as Record<
        string,
        { found: boolean; count: number }
    >;
    const timeline = summary.timeline as Record<
        string,
        { min_utc: string | null; max_utc: string | null; cutoff_candidates: unknown[] }
    >;
    return [
        '# Forense read-only — composición de ledgers',
        '',
        '## Alcance',
        '',
        SCOPE_NOTE,
        '',
        '## Ledgers',
        '',
        `- \`${LEDGER_INVENTORY}\`: ${ledgers[LEDGER_INVENTORY].count} asientos, hash \`${ledgers[LEDGER_INVENTORY].hash}\``,
        `- \`${LEDGER_FINANCIAL}\`: ${ledgers[LEDGER_FINANCIAL].count} asientos, hash \`${ledgers[LEDGER_FINANCIAL].hash}\``,
        '',
        '## Dominios',
        '',
        `- inventario: ${domains.inventario}`,
        `- sys_admin_users: ${domains.sys_admin_users}`,
        `- creditos_financiero: ${domains.creditos_financiero}`,
        `- otro: ${domains.otro}`,
        '',
        '## Data real',
        '',
        ...Object.values(realData).map(
            (result) =>
                `- ${(result as { id?: string }).id ?? ''}: found=${result.found}, count=${result.count}`
        ),
        '',
        '## Timeline',
        '',
        ...Object.entries(timeline).map(
            ([ledger, value]) =>
                `- ${ledger}: ${value.min_utc ?? '(sin timestamps)'} → ${value.max_utc ?? '(sin timestamps)'}; cutoff_candidates=${value.cutoff_candidates.length}`
        ),
        '',
        '## Nota',
        '',
        'Los cortes son candidatos. El Director decide la frontera configuración/operación.',
        '',
    ].join('\n');
}

async function ejecutarForenseLedgers(options: CliOptions): Promise<void> {
    const runId = makeRunId(new Date());
    const outDirCandidate =
        options.outDir || join(DEFAULT_OUT_ROOT, `ledgers-forense-${runId}`);
    const { db } = initFirebaseGuarded({
        outDir: outDirCandidate,
        projectId: PROJECT_ID,
    });

    const inventory = await readLedger(db, LEDGER_INVENTORY);
    const financial = await readLedger(db, LEDGER_FINANCIAL);

    if (inventory.count !== 14) {
        fail(
            'INVENTORY_LEDGER_ANCHOR_MISMATCH',
            `count=${inventory.count}, esperado 14`
        );
    }
    if (inventory.hash !== INVENTORY_LEDGER_HASH_ANCHOR) {
        fail(
            'INVENTORY_LEDGER_ANCHOR_MISMATCH',
            `hash=${inventory.hash}, esperado ${INVENTORY_LEDGER_HASH_ANCHOR}`
        );
    }

    const entries = [...inventory.entries, ...financial.entries];
    const fieldInventory = {
        [LEDGER_INVENTORY]: buildFieldInventory(
            LEDGER_INVENTORY,
            inventory.rawDocs
        ),
        [LEDGER_FINANCIAL]: buildFieldInventory(
            LEDGER_FINANCIAL,
            financial.rawDocs
        ),
    };
    const domainBreakdown = buildDomainBreakdown(entries);
    const actors = buildActors(entries);
    const realData = buildRealDataResults(entries);
    const timeline = {
        [LEDGER_INVENTORY]: buildTimeline(LEDGER_INVENTORY, inventory.entries),
        [LEDGER_FINANCIAL]: buildTimeline(LEDGER_FINANCIAL, financial.entries),
    };

    for (const ledger of [LEDGER_INVENTORY, LEDGER_FINANCIAL] as const) {
        const inventoryFields = fieldInventory[ledger].fields;
        for (const [name, info] of Object.entries(inventoryFields)) {
            if (info.present + info.missing !== fieldInventory[ledger].count) {
                fail(
                    'FIELD_INVENTORY_INCOHERENT',
                    `${ledger}/${name}: present+missing != count`
                );
            }
        }
    }

    const outDir = assertOutDirOutsideRepo(outDirCandidate);

    const generatedAt = new Date().toISOString();
    const summary = {
        ticket: 'WEB-FORENSE-LEDGERS-001',
        generated_at_utc: generatedAt,
        project_id: PROJECT_ID,
        read_whitelist: [LEDGER_INVENTORY, LEDGER_FINANCIAL],
        write_whitelist: [],
        scope_note: SCOPE_NOTE,
        ledgers: {
            [LEDGER_INVENTORY]: {
                count: inventory.count,
                hash: inventory.hash,
                anchor: INVENTORY_LEDGER_HASH_ANCHOR,
                anchor_match: inventory.hash === INVENTORY_LEDGER_HASH_ANCHOR,
            },
            [LEDGER_FINANCIAL]: {
                count: financial.count,
                hash: financial.hash,
                anchor: null,
                anchor_match: null,
            },
        },
        domain_breakdown: domainBreakdown,
        domain_totals: domainBreakdown.totals,
        field_inventory: fieldInventory,
        real_data: realData,
        timeline,
        actors,
    };

    const files: Record<string, unknown> = {
        'summary.json': summary,
        'entries_historial_auditoria_inventario.json': inventory.entries,
        'entries_historial_auditoria.json': financial.entries,
        'entries_all.json': entries,
        'domain_breakdown.json': domainBreakdown,
        'field_inventory.json': fieldInventory,
        'real_data_references.json': {
            scope_note: SCOPE_NOTE,
            results: realData,
        },
        'timeline.json': {
            scope_note: SCOPE_NOTE,
            ledgers: timeline,
        },
        'actors.json': actors,
    };

    const report = buildReport(summary);

    let scriptHash: string | null = null;
    try {
        scriptHash = sha256(readFileSync(process.argv[1], 'utf8'));
    } catch {
        scriptHash = null;
    }

    const { 'summary.json': summaryFile, ...extraFiles } = files;
    writeManifestAndReport(
        outDir,
        'summary.json',
        summaryFile,
        report,
        extraFiles,
        {
            ticket: 'WEB-FORENSE-LEDGERS-001',
            generated_at_utc: generatedAt,
            read_whitelist: [LEDGER_INVENTORY, LEDGER_FINANCIAL],
            write_whitelist: [],
            reports_outside_repo: true,
            scope_note: SCOPE_NOTE,
            script_sha256: scriptHash,
            ledger_hashes: {
                [LEDGER_INVENTORY]: inventory.hash,
                [LEDGER_FINANCIAL]: financial.hash,
            },
        },
        'report_hashes'
    );

    console.log(`INVENTORY_COUNT=${inventory.count}`);
    console.log(`INVENTORY_HASH=${inventory.hash}`);
    console.log(`FINANCIAL_COUNT=${financial.count}`);
    console.log(`FINANCIAL_HASH=${financial.hash}`);
    console.log(`DOMAIN_TOTALS=${JSON.stringify(domainBreakdown.totals)}`);
    console.log(`REAL_${REAL_IDS[0]}=${realData[REAL_IDS[0]].count}`);
    console.log(`REAL_${REAL_IDS[1]}=${realData[REAL_IDS[1]].count}`);
    console.log(`OUT=${outDir}`);
}

function reviveTimestamps(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(reviveTimestamps);
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.__timestamp === 'string') {
            const date = new Date(record.__timestamp);
            return { toDate: () => date };
        }
        const output: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(record)) {
            output[key] = reviveTimestamps(item);
        }
        return output;
    }
    return value;
}

function runFixtures(options: CliOptions): void {
    const fixture = readJson<FixtureFile>(options.fixtures as string);
    const canonicalInput = reviveTimestamps(fixture.canonicalization.input);
    const canonicalActual = stableStringify(canonicalInput);
    if (canonicalActual !== fixture.canonicalization.expected) {
        fail(
            'FIXTURE_CANONICALIZATION_FAILED',
            `expected=${fixture.canonicalization.expected}\nactual=${canonicalActual}`
        );
    }

    const inventoryEntries = fixture.inventory.map(({ docId, data }) =>
        normalizeEntry(LEDGER_INVENTORY, docId, reviveTimestamps(data) as Record<string, unknown>)
    );
    const financialEntries = fixture.financial.map(({ docId, data }) =>
        normalizeEntry(LEDGER_FINANCIAL, docId, reviveTimestamps(data) as Record<string, unknown>)
    );
    const realData = buildRealDataResults([
        ...inventoryEntries,
        ...financialEntries,
    ]);

    for (const id of REAL_IDS) {
        const expected = fixture.expected_real_ids[id];
        const actual = realData[id];
        if (!expected) {
            fail('FIXTURE_REAL_DATA_MISSING', id);
        }
        if (
            actual.found !== expected.found ||
            actual.count !== expected.count ||
            actual.count !== actual.entries.length
        ) {
            fail(
                'FIXTURE_REAL_DATA_FAILED',
                `${id}: expected found=${expected.found} count=${expected.count}, actual found=${actual.found} count=${actual.count} entries=${actual.entries.length}`
            );
        }
    }

    const outDir = assertOutDirOutsideRepo(options.outDir);
    const output = {
        ticket: 'WEB-FORENSE-LEDGERS-001',
        mode: 'fixtures',
        canonicalization: {
            pass: true,
            expected: fixture.canonicalization.expected,
            actual: canonicalActual,
        },
        real_data: realData,
        pass: true,
    };
    writeJson(join(outDir, 'ledgers-forense-fixtures.json'), output);
    console.log('FIXTURES=3/3');
    console.log('FIXTURE_CANONICALIZATION=PASS');
    console.log(`FIXTURE_REAL_${REAL_IDS[0]}=${realData[REAL_IDS[0]].count}`);
    console.log(`FIXTURE_REAL_${REAL_IDS[1]}=${realData[REAL_IDS[1]].count}`);
    console.log(`OUT=${outDir}`);
}

function parseArgs(argv: string[]): CliOptions {
    let fixtures: string | null = null;
    let project = '';
    let outDir = '';
    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            console.log(
                'Uso: --fixtures=<archivo> --out=<dir> | --project=tiendalasmotos --out=<dir>'
            );
            throw new Error('HELP_REQUESTED');
        }
        if (!arg.startsWith('--')) {
            fail('ARG_INVALIDO', arg);
        }
        const [rawKey, rawValue = ''] = arg.slice(2).split('=', 2);
        const key = rawKey.trim();
        const value = rawValue.trim();
        if (key === 'fixtures') {
            fixtures = value;
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
    if (!outDir) {
        fail('OUT_DIR_REQUERIDO', '(vacío)');
    }
    if (fixtures) {
        return { mode: 'fixtures', fixtures, project, outDir };
    }
    if (project !== PROJECT_ID) {
        fail('PROYECTO_NO_AUTORIZADO', project || '(vacío)');
    }
    return { mode: 'live', fixtures: null, project, outDir };
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
    await ejecutarForenseLedgers(options);
}

main().catch((error) => {
    console.error(
        '[ledgers] ERROR:',
        error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
});
