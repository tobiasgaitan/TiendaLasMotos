/**
 * WEB-INV-INGESTA-001-F1 — Disposiciones finales MT-5 (run-7).
 *
 * Capa pura y explícita que traduce el resultado del parser (INGRESA /
 * CENSAR / MAPPABLE / CUARENTENA / OMITIDA) a la disposición final de la
 * ingesta: CREATE / CENSAR / EXCLUIR / CUARENTENA / SKIP_CONFLICTO / OMITIDA.
 *
 * Esta capa NO modifica el parser ni sus buckets. Se aplica después del
 * parseo para que una decisión del Director sea auditable por separado.
 *
 * Delta run-7 sobre la config run-6 (SHA-256 4aad4822…):
 * - D-5: las filas CUARENTENA por REFERENCIA_CHARSET de las seis categorías
 *   INGESTA se sanean con `/`→`-` y espacio→`-` cuando su único defecto es
 *   ese. El crudo se conserva y se reporta fila a fila.
 * - D-5 excluye texto libre (segmentos alfabéticos de 3+ letras), símbolos
 *   distintos de `/` y espacio (`+`, `=`, coma, `?`, paréntesis, etc.) y
 *   filas con otro defecto (descripción/categoría larga). Esas filas siguen
 *   en CUARENTENA.
 * - D-5 no toca categorías CENSAR ni OMITIDAS: quedan fuera de alcance.
 * - Se agrega el chequeo post-mapeo de colisiones de import_key y cruzadas
 *   maestra↔alternativa; cualquier colisión produce SKIP_CONFLICTO con la
 *   fila identificada y nunca sobrescribe.
 *
 * Todo lo demás de run-6 queda intacto: D-1, D-2, D-3, D-4, los 102 overrides
 * de PRODUCTOS NO FABRICADOS POR LA EMPRESA y las 2 filas de 11034067.
 */
import {
    REFERENCIA_REGEX,
    computeImportKey,
    normalizarCategoria,
    type DocumentoPropuesto,
    type FilaClasificada,
    type ResultadoFila,
} from './inv-ingesta-utils';

export type DisposicionFinal =
    | 'CREATE'
    | 'CENSAR'
    | 'EXCLUIR'
    | 'CUARENTENA'
    | 'SKIP_CONFLICTO'
    | 'OMITIDA';

export type OrigenMapeo = 'D1' | 'D5';

export type TipoColisionMapeo =
    | 'REFERENCIA_FUENTE'
    | 'REFERENCIA_MAPEADA'
    | 'REFERENCIA_ALTERNATIVA'
    | 'ALTERNATIVA_ES_MAESTRA';

export type MotivoD5 =
    | 'D5_CREADA'
    | 'D5_SKIP_CONFLICTO'
    | 'D5_TEXTO_LIBRE'
    | 'D5_SIMBOLO_INVALIDO'
    | 'D5_OTRO_DEFECTO'
    | 'D5_CATEGORIA_NO_INGESTA';

export interface ReglaCategoria {
    categoria: string;
    base: ResultadoFila;
    disposicion: DisposicionFinal;
    motivo: string;
}

export interface ReglaReferencia {
    referencia: string;
    disposicion: 'CUARENTENA';
    motivo: string;
}

export interface ReglaMapeo {
    de: string;
    a: string;
}

export interface EanCuarentena {
    token: string;
    filas: number[];
}

export interface EanKeepAlternativa {
    token: string;
    referencias: string[];
}

export interface ConfigDisposiciones {
    version: 3;
    ticket: string;
    ratified_by: string;
    ratified_at: string;
    fuente: string;
    mapeoMappable: {
        aplicarA: 'MAPPABLE';
        reemplazos: ReglaMapeo[];
        preservarRaw: true;
        chequearColisiones: true;
    };
    mapeoCuarentena: {
        aplicarA: 'CUARENTENA_CHARSET';
        categorias: string[];
        reemplazos: ReglaMapeo[];
        preservarRaw: true;
        chequearColisiones: true;
        textoLibre: {
            segmentosAlfabeticosMin: number;
        };
    };
    porCategoria: ReglaCategoria[];
    porReferencia: ReglaReferencia[];
    ean: {
        cuarentena: EanCuarentena[];
        keep_alternativas: EanKeepAlternativa[];
    };
}

/**
 * Configuración explícita de overrides MT-5. Es la única fuente de verdad de
 * la disposición final; el dry-run la publica con SHA-256 en su evidencia y
 * la simulación exige el mismo hash antes de calcular CREATE.
 */
