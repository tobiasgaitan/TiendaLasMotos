---
phase: 8
plan: 1
name: Contratos de datos TypeScript + esquema Firestore con NAMING LOCK
wave: 1
depends_on: []
files_modified:
  - src/types/creditos.ts
requirements:
  - R-CR1
---

# Plan 8-1: Contratos de datos TypeScript + esquema Firestore con NAMING LOCK

## Objective

Crear `src/types/creditos.ts` con el `BaseAuditable` exacto dictado por el usuario,
la interfaz `ClienteCredito` bajo NAMING LOCK físico (5 claves inmutables de evidencia
de consola Firestore), las 4 interfaces de dominio restantes, el ledger
`HistorialAuditoria` append-only y la matriz explícita de operaciones permitidas por
colección (JSDoc en el archivo). **Desde esta escritura, NAMING LOCK total sobre todas
las claves.** Cumple C1.

## Sello de naming — Sección 1 del usuario (verbatim, carácter por carácter — C1)

> 1. SELLO DE NAMING (respuesta al punto exigido)
> No congelo tal cual. Dictamino con evidencia física de esta sesión:
> clientes_credito — esquema canónico por NAMING LOCK de evidencia física. La captura de consola Firestore (proyecto tiendalasmotos, nam5, 2026-09-22) pegada por Tobias exhibe el documento XSh6FVoyUGKrfMkCFnvR con las claves cedula, celular, direccion, fecha_registro, nombres. Esas cinco claves quedan inmutables. La proposición del planificador (tipo_documento, numero_documento, supresión de direccion) constituye intento de renombre sobre campos que conectan con Firestore compartida: habría sido Fallo Crítico de escribirse. Regla canónica:
> cedula = clave de número de documento. Prohibido sustituirla por numero_documento/tipo_documento. Si el negocio exige tipo de documento, se admite tipo_documento aditivo y opcional, jamás sustitutivo.
> nombres, celular, direccion inmutables. apellidos, email, ciudad admitidos solo como extensiones aditivas.
> fecha_registro = estampilla de registro de negocio en esta colección. El created_at del BaseAuditable no se aplica aquí (prohibida doble fuente de verdad); updated_at sí aplica.
> Las otras 5 colecciones + BaseAuditable + ledger. No existe esquema físico previo (colecciones verificadas vacías). La proposición del planificador queda congelada como esquema canónico inicial en el instante en que se escriba en 08-01-PLAN.md: BaseAuditable (registrado_por, registrado_por_email, actualizado_por, created_at, updated_at, activo, motivo_baja, fecha_baja, baja_por), interfaces de dominio según su tabla, historial_auditoria append-only con version, y formato numero_credito = CRE-YYYY-XXXX. Desde esa escritura, NAMING LOCK total sobre todas las claves.

## Code Patterns (Model Resilience)

Reference these existing files for code style:

- `src/types/index.ts` — Estilo de interfaces con `Timestamp` de `firebase/firestore`
  (ej. `Lead`, `Moto`, `CreditSimulation`); snake_case para campos de negocio.
- `src/types/financial.ts` — Uniones literales de dominio (ej. `lifeInsuranceType`,
  estados) y banderas `syncedWithUsura`/`manualOverride`.
- `src/app/admin/config/page.tsx:45` — Patrón de lectura `{ id: d.id, ...d.data() }`:
  el `id` (docId) NO pertenece a las interfaces, se adjunta en lectura.

Conventions:

- **NAMING LOCK:** prohibido renombrar/inventar colecciones; en `clientes_credito`
  prohibido renombrar/sustituir `cedula`, `nombres`, `celular`, `direccion`, `fecha_registro`.
- `cedula` = clave canónica de número de documento. `tipo_documento` solo aditivo/opcional.
- `fecha_registro` es el SSOT de registro en `clientes_credito`; `created_at` NO aplica ahí
  (prohibida doble fuente de verdad); `updated_at` sí aplica.
- `historial_auditoria` es standalone (sin `updated_at`, sin `activo`): append-only.
- Error handling: este plan es solo tipos; sin runtime.

## Tasks

<task type="auto">
  <name>Crear BaseAuditable exacto y ClienteCredito bajo NAMING LOCK físico</name>
  <files>[src/types/creditos.ts]</files>
  <action>
    Crear el archivo `src/types/creditos.ts` con:
    1. Importar `Timestamp` de `firebase/firestore`.
    2. Declarar `export interface BaseAuditable` con EXACTAMENTE estos 9 campos
       (ni uno más, ni uno menos):
       `registrado_por: string`, `registrado_por_email?: string`,
       `actualizado_por?: string`, `created_at: Timestamp`, `updated_at: Timestamp`,
       `activo: boolean`, `motivo_baja?: string`, `fecha_baja?: Timestamp`,
       `baja_por?: string`.
    3. Declarar `export interface ClienteCredito extends Omit<BaseAuditable, 'created_at'>`
       con las 5 claves inmutables:
       `cedula: string` (clave de número de documento — prohibido `numero_documento`),
       `nombres: string`, `celular: string`, `direccion: string`,
       `fecha_registro: Timestamp` (SSOT — prohibido `created_at` aquí);
       más extensiones SOLO aditivas/opcionales:
       `tipo_documento?: 'CC' | 'CE' | 'NIT' | 'PPT'`, `apellidos?: string`,
       `email?: string`, `ciudad?: string`.
    4. Añadir comentario `// NAMING LOCK FÍSICO — evidencia consola Firestore
       tiendalasmotos/nam5 2026-09-22 doc XSh6FVoyUGKrfMkCFnvR` sobre `ClienteCredito`.

    Match style from: `src/types/index.ts`
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>`src/types/creditos.ts` existe con `BaseAuditable` de 9 campos y `ClienteCredito`
  con las 5 claves inmutables; `tsc` pasa sin errores.</done>
