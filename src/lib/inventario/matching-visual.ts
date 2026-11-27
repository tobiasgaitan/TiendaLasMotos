/**
 * WEB-INV-050 — Cliente puro de matching visual on-demand.
 *
 * Compara la foto del asesor (A) contra una imagen de referencia del catálogo
 * (B) con el mismo modelo multimodal ya configurado. No importa Firestore,
 * React ni Next; la Server Action valida URLs/actores y persiste la auditoría.
 */

import {
    OPENROUTER_ENDPOINT,
    VISION_MULTIMODAL_MODELO_REGEX,
    extraerJsonVisionMultimodal,
    extraerTextoVisionMultimodal,
} from '@/lib/vision-client';
import type {
    MatchingVisualEstado,
    MatchingVisualPar,
} from '@/types/inventario';

export const MATCHING_VISUAL_PROMPT =
    'Dada la imagen A (foto del asesor) y la imagen B (foto de referencia del catálogo), ¿muestran el mismo repuesto de motocicleta? Responde JSON: { coincide: boolean, confianza: number, justificacion: string }';

export const VISION_MATCHING_TIMEOUT_MS = 2_800;
export const VISION_MATCHING_MAX_TOKENS = 400;
export const VISION_MATCHING_CONFIANZA_ALERTA = 0.6;
export const MATCHING_VISUAL_MAX_CANDIDATOS = 3;
export const MATCHING_VISUAL_MAX_JUSTIFICACION = 300;

export interface OpcionesMatchingVisual {
    apiKey: string;
    modelo: string;
    urlA: string;
    urlB: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}

export interface ResultadoMatchingVisual {
    estado: MatchingVisualEstado;
    coincide: boolean;
    confianza: number;
    justificacion: string;
    latencia_ms: number;
    message?: string;
}

export interface RegistroAuditoriaMatching {
    estado: MatchingVisualEstado;
    latencia_ms: number;
    documento_id?: string | null;
    referencia?: string | null;
    foto_storage_path?: string | null;
    asesor_email?: string | null;
}

export interface ResumenAuditoriaMatching {
    total: number;
    coincide: number;
    noCoincide: number;
    sinReferencia: number;
    timeout: number;
    error: number;
    tasaCoincidencia: number;
    medianaLatenciaMs: number;
    p95LatenciaMs: number;
    fotosUnicas: number;
    asesoresUnicos: number;
    referenciasTop: Array<{ referencia: string; total: number }>;
}

function esObjeto(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function limpiarTexto(value: unknown): string {
    if (typeof value !== 'string') return '';
    let limpio = '';
    for (const caracter of value) {
        const codigo = caracter.codePointAt(0);
        if (codigo !== undefined && (codigo < 32 || codigo === 127)) {
            limpio += ' ';
        } else {
            limpio += caracter;
        }
    }
    return limpio
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MATCHING_VISUAL_MAX_JUSTIFICACION)
        .trim();
}

function normalizarBooleano(value: unknown): boolean | null {
    if (value === true) return true;
    if (value === false) return false;
    if (typeof value === 'string') {
        const texto = value.trim().toLowerCase();
        if (texto === 'true' || texto === '1' || texto === 'si' || texto === 'sí') {
            return true;
        }
        if (texto === 'false' || texto === '0' || texto === 'no') {
            return false;
        }
    }
    return null;
}

function normalizarConfianza(value: unknown): number | null {
    let numero: number;
    if (typeof value === 'number') {
        numero = value;
    } else if (typeof value === 'string' && value.trim() !== '') {
        numero = Number(value);
    } else {
        return null;
    }
    if (!Number.isFinite(numero)) return null;
    if (numero > 1 && numero <= 100) {
        numero = numero / 100;
    }
    if (numero < 0 || numero > 1) return null;
    return numero;
}

/**
 * Normaliza la salida del modelo. Devuelve null si no hay contrato mínimo
 * (coincide booleano + confianza válida).
 */