export const MT5_DISPOSICIONES: ConfigDisposiciones = {
    version: 3,
    ticket: 'WEB-INV-INGESTA-001-F1',
    ratified_by: 'Director',
    ratified_at: '2026-11-18',
    fuente:
        'run-6 4aad4822… + delta D-5 del 2026-11-18: saneamiento /→- y espacio→- de CUARENTENA charset elegible, con texto libre, símbolos inválidos y categorías CENSAR/OMITIDA fuera de alcance',
    mapeoMappable: {
        aplicarA: 'MAPPABLE',
        reemplazos: [
            { de: '/', a: '-' },
            { de: ' ', a: '-' },
        ],
        preservarRaw: true,
        chequearColisiones: true,
    },
    mapeoCuarentena: {
        aplicarA: 'CUARENTENA_CHARSET',
        categorias: [
            'REPUESTOS',
            'LOS ORIGINALES',
            'ACCESORIOS',
            'LUBRICANTES',
            'GENERICOS',
            'LINEA DE CUIDADO',
        ],
        reemplazos: [
            { de: '/', a: '-' },
            { de: ' ', a: '-' },
        ],
        preservarRaw: true,
        chequearColisiones: true,
        textoLibre: {
            segmentosAlfabeticosMin: 3,
        },
    },
    porCategoria: [
        {
            categoria: 'HERRAMIENTAS ESPECIALIZADAS',
            base: 'CENSAR',
            disposicion: 'CENSAR',
            motivo: 'MT5_CENSAR_HERRAMIENTAS',
        },
        {
            categoria: 'PRODUCTOS NO FABRICADOS POR LA EMPRESA',
            base: 'MAPPABLE',
            disposicion: 'CENSAR',
            motivo: 'MT5_CENSAR_PRODUCTOS_NO_FABRICADOS',
        },
        {
            categoria: 'LOS ORIGINALES',
            base: 'MAPPABLE',
            disposicion: 'CREATE',
            motivo: 'D2_LOS_ORIGINALES_INGESTA',
        },
        {
            categoria: 'REPUESTOS',
            base: 'MAPPABLE',
            disposicion: 'CREATE',
            motivo: 'D1_MAPPABLE_REPUESTOS',
        },
    ],
    porReferencia: [
        {
            referencia: '11034067',
            disposicion: 'CUARENTENA',
            motivo: 'MT5_DUPLICADO_INTERNO',
        },
    ],
    ean: {
        cuarentena: [
            { token: '7704919622201', filas: [19850] },
            { token: '7704919374544', filas: [21634] },
            { token: '7704919751659', filas: [21639] },
            { token: '7704919487701', filas: [21828] },
            { token: '7704919383201', filas: [22334] },
            { token: '7897707508778', filas: [24692] },
        ],
        keep_alternativas: [
            {
                token: '7704919026122',
                referencias: ['11055328', '110555328'],
            },
            {
                token: '7704919073454',
                referencias: ['10030307', '11016126'],
            },
            {
                token: '7704919142327',
                referencias: ['10046950', '11010018'],
            },
            {
                token: '7704919188066',
                referencias: ['10091605', '11034039'],
            },
            {
                token: '7704919312225',
                referencias: ['10091610', '11034065'],
            },
            {
                token: '7704919543544',
                referencias: ['10024362', '11006913'],
            },
            {
                token: '7704919806618',
                referencias: ['10046819', '11014768'],
            },
            {
                token: '7704919840476',
                referencias: ['10046934', '11009974'],
            },
            {
                token: '7704919850963',
                referencias: ['10046812', '11014744'],
            },
            {
                token: '7704919861235',
                referencias: ['10046886', '11014988'],
            },
            {
                token: '7706913670400',
                referencias: ['21017604', '21017694'],
            },
        ],
    },
};

export interface ColisionMapeo {
    fila: number;
    referencia: string;
    importKey: string;
    tipo: TipoColisionMapeo;
}

export interface MapeoFila {
    fila: number;
    origen: OrigenMapeo;
    categoria: string;
    referenciaCruda: string;
    referenciaOriginal: string;
    referenciaMapeada: string;
    bucketOriginal: FilaClasificada['referenciaBucket'];
    motivoOriginal: string | null;
    reglas: string[];
    cambios: boolean;
    colisiones: ColisionMapeo[];
    disposicion: DisposicionFinal;
    motivo: string | null;
    importKeyOriginal: string | null;
    importKey: string | null;
}

export interface MapeoCuarentenaFila {
    fila: number;
    categoria: string;
    referenciaCruda: string;
    referenciaOriginal: string;
    referenciaSanitizada: string;
    reglas: string[];
    cambios: boolean;
    invalida: boolean;
    elegible: boolean;
    motivo: MotivoD5;
    colisiones: ColisionMapeo[];
    disposicion: DisposicionFinal;
    importKeyOriginal: string | null;
    importKey: string | null;
}

