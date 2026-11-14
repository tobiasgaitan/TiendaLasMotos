/**
 * WEB-FORENSE-P6-001 — Fase 0 read-only.
 *
 * Objetivo:
 *   - Enumerar completas las 3 colecciones del perímetro P6.
 *   - Clasificar cada documento con evidencia.
 *   - Construir una whitelist con IDs VACÍOS y pending_director_decision.
 *   - Leer baseline de ledger, CRE-2026-0001 y sedes.
 *   - Verificar Storage de paths candidatos y de los 5 reales de O-30.
 *
 * Este script NO tiene modo de escritura remota. Solo escribe reportes locales.
 */
import { hash as cryptoHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const PROJECT_ID = 'tiendalasmotos';
const BUCKET_NAME = 'tiendalasmotos.appspot.com';
const DEFAULT_OUT_ROOT =
    '/private/var/folders/wv/332j5kzn75d7kjnsj6l_3hhc0000gn/T/opencode';

const EXPECTED_INVENTORY = 7;
const EXPECTED_COUNTS = 5;
const EXPECTED_PHOTOS = 5;

const TEST_REFS = [
    'NUEVAPRUEBA12NOV26B1SINESPACIO',
    'NUEVAPRUEBA12NOV26B1',
    'GRP-CF-001',
    '123456',
] as const;

const REAL_O30_PATHS = [
    'inventario_repuestos/conexion@tiendalasmotos.com/354c579f-0b55-406d-8508-82d605e73bd2.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/37e442f9-fb11-4375-bf82-2e448c448932.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/5c32b110-3cac-425a-9398-48a29282904d.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/6abb3dac-4a36-4457-a6b8-53c340bfc9b1.jpg',
    'inventario_repuestos/conexion@tiendalasmotos.com/ec47caed-ddf8-4f04-86b2-2979280ac539.jpg',
] as const;

const COLLECTION_INVENTORY = 'inventario_repuestos';
const COLLECTION_COUNTS = 'conteos_pendientes_repuestos';
const COLLECTION_PHOTOS = 'fotos_inventario';
const COLLECTION_LEDGER = 'historial_auditoria_inventario';
const COLLECTION_SEDES = 'configuracion/general/sedes';
const CREDIT_PATH = 'creditos/CRE-2026-0001';

type Classification =
    | 'TEST_CANDIDATE'
    | 'REAL'
    | 'UNDETERMINED'
    | 'ALTERNATIVE_ONLY_MATCH';

type MatchType = 'PRIMARY' | 'ALTERNATIVE' | 'LINKED' | 'NONE';

type StorageStatus =
    | 'PRESENT'
    | 'ALREADY_ABSENT'
    | 'MISSING_PATH'
    | 'COLLISION_WITH_REAL_O30';

interface InventoryDoc {
    docId: string;
    referencia: string;
    referencias_alternativas: string[];
    descripcion: string;
    fabricante: string;
    categoria: string;
    aplica_a: string[];
    precio: number | null;
    stock: number | null;
    stock_minimo: number | null;
    imagen_url: string;
    sede_id: string;
    creado_por: string;
    creado_en: string | null;
    actualizado_por: string;
    actualizado_en: string | null;
    registrado_por: string;
}

interface CountDoc {
    docId: string;
    referencia_sugerida: string;
    referencia_confirmada: string;
    inventario_documento_id: string;
    sede_id: string;
    descripcion: string;
    cantidad_contada: number | null;
    ubicacion: string;
    anotaciones: string;
    foto_url: string;
    foto_url_path: string | null;
    estado: string;
    motivo_rechazo: string;
    asesor_email: string;
    asesor_uid: string;
    creado_en: string | null;
    revisado_por: string;
    revisado_en: string | null;
    registrado_por: string;
    actualizado_por: string;
}

interface PhotoDoc {
    docId: string;
    conteo_id: string;
    asesor_email: string;
    asesor_uid: string;
    foto_url: string;
    foto_url_path: string | null;
    storage_path: string;
    nombre_archivo: string;
    mime_type: string;
    tamano_bytes: number | null;
    etiquetas_vision: string[];
    creado_en: string | null;
}

interface InventoryClassified extends InventoryDoc {
    classification: Classification;
    match_type: MatchType;
    matched_refs: string[];
    blocking_reasons: string[];
    linked_count_ids: string[];
    linked_photo_ids: string[];
}

interface CountClassified extends CountDoc {
    classification: Classification;
    match_type: MatchType;
    matched_refs: string[];
    blocking_reasons: string[];
    linked_inventory_classification: Classification | null;
    photo_doc_id: string | null;
    storage_path: string;
    storage_status: StorageStatus | null;
}

interface PhotoClassified extends PhotoDoc {
    classification: Classification;
    match_type: MatchType;
    matched_refs: string[];
    blocking_reasons: string[];
    linked_count_classification: Classification | null;
    storage_status: StorageStatus;
}

interface PendingDecision {
    collection: string;
    docId: string;
    classification: Classification;
    match_type: MatchType;
    matched_refs: string[];
    evidence: Record<string, unknown>;
    blocking_reasons: string[];
}

interface Collision {
    type: string;
    collection: string;
    docId: string;
    detail: string;
    blocking: boolean;
}

interface StorageReport {
    path: string;
    source: 'candidate' | 'real_o30';
    status: StorageStatus;
    size: number | null;
    contentType: string | null;
    timeCreated: string | null;
    md5Hash: string | null;
}

interface P6Result {
    inventory: InventoryClassified[];
    counts: CountClassified[];
    photos: PhotoClassified[];
    pending: PendingDecision[];
    collisions: Collision[];
    warnings: string[];
    storage: StorageReport[];
    universe: {
        inventory: number;
        counts: number;
        photos: number;
        total: number;
        expected: { inventory: number; counts: number; photos: number };
        drift: boolean;
    };
}

interface FixtureInput {
    testRefs?: string[];
    realO30Paths?: string[];
    inventory: InventoryDoc[];
    counts: CountDoc[];
    photos: PhotoDoc[];
    storageStatusByPath?: Record<string, StorageStatus>;
    expected?: {
        inventory?: Record<string, Classification>;
        counts?: Record<string, Classification>;
        photos?: Record<string, Classification>;
        collisions?: string[];
        pendingCount?: number;
        whitelistEmpty?: boolean;
    };
}

interface BaselineSnapshot {
    exists: boolean;
    hash: string | null;
    snapshot: unknown;
}

interface LedgerReference {
    entryId: string;
    collection: string;
    documento_id: string;
    conteo_id: string;
    referencia: string;
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

function bool(value: unknown): boolean {
    return value === true;
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

function normalizeRef(value: unknown): string {
    return text(value).trim().toUpperCase();
}

function isTestPrefix(value: string): boolean {
    return value.startsWith('NUEVAPRUEBA');
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

function redactUrls(value: unknown): unknown {
    if (typeof value === 'string') {
        return value.replace(/https?:\/\/[^\s"]+/g, '[REDACTED_URL]');
    }
    if (Array.isArray(value)) return value.map(redactUrls);
    if (value && typeof value === 'object') {
        const record: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            record[key] = redactUrls(
                (value as Record<string, unknown>)[key]
            );
        }
        return record;
    }
    return value;
}

function addCollision(
    list: Collision[],
    seen: Record<string, true>,
    item: Collision
): void {
    const key = `${item.type}|${item.collection}|${item.docId}|${item.detail}`;
    if (seen[key]) return;
    seen[key] = true;
    list.push(item);
}

function classifyP6(input: {
    inventory: InventoryDoc[];
    counts: CountDoc[];
    photos: PhotoDoc[];
    testRefs: readonly string[];
    realO30Paths: readonly string[];
    storageStatusByPath?: Record<string, StorageStatus>;
}): P6Result {
    const testRefs = new Set(input.testRefs.map(normalizeRef));
    const realO30 = new Set(input.realO30Paths);
    const collisions: Collision[] = [];
    const collisionSeen: Record<string, true> = {};
    const warnings: string[] = [];

    const inventory: InventoryClassified[] = input.inventory.map((doc) => {
        const primary = normalizeRef(doc.referencia);
        const alternatives = doc.referencias_alternativas
            .map(normalizeRef)
            .filter(Boolean);
        const primaryMatch = testRefs.has(primary);
        const matchedAlternatives = alternatives.filter((ref) =>
            testRefs.has(ref)
        );
        const alternativeMatch = matchedAlternatives.length > 0;
        const matchedRefs = primaryMatch
            ? [primary]
            : matchedAlternatives;
        const nameHint =
            /(PRUEBA|TEST|DEMO|SAMPLE)/i.test(doc.docId) ||
            /(PRUEBA|TEST|DEMO|SAMPLE)/i.test(doc.descripcion);
        let classification: Classification;
        let matchType: MatchType = 'NONE';
        const blockingReasons: string[] = [];

        if (primaryMatch && isTestPrefix(primary)) {
            classification = 'TEST_CANDIDATE';
            matchType = 'PRIMARY';
        } else if (primaryMatch) {
            classification = 'UNDETERMINED';
            matchType = 'PRIMARY';
            blockingReasons.push(
                `REF_PRIMARIA_NO_PREFIJO: ${primary} requiere decisión del Director`
            );
        } else if (alternativeMatch) {
            classification = 'ALTERNATIVE_ONLY_MATCH';
            matchType = 'ALTERNATIVE';
            blockingReasons.push(
                `ALTERNATIVE_ONLY_MATCH: ${matchedAlternatives.join(', ')} aparece solo en referencias_alternativas`
            );
        } else if (nameHint) {
            classification = 'UNDETERMINED';
            blockingReasons.push(
                'NAME_HINTS_TEST: docId o descripcion sugiere prueba; el Director decide'
            );
        } else {
            classification = 'REAL';
        }

        return {
            ...doc,
            classification,
            match_type: matchType,
            matched_refs: matchedRefs,
            blocking_reasons: blockingReasons,
            linked_count_ids: [],
            linked_photo_ids: [],
        };
    });

    const inventoryById: Record<string, InventoryClassified> = {};
    for (const doc of inventory) {
        inventoryById[doc.docId] = doc;
    }

    const counts: CountClassified[] = input.counts.map((doc) => {
        const refs = [
            normalizeRef(doc.referencia_sugerida),
            normalizeRef(doc.referencia_confirmada),
        ].filter(Boolean);
        const matchedRefs = Array.from(
            new Set(refs.filter((ref) => testRefs.has(ref)))
        );
        const primaryMatch = matchedRefs.length > 0;
        const testPrefixMatch = matchedRefs.some(isTestPrefix);
        const nonPrefixedMatch = matchedRefs.some(
            (ref) => !isTestPrefix(ref)
        );
        const nameHint = /(PRUEBA|TEST|DEMO|SAMPLE)/i.test(doc.descripcion);
        const linkedInventory =
            inventoryById[doc.inventario_documento_id] ?? null;
        const linkedClassification = linkedInventory
            ? linkedInventory.classification
            : null;
        const blockingReasons: string[] = [];
        let classification: Classification;
        let matchType: MatchType = 'NONE';

        if (testPrefixMatch) {
            classification = 'TEST_CANDIDATE';
            matchType = 'PRIMARY';
        } else if (nonPrefixedMatch) {
            classification = 'UNDETERMINED';
            matchType = 'PRIMARY';
            blockingReasons.push(
                `REF_NO_PREFIJO: ${matchedRefs.join(', ')} requiere decisión del Director`
            );
        } else if (nameHint) {
            classification = 'UNDETERMINED';
            matchType = 'NONE';
            blockingReasons.push(
                'NAME_HINTS_TEST: descripcion sugiere prueba; el Director decide'
            );
        } else if (linkedClassification === 'TEST_CANDIDATE') {
            classification = 'UNDETERMINED';
            matchType = 'LINKED';
            blockingReasons.push(
                'LINKED_TO_TEST_CANDIDATE_INVENTORY: el conteo no tiene ref de prueba propia'
            );
        } else if (
            linkedClassification === 'UNDETERMINED' ||
            linkedClassification === 'ALTERNATIVE_ONLY_MATCH'
        ) {
            classification = 'UNDETERMINED';
            matchType = 'LINKED';
            blockingReasons.push(
                `LINKED_TO_${linkedClassification}: revisar vínculo`
            );
        } else if (linkedClassification === 'REAL') {
            classification = 'REAL';
            matchType = 'LINKED';
        } else {
            classification = 'UNDETERMINED';
            matchType = 'NONE';
            blockingReasons.push(
                'COUNT_WITHOUT_INVENTORY_LINK: no se pudo resolver inventario_documento_id'
            );
        }

        if (
            (classification === 'TEST_CANDIDATE' ||
                classification === 'UNDETERMINED') &&
            linkedClassification === 'REAL'
        ) {
            addCollision(collisions, collisionSeen, {
                type: 'TEST_COUNT_LINKED_TO_REAL_INVENTORY',
                collection: COLLECTION_COUNTS,
                docId: doc.docId,
                detail: `conteo candidato apunta a inventario REAL ${doc.inventario_documento_id}`,
                blocking: true,
            });
            blockingReasons.push(
                'TEST_COUNT_LINKED_TO_REAL_INVENTORY: el inventario real no se borra'
            );
        }

        if (
            classification === 'REAL' &&
            (linkedClassification === 'TEST_CANDIDATE' ||
                linkedClassification === 'UNDETERMINED' ||
                linkedClassification === 'ALTERNATIVE_ONLY_MATCH')
        ) {
            addCollision(collisions, collisionSeen, {
                type: 'REAL_COUNT_LINKED_TO_TEST_INVENTORY',
                collection: COLLECTION_COUNTS,
                docId: doc.docId,
                detail: `conteo REAL apunta a inventario ${linkedClassification}`,
                blocking: true,
            });
            blockingReasons.push(
                'REAL_COUNT_LINKED_TO_TEST_INVENTORY: no borrar el inventario padre'
            );
        }

        if (classification === 'UNDETERMINED' && linkedInventory === null) {
            warnings.push(
                `${doc.docId}: conteo sin vínculo de inventario resoluble`
            );
        }

        return {
            ...doc,
            classification,
            match_type: matchType,
            matched_refs: matchedRefs,
            blocking_reasons: blockingReasons,
            linked_inventory_classification: linkedClassification,
            photo_doc_id: null,
            storage_path: '',
            storage_status: null,
        };
    });

    const countsById: Record<string, CountClassified> = {};
    for (const doc of counts) {
        countsById[doc.docId] = doc;
    }

    const photos: PhotoClassified[] = input.photos.map((doc) => {
        const linkedCount = countsById[doc.conteo_id] ?? null;
        const linkedClassification = linkedCount
            ? linkedCount.classification
            : null;
        const blockingReasons: string[] = [];
        let classification: Classification;
        let matchType: MatchType = 'NONE';

        if (linkedClassification === 'TEST_CANDIDATE') {
            classification = 'TEST_CANDIDATE';
            matchType = 'LINKED';
        } else if (linkedClassification === 'UNDETERMINED') {
            classification = 'UNDETERMINED';
            matchType = 'LINKED';
            blockingReasons.push(
                'LINKED_TO_UNDETERMINED_COUNT: revisar antes de borrar'
            );
        } else if (linkedClassification === 'REAL') {
            classification = 'REAL';
            matchType = 'LINKED';
        } else {
            classification = 'UNDETERMINED';
            blockingReasons.push(
                'PHOTO_WITHOUT_COUNT: la foto no tiene conteo asociado'
            );
        }

        const configuredStatus = input.storageStatusByPath
            ? input.storageStatusByPath[doc.storage_path]
            : undefined;
        let storageStatus: StorageStatus;
        if (!doc.storage_path) {
            storageStatus = 'MISSING_PATH';
        } else if (
            realO30.has(doc.storage_path) &&
            classification !== 'REAL'
        ) {
            storageStatus = 'COLLISION_WITH_REAL_O30';
        } else {
            storageStatus = configuredStatus ?? 'PRESENT';
        }

        if (
            classification === 'REAL' &&
            configuredStatus === 'ALREADY_ABSENT'
        ) {
            blockingReasons.push(
                'REAL_O30_BLOB_MISSING: el blob real de O-30 no existe'
            );
            addCollision(collisions, collisionSeen, {
                type: 'REAL_O30_BLOB_MISSING',
                collection: COLLECTION_PHOTOS,
                docId: doc.docId,
                detail: doc.storage_path,
                blocking: true,
            });
        }

        if (storageStatus === 'MISSING_PATH') {
            blockingReasons.push(
                'MISSING_PATH: storage_path vacío o inválido'
            );
        }
        if (storageStatus === 'COLLISION_WITH_REAL_O30') {
            blockingReasons.push(
                'COLLISION_WITH_REAL_O30: el path pertenece a un blob real de O-30'
            );
            addCollision(collisions, collisionSeen, {
                type: 'COLLISION_WITH_REAL_O30',
                collection: COLLECTION_PHOTOS,
                docId: doc.docId,
                detail: doc.storage_path,
                blocking: true,
            });
        }
        if (linkedCount === null) {
            addCollision(collisions, collisionSeen, {
                type: 'PHOTO_WITHOUT_COUNT',
                collection: COLLECTION_PHOTOS,
                docId: doc.docId,
                detail: `conteo_id ${doc.conteo_id} no existe`,
                blocking: true,
            });
        }
        if (
            storageStatus === 'MISSING_PATH' &&
            linkedCount !== null
        ) {
            addCollision(collisions, collisionSeen, {
                type: 'MISSING_PATH',
                collection: COLLECTION_PHOTOS,
                docId: doc.docId,
                detail: 'documento de foto sin storage_path utilizable',
                blocking: true,
            });
        }

        return {
            ...doc,
            classification,
            match_type: matchType,
            matched_refs: [],
            blocking_reasons: blockingReasons,
            linked_count_classification: linkedClassification,
            storage_status: storageStatus,
        };
    });

    const photosByCount: Record<string, PhotoClassified[]> = {};
    for (const photo of photos) {
        const list = photosByCount[photo.conteo_id] ?? [];
        list.push(photo);
        photosByCount[photo.conteo_id] = list;
    }

    for (const count of counts) {
        const linkedPhotos = photosByCount[count.docId] ?? [];
        const firstPhoto = linkedPhotos[0] ?? null;
        count.photo_doc_id = firstPhoto ? firstPhoto.docId : null;
        count.storage_path = firstPhoto
            ? firstPhoto.storage_path
            : count.foto_url_path ?? '';
        count.storage_status = firstPhoto
            ? firstPhoto.storage_status
            : count.storage_path
              ? input.storageStatusByPath?.[count.storage_path] ?? 'PRESENT'
              : null;

        if (
            (count.classification === 'TEST_CANDIDATE' ||
                count.classification === 'UNDETERMINED') &&
            linkedPhotos.length === 0
        ) {
            if (!count.foto_url && !count.storage_path) {
                warnings.push(
                    `${count.docId}: NO_PHOTO (esperado, no bloqueante)`
                );
            } else {
                addCollision(collisions, collisionSeen, {
                    type: 'MISSING_PATH',
                    collection: COLLECTION_COUNTS,
                    docId: count.docId,
                    detail:
                        'conteo con foto_url pero sin documento fotos_inventario',
                    blocking: true,
                });
                count.blocking_reasons.push(
                    'MISSING_PATH: foto_url sin metadatos de foto'
                );
            }
        }
        if (linkedPhotos.length > 0) {
            const storageCollision = linkedPhotos.find(
                (photo) =>
                    photo.storage_status === 'COLLISION_WITH_REAL_O30'
            );
            if (storageCollision) {
                count.blocking_reasons.push(
                    'COLLISION_WITH_REAL_O30: la foto del conteo apunta a un blob real'
                );
            }
        }
    }

    for (const inv of inventory) {
        const linkedCounts = counts.filter(
            (count) => count.inventario_documento_id === inv.docId
        );
        inv.linked_count_ids = linkedCounts.map((count) => count.docId);
        const linkedPhotos: string[] = [];
        for (const count of linkedCounts) {
            const photosForCount = photosByCount[count.docId] ?? [];
            for (const photo of photosForCount) {
                linkedPhotos.push(photo.docId);
            }
        }
        inv.linked_photo_ids = linkedPhotos;
    }

    const duplicateSeen: Record<string, string[]> = {};
    for (const photo of photos) {
        if (!photo.storage_path) continue;
        const list = duplicateSeen[photo.storage_path] ?? [];
        list.push(photo.docId);
        duplicateSeen[photo.storage_path] = list;
    }
    for (const [path, ids] of Object.entries(duplicateSeen)) {
        if (ids.length > 1) {
            addCollision(collisions, collisionSeen, {
                type: 'DUPLICATE_STORAGE_PATH',
                collection: COLLECTION_PHOTOS,
                docId: path,
                detail: ids.join(', '),
                blocking: true,
            });
        }
    }

    const pending: PendingDecision[] = [];
    const pendingCollections: Array<{
        collection: string;
        docs: Array<
            InventoryClassified | CountClassified | PhotoClassified
        >;
    }> = [
        { collection: COLLECTION_INVENTORY, docs: inventory },
        { collection: COLLECTION_COUNTS, docs: counts },
        { collection: COLLECTION_PHOTOS, docs: photos },
    ];

    for (const group of pendingCollections) {
        for (const doc of group.docs) {
            if (
                doc.classification === 'TEST_CANDIDATE' ||
                doc.classification === 'UNDETERMINED' ||
                doc.classification === 'ALTERNATIVE_ONLY_MATCH'
            ) {
                const evidence =
                    group.collection === COLLECTION_INVENTORY
                        ? {
                              referencia: (doc as InventoryClassified)
                                  .referencia,
                              referencias_alternativas: (
                                  doc as InventoryClassified
                              ).referencias_alternativas,
                              descripcion: (doc as InventoryClassified)
                                  .descripcion,
                              stock: (doc as InventoryClassified).stock,
                              stock_minimo: (doc as InventoryClassified)
                                  .stock_minimo,
                              imagen_url: (doc as InventoryClassified)
                                  .imagen_url
                                  ? extractPathFromFotoUrl(
                                        (doc as InventoryClassified)
                                            .imagen_url
                                    ) ?? '[REDACTED_URL]'
                                  : '',
                              imagen_url_path: extractPathFromFotoUrl(
                                  (doc as InventoryClassified).imagen_url
                              ),
                              sede_id: (doc as InventoryClassified).sede_id,
                              creado_por: (doc as InventoryClassified)
                                  .creado_por,
                              creado_en: (doc as InventoryClassified)
                                  .creado_en,
                              actualizado_por: (
                                  doc as InventoryClassified
                              ).actualizado_por,
                              actualizado_en: (
                                  doc as InventoryClassified
                              ).actualizado_en,
                              registrado_por: (
                                  doc as InventoryClassified
                              ).registrado_por,
                              linked_count_ids: (
                                  doc as InventoryClassified
                              ).linked_count_ids,
                              linked_photo_ids: (
                                  doc as InventoryClassified
                              ).linked_photo_ids,
                          }
                        : group.collection === COLLECTION_COUNTS
                          ? {
                                referencia_sugerida: (
                                    doc as CountClassified
                                ).referencia_sugerida,
                                referencia_confirmada: (
                                    doc as CountClassified
                                ).referencia_confirmada,
                                inventario_documento_id: (
                                    doc as CountClassified
                                ).inventario_documento_id,
                                sede_id: (doc as CountClassified).sede_id,
                                descripcion: (doc as CountClassified)
                                    .descripcion,
                                cantidad_contada: (
                                    doc as CountClassified
                                ).cantidad_contada,
                                ubicacion: (doc as CountClassified).ubicacion,
                                estado: (doc as CountClassified).estado,
                                asesor_email: (
                                    doc as CountClassified
                                ).asesor_email,
                                asesor_uid: (doc as CountClassified)
                                    .asesor_uid,
                                foto_url_path: (
                                    doc as CountClassified
                                ).foto_url_path,
                                creado_en: (doc as CountClassified)
                                    .creado_en,
                                revisado_por: (
                                    doc as CountClassified
                                ).revisado_por,
                                revisado_en: (doc as CountClassified)
                                    .revisado_en,
                                linked_inventory_classification: (
                                    doc as CountClassified
                                ).linked_inventory_classification,
                                photo_doc_id: (doc as CountClassified)
                                    .photo_doc_id,
                                storage_status: (
                                    doc as CountClassified
                                ).storage_status,
                            }
                          : {
                                conteo_id: (doc as PhotoClassified)
                                    .conteo_id,
                                asesor_email: (doc as PhotoClassified)
                                    .asesor_email,
                                asesor_uid: (doc as PhotoClassified)
                                    .asesor_uid,
                                storage_path: (doc as PhotoClassified)
                                    .storage_path,
                                foto_url_path: (doc as PhotoClassified)
                                    .foto_url_path,
                                mime_type: (doc as PhotoClassified)
                                    .mime_type,
                                tamano_bytes: (doc as PhotoClassified)
                                    .tamano_bytes,
                                creado_en: (doc as PhotoClassified)
                                    .creado_en,
                                storage_status: (doc as PhotoClassified)
                                    .storage_status,
                                linked_count_classification: (
                                    doc as PhotoClassified
                                ).linked_count_classification,
                            };

                pending.push({
                    collection: group.collection,
                    docId: doc.docId,
                    classification: doc.classification,
                    match_type: doc.match_type,
                    matched_refs: doc.matched_refs,
                    evidence,
                    blocking_reasons: doc.blocking_reasons,
                });
            }
        }
    }

    const universe = {
        inventory: inventory.length,
        counts: counts.length,
        photos: photos.length,
        total: inventory.length + counts.length + photos.length,
        expected: {
            inventory: EXPECTED_INVENTORY,
            counts: EXPECTED_COUNTS,
            photos: EXPECTED_PHOTOS,
        },
        drift:
            inventory.length !== EXPECTED_INVENTORY ||
            counts.length !== EXPECTED_COUNTS ||
            photos.length !== EXPECTED_PHOTOS,
    };

    const statusByPath: Record<string, StorageStatus> = {};
    for (const photo of photos) {
        if (photo.storage_path) {
            statusByPath[photo.storage_path] = photo.storage_status;
        }
    }
    for (const path of REAL_O30_PATHS) {
        if (!(path in statusByPath)) {
            statusByPath[path] =
                input.storageStatusByPath?.[path] ?? 'PRESENT';
        }
    }

    const storage: StorageReport[] = Object.entries(statusByPath).map(
        ([path, status]) => ({
            path,
            source: realO30.has(path) ? 'real_o30' : 'candidate',
            status,
            size: null,
            contentType: null,
            timeCreated: null,
            md5Hash: null,
        })
    );

    return {
        inventory,
        counts,
        photos,
        pending,
        collisions,
        warnings,
        storage,
        universe,
    };
}

function parseCsvLikeValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function mapInventoryDoc(docId: string, data: Record<string, unknown>): InventoryDoc {
    return {
        docId,
        referencia: parseCsvLikeValue(data.referencia),
        referencias_alternativas: Array.isArray(data.referencias_alternativas)
            ? data.referencias_alternativas.map((item) =>
                  parseCsvLikeValue(item)
              )
            : [],
        descripcion: parseCsvLikeValue(data.descripcion),
        fabricante: parseCsvLikeValue(data.fabricante),
        categoria: parseCsvLikeValue(data.categoria),
        aplica_a: Array.isArray(data.aplica_a)
            ? data.aplica_a.map((item) => parseCsvLikeValue(item))
            : [],
        precio: num(data.precio),
        stock: num(data.stock),
        stock_minimo: num(data.stock_minimo),
        imagen_url: parseCsvLikeValue(data.imagen_url),
        sede_id: parseCsvLikeValue(data.sede_id),
        creado_por: parseCsvLikeValue(data.creado_por),
        creado_en: toIso(data.creado_en),
        actualizado_por: parseCsvLikeValue(data.actualizado_por),
        actualizado_en: toIso(data.actualizado_en),
        registrado_por: parseCsvLikeValue(data.registrado_por),
    };
}

function mapCountDoc(docId: string, data: Record<string, unknown>): CountDoc {
    const fotoUrl = parseCsvLikeValue(data.foto_url);
    return {
        docId,
        referencia_sugerida: parseCsvLikeValue(data.referencia_sugerida),
        referencia_confirmada: parseCsvLikeValue(data.referencia_confirmada),
        inventario_documento_id: parseCsvLikeValue(
            data.inventario_documento_id
        ),
        sede_id: parseCsvLikeValue(data.sede_id),
        descripcion: parseCsvLikeValue(data.descripcion),
        cantidad_contada: num(data.cantidad_contada),
        ubicacion: parseCsvLikeValue(data.ubicacion),
        anotaciones: parseCsvLikeValue(data.anotaciones),
        foto_url: fotoUrl,
        foto_url_path: extractPathFromFotoUrl(fotoUrl),
        estado: parseCsvLikeValue(data.estado),
        motivo_rechazo: parseCsvLikeValue(data.motivo_rechazo),
        asesor_email: parseCsvLikeValue(data.asesor_email),
        asesor_uid: parseCsvLikeValue(data.asesor_uid),
        creado_en: toIso(data.creado_en),
        revisado_por: parseCsvLikeValue(data.revisado_por),
        revisado_en: toIso(data.revisado_en),
        registrado_por: parseCsvLikeValue(data.registrado_por),
        actualizado_por: parseCsvLikeValue(data.actualizado_por),
    };
}

function mapPhotoDoc(docId: string, data: Record<string, unknown>): PhotoDoc {
    const fotoUrl = parseCsvLikeValue(data.foto_url);
    return {
        docId,
        conteo_id: parseCsvLikeValue(data.conteo_id),
        asesor_email: parseCsvLikeValue(data.asesor_email),
        asesor_uid: parseCsvLikeValue(data.asesor_uid),
        foto_url: fotoUrl,
        foto_url_path: extractPathFromFotoUrl(fotoUrl),
        storage_path: parseCsvLikeValue(data.storage_path),
        nombre_archivo: parseCsvLikeValue(data.nombre_archivo),
        mime_type: parseCsvLikeValue(data.mime_type),
        tamano_bytes: num(data.tamano_bytes),
        etiquetas_vision: Array.isArray(data.etiquetas_vision)
            ? data.etiquetas_vision.map((item) =>
                  parseCsvLikeValue(item)
              )
            : [],
        creado_en: toIso(data.creado_en),
    };
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

function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeRunId(date: Date): string {
    return date.toISOString().replace(/[:.]/g, '-');
}

function sanitizeInventory(
    doc: InventoryClassified
): InventoryClassified & { imagen_url_path: string | null } {
    const path = extractPathFromFotoUrl(doc.imagen_url);
    return {
        ...doc,
        imagen_url: doc.imagen_url ? path ?? '[REDACTED_URL]' : '',
        imagen_url_path: path,
    };
}

function sanitizeCount(doc: CountClassified): CountClassified {
    return {
        ...doc,
        foto_url: doc.foto_url ? '[REDACTED_URL]' : '',
    };
}

function sanitizePhoto(doc: PhotoClassified): PhotoClassified {
    return {
        ...doc,
        foto_url: doc.foto_url ? '[REDACTED_URL]' : '',
    };
}

function buildWhitelist(result: P6Result) {
    return {
        inventory_doc_ids: [],
        count_doc_ids: [],
        photo_doc_ids: [],
        storage_paths_present: [],
        storage_paths_already_absent: [],
        test_refs: [...TEST_REFS],
        real_linked_storage_paths: [...REAL_O30_PATHS],
        pending_director_decision: result.pending,
        read_whitelist: {
            collections: [
                COLLECTION_INVENTORY,
                COLLECTION_COUNTS,
                COLLECTION_PHOTOS,
                COLLECTION_LEDGER,
            ],
            documents: [CREDIT_PATH, COLLECTION_SEDES],
            ledger: 'count + hash + entry IDs read-only',
            external_baseline: 'CRE-2026-0001 + Santa Marta, read-only',
            writes: 'none',
        },
        universe: result.universe,
        collisions: result.collisions,
        warnings: result.warnings,
    };
}

function buildReport(
    result: P6Result,
    manifest: Record<string, unknown>,
    ledger: unknown,
    external: unknown
): string {
    const inventoryRows = result.inventory.map((doc) => [
        doc.docId,
        doc.referencia,
        doc.classification,
        doc.match_type,
        doc.matched_refs.join(' | '),
        doc.stock ?? '',
        doc.sede_id,
        doc.creado_por,
        doc.creado_en ?? '',
    ]);
    const countRows = result.counts.map((doc) => [
        doc.docId,
        doc.referencia_confirmada || doc.referencia_sugerida,
        doc.classification,
        doc.match_type,
        doc.inventario_documento_id,
        doc.asesor_email,
        doc.creado_en ?? '',
        doc.storage_status ?? '',
    ]);
    const photoRows = result.photos.map((doc) => [
        doc.docId,
        doc.conteo_id,
        doc.classification,
        doc.storage_status,
        doc.storage_path,
        doc.creado_en ?? '',
    ]);
    const pendingRows = result.pending.map((item) => [
        item.collection,
        item.docId,
        item.classification,
        item.match_type,
        item.blocking_reasons.join(' | '),
    ]);
    const collisionRows = result.collisions.map((item) => [
        item.type,
        item.collection,
        item.docId,
        String(item.blocking),
        item.detail,
    ]);
    const storageRows = result.storage.map((item) => [
        item.path,
        item.source,
        item.status,
    ]);

    const table = (headers: string[], rows: Array<Array<unknown>>) =>
        [
            `| ${headers.join(' | ')} |`,
            `| ${headers.map(() => '---').join(' | ')} |`,
            ...rows.map(
                (row) =>
                    `| ${row
                        .map((value) =>
                            String(value ?? '')
                                .replace(/\|/g, '\\|')
                                .replace(/\n/g, ' ')
                        )
                        .join(' | ')} |`
            ),
        ].join('\n');

    return [
        '# P6 — Forense read-only de datos de prueba',
        '',
        `**Ticket:** WEB-FORENSE-P6-001`,
        `**Proyecto:** ${PROJECT_ID}`,
        `**Bucket:** ${BUCKET_NAME}`,
        `**Generado:** ${String(manifest.generatedAt)}`,
        '',
        '## Universo',
        '',
        table(
            ['Colección', 'Documentos', 'Baseline'],
            [
                [
                    COLLECTION_INVENTORY,
                    result.universe.inventory,
                    EXPECTED_INVENTORY,
                ],
                [
                    COLLECTION_COUNTS,
                    result.universe.counts,
                    EXPECTED_COUNTS,
                ],
                [COLLECTION_PHOTOS, result.universe.photos, EXPECTED_PHOTOS],
                ['TOTAL', result.universe.total, 17],
            ]
        ),
        '',
        result.universe.drift
            ? '**UNIVERSE_DRIFT:** el universo actual difiere del baseline 7/5/5. Gate 2 permanece cerrado hasta explicar la diferencia.'
            : 'Universo 7/5/5 confirmado.',
        '',
        '## Inventario',
        '',
        table(
            [
                'docId',
                'referencia',
                'clasificación',
                'match',
                'refs',
                'stock',
                'sede',
                'creado_por',
                'creado_en',
            ],
            inventoryRows
        ),
        '',
        '## Conteos',
        '',
        table(
            [
                'docId',
                'referencia',
                'clasificación',
                'match',
                'inventario_id',
                'asesor',
                'creado_en',
                'storage',
            ],
            countRows
        ),
        '',
        '## Fotos',
        '',
        table(
            [
                'docId',
                'conteo_id',
                'clasificación',
                'storage',
                'storage_path',
                'creado_en',
            ],
            photoRows
        ),
        '',
        '## Pendientes de decisión del Director',
        '',
        pendingRows.length
            ? table(
                  [
                      'colección',
                      'docId',
                      'clasificación',
                      'match',
                      'blocking_reasons',
                  ],
                  pendingRows
              )
            : 'Sin pendientes.',
        '',
        '## Colisiones',
        '',
        collisionRows.length
            ? table(
                  ['tipo', 'colección', 'docId', 'bloqueante', 'detalle'],
                  collisionRows
              )
            : 'Sin colisiones.',
        '',
        '## Storage',
        '',
        table(['path', 'origen', 'estado'], storageRows),
        '',
        '## Baseline ledger',
        '',
        '```json',
        JSON.stringify(ledger, null, 2),
        '```',
        '',
        '## Baseline externo',
        '',
        '```json',
        JSON.stringify(external, null, 2),
        '```',
        '',
        '## Whitelist',
        '',
        '`inventory_doc_ids`, `count_doc_ids`, `photo_doc_ids`, `storage_paths_present` y `storage_paths_already_absent` están **vacíos**. El Director debe poblarlos en Gate 2.',
        '',
        '## Atestación de no escritura',
        '',
        '- Cero escrituras en Firestore.',
        '- Cero escrituras en Storage.',
        '- Cero acceso a almacenamiento local del navegador.',
        '- Reportes solo en el directorio de evidencias.',
        '',
    ].join('\n');
}

async function runFixtures(options: {
    fixtures: string;
    outDir: string;
}): Promise<void> {
    const fixture = JSON.parse(
        readFileSync(options.fixtures, 'utf8')
    ) as FixtureInput;
    const testRefs = fixture.testRefs ?? [...TEST_REFS];
    const realO30Paths = fixture.realO30Paths ?? [...REAL_O30_PATHS];
    const result = classifyP6({
        inventory: fixture.inventory,
        counts: fixture.counts,
        photos: fixture.photos,
        testRefs,
        realO30Paths,
        storageStatusByPath: fixture.storageStatusByPath,
    });

    const mismatches: string[] = [];
    const checkClassifications = (
        label: string,
        expected: Record<string, Classification> | undefined,
        actual: Array<{ docId: string; classification: Classification }>
    ) => {
        if (!expected) return;
        const actualById: Record<string, Classification> = {};
        for (const doc of actual) actualById[doc.docId] = doc.classification;
        for (const [docId, classification] of Object.entries(expected)) {
            if (actualById[docId] !== classification) {
                mismatches.push(
                    `${label}/${docId}: esperado ${classification}, actual ${actualById[docId] ?? '(ausente)'}`
                );
            }
        }
    };
    checkClassifications(
        'inventory',
        fixture.expected?.inventory,
        result.inventory
    );
    checkClassifications('counts', fixture.expected?.counts, result.counts);
    checkClassifications('photos', fixture.expected?.photos, result.photos);

    if (fixture.expected?.collisions) {
        const actualTypes = result.collisions.map((item) => item.type);
        for (const type of fixture.expected.collisions) {
            if (!actualTypes.includes(type)) {
                mismatches.push(`colisión ausente: ${type}`);
            }
        }
    }
    if (
        fixture.expected?.pendingCount !== undefined &&
        result.pending.length !== fixture.expected.pendingCount
    ) {
        mismatches.push(
            `pendingCount: esperado ${fixture.expected.pendingCount}, actual ${result.pending.length}`
        );
    }
    if (fixture.expected?.whitelistEmpty) {
        const whitelist = buildWhitelist(result);
        if (
            whitelist.inventory_doc_ids.length !== 0 ||
            whitelist.count_doc_ids.length !== 0 ||
            whitelist.photo_doc_ids.length !== 0 ||
            whitelist.storage_paths_present.length !== 0 ||
            whitelist.storage_paths_already_absent.length !== 0
        ) {
            mismatches.push('whitelist no está vacía');
        }
    }

    if (mismatches.length > 0) {
        throw new Error(
            `Fixtures no coinciden:\n${mismatches.join('\n')}`
        );
    }

    const outDir = assertOutDirOutsideRepo(options.outDir);
    mkdirSync(outDir, { recursive: true });
    const whitelist = buildWhitelist(result);
    const ledger = {
        collection: COLLECTION_LEDGER,
        count: 0,
        hash: null,
        references: [],
        note: 'fixtures mode: no Firestore',
    };
    const external = {
        credit: { exists: false, hash: null, snapshot: null },
        sedes: { count: 0, hash: null, santa_marta: [] },
        note: 'fixtures mode: no Firestore',
    };
    const manifest = {
        ticket: 'WEB-FORENSE-P6-001',
        mode: 'fixtures',
        projectId: PROJECT_ID,
        bucket: BUCKET_NAME,
        generatedAt: new Date().toISOString(),
        writeWhitelist: 'none',
        readWhitelist: whitelist.read_whitelist,
        fixtures: options.fixtures,
    };
    writeJson(join(outDir, 'summary.json'), {
        mode: 'fixtures',
        universe: result.universe,
        classifications: {
            inventory: result.inventory.map((doc) => ({
                docId: doc.docId,
                classification: doc.classification,
            })),
            counts: result.counts.map((doc) => ({
                docId: doc.docId,
                classification: doc.classification,
            })),
            photos: result.photos.map((doc) => ({
                docId: doc.docId,
                classification: doc.classification,
            })),
        },
        collisions: result.collisions,
        warnings: result.warnings,
    });
    writeJson(join(outDir, 'whitelist.json'), whitelist);
    writeJson(
        join(outDir, 'pending_director_decision.json'),
        result.pending
    );
    writeJson(join(outDir, 'collisions.json'), result.collisions);
    writeJson(join(outDir, 'storage.json'), result.storage);
    writeJson(join(outDir, 'ledger_baseline.json'), ledger);
    writeJson(join(outDir, 'external_baseline.json'), external);
    writeFileSync(
        join(outDir, 'report.md'),
        `${buildReport(result, manifest, ledger, external)}\n`,
        'utf8'
    );
    writeJson(join(outDir, 'manifest.json'), manifest);

    console.log('[p6] FIXTURES PASS');
    console.log(`[p6] pending=${result.pending.length}`);
    console.log(`[p6] collisions=${result.collisions.length}`);
    console.log(`[p6] out=${outDir}`);
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

async function readLedger(
    db: ReturnType<typeof getFirestore>,
    candidateIds: Record<string, true>
): Promise<{
    count: number;
    hash: string;
    references: LedgerReference[];
}> {
    const snap = await db.collection(COLLECTION_LEDGER).get();
    const lines: string[] = [];
    const references: LedgerReference[] = [];
    for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>;
        lines.push(`${doc.id}:${stableStringify(data)}`);
        const documentoId = text(data.documento_id);
        const conteoId = text(data.conteo_id);
        const referencia = text(data.referencia);
        if (
            (documentoId && candidateIds[documentoId]) ||
            (conteoId && candidateIds[conteoId])
        ) {
            references.push({
                entryId: doc.id,
                collection: text(data.coleccion_afectada),
                documento_id: documentoId,
                conteo_id: conteoId,
                referencia,
            });
        }
    }
    lines.sort();
    return {
        count: snap.size,
        hash: sha256(lines.join('\n')),
        references,
    };
}

async function readCredit(
    db: ReturnType<typeof getFirestore>
): Promise<BaselineSnapshot> {
    const doc = await db
        .collection('creditos')
        .doc('CRE-2026-0001')
        .get();
    if (!doc.exists) {
        return { exists: false, hash: null, snapshot: null };
    }
    const data = doc.data() as Record<string, unknown>;
    return {
        exists: true,
        hash: sha256(stableStringify(data)),
        snapshot: redactUrls(data),
    };
}

async function readSedes(
    db: ReturnType<typeof getFirestore>
): Promise<{
    count: number;
    hash: string;
    santa_marta: Array<{
        docId: string;
        hash: string;
        snapshot: unknown;
    }>;
    snapshot: unknown;
}> {
    const snap = await db.collection(COLLECTION_SEDES).get();
    const lines: string[] = [];
    const santaMarta: Array<{
        docId: string;
        hash: string;
        snapshot: unknown;
    }> = [];
    const snapshot: Array<{ docId: string; data: unknown }> = [];
    for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>;
        lines.push(`${doc.id}:${stableStringify(data)}`);
        snapshot.push({ docId: doc.id, data: redactUrls(data) });
        const name = text(data.name).toLowerCase();
        if (name.includes('santa marta')) {
            santaMarta.push({
                docId: doc.id,
                hash: sha256(stableStringify(data)),
                snapshot: redactUrls(data),
            });
        }
    }
    lines.sort();
    return {
        count: snap.size,
        hash: sha256(lines.join('\n')),
        santa_marta: santaMarta,
        snapshot,
    };
}

async function readStorageStatuses(
    bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>,
    paths: string[]
): Promise<Record<string, StorageStatus>> {
    const statuses: Record<string, StorageStatus> = {};
    for (const path of paths) {
        if (!path) {
            statuses[path] = 'MISSING_PATH';
            continue;
        }
        try {
            await bucket.file(path).getMetadata();
            statuses[path] = 'PRESENT';
        } catch {
            statuses[path] = 'ALREADY_ABSENT';
        }
    }
    return statuses;
}

async function runLive(options: {
    project: string;
    outDir: string;
}): Promise<void> {
    const app =
        getApps()[0] ??
        initializeApp({
            projectId: PROJECT_ID,
            storageBucket: BUCKET_NAME,
        });
    if (app.options.projectId && app.options.projectId !== PROJECT_ID) {
        throw new Error(
            `App inicializada con proyecto no autorizado: ${app.options.projectId}`
        );
    }
    const configuredBucket = resolveConfiguredBucket();
    if (configuredBucket && configuredBucket !== BUCKET_NAME) {
        throw new Error(
            `Bucket configurado no autorizado: ${configuredBucket}`
        );
    }
    const db = getFirestore(app);
    const bucket = getStorage(app).bucket(BUCKET_NAME);

    const [inventorySnap, countsSnap, photosSnap] = await Promise.all([
        db.collection(COLLECTION_INVENTORY).get(),
        db.collection(COLLECTION_COUNTS).get(),
        db.collection(COLLECTION_PHOTOS).get(),
    ]);

    const inventory = inventorySnap.docs.map((doc) =>
        mapInventoryDoc(doc.id, doc.data() as Record<string, unknown>)
    );
    const counts = countsSnap.docs.map((doc) =>
        mapCountDoc(doc.id, doc.data() as Record<string, unknown>)
    );
    const photos = photosSnap.docs.map((doc) =>
        mapPhotoDoc(doc.id, doc.data() as Record<string, unknown>)
    );

    const initial = classifyP6({
        inventory,
        counts,
        photos,
        testRefs: TEST_REFS,
        realO30Paths: REAL_O30_PATHS,
    });

    const pathsToCheck: string[] = [];
    const pathSeen: Record<string, true> = {};
    for (const photo of initial.photos) {
        if (photo.storage_path && !pathSeen[photo.storage_path]) {
            pathSeen[photo.storage_path] = true;
            pathsToCheck.push(photo.storage_path);
        }
    }
    for (const path of REAL_O30_PATHS) {
        if (!pathSeen[path]) {
            pathSeen[path] = true;
            pathsToCheck.push(path);
        }
    }

    const storageStatusByPath = await readStorageStatuses(
        bucket,
        pathsToCheck
    );
    const result = classifyP6({
        inventory,
        counts,
        photos,
        testRefs: TEST_REFS,
        realO30Paths: REAL_O30_PATHS,
        storageStatusByPath,
    });

    const candidateIds: Record<string, true> = {};
    for (const item of result.pending) {
        candidateIds[item.docId] = true;
    }
    const ledger = await readLedger(db, candidateIds);
    const credit = await readCredit(db);
    if (!credit.exists) {
        result.warnings.push(
            'CREDIT_NOT_FOUND: creditos/CRE-2026-0001 no existe'
        );
    }
    const sedes = await readSedes(db);

    const outDir = assertOutDirOutsideRepo(options.outDir);
    mkdirSync(outDir, { recursive: true });
    const whitelist = buildWhitelist(result);
    const manifestBase = {
        ticket: 'WEB-FORENSE-P6-001',
        mode: 'live',
        projectId: PROJECT_ID,
        bucket: BUCKET_NAME,
        generatedAt: new Date().toISOString(),
        writeWhitelist: 'none',
        readWhitelist: whitelist.read_whitelist,
        universe: result.universe,
    };

    const storageReport = result.storage.map((item) => {
        const filePath = item.path;
        const status = storageStatusByPath[filePath] ?? item.status;
        return {
            ...item,
            status,
        };
    });

    const files: Record<string, unknown> = {
        'summary.json': {
            mode: 'live',
            universe: result.universe,
            classifications: {
                inventory: result.inventory.map((doc) => ({
                    docId: doc.docId,
                    classification: doc.classification,
                    match_type: doc.match_type,
                    matched_refs: doc.matched_refs,
                })),
                counts: result.counts.map((doc) => ({
                    docId: doc.docId,
                    classification: doc.classification,
                    match_type: doc.match_type,
                    matched_refs: doc.matched_refs,
                })),
                photos: result.photos.map((doc) => ({
                    docId: doc.docId,
                    classification: doc.classification,
                    match_type: doc.match_type,
                    storage_status: doc.storage_status,
                })),
            },
            collisions: result.collisions,
            warnings: result.warnings,
            ledger: {
                count: ledger.count,
                hash: ledger.hash,
                references: ledger.references.length,
            },
            external: {
                creditHash: credit.hash,
                sedesCount: sedes.count,
                sedesHash: sedes.hash,
                santaMartaCount: sedes.santa_marta.length,
            },
        },
        'inventory_all.json': result.inventory.map(sanitizeInventory),
        'counts_all.json': result.counts.map(sanitizeCount),
        'photos_all.json': result.photos.map(sanitizePhoto),
        'pending_director_decision.json': result.pending,
        'collisions.json': result.collisions,
        'storage.json': storageReport,
        'ledger_baseline.json': {
            collection: COLLECTION_LEDGER,
            count: ledger.count,
            hash: ledger.hash,
            references: ledger.references,
        },
        'external_baseline.json': {
            credit,
            sedes,
        },
        'whitelist.json': whitelist,
    };

    const hashes: Record<string, string> = {};
    for (const [name, value] of Object.entries(files)) {
        const serialized = `${JSON.stringify(value, null, 2)}\n`;
        writeFileSync(join(outDir, name), serialized, 'utf8');
        hashes[name] = sha256(serialized);
    }

    const report = buildReport(
        result,
        manifestBase,
        files['ledger_baseline.json'],
        files['external_baseline.json']
    );
    writeFileSync(join(outDir, 'report.md'), `${report}\n`, 'utf8');
    hashes['report.md'] = sha256(`${report}\n`);

    writeJson(join(outDir, 'manifest.json'), {
        ...manifestBase,
        hashes,
        outputs: Object.keys(files).concat('report.md', 'manifest.json'),
    });

    console.log('[p6] LIVE PASS');
    console.log(`[p6] universe=${result.universe.inventory}/${result.universe.counts}/${result.universe.photos}`);
    console.log(`[p6] drift=${result.universe.drift}`);
    console.log(`[p6] pending=${result.pending.length}`);
    console.log(`[p6] collisions=${result.collisions.length}`);
    console.log(`[p6] ledger_count=${ledger.count}`);
    console.log(`[p6] out=${outDir}`);
}

function parseArgs(argv: string[]): {
    mode: 'fixtures' | 'live';
    fixtures: string | null;
    project: string;
    outDir: string;
} {
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
            throw new Error(`Argumento no reconocido: ${arg}`);
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
        throw new Error(`Flag no reconocido: --${key}`);
    }

    if (!outDir) {
        throw new Error('Falta --out.');
    }
    if (fixtures) {
        return {
            mode: 'fixtures',
            fixtures,
            project: PROJECT_ID,
            outDir,
        };
    }
    if (project !== PROJECT_ID) {
        throw new Error(
            `Proyecto no autorizado: ${project || '(vacío)'}. Solo ${PROJECT_ID}`
        );
    }
    return { mode: 'live', fixtures: null, project, outDir };
}

async function main(): Promise<void> {
    let options: ReturnType<typeof parseArgs>;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        if (error instanceof Error && error.message === 'HELP_REQUESTED') {
            return;
        }
        throw error;
    }
    if (options.mode === 'fixtures') {
        await runFixtures({
            fixtures: options.fixtures as string,
            outDir: options.outDir,
        });
        return;
    }
    await runLive({
        project: options.project,
        outDir: options.outDir,
    });
}

main().catch((error) => {
    console.error(
        '[p6] ERROR:',
        error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
});
