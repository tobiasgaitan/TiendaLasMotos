/**
 * WEB-INV-INGESTA-001-F1 — Utilidades puras de la ingesta de inventario.
 *
 * Fase 1 es solo lectura: este módulo no importa Firestore, Storage ni
 * filesystem. Recibe filas ya extraídas de la fuente congelada y devuelve
 * clasificaciones, métricas de reporte y propuestas de documento.
 *
 * Reglas ratificadas que viven aquí:
 * - G1: whitelist de categorías y disposición por censo.
 * - G2: CLEAN estricto; NORMALIZABLE no se ingiere sin regla aprobada.
 * - G3-LITERAL-CORREGIDO: unión txtPersonalizado1+txtPersonalizado2,
 *   tokenización literal por [,;\n/], EAN-13 no-maestro a alternativas,
 *   aplica_a vacío y sospecha de modelo a cuarentena-manifiesto.
 * - COND-1: Precio1..4 y Existencias NO se ingieren; solo son métricas.
 * - D4: import_key = SHA-256 de la referencia normalizada.
 */
import { createHash } from 'node:crypto';

export const TICKET = 'WEB-INV-INGESTA-001-F1';
export const SOURCE_SHEET = 'ExportarAExcel';
export const SOURCE_HEADER_ROW = 2;
export const SOURCE_DATA_START_ROW = 3;
export const SOURCE_SHA256 =
    '3825ca9249da8fcde535819ec39efee73e97674d16422fcf0a1aabcfcd6fbc56';
export const SOURCE_BYTES = 2404291;
export const SOURCE_DATA_ROWS = 25255;

export const SOURCE_HEADERS = [
    'GrupoUno',
    'DescGrupoUno',
    'GrupoDos',
    'DescGrupoDos',
    'Codigo Producto',
    'Descripción',
    'Maximo Permitido',
    'Minimo Permitido',
    'Punto Reorden',
    'UnidadDeMedida',
    'Precio1',
    'Precio2',
    'Precio3',
    'Precio4',
    'Iva',
    'Existencias',
    'txtPersonalizado1',
    'txtPersonalizado2',
] as const;

export type SourceHeader = (typeof SOURCE_HEADERS)[number];

export const MAX_REFERENCIA = 64;
export const MAX_DESCRIPCION = 500;
export const MAX_CATEGORIA = 100;

export const REFERENCIA_REGEX = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;

export type Bucket =
    | 'CLEAN'
    | 'NORMALIZABLE'
    | 'MAPPABLE'
    | 'QUARANTINE'
    | 'EAN13';

export type ResultadoFila =
    | 'INGRESA'
    | 'CENSAR'
    | 'MAPPABLE'
    | 'CUARENTENA'
    | 'OMITIDA';

export type DisposicionCategoria =
    | 'INGRESA'
    | 'INGRESA_SOLO_VALIDAS'
    | 'CENSAR'
    | 'MAPPABLE'
    | 'FUERA'
    | 'CUARENTENA';

export type FuenteCategoria = 'DescGrupoDos' | 'DescGrupoUno' | 'AUSENTE';

export const CATEGORIAS_INGRESA = [
    'REPUESTOS',
    'LUBRICANTES',
    'ACCESORIOS',
] as const;

export const CATEGORIAS_INGRESA_SOLO_VALIDAS = [
    'LINEA DE CUIDADO',
    'GENERICOS',
] as const;

export const CATEGORIAS_CENSAR = ['HERRAMIENTAS ESPECIALIZADAS'] as const;

export const CATEGORIAS_MAPPABLE = ['LOS ORIGINALES'] as const;

export const CATEGORIAS_FUERA = [
    'MOTOCICLETAS',
    'CICLOMOTOR',
    'MOTOCARROS',
    'PATINETAS',
    'BICICLETAS',
    'SERVICIOS',
    'CONTRATOS',
] as const;

const SET_INGRESA = new Set<string>(CATEGORIAS_INGRESA);
const SET_INGRESA_SOLO_VALIDAS = new Set<string>(
    CATEGORIAS_INGRESA_SOLO_VALIDAS
);
const SET_CENSAR = new Set<string>(CATEGORIAS_CENSAR);
const SET_MAPPABLE = new Set<string>(CATEGORIAS_MAPPABLE);
const SET_FUERA = new Set<string>(CATEGORIAS_FUERA);

export interface HeaderCheck {
    pass: boolean;
    code: 'PASS' | 'SOURCE_SCHEMA_MISMATCH';
    missing: string[];
    extra: string[];
    firstMismatchIndex: number | null;
    expected: readonly string[];
    received: readonly string[];
}