export interface FilaConDisposicion {
    fila: number;
    categoria: string;
    referencia: string;
    referenciaOriginal: string;
    referenciaCruda: string;
    resultado: ResultadoFila;
    disposicion: DisposicionFinal;
    motivo: string | null;
    overrides: string[];
    mapeo: {
        origen: OrigenMapeo;
        aplicado: true;
        reglas: string[];
        cambios: boolean;
        colisiones: ColisionMapeo[];
    } | null;
    importKeyOriginal: string | null;
    importKey: string | null;
    documentoPropuesto: DocumentoPropuesto | null;
}

export interface CategoriaDisposicion {
    categoria: string;
    total: number;
    CREATE: number;
    CENSAR: number;
    EXCLUIR: number;
    CUARENTENA: number;
    SKIP_CONFLICTO: number;
    OMITIDA: number;
}

export interface ResumenMapeoOrigen {
    filas: number;
    conCambios: number;
    sinCambios: number;
    colisiones: number;
}

export interface ResumenCategoriaD5 {
    categoria: string;
    charsetTotal: number;
    candidatas: number;
    elegibles: number;
    creadas: number;
    skipConflicto: number;
    textoLibre: number;
    simboloInvalido: number;
    otroDefecto: number;
    fueraDeAlcance: number;
    colisiones: number;
}

export interface ResumenD5 {
    charsetTotal: number;
    candidatas: number;
    elegibles: number;
    creadas: number;
    skipConflicto: number;
    textoLibre: number;
    simboloInvalido: number;
    otroDefecto: number;
    fueraDeAlcance: number;
    colisiones: number;
    porCategoria: ResumenCategoriaD5[];
}

export interface ResumenMapeo {
    filas: number;
    conCambios: number;
    sinCambios: number;
    colisiones: number;
    d1: ResumenMapeoOrigen;
    d5: ResumenD5;
}

export interface ResumenDisposiciones {
    total: number;
    parsed: number;
    CREATE: number;
    CENSAR: number;
    EXCLUIR: number;
    CUARENTENA: number;
    SKIP_CONFLICTO: number;
    OMITIDA: number;
    residuo: number;
    reconciliacion: 'PASS' | 'FAIL';
    overridesAplicados: number;
    mapeo: ResumenMapeo;
    porCategoria: CategoriaDisposicion[];
}

export interface OverrideGroup {
    motivo: string;
    filas: number[];
    total: number;
}

export interface ResultadoDisposiciones {
    filas: FilaConDisposicion[];
    resumen: ResumenDisposiciones;
    mapeo: MapeoFila[];
    mapeoCuarentena: MapeoCuarentenaFila[];
    overrides: OverrideGroup[];
}

interface MapeoTemporal {
    fila: FilaClasificada;
    origen: OrigenMapeo;
    referenciaOriginal: string;
    referenciaMapeada: string;
    reglas: string[];
    cambios: boolean;
    invalida: boolean;
    colisiones: ColisionMapeo[];
}

interface MapeoD5Temporal extends MapeoCuarentenaFila {
    filaClasificada: FilaClasificada;
}

const DISPOSICIONES: readonly DisposicionFinal[] = [
    'CREATE',
    'CENSAR',
    'EXCLUIR',
    'CUARENTENA',
    'SKIP_CONFLICTO',
    'OMITIDA',
];

const MOTIVOS_D5_PERMITIDOS = new Set([
    'REFERENCIA_CHARSET',
    'CATEGORIA_REQUIERE_MAPPING',
]);

export function disposicionBase(resultado: ResultadoFila): DisposicionFinal {
    switch (resultado) {
        case 'INGRESA':
            return 'CREATE';
        case 'CENSAR':
            return 'CENSAR';
        case 'MAPPABLE':
            return 'EXCLUIR';
        case 'CUARENTENA':
            return 'CUARENTENA';
        case 'OMITIDA':
            return 'OMITIDA';
    }
}

function categoriaResumen(categoria: string): CategoriaDisposicion {
    return {
        categoria,
        total: 0,
        CREATE: 0,
        CENSAR: 0,
        EXCLUIR: 0,
        CUARENTENA: 0,
        SKIP_CONFLICTO: 0,
        OMITIDA: 0,
    };
}

function normalizarReferencia(value: string): string {
    return value.trim().toUpperCase();
}

function agregarReferencia(
    mapa: Map<string, number[]>,
    referencia: string,
    fila: number
): void {
    const filas = mapa.get(referencia) ?? [];
    filas.push(fila);
    mapa.set(referencia, filas);
}

function aplicarReemplazos(
    value: string,
    reemplazos: readonly ReglaMapeo[]
): { referencia: string; reglas: string[]; cambios: boolean } {
    let referencia = value;
    const reglas: string[] = [];
    for (const regla of reemplazos) {
        if (!referencia.includes(regla.de)) continue;
        referencia = referencia.split(regla.de).join(regla.a);
        reglas.push(`${regla.de}->${regla.a}`);
    }
    return { referencia, reglas, cambios: referencia !== value };
}