export function normalizarMatchingVisual(
    raw: unknown
): { coincide: boolean; confianza: number; justificacion: string } | null {
    if (!esObjeto(raw)) return null;

    const coincide = normalizarBooleano(raw.coincide);
    const confianza = normalizarConfianza(raw.confianza);
    if (coincide === null || confianza === null) return null;

    return {
        coincide,
        confianza,
        justificacion: limpiarTexto(raw.justificacion),
    };
}

export function construirPayloadMatchingVisual(
    modelo: string,
    urlA: string,
    urlB: string
): Record<string, unknown> {
    return {
        model: modelo,
        messages: [
            {
                role: 'system',
                content: MATCHING_VISUAL_PROMPT,
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'Compara ambas imágenes y devuelve solo el JSON del esquema.',
                    },
                    {
                        type: 'image_url',
                        image_url: { url: urlA },
                    },
                    {
                        type: 'image_url',
                        image_url: { url: urlB },
                    },
                ],
            },
        ],
        temperature: 0,
        max_tokens: VISION_MATCHING_MAX_TOKENS,
        // z-ai/glm-5.3-flash es un modelo de razonamiento; se acota igual que
        // en el conteo para respetar el presupuesto de 3 s.
        reasoning_effort: 'minimal',
        provider: {
            data_collection: 'deny',
            allow_fallbacks: true,
        },
    };
}

function mensajeHttp(status: number): string {
    if (status === 401 || status === 403) {
        return 'El matching visual no está autorizado.';
    }
    if (status === 402) {
        return 'El matching visual no tiene saldo disponible.';
    }
    if (status === 429) {
        return 'El matching visual está ocupado.';
    }
    if (status >= 500) {
        return 'El matching visual no está disponible.';
    }
    return 'No se pudo obtener el matching visual.';
}

function esErrorTimeout(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return (
        error.name === 'TimeoutError' ||
        error.name === 'AbortError' ||
        /timeout|abort/i.test(error.message)
    );
}

/**
 * Llama a OpenRouter y devuelve un resultado tipado. Nunca lanza: timeout y
 * errores se representan como estados para que el conteo siga disponible.
 */
export async function analizarMatchingVisual(
    opciones: OpcionesMatchingVisual
): Promise<ResultadoMatchingVisual> {
    const inicio = performance.now();
    const terminar = (
        estado: MatchingVisualEstado,
        extra: Partial<ResultadoMatchingVisual> = {}
    ): ResultadoMatchingVisual => ({
        estado,
        coincide: false,
        confianza: 0,
        justificacion: '',
        latencia_ms: Math.max(0, Math.round(performance.now() - inicio)),
        ...extra,
    });

    const apiKey =
        typeof opciones.apiKey === 'string' ? opciones.apiKey.trim() : '';
    const modelo =
        typeof opciones.modelo === 'string' ? opciones.modelo.trim() : '';
    if (!apiKey) {
        return terminar('error', {
            message: 'La visión multimodal no está configurada.',
        });
    }
    if (!modelo || !VISION_MULTIMODAL_MODELO_REGEX.test(modelo)) {
        return terminar('error', {
            message: 'El modelo de matching visual no está configurado.',
        });
    }
    if (!opciones.urlA || !opciones.urlB) {
        return terminar('error', {
            message: 'Faltan las imágenes para comparar.',
        });
    }

    const fetchImpl = opciones.fetchImpl ?? fetch;
    const timeoutMs =
        typeof opciones.timeoutMs === 'number' &&
        Number.isFinite(opciones.timeoutMs) &&
        opciones.timeoutMs > 0
            ? opciones.timeoutMs
            : VISION_MATCHING_TIMEOUT_MS;

    try {
        const respuesta = await fetchImpl(OPENROUTER_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://tiendalasmotos.com',
                'X-Title': 'Tienda Las Motos - Matching visual',
            },
            body: JSON.stringify(
                construirPayloadMatchingVisual(modelo, opciones.urlA, opciones.urlB)
            ),
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (!respuesta.ok) {
            return terminar('error', {
                message: mensajeHttp(respuesta.status),
            });
        }

        const payload = (await respuesta.json()) as unknown;
        const texto = extraerTextoVisionMultimodal(payload);
        if (!texto) {
            return terminar('error', {
                message: 'El matching visual devolvió una respuesta vacía.',
            });
        }

        const json = extraerJsonVisionMultimodal(texto);
        const normalizado = normalizarMatchingVisual(json);
        if (!normalizado) {
            return terminar('error', {
                message: 'El matching visual devolvió un JSON inválido.',
            });
        }

        return terminar(
            normalizado.coincide ? 'coincide' : 'no_coincide',
            {
                coincide: normalizado.coincide,
                confianza: normalizado.confianza,
                justificacion: normalizado.justificacion,
            }
        );
    } catch (error) {
        if (esErrorTimeout(error)) {
            return terminar('timeout', {
                message: 'El matching visual superó el tiempo máximo.',
            });
        }
        return terminar('error', {
            message:
                error instanceof Error
                    ? error.message
                    : 'Error desconocido en matching visual.',
        });
    }
}

