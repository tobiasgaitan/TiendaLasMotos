/**
 * WEB-INV-INGESTA-002-F2 — Utilidades puras del apply y rollback.
 *
 * No importa Firestore ni Storage. Solo criptografía, tipos y funciones
 * deterministas para hashes, batches, D4-B y payloads.
 */
import { createHash } from 'node:crypto';
import {
    computeImportKey,
    type DocumentoPropuesto,
} from './inv-ingesta-utils';

export const TICKET = 'WEB-INV-INGESTA-002-F2';
export const PROJECT_ID = 'tiendalasmotos';
export const ENVIRONMENT = 'beta';
export const BATCH_SIZE = 100;
export const EXPECTED_CREATE = 21256;
export const EXPECTED_BATCHES = 213;
export const ACTOR_ID = 't05KiQCGQgUWFARvczn3nuXp9Qz2';
export const ACTOR_EMAIL = 'tobiasgaitan@gmail.com';
export const CONFIRM_APPLY =
    'APLICAR WEB-INV-INGESTA-002-F2 EN BETA / FIRESTORE COMPARTIDO';
export const CONFIRM_ROLLBACK =
    'ROLLBACK WEB-INV-INGESTA-002-F2 EN BETA';

export type UnidadMedida = 'unidad' | 'litro';

export const PAYLOAD_KEYS = [
    'referencia',
    'descripcion',
    'categoria',
    'referencias_alternativas',
    'aplica_a',
    'unidad_medida',
    'import_key',
    'fabricante',
    'sede_id',
    'ubicacion',
    'precio',
    'stock',
    'stock_minimo',
    'imagen_url',
    'creado_por',
    'creado_en',
    'actualizado_por',
    'actualizado_en',
] as const;

export function sha256Texto(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sha256Json(value: unknown): string {
    return sha256Texto(JSON.stringify(value));
}

export function esSha256Hex(value: string): boolean {
    return /^[a-f0-9]{64}$/.test(value);
}

export interface HashesIngesta {
    source: string;
    csv: string;
    parse: string;
    config: string;
}

export interface ResultadoValidacionHashes {
    ok: boolean;
    errores: string[];
}

export function validarHashes(
    obtenidos: HashesIngesta,
    esperados: HashesIngesta
): ResultadoValidacionHashes {
    const errores: string[] = [];

    for (const clave of [
        'source',
        'csv',
        'parse',
        'config',
    ] as const) {
        const obtenido = obtenidos[clave];
        const esperado = esperados[clave];
        if (!esSha256Hex(obtenido)) {
            errores.push(`${clave}: hash obtenido inválido (${obtenido})`);
        }
        if (!esSha256Hex(esperado)) {
            errores.push(`${clave}: hash esperado inválido (${esperado})`);
        }
        if (obtenido !== esperado) {
            errores.push(
                `${clave}: ${obtenido} != ${esperado}`
            );
        }
    }

    return { ok: errores.length === 0, errores };
}

export function normalizarUnidadMedida(value: unknown): UnidadMedida {
    const normalizado = String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\.+$/, '');

    return normalizado === 'l' ||
        normalizado === 'lt' ||
        normalizado === 'lts' ||
        normalizado === 'litro' ||
        normalizado === 'litros'
        ? 'litro'
        : 'unidad';
}