export interface ResultadoMapeoReferencia {
    referencia: string;
    reglas: string[];
    cambios: boolean;
    invalida: boolean;
}

/**
 * Aplica las sustituciones D-1 a una referencia MAPPABLE ya normalizada por
 * el parser. El crudo nunca se modifica: el llamador lo conserva aparte.
 */
export function mapearReferenciaMappable(
    value: string,
    config: ConfigDisposiciones = MT5_DISPOSICIONES
): ResultadoMapeoReferencia {
    const aplicado = aplicarReemplazos(value, config.mapeoMappable.reemplazos);
    return {
        ...aplicado,
        invalida:
            !REFERENCIA_REGEX.test(aplicado.referencia) ||
            aplicado.referencia.length > 64,
    };
}

/**
 * D-5: un texto es "libre" cuando algún segmento separado por espacio o `/`
 * es una palabra puramente alfabética de 3+ letras. Los códigos reales usan
 * prefijos/sufijos cortos (2RS, C3, AH, NR, BL, TL, QN) o contienen dígitos;
 * las descripciones usan palabras completas (CABLE, KIT, ORIGINAL, ACEITE).
 */
export function esTextoLibreD5(
    value: string,
    minimo: number = MT5_DISPOSICIONES.mapeoCuarentena.textoLibre
        .segmentosAlfabeticosMin
): boolean {
    return value
        .trim()
        .toUpperCase()
        .split(/[ /]+/)
        .some(
            (segmento) =>
                /^[A-Z]+$/.test(segmento) && segmento.length >= minimo
        );
}

export interface ResultadoMapeoCuarentena {
    referencia: string;
    reglas: string[];
    cambios: boolean;
    invalida: boolean;
    textoLibre: boolean;
}

/**
 * Aplica las sustituciones D-5 a una referencia CUARENTENA por charset ya
 * normalizada. No decide categoría ni otros defectos; eso lo hace el
 * clasificador de disposiciones.
 */
export function mapearReferenciaCuarentena(
    value: string,
    config: ConfigDisposiciones = MT5_DISPOSICIONES
): ResultadoMapeoCuarentena {
    const aplicado = aplicarReemplazos(
        value,
        config.mapeoCuarentena.reemplazos
    );
    return {
        ...aplicado,
        invalida:
            !REFERENCIA_REGEX.test(aplicado.referencia) ||
            aplicado.referencia.length > 64,
        textoLibre: esTextoLibreD5(
            value,
            config.mapeoCuarentena.textoLibre.segmentosAlfabeticosMin
        ),
    };
}

function categoriaD5Habilitada(
    categoria: string,
    config: ConfigDisposiciones
): boolean {
    const normalizada = normalizarCategoria(categoria);
    return config.mapeoCuarentena.categorias.some(
        (permitida) => normalizarCategoria(permitida) === normalizada
    );
}

function crearResumenD5(
    mapeos: readonly MapeoCuarentenaFila[]
): ResumenD5 {
    const porCategoriaMap = new Map<string, ResumenCategoriaD5>();
    const resumen: ResumenD5 = {
        charsetTotal: 0,
        candidatas: 0,
        elegibles: 0,
        creadas: 0,
        skipConflicto: 0,
        textoLibre: 0,
        simboloInvalido: 0,
        otroDefecto: 0,
        fueraDeAlcance: 0,
        colisiones: 0,
        porCategoria: [],
    };

    for (const mapeo of mapeos) {
        const clave = mapeo.categoria || 'CATEGORIA_AUSENTE';
        const categoria =
            porCategoriaMap.get(clave) ??
            ({
                categoria: clave,
                charsetTotal: 0,
                candidatas: 0,
                elegibles: 0,
                creadas: 0,
                skipConflicto: 0,
                textoLibre: 0,
                simboloInvalido: 0,
                otroDefecto: 0,
                fueraDeAlcance: 0,
                colisiones: 0,
            } satisfies ResumenCategoriaD5);

        const esFueraDeAlcance = mapeo.motivo === 'D5_CATEGORIA_NO_INGESTA';
        const esCandidata = !esFueraDeAlcance;
        const esTextoLibre = mapeo.motivo === 'D5_TEXTO_LIBRE';
        const esSimboloInvalido =
            mapeo.motivo === 'D5_SIMBOLO_INVALIDO';
        const esOtroDefecto = mapeo.motivo === 'D5_OTRO_DEFECTO';

        resumen.charsetTotal += 1;
        categoria.charsetTotal += 1;
        if (esFueraDeAlcance) {
            resumen.fueraDeAlcance += 1;
            categoria.fueraDeAlcance += 1;
        } else {
            resumen.candidatas += 1;
            categoria.candidatas += 1;
        }
        if (esTextoLibre) {
            resumen.textoLibre += 1;
            categoria.textoLibre += 1;
        }
        if (esSimboloInvalido) {
            resumen.simboloInvalido += 1;
            categoria.simboloInvalido += 1;
        }
        if (esOtroDefecto) {
            resumen.otroDefecto += 1;
            categoria.otroDefecto += 1;
        }
        if (mapeo.elegible) {
            resumen.elegibles += 1;
            categoria.elegibles += 1;
            if (mapeo.disposicion === 'CREATE') {
                resumen.creadas += 1;
                categoria.creadas += 1;
            }
            if (mapeo.disposicion === 'SKIP_CONFLICTO') {
                resumen.skipConflicto += 1;
                categoria.skipConflicto += 1;
            }
            if (mapeo.colisiones.length > 0) {
                resumen.colisiones += 1;
                categoria.colisiones += 1;
            }
        }

        porCategoriaMap.set(clave, categoria);
    }

    resumen.porCategoria = [...porCategoriaMap.values()].sort(
        (a, b) =>
            b.charsetTotal - a.charsetTotal ||
            a.categoria.localeCompare(b.categoria, 'es')
    );
    return resumen;
}