/**
 * Elige el par con mayor confianza entre los que declararon coincidencia.
 * Tie-break: documento_id ascendente para ser determinista.
 */
export function seleccionarMejorMatching(
    pares: readonly MatchingVisualPar[]
): MatchingVisualPar | null {
    const candidatos = pares.filter(
        (par) =>
            par.estado === 'coincide' &&
            Number.isFinite(par.confianza) &&
            par.confianza >= 0 &&
            par.confianza <= 1
    );
    if (candidatos.length === 0) return null;

    return [...candidatos].sort((a, b) => {
        if (b.confianza !== a.confianza) return b.confianza - a.confianza;
        return a.documento_id.localeCompare(b.documento_id, 'en');
    })[0];
}

function percentil(valores: number[], p: number): number {
    if (valores.length === 0) return 0;
    const ordenados = [...valores].sort((a, b) => a - b);
    const indice = Math.min(
        ordenados.length - 1,
        Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1)
    );
    return ordenados[indice];
}

export function agregarAuditoriaSemanal(
    registros: readonly RegistroAuditoriaMatching[]
): ResumenAuditoriaMatching {
    const total = registros.length;
    const conteoEstado = (estado: MatchingVisualEstado): number =>
        registros.filter((registro) => registro.estado === estado).length;

    const latencias = registros
        .map((registro) => registro.latencia_ms)
        .filter(
            (latencia): latencia is number =>
                typeof latencia === 'number' && Number.isFinite(latencia)
        );

    const fotos = new Set<string>();
    const asesores = new Set<string>();
    const referencias = new Map<string, number>();

    for (const registro of registros) {
        if (
            typeof registro.foto_storage_path === 'string' &&
            registro.foto_storage_path.trim()
        ) {
            fotos.add(registro.foto_storage_path);
        }
        if (
            typeof registro.asesor_email === 'string' &&
            registro.asesor_email.trim()
        ) {
            asesores.add(registro.asesor_email.toLowerCase());
        }
        if (
            typeof registro.referencia === 'string' &&
            registro.referencia.trim()
        ) {
            const referencia = registro.referencia.trim().toUpperCase();
            referencias.set(referencia, (referencias.get(referencia) ?? 0) + 1);
        }
    }

    return {
        total,
        coincide: conteoEstado('coincide'),
        noCoincide: conteoEstado('no_coincide'),
        sinReferencia: conteoEstado('sin_referencia'),
        timeout: conteoEstado('timeout'),
        error: conteoEstado('error'),
        tasaCoincidencia: total > 0 ? conteoEstado('coincide') / total : 0,
        medianaLatenciaMs: percentil(latencias, 50),
        p95LatenciaMs: percentil(latencias, 95),
        fotosUnicas: fotos.size,
        asesoresUnicos: asesores.size,
        referenciasTop: [...referencias.entries()]
            .map(([referencia, count]) => ({ referencia, total: count }))
            .sort((a, b) => {
                if (b.total !== a.total) return b.total - a.total;
                return a.referencia.localeCompare(b.referencia, 'en');
            })
            .slice(0, 10),
    };
}
