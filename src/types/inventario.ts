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

export const UNIDADES_MEDIDA = ['unidad', 'litro'] as const;

export type UnidadMedida = (typeof UNIDADES_MEDIDA)[number];

export interface ConteoPendiente {
    referencia_sugerida: string;
    referencia_confirmada: string;
    inventario_documento_id: string;
    sede_id: string;
    descripcion: string;
    cantidad_contada: number;
    precio_etiqueta_fisica: number | null;
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
    sede_id?: string;
    descripcion: string;
    fabricante: string;
    aplica_a: string[];
    categoria: string;
    unidad_medida: UnidadMedida;
    precio: number;
    ubicacion?: string;
    stock: number;
    stock_minimo: number;
    referencias_alternativas: string[];
    imagen_url: string;
    /** WEB-INV-049 — URLs HTTPS canónicas de Firebase Storage (máx. 5). */
    imagenes_referencia?: string[];
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
    cantidad_sugerida_multimodal?: number | null;
    justificacion_multimodal?: string | null;
    confidence_multimodal?: number | null;
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
    operacion: 'CREATE' | 'UPDATE' | 'DELETE';
    datos_anteriores: Record<string, unknown> | null;
    datos_nuevos: Record<string, unknown> | null;
    campos_modificados: string[];
    registrado_por: string;
    registrado_por_email: string;
    creado_en: Timestamp;
    version: 1;
}

export type InventarioActionCodigo = 'FK_CONTEOS';

export interface InventarioActionResult {
    success: boolean;
    message?: string;
    id?: string;
    idempotente?: boolean;
    codigo?: InventarioActionCodigo;
}

export type PendienteDTO = Omit<
    ConteoPendiente,
    'creado_en' | 'revisado_en'
> & {
    id: string;
    sede_nombre: string;
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
    documento_id: string;
    referencia: string;
    referencias_alternativas: string[];
    descripcion: string;
    fabricante: string;
    categoria: string;
    aplica_a: string[];
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

export type VisionConteoMotivo =
    | 'imagen_saturada'
    | 'unidades_superpuestas'
    | 'iluminacion_deficiente'
    | 'angulo_no_adecuado'
    | 'imagen_borrosa'
    | 'objeto_no_visible'
    | 'confianza_baja'
    | 'otro';

export interface VisionConteoData {
    cantidad_sugerida_multimodal: number | null;
    justificacion_multimodal: string | null;
    confidence_multimodal: number | null;
    puede_contar: boolean;
    motivo_no_conteo: VisionConteoMotivo | null;
    saturada: boolean;
}

export type VisionConteoResult =
    | {
          success: true;
          conteo: VisionConteoData;
      }
    | {
          success: false;
          message: string;
      };

/**
 * WEB-INV-050 — Matching visual on-demand foto-vs-referencia.
 * Aditivo: no modifica VisionConteoData ni el conteo.
 */
export type MatchingVisualEstado =
    | 'coincide'
    | 'no_coincide'
    | 'sin_referencia'
    | 'timeout'
    | 'error';

export interface MatchingVisualPar {
    documento_id: string;
    referencia: string;
    estado: MatchingVisualEstado;
    coincide: boolean;
    confianza: number;
    justificacion: string;
    latencia_ms: number;
}

export interface MatchingVisualResult {
    success: boolean;
    disponible: boolean;
    modelo: string | null;
    mejor: MatchingVisualPar | null;
    pares: MatchingVisualPar[];
    message?: string;
    latencia_ms: number;
}

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
