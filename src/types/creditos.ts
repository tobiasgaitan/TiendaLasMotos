import { Timestamp } from "firebase/firestore";

/**
 * Módulo de Gestión de Créditos y Renting — Fase 9.
 *
 * ESQUEMA CANÓNICO (NAMING LOCK desde 09-01):
 * - Nombres de campo = Documento de Negocio Fase 9 verbatim.
 * - OVERRIDE QWEN #1: colección `clientes_credito` (NO `clientes`); 5 claves inmutables.
 * - OVERRIDE QWEN #2: auditoría = `registrado_por` (NO `uid_responsable`).
 * - OVERRIDE QWEN #4: `historial_auditoria` append-only, escrito SOLO con `add()`.
 * - El docId de Firestore NO pertenece a las interfaces; se adjunta en lectura
 *   con `{ id: d.id, ...d.data() }` (patrón `src/app/admin/config/page.tsx:45`).
 */

// ==========================================
// 1. Base auditable (9 campos exactos)
// ==========================================

export interface BaseAuditable {
    // registrado_por = OVERRIDE QWEN #2 (uid verificado por verifyIdToken)
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

// ==========================================
// 2. clientes_credito (NAMING LOCK físico)
// ==========================================

// NAMING LOCK — colección clientes_credito (OVERRIDE QWEN #1)
export interface ClienteCredito extends Omit<BaseAuditable, 'created_at'> {
    // 5 claves canónicas inmutables. cedula = clave de número de documento;
    // PROHIBIDO numero_documento/tipo_documento como sustitutos.
    cedula: string;
    nombres: string;
    celular: string;
    direccion: string;
    // fecha_registro = SSOT de registro de negocio. created_at NO aplica aquí
    // (prohibida doble fuente de verdad); updated_at sí aplica.
    fecha_registro: Timestamp;
    // Extensiones SOLO aditivas/opcionales
    tipo_documento?: 'CC' | 'CE' | 'NIT' | 'PPT';
    apellidos?: string;
    email?: string;
    ciudad?: string;
}

// ==========================================
// 3. creditos (mapas vehiculo/condiciones/asignaciones)
// ==========================================

export type ModalidadCredito = 'renting' | 'credito' | 'contado';

export interface CreditoVehiculo {
    placa: string;
    marca?: string;
    modelo?: string;
    anio?: number;
    color?: string;
}

export interface CreditoCondiciones {
    porcentaje_comision: number;
    valor_cuota: number;
    excluir_domingos: boolean;
    modalidad_credito: ModalidadCredito;
}

export interface CreditoAsignaciones {
    // Los 3 son FK lógicas a sys_admin_users por email canónico (docId = email).
    // Ruta A' (Deuda 2): el concepto "uid" se reserva a registrado_por (Auth uid).
    email_admin: string;
    email_usuario: string;
    email_inversor: string;
}

export interface Credito extends BaseAuditable {
    id_cliente: string; // FK a clientes_credito.id
    fecha_registro: Timestamp; // Base del cálculo de mora (Regla B)
    vehiculo: CreditoVehiculo;
    condiciones: CreditoCondiciones;
    asignaciones: CreditoAsignaciones;
    // ADITIVO OPCIONAL sellado por QWEN (H1): correlativo de trazabilidad de UI.
    // NO sustituye ninguna clave del Documento de Negocio.
    numero_credito?: string; // CRE-YYYY-XXXX
}

export type CreditoConId = Credito & { id: string };
export type ClienteCreditoConId = ClienteCredito & { id: string };

// ==========================================
// 4. pagos_y_multas
// ==========================================

// nota_credito = ajuste de saldo negativo (Sección 4 del Documento), sellado por QWEN (H1)
export type TipoTransaccion = 'pago_cuota' | 'multa' | 'nota_credito';

export interface PagoYMulta extends BaseAuditable {
    id_credito: string; // FK a creditos.id
    valor_pagado_cliente: number;
    tipo_transaccion: TipoTransaccion;
    valor_comision: number; // calculado en servidor — Regla A
    valor_neto_empresa: number; // calculado en servidor — Regla A
    fecha_registro: Timestamp;
    metodo_pago?: 'efectivo' | 'transferencia' | 'tarjeta' | 'pse';
    referencia?: string;
    // Obligatorio cuando tipo_transaccion === 'multa'
    motivo?: string;
}

export type PagoYMultaConId = PagoYMulta & { id: string };

// ==========================================
// 5. pagos_inversores (giro de salida)
// ==========================================

export interface PagoInversor extends BaseAuditable {
    id_credito: string; // FK a creditos.id
    email_admin: string; // FK a sys_admin_users por email (admin que gira)
    email_inversor: string; // FK a sys_admin_users por email (inversor receptor)
    monto: number;
    fecha_registro: Timestamp;
    metodo_pago?: 'efectivo' | 'transferencia' | 'cheque' | 'otro';
    referencia?: string;
}

export type PagoInversorConId = PagoInversor & { id: string };

// ==========================================
// 6. remisiones_dinero (cierre de caja)
// ==========================================

export type EstadoRemision = 'pendiente' | 'recibido' | 'anulado';

export interface RemisionDinero extends BaseAuditable {
    email_cobrador: string; // cobrador que genera el cierre (email canónico)
    email_admin: string; // admin que aprueba (email canónico)
    monto: number; // suma valor_neto_empresa del día
    fecha_registro: Timestamp;
    estado: EstadoRemision;
}

export type RemisionDineroConId = RemisionDinero & { id: string };

// ==========================================
// 7. historial_auditoria (ledger append-only)
// ==========================================

export type OperacionAuditoria = 'CREATE' | 'UPDATE' | 'SOFT_DELETE';

// append-only — escrito SOLO con add() (OVERRIDE QWEN #4)
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

export type HistorialAuditoriaConId = HistorialAuditoria & { id: string };

/**
 * MATRIZ DE OPERACIONES PERMITIDAS POR COLECCIÓN (auditoría):
 * - creditos: Create/Read/Update + baja lógica. PROHIBIDO delete físico.
 * - clientes_credito: Create/Read/Update + baja lógica. PROHIBIDO delete físico.
 * - pagos_y_multas: Create/Read/Update + baja lógica. PROHIBIDO delete
 *   (inmutable financieramente; ajustes solo vía nota_credito negativa).
 * - pagos_inversores: Create/Read/Update + baja lógica. PROHIBIDO delete.
 * - remisiones_dinero: Create/Read/Update + baja lógica. PROHIBIDO delete.
 * - historial_auditoria: append (solo Server Action con add()) / Read autenticado /
 *   Update y Delete PROHIBIDOS.
 * - sys_admin_users: FUERA del alcance del módulo (solo lectura para dropdowns).
 */