function construirMapeos(
    filas: readonly FilaClasificada[],
    config: ConfigDisposiciones
): {
    mapeos: Map<number, MapeoTemporal>;
    mapeosD5: Map<number, MapeoD5Temporal>;
    referenciasFuente: Map<string, number[]>;
    alternativasPorFila: Map<number, string[]>;
    filasPorAlternativa: Map<string, number[]>;
} {
    const referenciasFuente = new Map<string, number[]>();
    const alternativasPorFila = new Map<number, string[]>();
    const filasPorAlternativa = new Map<string, number[]>();

    for (const fila of filas) {
        const referencia = normalizarReferencia(fila.referencia);
        if (referencia) {
            agregarReferencia(referenciasFuente, referencia, fila.fila);
        }

        const alternativas = fila.referenciasAlternativas
            .map((alternativa) => normalizarReferencia(alternativa))
            .filter((alternativa) => alternativa.length > 0);
        alternativasPorFila.set(fila.fila, alternativas);
        for (const alternativa of alternativas) {
            agregarReferencia(filasPorAlternativa, alternativa, fila.fila);
        }
    }

    const mapeos = new Map<number, MapeoTemporal>();
    const mapeosD5 = new Map<number, MapeoD5Temporal>();
    const referenciasMapeadas = new Map<string, number[]>();

    for (const fila of filas) {
        if (fila.resultado === 'MAPPABLE') {
            const mapeo = mapearReferenciaMappable(fila.referencia, config);
            if (!mapeo.invalida) {
                agregarReferencia(
                    referenciasMapeadas,
                    mapeo.referencia,
                    fila.fila
                );
            }
            mapeos.set(fila.fila, {
                fila,
                origen: 'D1',
                referenciaOriginal: fila.referencia,
                referenciaMapeada: mapeo.referencia,
                reglas: mapeo.reglas,
                cambios: mapeo.cambios,
                invalida: mapeo.invalida,
                colisiones: [],
            });
            continue;
        }

        if (fila.referenciaMotivo !== 'REFERENCIA_CHARSET') continue;

        const mapeo = mapearReferenciaCuarentena(fila.referencia, config);
        const categoriaHabilitada = categoriaD5Habilitada(
            fila.categoria,
            config
        );
        const fueraDeAlcance =
            fila.resultado !== 'CUARENTENA' || !categoriaHabilitada;
        const otroDefecto = fila.motivos.some(
            (motivo) => !MOTIVOS_D5_PERMITIDOS.has(motivo)
        );
        const simboloInvalido = mapeo.invalida;
        const textoLibre = !simboloInvalido && mapeo.textoLibre;
        const elegible =
            !fueraDeAlcance &&
            !otroDefecto &&
            !simboloInvalido &&
            !textoLibre &&
            mapeo.cambios;

        let motivo: MotivoD5;
        if (fueraDeAlcance) {
            motivo = 'D5_CATEGORIA_NO_INGESTA';
        } else if (simboloInvalido) {
            motivo = 'D5_SIMBOLO_INVALIDO';
        } else if (textoLibre) {
            motivo = 'D5_TEXTO_LIBRE';
        } else if (otroDefecto) {
            motivo = 'D5_OTRO_DEFECTO';
        } else {
            motivo = 'D5_CREADA';
        }

        const registro: MapeoD5Temporal = {
            fila: fila.fila,
            filaClasificada: fila,
            categoria: fila.categoria,
            referenciaCruda: fila.referenciaCruda,
            referenciaOriginal: fila.referencia,
            referenciaSanitizada: mapeo.referencia,
            reglas: mapeo.reglas,
            cambios: mapeo.cambios,
            invalida: mapeo.invalida,
            elegible,
            motivo,
            colisiones: [],
            disposicion: 'CUARENTENA',
            importKeyOriginal: fila.importKey,
            importKey: null,
        };
        mapeosD5.set(fila.fila, registro);

        if (!elegible) continue;

        agregarReferencia(
            referenciasMapeadas,
            mapeo.referencia,
            fila.fila
        );
        mapeos.set(fila.fila, {
            fila,
            origen: 'D5',
            referenciaOriginal: fila.referencia,
            referenciaMapeada: mapeo.referencia,
            reglas: mapeo.reglas,
            cambios: mapeo.cambios,
            invalida: false,
            colisiones: [],
        });
    }

    for (const mapeo of mapeos.values()) {
        if (mapeo.invalida) continue;
        const importKey = computeImportKey(mapeo.referenciaMapeada);
        const vistas = new Set<string>();
        const agregarColision = (
            fila: number,
            tipo: TipoColisionMapeo
        ): void => {
            if (fila === mapeo.fila.fila) return;
            const clave = `${fila}|${tipo}`;
            if (vistas.has(clave)) return;
            vistas.add(clave);
            mapeo.colisiones.push({
                fila,
                referencia: mapeo.referenciaMapeada,
                importKey,
                tipo,
            });
        };

        for (const fila of
            referenciasFuente.get(mapeo.referenciaMapeada) ?? []) {
            agregarColision(fila, 'REFERENCIA_FUENTE');
        }
        for (const fila of
            referenciasMapeadas.get(mapeo.referenciaMapeada) ?? []) {
            agregarColision(fila, 'REFERENCIA_MAPEADA');
        }
        for (const fila of
            filasPorAlternativa.get(mapeo.referenciaMapeada) ?? []) {
            agregarColision(fila, 'REFERENCIA_ALTERNATIVA');
        }
        for (const alternativa of
            alternativasPorFila.get(mapeo.fila.fila) ?? []) {
            for (const fila of referenciasFuente.get(alternativa) ?? []) {
                agregarColision(fila, 'ALTERNATIVA_ES_MAESTRA');
            }
        }

        if (mapeo.origen === 'D5' && mapeo.colisiones.length > 0) {
            const registro = mapeosD5.get(mapeo.fila.fila);
            if (registro) {
                registro.colisiones = [...mapeo.colisiones];
                registro.motivo = 'D5_SKIP_CONFLICTO';
            }
        }
    }

    return {
        mapeos,
        mapeosD5,
        referenciasFuente,
        alternativasPorFila,
        filasPorAlternativa,
    };
}

