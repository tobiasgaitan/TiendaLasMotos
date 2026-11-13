import type { VisionSugerencia, VisionUnidad } from '@/types/inventario';

/**
 * WEB-038 — Utilidades puras de Google Cloud Vision.
 *
 * Este archivo NO lleva 'use server' y no importa SDKs. Puede usarse tanto en
 * la Server Action como en tests o en la UI para mapear etiquetas a categorías.
 */

export const VISION_SCORE_MINIMO = 0.60;
export const VISION_MAX_ETIQUETAS = 10;
export const VISION_MAX_BYTES = 5 * 1024 * 1024;
export const VISION_OBJECT_MAX_RESULTS = 10;

export const MIME_VISION_PERMITIDOS = [
    'image/jpeg',
    'image/png',
    'image/webp',
] as const;

export const MAPA_CATEGORIAS: Readonly<Record<string, string>> = Object.freeze({
    tire: 'LLANTAS',
    'automotive tire': 'LLANTAS',
    brake: 'FRENOS',
    'vehicle brake': 'FRENOS',
    battery: 'BATERIAS',
    'car battery': 'BATERIAS',
    'motor oil': 'ACEITES',
    oil: 'ACEITES',
    'air filter': 'FILTROS',
    'spark plug': 'ENCENDIDO',
    'shock absorber': 'SUSPENSION',
    chain: 'TRANSMISION',
    sprocket: 'TRANSMISION',
    helmet: 'ACCESORIOS',
});

export function normalizarMimeVision(raw: string | null): string {
    if (!raw) return '';
    return raw.split(';')[0].trim().toLowerCase();
}

export function esMimeVisionPermitido(raw: string | null): boolean {
    const mime = normalizarMimeVision(raw);
    return (MIME_VISION_PERMITIDOS as readonly string[]).includes(mime);
}

export function esTamanoImagenPermitido(bytes: number): boolean {
    return (
        typeof bytes === 'number' &&
        Number.isFinite(bytes) &&
        bytes > 0 &&
        bytes <= VISION_MAX_BYTES
    );
}

export function categoriaDesdeEtiqueta(etiqueta: string): string | null {
    const clave = etiqueta.trim().toLowerCase();
    if (!clave) return null;
    if (!Object.prototype.hasOwnProperty.call(MAPA_CATEGORIAS, clave)) {
        return null;
    }
    return MAPA_CATEGORIAS[clave];
}

export function categoriaSugerida(etiquetas: readonly string[]): string | null {
    for (const etiqueta of etiquetas) {
        const categoria = categoriaDesdeEtiqueta(etiqueta);
        if (categoria) return categoria;
    }
    return null;
}

function limpiarEtiqueta(value: string): string {
    let limpio = '';
    for (const caracter of value) {
        const codigo = caracter.codePointAt(0);
        if (codigo !== undefined && (codigo < 32 || codigo === 127)) {
            limpio += ' ';
        } else {
            limpio += caracter;
        }
    }
    return limpio.trim().replace(/\s+/g, ' ').slice(0, 80).trim();
}

interface LabelVision {
    description?: unknown;
    score?: unknown;
}

/**
 * Filtra scores < 0.60, normaliza, deduplica por etiqueta (case-insensitive),
 * ordena por score descendente y devuelve como máximo 10 sugerencias.
 */
export function sanitizarEtiquetasVision(
    labels: unknown
): VisionSugerencia[] {
    if (!Array.isArray(labels)) return [];

    const porEtiqueta = new Map<string, VisionSugerencia>();

    for (const item of labels) {
        if (!item || typeof item !== 'object') continue;

        const label = item as LabelVision;
        if (typeof label.description !== 'string') continue;
        if (
            typeof label.score !== 'number' ||
            !Number.isFinite(label.score) ||
            label.score < VISION_SCORE_MINIMO
        ) {
            continue;
        }

        const etiqueta = limpiarEtiqueta(label.description);
        if (!etiqueta) continue;

        const clave = etiqueta.toLowerCase();
        const previa = porEtiqueta.get(clave);
        if (!previa || label.score > previa.score) {
            porEtiqueta.set(clave, { etiqueta, score: label.score });
        }
    }

    return Array.from(porEtiqueta.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, VISION_MAX_ETIQUETAS);
}

interface ObjetoVision {
    name?: unknown;
    score?: unknown;
}

/**
 * Agrupa `localizedObjectAnnotations` por nombre y cuenta instancias.
 * No suma etiquetas distintas: cada unidad representa objetos detectados con
 * el mismo nombre. La cantidad es una estimación para que el asesor confirme.
 */
export function sanitizarObjetosVision(objetos: unknown): VisionUnidad[] {
    if (!Array.isArray(objetos)) return [];

    const porEtiqueta = new Map<string, VisionUnidad>();

    for (const item of objetos) {
        if (!item || typeof item !== 'object') continue;

        const objeto = item as ObjetoVision;
        if (typeof objeto.name !== 'string') continue;
        if (
            typeof objeto.score !== 'number' ||
            !Number.isFinite(objeto.score) ||
            objeto.score < VISION_SCORE_MINIMO
        ) {
            continue;
        }

        const etiqueta = limpiarEtiqueta(objeto.name);
        if (!etiqueta) continue;

        const clave = etiqueta.toLowerCase();
        const previa = porEtiqueta.get(clave);
        if (previa) {
            previa.cantidad += 1;
            if (objeto.score > previa.score) {
                previa.score = objeto.score;
            }
        } else {
            porEtiqueta.set(clave, {
                etiqueta,
                score: objeto.score,
                cantidad: 1,
            });
        }
    }

    return Array.from(porEtiqueta.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, VISION_MAX_ETIQUETAS);
}

/**
 * Une etiquetas de label detection y nombres de object localization,
 * deduplicando por texto normalizado y limitando el resultado canónico.
 */
export function combinarEtiquetas(
    ...listas: readonly (readonly string[])[]
): string[] {
    const porClave = new Map<string, string>();

    for (const lista of listas) {
        for (const valor of lista) {
            const etiqueta = limpiarEtiqueta(valor);
            if (!etiqueta) continue;
            const clave = etiqueta.toLowerCase();
            if (!porClave.has(clave)) {
                porClave.set(clave, etiqueta);
            }
            if (porClave.size >= VISION_MAX_ETIQUETAS) {
                return Array.from(porClave.values());
            }
        }
    }

    return Array.from(porClave.values());
}
