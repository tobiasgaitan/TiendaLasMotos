import type { CrearConteoInput } from '@/lib/actions/inventario-schemas';
import {
    OUTBOX_DB_NAME,
    OUTBOX_DB_VERSION,
    type MimeFoto,
} from '../outbox-utils';

export const OUTBOX_DB = OUTBOX_DB_NAME;
export const OUTBOX_VERSION = OUTBOX_DB_VERSION;
export { EVENTO_OUTBOX } from '../outbox-utils';

export type EstadoEnvioOutbox = 'pendiente' | 'sincronizando' | 'error';

export type BorradorConteoPayload = Omit<CrearConteoInput, 'foto_url'> & {
    foto_url?: string;
};

export interface BorradorConteoOutbox {
    conteo_id: string;
    propietario_uid: string;
    payload: BorradorConteoPayload;
    intentos: number;
    estado_envio: EstadoEnvioOutbox;
    creado_en: number;
    actualizado_en: number;
    proximo_intento_en: number;
    ultimo_error: string;
}

export interface FotoBorradorOutbox {
    conteo_id: string;
    propietario_uid: string;
    blob: Blob;
    storage_path: string;
    nombre_archivo: string;
    mime_type: MimeFoto;
    tamano_bytes: number;
}

export type EntradaBorradorConteo = Omit<
    CrearConteoInput,
    | 'conteo_id'
    | 'foto_url'
    | 'storage_path'
    | 'nombre_archivo'
    | 'mime_type'
    | 'tamano_bytes'
>;

export interface ResultadoEncolar {
    conteo_id: string;
    storage_path: string;
}

export interface ResultadoSincronizacion {
    procesados: number;
    exitosos: number;
    fallidos: number;
    ultimoError: string | null;
}

export interface FotoPreparada {
    blob: Blob;
    mime_type: MimeFoto;
    nombre_archivo: string;
    tamano_bytes: number;
}