export function normalizarReferencia(value: unknown): string {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function generarImportKey(referencia: string): string {
    const key = computeImportKey(referencia);
    if (!esSha256Hex(key)) {
        throw new Error(`IMPORT_KEY_INVALIDO: ${key}`);
    }
    return key;
}

export interface BatchPlan<T> {
    index: number;
    items: T[];
}

export function calcularBatches<T>(
    items: readonly T[],
    tamano: number = BATCH_SIZE
): BatchPlan<T>[] {
    if (!Number.isInteger(tamano) || tamano <= 0) {
        throw new Error(`BATCH_SIZE_INVALIDO: ${tamano}`);
    }

    const batches: BatchPlan<T>[] = [];
    for (let inicio = 0; inicio < items.length; inicio += tamano) {
        batches.push({
            index: batches.length + 1,
            items: items.slice(inicio, inicio + tamano),
        });
    }
    return batches;
}

export function contarBatches(
    total: number,
    tamano: number = BATCH_SIZE
): number {
    if (!Number.isInteger(tamano) || tamano <= 0) {
        throw new Error(`BATCH_SIZE_INVALIDO: ${tamano}`);
    }
    return Math.ceil(total / tamano);
}

export interface EntradaPayloadDocumento {
    documentoPropuesto: DocumentoPropuesto;
    unidadMedida: unknown;
    importKey: string;
    ahora: unknown;
}

export function construirPayloadDocumento(
    entrada: EntradaPayloadDocumento
): Record<string, unknown> {
    const doc = entrada.documentoPropuesto;

    return {
        referencia: doc.referencia,
        descripcion: doc.descripcion,
        categoria: doc.categoria,
        referencias_alternativas: [...doc.referencias_alternativas],
        aplica_a: [...doc.aplica_a],
        unidad_medida: normalizarUnidadMedida(entrada.unidadMedida),
        import_key: entrada.importKey,
        fabricante: '',
        sede_id: '',
        ubicacion: '',
        precio: 0,
        stock: 0,
        stock_minimo: 0,
        imagen_url: '',
        creado_por: ACTOR_ID,
        creado_en: entrada.ahora,
        actualizado_por: ACTOR_ID,
        actualizado_en: entrada.ahora,
    };
}

export interface ResultadoValidacionPayload {
    ok: boolean;
    errores: string[];
}

export function validarPayloadDocumento(
    payload: Record<string, unknown>
): ResultadoValidacionPayload {
    const errores: string[] = [];
    const claves = Object.keys(payload).sort();
    const esperadas = [...PAYLOAD_KEYS].sort();

    if (claves.join('|') !== esperadas.join('|')) {
        errores.push(
            `claves: ${claves.join(',')} != ${esperadas.join(',')}`
        );
    }

    if (
        payload.unidad_medida !== 'unidad' &&
        payload.unidad_medida !== 'litro'
    ) {
        errores.push(`unidad_medida inválida: ${String(payload.unidad_medida)}`);
    }

    if (
        typeof payload.import_key !== 'string' ||
        !esSha256Hex(payload.import_key)
    ) {
        errores.push(`import_key inválida: ${String(payload.import_key)}`);
    }

    if (typeof payload.referencia !== 'string' || !payload.referencia) {
        errores.push('referencia vacía');
    }

    if (typeof payload.descripcion !== 'string' || !payload.descripcion) {
        errores.push('descripcion vacía');
    }

    return { ok: errores.length === 0, errores };
}

export function hashPayloadDocumento(
    payload: Record<string, unknown>
): string {
    const copia = { ...payload };
    delete copia.creado_en;
    delete copia.actualizado_en;
    return sha256Json(copia);
}

export interface EntradaPayloadLedger {
    documentoId: string;
    referencia: string;
    payload: Record<string, unknown>;
    ahora: unknown;
}

export function construirPayloadLedger(
    entrada: EntradaPayloadLedger
): Record<string, unknown> {
    return {
        coleccion_afectada: 'inventario_repuestos',
        documento_id: entrada.documentoId,
        referencia: entrada.referencia,
        conteo_id: null,
        operacion: 'CREATE',
        datos_anteriores: null,
        datos_nuevos: entrada.payload,
        campos_modificados: Object.keys(entrada.payload),
        registrado_por: ACTOR_ID,
        registrado_por_email: ACTOR_EMAIL,
        creado_en: entrada.ahora,
        version: 1,
    };
}

export interface ExistenteD4B {
    documentoId: string;
    referencia: string;
    importKey: string | null;
}

export type D4BEstado =
    | 'CREATE'
    | 'D4B_RECONCILIABLE'
    | 'D4B_AMBIGUO'
    | 'SKIP_IDEMPOTENTE';

export interface DecisionD4B {
    estado: D4BEstado;
    documentoIds: string[];
    motivo?: string;
}

export function clasificarD4B(
    referencia: string,
    importKey: string,
    existentes: readonly ExistenteD4B[]
): DecisionD4B {
    const normalizada = normalizarReferencia(referencia);

    const porImportKey = existentes.filter(
        (existente) => existente.importKey === importKey
    );
    if (porImportKey.length > 0) {
        return {
            estado: 'SKIP_IDEMPOTENTE',
            documentoIds: porImportKey.map(
                (existente) => existente.documentoId
            ),
        };
    }

    const porReferencia = existentes.filter(
        (existente) =>
            normalizarReferencia(existente.referencia) === normalizada
    );

    if (porReferencia.length > 1) {
        return {
            estado: 'D4B_AMBIGUO',
            documentoIds: porReferencia.map(
                (existente) => existente.documentoId
            ),
            motivo: 'múltiples documentos con la misma referencia',
        };
    }

    if (porReferencia.length === 1) {
        if (!porReferencia[0].importKey) {
            return {
                estado: 'D4B_RECONCILIABLE',
                documentoIds: [porReferencia[0].documentoId],
                motivo: 'un documento manual sin import_key',
            };
        }
        return {
            estado: 'D4B_AMBIGUO',
            documentoIds: [porReferencia[0].documentoId],
            motivo: 'un documento con import_key distinto',
        };
    }

    return { estado: 'CREATE', documentoIds: [] };
}

export interface DocumentoManifiesto {
    documento_id: string;
    import_key: string;
}

export interface DocumentoActualRollback {
    documento_id: string;
    exists: boolean;
    import_key?: string | null;
}

export interface ResultadoRollback {
    deletes: string[];
    missing: string[];
    mismatches: Array<{
        documento_id: string;
        esperado: string;
        obtenido: string | null;
    }>;
}

export function clasificarRollback(
    manifiesto: readonly DocumentoManifiesto[],
    actuales: readonly DocumentoActualRollback[]
): ResultadoRollback {
    const mapa = new Map(
        actuales.map((actual) => [actual.documento_id, actual])
    );
    const deletes: string[] = [];
    const missing: string[] = [];
    const mismatches: ResultadoRollback['mismatches'] = [];

    for (const documento of manifiesto) {
        const actual = mapa.get(documento.documento_id);
        if (!actual || !actual.exists) {
            missing.push(documento.documento_id);
            continue;
        }
        if (actual.import_key !== documento.import_key) {
            mismatches.push({
                documento_id: documento.documento_id,
                esperado: documento.import_key,
                obtenido:
                    typeof actual.import_key === 'string'
                        ? actual.import_key
                        : null,
            });
            continue;
        }
        deletes.push(documento.documento_id);
    }

    return { deletes, missing, mismatches };
}

export function hashBatchManifest(
    manifestSinHash: Record<string, unknown>
): string {
    return sha256Json(manifestSinHash);
}
