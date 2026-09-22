import { Timestamp } from "firebase/firestore";

/**
 * Módulo de Gestión de Créditos (Fase 8) — Contratos de datos.
 * NAMING LOCK: prohibido renombrar colecciones o claves canónicas.
 * Las 6 colecciones del módulo: clientes_credito, creditos, historial_auditoria,
 * pagos_inversores, pagos_y_multas, remisiones_dinero.
 * sys_admin_users queda FUERA del alcance del módulo.
 */

/**
 * Base auditable exacta dictada por NAMING LOCK (9 campos, ni uno más ni uno menos).
 * Nota: el `id` (docId Firestore) NO pertenece a esta interfaz; se adjunta en
 * lectura con `{ id: doc.id, ...data }` (patrón admin/config).
 */
export interface BaseAuditable {
    registrado_por: string;
    registrado_por_email?: string;
    actualizado_por?: string;
    created_at: Timestamp;
    updated_at: Timestamp;
    activo: boolean;
    motivo_baja?: string;
    fecha_baja?: Timestamp;
    baja_por?: string;
}

// NAMING LOCK FÍSICO — evidencia consola Firestore tiendalasmotos/nam5 2026-09-22
// doc XSh6FVoyUGKrfMkCFnvR. Claves inmutables: cedula, nombres, celular,
// direccion, fecha_registro. `cedula` es la clave de número de documento
// (prohibido numero_documento). `fecha_registro` es el SSOT de registro:
// `created_at` NO aplica aquí (prohibida doble fuente de verdad).
export interface ClienteCredito extends Omit<BaseAuditable, 'created_at'> {
    // -- Claves canónicas inmutables --
    cedula: string;
    nombres: string;
    celular: string;
    direccion: string;
    fecha_registro: Timestamp;
    // -- Extensiones SOLO aditivas (nunca sustitutivas) --
    tipo_documento?: 'CC' | 'CE' | 'NIT' | 'PPT';
    apellidos?: string;
    email?: string;
    ciudad?: string;
}

export interface Credito extends BaseAuditable {
    numero_credito: string; // Formato CRE-YYYY-XXXX
    cliente_id: string;
    moto_id: string;
    entidad_financiera_id?: string;
    sede_id?: string;
    valor_moto: number;
    cuota_inicial: number;
    capital_financiado: number;
    tasa_interes_mensual: number;
    plazo_meses: number;
    cuota_mensual: number;
    estado: 'SOLICITADO' | 'APROBADO' | 'DESEMBOLSADO' | 'ACTIVO' | 'PAGADO' | 'MOROSO' | 'RECHAZADO' | 'ANULADO';
    fecha_solicitud: Timestamp;
    fecha_aprobacion?: Timestamp;
    fecha_desembolso?: Timestamp;
    saldo_capital?: number;
}

export interface PagoInversor extends BaseAuditable {
    credito_id: string;
    inversionista_id: string;
    monto: number;
    fecha_pago: Timestamp;
    metodo_pago: 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO';
    referencia?: string;
    estado: 'PENDIENTE' | 'PAGADO' | 'ANULADO';
}

export interface PagoYMulta extends BaseAuditable {
    credito_id: string;
    tipo: 'PAGO' | 'MULTA';
    monto: number;
    fecha: Timestamp;
    metodo_pago?: 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'PSE';
    motivo?: string; // Obligatorio cuando tipo === 'MULTA' (validado en 08-04)
    referencia?: string;
    estado: 'PENDIENTE' | 'APLICADO' | 'ANULADO';
}

export interface RemisionDinero extends BaseAuditable {
    origen: string;
    destino: string;
    monto: number;
    fecha_remision: Timestamp;
    metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO';
    comprobante_url?: string;
    responsable_recepcion?: string;
    estado: 'PENDIENTE' | 'ENVIADO' | 'RECIBIDO' | 'ANULADO';
}

export type OperacionAuditoria = 'CREATE' | 'UPDATE' | 'SOFT_DELETE';

/**
 * Ledger inmutable de trazabilidad (append-only, standalone: sin updated_at,
 * sin activo). Solo se escribe vía Server Actions con Admin SDK.
 */
export interface HistorialAuditoria {
    coleccion_afectada: string;
    documento_id: string;
    operacion: OperacionAuditoria;
    datos_anteriores: Record<string, unknown> | null;
    datos_nuevos: Record<string, unknown> | null;
    campos_modificados: string[];
    registrado_por: string;
    registrado_por_email?: string;
    created_at: Timestamp;
    version: 1;
}

/**
 * MATRIZ DE OPERACIONES PERMITIDAS POR COLECCIÓN (auditoría):
 * - creditos: Create / Read / Update + baja lógica. Delete físico PROHIBIDO.
 * - clientes_credito: Create / Read / Update + baja lógica. Delete físico PROHIBIDO.
 * - pagos_inversores: Create / Read / Update + baja lógica. Delete físico PROHIBIDO.
 * - pagos_y_multas: Create / Read / Update + baja lógica. Delete físico PROHIBIDO.
 * - remisiones_dinero: Create / Read / Update + baja lógica. Delete físico PROHIBIDO.
 * - historial_auditoria: Append (solo Server Action) / Read autenticado.
 *   Update y Delete PROHIBIDOS (ledger inmutable).
 * - sys_admin_users: FUERA del alcance del módulo.
 */
