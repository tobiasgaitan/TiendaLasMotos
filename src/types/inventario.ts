/**
 * WEB-038 — Contratos del inventario de repuestos.
 *
 * NAMING LOCK: estas llaves son inmutables. Cualquier cambio debe pasar por
 * revisión explícita y migración de datos.
 */
import type { Timestamp } from 'firebase/firestore';

export const ESTADOS_CONTEO = [
    'pendiente_revision',
    'aprobado',
    'rechazado',
] as const;

export type EstadoConteo = (typeof ESTADOS_CONTEO)[number];

export interface ConteoPendiente {
    referencia_sugerida: string;
    referencia_confirmada: string;
    descripcion: string;
    cantidad_contada: number;
    ubicacion: string;
    anotaciones: string;
    foto_url: string;
    estado: EstadoConteo;
    motivo_rechazo: string;
    asesor_email: string;
    asesor_uid: string;
    creado_en: Timestamp;
    revisado_por: string;
    revisado_en: Timestamp | null;
}

export interface InventarioRepuesto {
    referencia: string;
    sede_id: string;
    descripcion: string;
    fabricante: string;
    aplica_a: string[];
    categoria: string;
    precio: number;
    ubicacion: string;
    stock: number;
    stock_minimo: number;
    imagen_url: string;
    creado_por: string;
    creado_en: Timestamp;
    actualizado_por: string;
    actualizado_en: Timestamp;
}

export interface SedeOpcion {
    id: string;
    name: string;
    department: string;
}

export interface ListarSedesResult {
    success: boolean;
    message?: string;
    sedes: SedeOpcion[];
}

export interface FotoInventario {
    conteo_id: string;
    asesor_email: string;
    asesor_uid: string;
    foto_url: string;
    storage_path: string;
    nombre_archivo: string;
    mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
    tamano_bytes: number;
    etiquetas_vision: string[];
    creado_en: Timestamp;
}

export interface HistorialAuditoriaInventario {
    coleccion_afectada:
        | 'inventario_repuestos'
        | 'conteos_pendientes_repuestos'
        | 'fotos_inventario';
    documento_id: string;
    referencia: string | null;
    conteo_id: string | null;
    operacion: 'CREATE' | 'UPDATE';
    datos_anteriores: Record<string, unknown> | null;
    datos_nuevos: Record<string, unknown> | null;
    campos_modificados: string[];
    registrado_por: string;
    registrado_por_email: string;
    creado_en: Timestamp;
    version: 1;
}

export interface InventarioActionResult {
    success: boolean;
    message?: string;
    id?: string;
    idempotente?: boolean;
}

export type PendienteDTO = Omit<
    ConteoPendiente,
    'creado_en' | 'revisado_en'
> & {
    id: string;
    creado_en: string;
    revisado_en: string | null;
};

export interface ListarPendientesResult {
    success: boolean;
    message?: string;
    pendientes: PendienteDTO[];
}

export interface VisionSugerencia {
    etiqueta: string;
    score: number;
}

export interface VisionUnidad {
    etiqueta: string;
    score: number;
    cantidad: number;
}

export interface RepuestoCandidato {
    referencia: string;
    descripcion: string;
    fabricante: string;
    categoria: string;
    stock: number;
    score: number;
    coincidencias: string[];
}

export type VisionResult =
    | {
          success: true;
          etiquetas: string[];
          sugerencias: VisionSugerencia[];
          unidades: VisionUnidad[];
      }
    | {
          success: false;
          message: string;
      };

export interface BuscarCandidatosResult {
    success: boolean;
    message?: string;
    candidatos: RepuestoCandidato[];
    total?: number;
}

export interface ObtenerRepuestoResult {
    success: boolean;
    message?: string;
    existe: boolean;
}
