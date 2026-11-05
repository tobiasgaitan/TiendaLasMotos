/**
 * WEB-038 — Utilidades puras del outbox offline.
 *
 * Sin IndexedDB, sin Firebase y sin React: se pueden probar en Node.
 */

export const OUTBOX_DB_NAME = 'tlm_offline';
export const OUTBOX_DB_VERSION = 2;
export const OUTBOX_STORE_BORRADORES = 'borradores_conteos';
export const OUTBOX_STORE_FOTOS = 'fotos_borrador';
export const EVENTO_OUTBOX = 'tlm-offline-outbox-changed';

export const MAX_FOTO_BYTES = 5 * 1024 * 1024;
export const MAX_FOTO_COMPRIMIDA_BYTES = 1.5 * 1024 * 1024;
export const MAX_BACKOFF_MS = 5 * 60 * 1000;
export const STALE_SINCRONIZANDO_MS = 60 * 1000;

export const MIMES_FOTO = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type MimeFoto = (typeof MIMES_FOTO)[number];

export interface FotoSubida {
    foto_url: string;
    storage_path: string;
    nombre_archivo: string;
    mime_type: MimeFoto;
    tamano_bytes: number;
}

export interface OpcionesEncolarConteo {
    conteoId?: string;
    fotoSubida?: FotoSubida;
}

export interface RegistroConPropietario {
    propietario_uid?: unknown;
}

/**
 * Solo un registro con propietario_uid string no vacío e igual al uid
 * consultado pertenece a ese propietario. Cualquier registro legado sin
 * propietario queda fuera.
 */
export function esBorradorDePropietario(
    registro: RegistroConPropietario,
    uid: string
): boolean {
    const uidCanon = typeof uid === 'string' ? uid.trim() : '';
    if (!uidCanon) {
        console.error('[offline] esBorradorDePropietario: uid vacío.');
        return false;
    }

    const propietario = registro.propietario_uid;
    if (typeof propietario !== 'string' || !propietario.trim()) {
        return false;
    }

    return propietario.trim() === uidCanon;
}

/**
 * Filtro defensivo adicional al índice de IndexedDB. Nunca deja pasar
 * registros sin propietario ni registros de otro uid.
 */
export function filtrarPorPropietario<T extends RegistroConPropietario>(
    registros: T[],
    uid: string
): T[] {
    const uidCanon = typeof uid === 'string' ? uid.trim() : '';
    if (!uidCanon) {
        const error = new Error(
            'No se puede filtrar el outbox sin un uid válido.'
        );
        console.error('[offline] filtrarPorPropietario:', error);
        throw error;
    }

    return registros.filter((registro) =>
        esBorradorDePropietario(registro, uidCanon)
    );
}

export function esMimeFotoPermitido(value: string): value is MimeFoto {
    return (MIMES_FOTO as readonly string[]).includes(value);
}

export function extensionDesdeMime(mime: MimeFoto): 'jpg' | 'png' | 'webp' {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'jpg';
}

export function generarConteoId(): string {
    if (
        typeof globalThis.crypto === 'undefined' ||
        typeof globalThis.crypto.randomUUID !== 'function'
    ) {
        const error = new Error(
            'crypto.randomUUID no está disponible en este navegador.'
        );
        console.error('[offline] No se pudo generar conteo_id:', error);
        throw error;
    }
    return globalThis.crypto.randomUUID();
}

/** Validación pura del UUID que viaja por Storage, Vision y Firestore. */
export function esUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value.trim()
    );
}

export function construirStoragePath(
    asesorEmail: string,
    conteoId: string,
    mime: MimeFoto
): string {
    const email = asesorEmail.trim().toLowerCase();
    if (!email) {
        const error = new Error('El email del asesor está vacío.');
        console.error('[offline] No se pudo construir storage_path:', error);
        throw error;
    }
    return `inventario_repuestos/${email}/${conteoId}.${extensionDesdeMime(mime)}`;
}

export function normalizarNombreArchivo(
    nombre: string,
    conteoId: string,
    mime: MimeFoto
): string {
    const limpio = nombre
        .trim()
        .replace(/[^a-zA-Z0-9._ -]+/g, '_')
        .replace(/\s+/g, ' ')
        .slice(0, 180)
        .trim();

    if (!limpio) {
        return `${conteoId}.${extensionDesdeMime(mime)}`;
    }
    return limpio;
}

/**
 * Backoff exponencial con techo de 5 minutos.
 * intentos=1 → 2s, intentos=2 → 4s, ... intentos>=8 → 300s.
 */
export function calcularBackoffMs(intentos: number): number {
    const intento = Number.isFinite(intentos) ? Math.max(1, Math.floor(intentos)) : 1;
    return Math.min(2 ** intento * 1000, MAX_BACKOFF_MS);
}

/**
 * Allowlist de navegación del service worker. No debe ampliarse sin revisar
 * el riesgo de cachear HTML autenticado de otras rutas.
 */
export function esRutaInventario(pathname: string): boolean {
    // Allowlist estricta: no cachear subrutas de inventario que puedan
    // contener PII de otro contexto. La ruta canónica del PWA es la
    // pantalla de conteo del asesor.
    return (
        pathname === '/admin/inventario-asesor' ||
        pathname === '/admin/inventario-asesor/'
    );
}

export function esBorradorSincronizable(
    estado_envio: string,
    actualizado_en: number,
    proximo_intento_en: number,
    ahora: number,
    respetarBackoff: boolean
): boolean {
    if (respetarBackoff && proximo_intento_en > ahora) return false;

    if (
        estado_envio === 'sincronizando' &&
        ahora - actualizado_en < STALE_SINCRONIZANDO_MS
    ) {
        return false;
    }

    return true;
}