</task>

<task type="auto">
  <name>Declarar interfaces de dominio de las 4 colecciones operativas restantes</name>
  <files>[src/types/creditos.ts]</files>
  <action>
    Añadir a `src/types/creditos.ts` (cada una `extends BaseAuditable`):
    1. `export interface Credito`: `numero_credito: string` (formato `CRE-YYYY-XXXX`),
       `cliente_id: string`, `moto_id: string`, `entidad_financiera_id?: string`,
       `sede_id?: string`, `valor_moto: number`, `cuota_inicial: number`,
       `capital_financiado: number`, `tasa_interes_mensual: number`,
       `plazo_meses: number`, `cuota_mensual: number`,
       `estado: 'SOLICITADO' | 'APROBADO' | 'DESEMBOLSADO' | 'ACTIVO' | 'PAGADO' | 'MOROSO' | 'RECHAZADO' | 'ANULADO'`,
       `fecha_solicitud: Timestamp`, `fecha_aprobacion?: Timestamp`,
       `fecha_desembolso?: Timestamp`, `saldo_capital?: number`.
    2. `export interface PagoInversor`: `credito_id: string`, `inversionista_id: string`,
       `monto: number`, `fecha_pago: Timestamp`,
       `metodo_pago: 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO'`,
       `referencia?: string`, `estado: 'PENDIENTE' | 'PAGADO' | 'ANULADO'`.
    3. `export interface PagoYMulta`: `credito_id: string`,
       `tipo: 'PAGO' | 'MULTA'`, `monto: number`, `fecha: Timestamp`,
       `metodo_pago?: 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'PSE'`,
       `motivo?: string` (requerido por validación Zod en 08-04 cuando `tipo === 'MULTA'`),
       `referencia?: string`, `estado: 'PENDIENTE' | 'APLICADO' | 'ANULADO'`.
    4. `export interface RemisionDinero`: `origen: string`, `destino: string`,
       `monto: number`, `fecha_remision: Timestamp`,
       `metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO'`,
       `comprobante_url?: string`, `responsable_recepcion?: string`,
       `estado: 'PENDIENTE' | 'ENVIADO' | 'RECIBIDO' | 'ANULADO'`.

    Match style from: `src/types/financial.ts`
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Las 4 interfaces existen, extienden `BaseAuditable` completo (con `created_at`);
  `tsc` pasa sin errores.</done>
</task>

<task type="auto">
  <name>Declarar ledger HistorialAuditoria y matriz de operaciones</name>
  <files>[src/types/creditos.ts]</files>
  <action>
    Añadir a `src/types/creditos.ts`:
    1. `export type OperacionAuditoria = 'CREATE' | 'UPDATE' | 'SOFT_DELETE';`
    2. `export interface HistorialAuditoria` (standalone, NO extiende BaseAuditable):
       `coleccion_afectada: string`, `documento_id: string`,
       `operacion: OperacionAuditoria`,
       `datos_anteriores: Record<string, unknown> | null`,
       `datos_nuevos: Record<string, unknown> | null`,
       `campos_modificados: string[]`, `registrado_por: string`,
       `registrado_por_email?: string`, `created_at: Timestamp`, `version: 1;`
       (literal `1`, append-only: sin `updated_at`, sin `activo`).
    3. Bloque JSDoc `MATRIZ DE OPERACIONES PERMITIDAS POR COLECCIÓN (auditoría)` que
       declare: `creditos` Create/Read/Update + baja lógica, sin delete físico;
       `clientes_credito`, `pagos_inversores`, `pagos_y_multas`, `remisiones_dinero`
       Create/Read/Update + baja lógica, sin delete físico;
       `historial_auditoria` append (solo Server Action) / Read autenticado /
       Update y Delete prohibidos; `sys_admin_users` fuera de alcance del módulo.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>`HistorialAuditoria` existe con `version: 1` y la matriz JSDoc está presente;
  `tsc` pasa sin errores.</done>
</task>

## Must-Haves

- `src/types/creditos.ts` contiene `BaseAuditable` con exactamente los 9 campos dictados.
- `ClienteCredito` usa las 5 claves inmutables (`cedula`, `nombres`, `celular`,
  `direccion`, `fecha_registro`) y omite `created_at`.
- Las 5 colecciones restantes usan el esquema congelado; `historial_auditoria`
  append-only con `version`.
- C1 cumplido: este archivo reproduce la sección 1 del dictamen verbatim (arriba).
- `npx tsc --noEmit` con código de salida 0.

---
*Created: 2026-09-22*