/**
 * Verifica los 18 headers exactos, en orden, de la hoja ExportarAExcel.
 * Un mismatch detiene el parsing (SOURCE_SCHEMA_MISMATCH).
 */
export function verificarHeaders(headers: readonly unknown[]): HeaderCheck {
    const recibidos = headers.map((header) => String(header ?? ''));
    const missing = SOURCE_HEADERS.filter(
        (header) => !recibidos.includes(header)
    );
    const extra = recibidos.filter(
        (header) => !(SOURCE_HEADERS as readonly string[]).includes(header)
    );

    let firstMismatchIndex: number | null = null;
    const max = Math.max(recibidos.length, SOURCE_HEADERS.length);
    for (let index = 0; index < max; index += 1) {
        if (recibidos[index] !== SOURCE_HEADERS[index]) {
            firstMismatchIndex = index;
            break;
        }
    }

    return {
        pass: firstMismatchIndex === null,
        code:
            firstMismatchIndex === null
                ? 'PASS'
                : 'SOURCE_SCHEMA_MISMATCH',
        missing,
        extra,
        firstMismatchIndex,
        expected: SOURCE_HEADERS,
        received: recibidos,
    };
}

/**
 * Limpia artefactos de exportación: _x000D_ y finales de línea CRLF/CR.
 * No recorta espacios ni cambia mayúsculas; eso lo decide cada regla.
 */