/**
 * Aplica la configuración MT-5 a las filas ya parseadas. No lanza por filas
 * individuales: una referencia mapeada inválida se cuarentena y una colisión
 * post-mapeo se marca SKIP_CONFLICTO con las filas implicadas.
 */
export function aplicarDisposiciones(
    filas: readonly FilaClasificada[],
    config: ConfigDisposiciones = MT5_DISPOSICIONES
): ResultadoDisposiciones {
    const { mapeos, mapeosD5 } = construirMapeos(filas, config);
    const categorias = new Map<string, CategoriaDisposicion>();
    const resultado: FilaConDisposicion[] = [];
    const mapeoFilas: MapeoFila[] = [];
    const overridesMap = new Map<string, number[]>();
    const totales: Record<DisposicionFinal, number> = {
        CREATE: 0,
        CENSAR: 0,
        EXCLUIR: 0,
        CUARENTENA: 0,
        SKIP_CONFLICTO: 0,
        OMITIDA: 0,
    };
    let overridesAplicados = 0;

    const registrarOverride = (motivo: string, fila: number): void => {
        const filasMotivo = overridesMap.get(motivo) ?? [];
        filasMotivo.push(fila);
        overridesMap.set(motivo, filasMotivo);
    };

    for (const fila of filas) {
        const mapeo = mapeos.get(fila.fila);
        const d5 = mapeosD5.get(fila.fila);
        if (mapeo && d5 && mapeo.origen !== 'D5') {
            throw new Error(`Mapeo D5 inconsistente en fila ${fila.fila}`);
        }

        let disposicion = disposicionBase(fila.resultado);
        let motivo: string | null = null;
        const overridesFila: string[] = [];
        const categoriaNormalizada = normalizarCategoria(fila.categoria);

        for (const regla of config.porCategoria) {
            if (fila.resultado !== regla.base) continue;
            if (
                categoriaNormalizada !==
                normalizarCategoria(regla.categoria)
            ) {
                continue;
            }
            if (disposicion === regla.disposicion) continue;
            disposicion = regla.disposicion;
            motivo = regla.motivo;
            overridesFila.push(regla.motivo);
        }

        for (const regla of config.porReferencia) {
            const referenciasAComparar = [
                normalizarReferencia(fila.referencia),
                ...(d5 ? [normalizarReferencia(d5.referenciaSanitizada)] : []),
            ];
            if (
                !referenciasAComparar.includes(
                    normalizarReferencia(regla.referencia)
                )
            ) {
                continue;
            }
            if (disposicion === 'OMITIDA' || disposicion === 'CUARENTENA') {
                continue;
            }
            disposicion = 'CUARENTENA';
            motivo = regla.motivo;
            overridesFila.push(regla.motivo);
        }

        if (
            d5 &&
            !d5.elegible &&
            motivo === null &&
            d5.motivo !== 'D5_CATEGORIA_NO_INGESTA'
        ) {
            motivo = d5.motivo;
        }

        if (mapeo?.origen === 'D5') {
            if (mapeo.invalida) {
                throw new Error(
                    `Mapeo D5 inválido marcado como elegible en fila ${fila.fila}`
                );
            }
            if (mapeo.colisiones.length > 0) {
                disposicion = 'SKIP_CONFLICTO';
                motivo = 'D5_MAPEO_COLISION';
            } else {
                disposicion = 'CREATE';
                motivo = 'D5_CUARENTENA_SANEADA';
            }
            overridesFila.push(motivo);
        }

        if (mapeo?.origen === 'D1') {
            if (mapeo.invalida && disposicion !== 'CUARENTENA') {
                disposicion = 'CUARENTENA';
                motivo = 'D1_MAPEO_INVALIDO';
                overridesFila.push('D1_MAPEO_INVALIDO');
            }

            if (
                mapeo.colisiones.length > 0 &&
                disposicion === 'CREATE'
            ) {
                disposicion = 'SKIP_CONFLICTO';
                motivo = 'D1_MAPEO_COLISION';
                overridesFila.push('D1_MAPEO_COLISION');
            }
        }

        if (overridesFila.length > 0) {
            overridesAplicados += 1;
            for (const override of overridesFila) {
                registrarOverride(override, fila.fila);
            }
        }

        const referenciaFinal = mapeo
            ? mapeo.referenciaMapeada
            : fila.referencia;
        let importKeyFinal: string | null = null;
        let documentoPropuesto: DocumentoPropuesto | null = null;

        if (disposicion === 'CREATE') {
            if (!REFERENCIA_REGEX.test(referenciaFinal)) {
                throw new Error(
                    `Referencia CREATE inválida en fila ${fila.fila}: ${referenciaFinal}`
                );
            }
            importKeyFinal = computeImportKey(referenciaFinal);
            if (
                !mapeo &&
                fila.importKey &&
                fila.importKey !== importKeyFinal
            ) {
                throw new Error(
                    `import_key inconsistente en fila ${fila.fila}`
                );
            }
            documentoPropuesto = {
                referencia: referenciaFinal,
                descripcion: fila.descripcion,
                categoria: fila.categoria,
                referencias_alternativas: [
                    ...fila.referenciasAlternativas,
                ],
                aplica_a: [],
            };
        } else if (mapeo?.origen === 'D5' && mapeo) {
            importKeyFinal = computeImportKey(referenciaFinal);
        }

        if (d5) {
            d5.disposicion = disposicion;
            d5.importKey = d5.elegible ? computeImportKey(referenciaFinal) : null;
        }

        const claveCategoria = fila.categoria || 'CATEGORIA_AUSENTE';
        const categoria =
            categorias.get(claveCategoria) ??
            categoriaResumen(claveCategoria);
        categoria.total += 1;
        categoria[disposicion] += 1;
        categorias.set(claveCategoria, categoria);
        totales[disposicion] += 1;

        if (mapeo) {
            mapeoFilas.push({
                fila: fila.fila,
                origen: mapeo.origen,
                categoria: fila.categoria,
                referenciaCruda: fila.referenciaCruda,
                referenciaOriginal: mapeo.referenciaOriginal,
                referenciaMapeada: mapeo.referenciaMapeada,
                bucketOriginal: fila.referenciaBucket,
                motivoOriginal: fila.referenciaMotivo,
                reglas: mapeo.reglas,
                cambios: mapeo.cambios,
                colisiones: mapeo.colisiones,
                disposicion,
                motivo,
                importKeyOriginal: fila.importKey,
                importKey: importKeyFinal,
            });
        }

        resultado.push({
            fila: fila.fila,
            categoria: fila.categoria,
            referencia: referenciaFinal,
            referenciaOriginal: fila.referencia,
            referenciaCruda: fila.referenciaCruda,
            resultado: fila.resultado,
            disposicion,
            motivo,
            overrides: overridesFila,
            mapeo: mapeo
                ? {
                      origen: mapeo.origen,
                      aplicado: true,
                      reglas: mapeo.reglas,
                      cambios: mapeo.cambios,
                      colisiones: mapeo.colisiones,
                  }
                : null,
            importKeyOriginal: fila.importKey,
            importKey: importKeyFinal,
            documentoPropuesto,
        });
    }

    const parsed =
        totales.CREATE +
        totales.CENSAR +
        totales.EXCLUIR +
        totales.CUARENTENA +
        totales.SKIP_CONFLICTO;
    const total = filas.length;
    const residuo = total - (parsed + totales.OMITIDA);
    const parsedDelParser = filas.filter(
        (fila) => fila.resultado !== 'OMITIDA'
    ).length;
    const reconciliacion: 'PASS' | 'FAIL' =
        residuo === 0 && parsed === parsedDelParser ? 'PASS' : 'FAIL';

    const porCategoria = [...categorias.values()].sort(
        (a, b) =>
            b.total - a.total || a.categoria.localeCompare(b.categoria, 'es')
    );

    const mapeoD1 = mapeoFilas.filter((fila) => fila.origen === 'D1');
    const mapeoD5 = mapeoFilas.filter((fila) => fila.origen === 'D5');
    const resumenD1: ResumenMapeoOrigen = {
        filas: mapeoD1.length,
        conCambios: mapeoD1.filter((fila) => fila.cambios).length,
        sinCambios: mapeoD1.filter((fila) => !fila.cambios).length,
        colisiones: mapeoD1.filter((fila) => fila.colisiones.length > 0)
            .length,
    };
    const resumenD5 = crearResumenD5(
        [...mapeosD5.values()].map(
            (registro): MapeoCuarentenaFila => ({
                fila: registro.fila,
                categoria: registro.categoria,
                referenciaCruda: registro.referenciaCruda,
                referenciaOriginal: registro.referenciaOriginal,
                referenciaSanitizada: registro.referenciaSanitizada,
                reglas: registro.reglas,
                cambios: registro.cambios,
                invalida: registro.invalida,
                elegible: registro.elegible,
                motivo: registro.motivo,
                colisiones: registro.colisiones,
                disposicion: registro.disposicion,
                importKeyOriginal: registro.importKeyOriginal,
                importKey: registro.importKey,
            })
        )
    );

    const resumenMapeo: ResumenMapeo = {
        filas: mapeoFilas.length,
        conCambios: mapeoFilas.filter((fila) => fila.cambios).length,
        sinCambios: mapeoFilas.filter((fila) => !fila.cambios).length,
        colisiones: mapeoFilas.filter((fila) => fila.colisiones.length > 0)
            .length,
        d1: resumenD1,
        d5: resumenD5,
    };

    const overrides: OverrideGroup[] = [...overridesMap.entries()]
        .map(([motivo, filasMotivo]) => ({
            motivo,
            filas: [...filasMotivo].sort((a, b) => a - b),
            total: filasMotivo.length,
        }))
        .sort(
            (a, b) =>
                b.total - a.total || a.motivo.localeCompare(b.motivo, 'es')
        );

    const mapeoCuarentena = [...mapeosD5.values()]
        .map(
            (registro): MapeoCuarentenaFila => ({
                fila: registro.fila,
                categoria: registro.categoria,
                referenciaCruda: registro.referenciaCruda,
                referenciaOriginal: registro.referenciaOriginal,
                referenciaSanitizada: registro.referenciaSanitizada,
                reglas: registro.reglas,
                cambios: registro.cambios,
                invalida: registro.invalida,
                elegible: registro.elegible,
                motivo: registro.motivo,
                colisiones: registro.colisiones,
                disposicion: registro.disposicion,
                importKeyOriginal: registro.importKeyOriginal,
                importKey: registro.importKey,
            })
        )
        .sort((a, b) => a.fila - b.fila);

    return {
        filas: resultado,
        resumen: {
            total,
            parsed,
            CREATE: totales.CREATE,
            CENSAR: totales.CENSAR,
            EXCLUIR: totales.EXCLUIR,
            CUARENTENA: totales.CUARENTENA,
            SKIP_CONFLICTO: totales.SKIP_CONFLICTO,
            OMITIDA: totales.OMITIDA,
            residuo,
            reconciliacion,
            overridesAplicados,
            mapeo: resumenMapeo,
            porCategoria,
        },
        mapeo: mapeoFilas.sort(
            (a, b) => a.fila - b.fila || a.origen.localeCompare(b.origen)
        ),
        mapeoCuarentena,
        overrides,
    };
}

export function disposicionesValidas(): readonly DisposicionFinal[] {
    return DISPOSICIONES;
}