export function limpiarCelda(value: unknown): string {
    if (value === null || value === undefined) return '';
    const texto = typeof value === 'string' ? value : String(value);
    return texto
        .replace(/_x000D_/gi, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
}

export function normalizarTexto(value: unknown): string {
    return limpiarCelda(value).trim();
}

export type NumeroParseado =
    | { ok: true; value: number }
    | { ok: false; code: string; crudo: string };

/**
 * Parser de números con formato colombiano y tolerancia a números nativos
 * de Excel. Ejemplos: "1.234,56" -> 1234.56; "$ 2.500" -> 2500;
 * "0.19" -> 0.19; "-1" -> -1.
 */
export function parseNumeroColombiano(value: unknown): NumeroParseado {
    if (typeof value === 'number') {
        if (Number.isFinite(value)) return { ok: true, value };
        return { ok: false, code: 'NUMERO_NO_FINITO', crudo: String(value) };
    }

    const crudo = normalizarTexto(value);
    if (!crudo) return { ok: false, code: 'NUMERO_VACIO', crudo };

    let texto = crudo.replace(/\s|\u00a0/g, '').replace(/\$/g, '');
    let negativo = false;

    if (/^\(.*\)$/.test(texto)) {
        negativo = true;
        texto = texto.slice(1, -1);
    }
    if (texto.startsWith('-')) {
        negativo = true;
        texto = texto.slice(1);
    }
    if (texto.endsWith('-')) {
        negativo = true;
        texto = texto.slice(0, -1);
    }

    if (!/^[0-9.,]+$/.test(texto)) {
        return { ok: false, code: 'NUMERO_INVALIDO', crudo };
    }

    const ultimaComa = texto.lastIndexOf(',');
    const ultimoPunto = texto.lastIndexOf('.');

    if (ultimaComa >= 0 && ultimoPunto >= 0) {
        if (ultimaComa > ultimoPunto) {
            texto = texto.replace(/\./g, '').replace(',', '.');
        } else {
            texto = texto.replace(/,/g, '');
        }
    } else if (ultimaComa >= 0) {
        const partes = texto.split(',');
        if (partes.length === 2) {
            texto = `${partes[0]}.${partes[1]}`;
        } else if (partes.slice(1).every((parte) => parte.length === 3)) {
            texto = partes.join('');
        } else {
            return { ok: false, code: 'NUMERO_INVALIDO', crudo };
        }
    } else if (ultimoPunto >= 0) {
        const partes = texto.split('.');
        if (partes.length === 2) {
            const [entera, decimal] = partes;
            const pareceMiles =
                decimal.length === 3 &&
                entera.length >= 1 &&
                entera.length <= 3 &&
                !/^0+$/.test(entera);
            texto = pareceMiles
                ? `${entera}${decimal}`
                : `${entera}.${decimal}`;
        } else if (partes.slice(1).every((parte) => parte.length === 3)) {
            texto = partes.join('');
        } else {
            return { ok: false, code: 'NUMERO_INVALIDO', crudo };
        }
    }

    const numero = Number(texto);
    if (!Number.isFinite(numero)) {
        return { ok: false, code: 'NUMERO_INVALIDO', crudo };
    }
    return { ok: true, value: negativo ? -numero : numero };
}

export interface ReferenciaClasificada {
    cruda: string;
    normalizada: string;
    bucket: Bucket;
    motivo: string | null;
    longitudCruda: number;
    longitudNormalizada: number;
}

/**
 * Clasifica una referencia maestra. CLEAN exige que el crudo ya esté en
 * mayúsculas y sin espacios externos; NORMALIZABLE solo cubre trim/uppercase
 * y no se ingiere hasta que MT-5 apruebe la regla de saneamiento.
 */
export function clasificarReferencia(
    value: unknown,
    maxReferencia: number = MAX_REFERENCIA
): ReferenciaClasificada {
    const cruda = limpiarCelda(value);
    const recortada = cruda.trim();
    const normalizada = recortada.toUpperCase();
    const base = {
        cruda,
        normalizada,
        longitudCruda: cruda.length,
        longitudNormalizada: normalizada.length,
    };

    if (!recortada) {
        return {
            ...base,
            bucket: 'QUARANTINE',
            motivo: 'REFERENCIA_VACIA',
        };
    }

    if (normalizada.length > maxReferencia) {
        return {
            ...base,
            bucket: 'QUARANTINE',
            motivo: 'REFERENCIA_LARGA',
        };
    }

    if (REFERENCIA_REGEX.test(normalizada)) {
        if (cruda === recortada && recortada === normalizada) {
            return { ...base, bucket: 'CLEAN', motivo: null };
        }

        let motivo = 'MINUSCULAS';
        if (cruda !== recortada && recortada !== normalizada) {
            motivo = 'ESPACIOS_Y_MINUSCULAS';
        } else if (cruda !== recortada) {
            motivo = 'ESPACIOS_EXTERNOS';
        }
        return { ...base, bucket: 'NORMALIZABLE', motivo };
    }

    return {
        ...base,
        bucket: 'QUARANTINE',
        motivo: 'REFERENCIA_CHARSET',
    };
}

export function ean13ChecksumValido(value: unknown): boolean {
    const texto = normalizarTexto(value);
    if (!/^\d{13}$/.test(texto)) return false;
    let suma = 0;
    for (let index = 0; index < 12; index += 1) {
        const digito = Number(texto[index]);
        suma += digito * (index % 2 === 0 ? 1 : 3);
    }
    const esperado = (10 - (suma % 10)) % 10;
    return esperado === Number(texto[12]);
}

export function normalizarCategoria(value: unknown): string {
    return normalizarTexto(value).toUpperCase().replace(/\s+/g, ' ');
}

export interface CategoriaClasificada {
    categoria: string;
    disposicion: DisposicionCategoria;
    motivo: string | null;
}

/**
 * Aplica la whitelist ratificada G1. Una categoría desconocida no se rescata:
 * queda MAPPABLE para que MT-5 decida su mapping.
 */
export function clasificarCategoria(value: unknown): CategoriaClasificada {
    const categoria = normalizarCategoria(value);
    if (!categoria) {
        return {
            categoria: '',
            disposicion: 'CUARENTENA',
            motivo: 'CATEGORIA_AUSENTE',
        };
    }
    if (SET_INGRESA.has(categoria)) {
        return { categoria, disposicion: 'INGRESA', motivo: null };
    }
    if (SET_INGRESA_SOLO_VALIDAS.has(categoria)) {
        return {
            categoria,
            disposicion: 'INGRESA_SOLO_VALIDAS',
            motivo: null,
        };
    }
    if (SET_CENSAR.has(categoria)) {
        return { categoria, disposicion: 'CENSAR', motivo: 'CATEGORIA_CENSAR' };
    }
    if (SET_MAPPABLE.has(categoria)) {
        return {
            categoria,
            disposicion: 'MAPPABLE',
            motivo: 'CATEGORIA_REQUIERE_MAPPING',
        };
    }
    if (SET_FUERA.has(categoria)) {
        return {
            categoria,
            disposicion: 'FUERA',
            motivo: 'CATEGORIA_FUERA_DE_ALCANCE',
        };
    }
    return {
        categoria,
        disposicion: 'MAPPABLE',
        motivo: 'CATEGORIA_REQUIERE_MAPPING',
    };
}

/**
 * Tokenización literal G3: se limpia _x000D_/CRLF y se parte por coma,
 * punto y coma, salto de línea y slash. No se parte por espacios porque los
 * nombres de modelo forman parte del manifiesto de sospecha.
 */
export function tokenizarCampo(value: unknown): string[] {
    const limpio = limpiarCelda(value);
    return limpio
        .split(/[,;\n/]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
}

export function tokenizarPersonalizados(
    valores: readonly unknown[]
): string[] {
    return valores.flatMap((value) => tokenizarCampo(value));
}

export interface OpcionesTokens {
    blocklist?: readonly string[];
    masters?: readonly string[];
    maxReferencia?: number;
}

export interface TokenClasificado {
    crudo: string;
    normalizado: string;
    bucket: Bucket;
    motivo: string | null;
    ean13: boolean;
}

export interface ResumenTokens {
    total: number;
    unicos: number;
    porBucket: Record<Bucket, number>;
    ean13: {
        tokens: number;
        unicos: number;
        validosUnicos: number;
        invalidosUnicos: number;
        duplicadosUnicos: number;
        ocurrenciasDuplicadas: number;
        colisionesMaestraUnicas: number;
    };
}

function crearContadoresBucket(): Record<Bucket, number> {
    return {
        CLEAN: 0,
        NORMALIZABLE: 0,
        MAPPABLE: 0,
        QUARANTINE: 0,
        EAN13: 0,
    };
}

function normalizarAlConjunto(
    valores: readonly string[] | undefined
): Set<string> {
    return new Set(
        (valores ?? [])
            .map((valor) => normalizarTexto(valor).toUpperCase())
            .filter((valor) => valor.length > 0)
    );
}

interface OpcionesTokenInternas {
    blocklist: Set<string>;
    masters: Set<string>;
    maxReferencia: number;
    excluir?: string;
}

export function clasificarToken(
    value: unknown,
    opciones: OpcionesTokenInternas
): TokenClasificado | null {
    const crudo = limpiarCelda(value);
    const token = crudo.trim();
    if (!token) return null;

    const normalizado = token.toUpperCase();
    const base = {
        crudo,
        normalizado,
        ean13: /^\d{13}$/.test(token),
    };

    if (base.ean13) {
        if (!ean13ChecksumValido(token)) {
            return {
                ...base,
                bucket: 'QUARANTINE',
                motivo: 'EAN13_CHECKSUM',
            };
        }
        if (opciones.masters.has(token) && token !== opciones.excluir) {
            return {
                ...base,
                bucket: 'QUARANTINE',
                motivo: 'EAN13_COLISION_MAESTRA',
            };
        }
        return { ...base, bucket: 'EAN13', motivo: null };
    }

    if (opciones.blocklist.has(normalizado)) {
        return {
            ...base,
            bucket: 'QUARANTINE',
            motivo: 'BLOCKLIST_CENSADA',
        };
    }

    if (/\s/.test(token)) {
        return {
            ...base,
            bucket: 'QUARANTINE',
            motivo: 'SOSPECHA_MODELO',
        };
    }

    const referencia = clasificarReferencia(token, opciones.maxReferencia);
    if (referencia.bucket === 'CLEAN') {
        return { ...base, bucket: 'CLEAN', motivo: null };
    }
    if (referencia.bucket === 'NORMALIZABLE') {
        return {
            ...base,
            bucket: 'NORMALIZABLE',
            motivo: referencia.motivo,
        };
    }
    if (referencia.motivo === 'REFERENCIA_LARGA') {
        return {
            ...base,
            bucket: 'QUARANTINE',
            motivo: 'REFERENCIA_LARGA',
        };
    }

    return {
        ...base,
        bucket: 'MAPPABLE',
        motivo: 'REQUIERE_MAPPING',
    };
}

export function resumirTokens(
    tokens: readonly TokenClasificado[]
): ResumenTokens {
    const porBucket = crearContadoresBucket();
    const unicos = new Set<string>();
    const eanContador = new Map<string, number>();
    const eanColisiones = new Set<string>();

    for (const token of tokens) {
        porBucket[token.bucket] += 1;
        unicos.add(token.normalizado);
        if (/^\d{13}$/.test(token.normalizado)) {
            eanContador.set(
                token.normalizado,
                (eanContador.get(token.normalizado) ?? 0) + 1
            );
            if (token.motivo === 'EAN13_COLISION_MAESTRA') {
                eanColisiones.add(token.normalizado);
            }
        }
    }

    let validosUnicos = 0;
    let invalidosUnicos = 0;
    let duplicadosUnicos = 0;
    let ocurrenciasDuplicadas = 0;

    for (const [ean, cantidad] of eanContador) {
        if (ean13ChecksumValido(ean)) {
            validosUnicos += 1;
        } else {
            invalidosUnicos += 1;
        }
        if (cantidad > 1) {
            duplicadosUnicos += 1;
            ocurrenciasDuplicadas += cantidad - 1;
        }
    }

    return {
        total: tokens.length,
        unicos: unicos.size,
        porBucket,
        ean13: {
            tokens: [...eanContador.values()].reduce(
                (total, cantidad) => total + cantidad,
                0
            ),
            unicos: eanContador.size,
            validosUnicos,
            invalidosUnicos,
            duplicadosUnicos,
            ocurrenciasDuplicadas,
            colisionesMaestraUnicas: eanColisiones.size,
        },
    };
}

export interface ResultadoTokens {
    tokens: TokenClasificado[];
    alternativas: string[];
    resumen: ResumenTokens;
}

/**
 * Procesa la unión txtPersonalizado1+txtPersonalizado2. Solo los EAN-13
 * válidos y no-maestros se agregan a referencias_alternativas. Los tokens
 * bloqueados, con checksum inválido o con sospecha de modelo quedan en
 * cuarentena-manifiesto y no se rescatan.
 */
function procesarTokensConjuntos(
    valores: readonly unknown[],
    blocklist: Set<string>,
    masters: Set<string>,
    maxReferencia: number,
    excluir?: string
): ResultadoTokens {
    const internas: OpcionesTokenInternas = {
        blocklist,
        masters,
        maxReferencia,
        excluir,
    };

    const tokens = tokenizarPersonalizados(valores)
        .map((token) => clasificarToken(token, internas))
        .filter((token): token is TokenClasificado => token !== null);

    const alternativas: string[] = [];
    const vistas = new Set<string>();
    for (const token of tokens) {
        if (token.bucket !== 'EAN13') continue;
        if (token.normalizado === excluir) continue;
        if (vistas.has(token.normalizado)) continue;
        vistas.add(token.normalizado);
        alternativas.push(token.normalizado);
    }

    return { tokens, alternativas, resumen: resumirTokens(tokens) };
}

export function procesarTokensPersonalizados(
    valores: readonly unknown[],
    opciones: OpcionesTokens = {}
): ResultadoTokens {
    return procesarTokensConjuntos(
        valores,
        normalizarAlConjunto(opciones.blocklist),
        normalizarAlConjunto(opciones.masters),
        opciones.maxReferencia ?? MAX_REFERENCIA
    );
}

export interface FilaOrigen {
    fila: number;
    valores: Record<string, unknown>;
}

export interface GruposRellenos {
    grupoUno: string;
    descGrupoUno: string;
    grupoDos: string;
    descGrupoDos: string;
}

/**
 * Forward-fill jerárquico A–D. Un cambio en el grupo padre reinicia el hijo:
 * así el bloque SERVICIOS no hereda la última categoría de productos y el
 * bloque sin DescGrupoDos no hereda una categoría de otro padre.
 */
export function rellenarGrupos(
    filas: readonly FilaOrigen[]
): GruposRellenos[] {
    let grupoUno = '';
    let descGrupoUno = '';
    let grupoDos = '';
    let descGrupoDos = '';
    const resultado: GruposRellenos[] = [];

    for (const fila of filas) {
        const siguienteUno = normalizarTexto(fila.valores.GrupoUno);
        const siguienteDescUno = normalizarTexto(
            fila.valores.DescGrupoUno
        );
        const siguienteDos = normalizarTexto(fila.valores.GrupoDos);
        const siguienteDescDos = normalizarTexto(
            fila.valores.DescGrupoDos
        );

        if (siguienteUno && siguienteUno !== grupoUno) {
            grupoUno = siguienteUno;
            descGrupoUno = '';
            grupoDos = '';
            descGrupoDos = '';
        }
        if (siguienteDescUno && siguienteDescUno !== descGrupoUno) {
            descGrupoUno = siguienteDescUno;
            descGrupoDos = '';
        }
        if (siguienteDos && siguienteDos !== grupoDos) {
            grupoDos = siguienteDos;
            descGrupoDos = '';
        }
        if (siguienteDescDos) {
            descGrupoDos = siguienteDescDos;
        }

        resultado.push({
            grupoUno,
            descGrupoUno,
            grupoDos,
            descGrupoDos,
        });
    }

    return resultado;
}

interface CategoriaDesdeGrupos {
    categoria: string;
    fuente: FuenteCategoria;
}

function categoriaDesdeGrupos(grupos: GruposRellenos): CategoriaDesdeGrupos {
    const descDos = grupos.descGrupoDos.trim();
    if (descDos) return { categoria: descDos, fuente: 'DescGrupoDos' };
    const descUno = grupos.descGrupoUno.trim();
    if (descUno) return { categoria: descUno, fuente: 'DescGrupoUno' };
    return { categoria: '', fuente: 'AUSENTE' };
}

export interface MetricasFila {
    precio1: number | null;
    precio2: number | null;
    precio3: number | null;
    precio4: number | null;
    iva: number | null;
    existencias: number | null;
}

export interface Incidencia {
    fila: number;
    codigo: string;
    campo?: string;
    detalle?: string;
}

export interface DocumentoPropuesto {
    referencia: string;
    descripcion: string;
    categoria: string;
    referencias_alternativas: string[];
    aplica_a: string[];
}

export interface FilaClasificada {
    fila: number;
    resultado: ResultadoFila;
    motivos: string[];
    grupos: GruposRellenos;
    categoria: string;
    categoriaFuente: FuenteCategoria;
    disposicionCategoria: DisposicionCategoria;
    referenciaCruda: string;
    referencia: string;
    referenciaBucket: Bucket;
    referenciaMotivo: string | null;
    descripcion: string;
    descripcionLongitud: number;
    unidadMedida: string;
    metricas: MetricasFila;
    tokens: TokenClasificado[];
    referenciasAlternativas: string[];
    importKey: string | null;
    documentoPropuesto: DocumentoPropuesto | null;
}

export interface ResumenParseo {
    totalFilas: number;
    parsedRows: number;
    skippedRows: number;
    porResultado: Record<ResultadoFila, number>;
    porBucket: Record<Bucket, number>;
    categorias: Record<string, number>;
    tokens: ResumenTokens;
    metricas: {
        preciosConError: number;
        existenciasConError: number;
        existenciasNegativas: number;
    };
}

export interface ResultadoParseo {
    filas: FilaClasificada[];
    incidencias: Incidencia[];
    resumen: ResumenParseo;
}

export interface OpcionesParseo {
    blocklist?: readonly string[];
    masters?: readonly string[];
    maxReferencia?: number;
    maxDescripcion?: number;
    maxCategoria?: number;
}

const CAMPOS_METRICAS: ReadonlyArray<{
    clave: keyof MetricasFila;
    header: SourceHeader;
}> = [
    { clave: 'precio1', header: 'Precio1' },
    { clave: 'precio2', header: 'Precio2' },
    { clave: 'precio3', header: 'Precio3' },
    { clave: 'precio4', header: 'Precio4' },
    { clave: 'iva', header: 'Iva' },
    { clave: 'existencias', header: 'Existencias' },
];

function metricasVacias(): MetricasFila {
    return {
        precio1: null,
        precio2: null,
        precio3: null,
        precio4: null,
        iva: null,
        existencias: null,
    };
}

export function computeImportKey(referencia: string): string {
    const normalizada = normalizarTexto(referencia).toUpperCase();
    return createHash('sha256')
        .update(`inventario_repuestos|v1|${normalizada}`, 'utf8')
        .digest('hex');
}

/**
 * Parsea y clasifica filas ya extraídas. No escribe nada y no produce
 * claves de precio/stock en el documento propuesto: esas columnas solo
 * alimentan métricas de reporte (COND-1).
 */
export function parseInventarioRows(
    filasOrigen: readonly FilaOrigen[],
    opciones: OpcionesParseo = {}
): ResultadoParseo {
    const maxReferencia = opciones.maxReferencia ?? MAX_REFERENCIA;
    const maxDescripcion = opciones.maxDescripcion ?? MAX_DESCRIPCION;
    const maxCategoria = opciones.maxCategoria ?? MAX_CATEGORIA;
    const blocklist = normalizarAlConjunto(opciones.blocklist);
    const masters = normalizarAlConjunto(opciones.masters);
    // G3: "no-maestro" incluye las referencias de la propia fuente. Sin esto,
    // un EAN-13 que ya es código de otra fila entraría como alternativa y
    // crearía ambigüedad de matching desde la primera ingesta.
    for (const filaOrigen of filasOrigen) {
        const referenciaFuente = normalizarTexto(
            filaOrigen.valores['Codigo Producto']
        ).toUpperCase();
        if (referenciaFuente) masters.add(referenciaFuente);
    }
    const grupos = rellenarGrupos(filasOrigen);

    const filas: FilaClasificada[] = [];
    const incidencias: Incidencia[] = [];
    const porResultado: Record<ResultadoFila, number> = {
        INGRESA: 0,
        CENSAR: 0,
        MAPPABLE: 0,
        CUARENTENA: 0,
        OMITIDA: 0,
    };
    const porBucket = crearContadoresBucket();
    const categorias: Record<string, number> = {};
    const todosLosTokens: TokenClasificado[] = [];
    const metricasResumen = {
        preciosConError: 0,
        existenciasConError: 0,
        existenciasNegativas: 0,
    };

    for (let index = 0; index < filasOrigen.length; index += 1) {
        const origen = filasOrigen[index];
        const valores = origen.valores ?? {};
        const grupo = grupos[index];
        const fila = origen.fila;
        const leer = (header: SourceHeader): string =>
            limpiarCelda(valores[header]);

        const todoVacio = SOURCE_HEADERS.every(
            (header) => normalizarTexto(valores[header]) === ''
        );

        if (todoVacio) {
            const motivo = 'FILA_VACIA';
            const vacia: FilaClasificada = {
                fila,
                resultado: 'OMITIDA',
                motivos: [motivo],
                grupos: grupo,
                categoria: '',
                categoriaFuente: 'AUSENTE',
                disposicionCategoria: 'CUARENTENA',
                referenciaCruda: '',
                referencia: '',
                referenciaBucket: 'QUARANTINE',
                referenciaMotivo: 'REFERENCIA_VACIA',
                descripcion: '',
                descripcionLongitud: 0,
                unidadMedida: '',
                metricas: metricasVacias(),
                tokens: [],
                referenciasAlternativas: [],
                importKey: null,
                documentoPropuesto: null,
            };
            filas.push(vacia);
            porResultado.OMITIDA += 1;
            porBucket.QUARANTINE += 1;
            categorias.CATEGORIA_AUSENTE =
                (categorias.CATEGORIA_AUSENTE ?? 0) + 1;
            incidencias.push({ fila, codigo: motivo });
            continue;
        }

        const referenciaCruda = leer('Codigo Producto');
        const referencia = clasificarReferencia(
            referenciaCruda,
            maxReferencia
        );
        const descripcion = normalizarTexto(leer('Descripción'));
        const categoriaDesde = categoriaDesdeGrupos(grupo);
        const categoria = clasificarCategoria(categoriaDesde.categoria);
        const unidadMedida = normalizarTexto(leer('UnidadDeMedida'));
        const motivos: string[] = [];
        let resultadoFila: ResultadoFila;
        const agregarMotivo = (codigo: string): void => {
            if (!motivos.includes(codigo)) motivos.push(codigo);
        };
        const escalarACuarentena = (codigo: string): void => {
            agregarMotivo(codigo);
            if (resultadoFila !== 'CENSAR' && resultadoFila !== 'OMITIDA') {
                resultadoFila = 'CUARENTENA';
            }
        };

        switch (categoria.disposicion) {
            case 'FUERA':
                resultadoFila = 'OMITIDA';
                agregarMotivo('CATEGORIA_FUERA_DE_ALCANCE');
                break;
            case 'CUARENTENA':
                resultadoFila = 'CUARENTENA';
                agregarMotivo(categoria.motivo ?? 'CATEGORIA_AUSENTE');
                break;
            case 'CENSAR':
                resultadoFila = 'CENSAR';
                agregarMotivo(categoria.motivo ?? 'CATEGORIA_CENSAR');
                break;
            case 'MAPPABLE':
                resultadoFila = 'MAPPABLE';
                agregarMotivo(
                    categoria.motivo ?? 'CATEGORIA_REQUIERE_MAPPING'
                );
                break;
            case 'INGRESA':
            case 'INGRESA_SOLO_VALIDAS':
                resultadoFila = 'INGRESA';
                break;
        }

        if (resultadoFila !== 'OMITIDA') {
            if (!descripcion && !referencia.cruda.trim()) {
                resultadoFila = 'OMITIDA';
                agregarMotivo('SIN_DATOS');
            } else if (!descripcion) {
                resultadoFila = 'OMITIDA';
                agregarMotivo('SIN_DESCRIPCION');
            }
        }

        if (resultadoFila !== 'OMITIDA') {
            if (referencia.bucket === 'QUARANTINE') {
                escalarACuarentena(
                    referencia.motivo ?? 'REFERENCIA_INVALIDA'
                );
            } else if (referencia.bucket === 'NORMALIZABLE') {
                agregarMotivo('REFERENCIA_REQUIERE_REGLA');
                if (resultadoFila === 'INGRESA') {
                    resultadoFila = 'MAPPABLE';
                }
            }

            if (descripcion.length > maxDescripcion) {
                escalarACuarentena('DESCRIPCION_LARGA');
            }
            if (categoria.categoria.length > maxCategoria) {
                escalarACuarentena('CATEGORIA_LARGA');
            }
        }

        const metricas = metricasVacias();
        for (const campo of CAMPOS_METRICAS) {
            const crudo = valores[campo.header];
            if (!normalizarTexto(crudo)) continue;
            const parseado = parseNumeroColombiano(crudo);
            if (parseado.ok) {
                metricas[campo.clave] = parseado.value;
            } else {
                incidencias.push({
                    fila,
                    codigo: 'METRICA_INVALIDA',
                    campo: campo.header,
                    detalle: parseado.code,
                });
                if (
                    campo.clave === 'precio1' ||
                    campo.clave === 'precio2' ||
                    campo.clave === 'precio3' ||
                    campo.clave === 'precio4'
                ) {
                    metricasResumen.preciosConError += 1;
                } else if (campo.clave === 'existencias') {
                    metricasResumen.existenciasConError += 1;
                }
            }
        }
        if (
            metricas.existencias !== null &&
            metricas.existencias < 0
        ) {
            metricasResumen.existenciasNegativas += 1;
        }

        const tokens = procesarTokensConjuntos(
            [
                valores.txtPersonalizado1,
                valores.txtPersonalizado2,
            ],
            blocklist,
            masters,
            maxReferencia,
            referencia.normalizada || undefined
        );
        todosLosTokens.push(...tokens.tokens);
        for (const token of tokens.tokens) {
            if (token.bucket === 'QUARANTINE') {
                incidencias.push({
                    fila,
                    codigo: token.motivo ?? 'TOKEN_CUARENTENA',
                    campo: 'txtPersonalizado1+txtPersonalizado2',
                    detalle: token.crudo,
                });
            }
            if (
                token.bucket === 'EAN13' &&
                token.normalizado === referencia.normalizada
            ) {
                incidencias.push({
                    fila,
                    codigo: 'EAN13_REFERENCIA_PROPIA',
                    campo: 'txtPersonalizado1+txtPersonalizado2',
                    detalle: token.crudo,
                });
            }
        }
        const referenciasAlternativas = tokens.alternativas.filter(
            (alternativa) => alternativa !== referencia.normalizada
        );

        const documentoPropuesto =
            resultadoFila === 'INGRESA'
                ? {
                      referencia: referencia.normalizada,
                      descripcion,
                      categoria: categoria.categoria,
                      referencias_alternativas: referenciasAlternativas,
                      aplica_a: [] as string[],
                  }
                : null;

        const filaClasificada: FilaClasificada = {
            fila,
            resultado: resultadoFila,
            motivos,
            grupos: grupo,
            categoria: categoria.categoria,
            categoriaFuente: categoriaDesde.fuente,
            disposicionCategoria: categoria.disposicion,
            referenciaCruda,
            referencia: referencia.normalizada,
            referenciaBucket: referencia.bucket,
            referenciaMotivo: referencia.motivo,
            descripcion,
            descripcionLongitud: descripcion.length,
            unidadMedida,
            metricas,
            tokens: tokens.tokens,
            referenciasAlternativas,
            importKey: referencia.normalizada
                ? computeImportKey(referencia.normalizada)
                : null,
            documentoPropuesto,
        };

        filas.push(filaClasificada);
        porResultado[resultadoFila] += 1;
        porBucket[referencia.bucket] += 1;
        const claveCategoria =
            categoria.categoria || 'CATEGORIA_AUSENTE';
        categorias[claveCategoria] =
            (categorias[claveCategoria] ?? 0) + 1;

        if (resultadoFila === 'OMITIDA') {
            const motivo =
                motivos.find(
                    (codigo) =>
                        codigo === 'FILA_VACIA' ||
                        codigo === 'SIN_DATOS' ||
                        codigo === 'SIN_DESCRIPCION' ||
                        codigo === 'CATEGORIA_FUERA_DE_ALCANCE'
                ) ?? 'OMITIDA';
            incidencias.push({ fila, codigo: motivo });
        } else {
            for (const motivo of motivos) {
                incidencias.push({ fila, codigo: motivo });
            }
        }
    }

    const totalFilas = filas.length;
    const skippedRows = porResultado.OMITIDA;
    return {
        filas,
        incidencias,
        resumen: {
            totalFilas,
            parsedRows: totalFilas - skippedRows,
            skippedRows,
            porResultado,
            porBucket,
            categorias,
            tokens: resumirTokens(todosLosTokens),
            metricas: metricasResumen,
        },
    };
}
