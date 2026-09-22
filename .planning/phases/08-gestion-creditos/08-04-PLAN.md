---
phase: 8
plan: 4
name: Server Actions financieras — pagos_inversores, pagos_y_multas, remisiones_dinero
wave: 3
depends_on:
  - 3
files_modified:
  - src/app/admin/creditos/actions.ts
requirements:
  - R-CR4
  - R-CR9
  - R-CR10
---

# Plan 8-4: Server Actions financieras — pagos_inversores, pagos_y_multas, remisiones_dinero

## Objective

Extender `src/app/admin/creditos/actions.ts` (creado en 08-03) con el alta/edición y
baja lógica de las 3 colecciones financieras, reutilizando `requireActor` y
`appendAuditoria`. Cada escritura inyecta `registrado_por` verificado y su entrada de
ledger. Regla de negocio: en `pagos_y_multas`, `motivo` es obligatorio cuando
`tipo === 'MULTA'`. Prohibido `delete()` físico en las 3 colecciones.

## Code Patterns (Model Resilience)

Reference these existing files for code style:

- `src/app/admin/creditos/actions.ts` (plan 08-03) — `requireActor`, `appendAuditoria`,
  patrón de retorno `{ success, errors?, message? }`, `revalidatePath`.
- `src/types/creditos.ts` (plan 08-01) — `PagoInversor`, `PagoYMulta`, `RemisionDinero`.
- `src/app/actions.ts:15` — Esquemas `zod` con mensajes en español y `.passthrough()`
  prohibido aquí (whitelist estricta de campos por colección).

Conventions:

- Whitelist estricta: cada action solo acepta las claves de su interfaz; cualquier
  clave extra se descarta (Faraday Cage en servidor).
- Montos `monto`/`valor` como número ≥ 0 (`z.coerce.number().min(0)`); fechas como
  `Timestamp` server o ISO válido convertido.
- Referencias `credito_id`/`inversionista_id` validadas no vacías; si el `credito_id`
  no existe o está inactivo, la escritura se rechaza con mensaje explícito
  (prohibido huérfano silencioso).
- Zero-Silent-Failures + `revalidatePath` por ruta afectada.

## Tasks

<task type="auto">
  <name>Implementar alta/edición/baja de pagos_inversores</name>
  <files>[src/app/admin/creditos/actions.ts]</files>
  <action>
    Añadir a `src/app/admin/creditos/actions.ts`:
    1. `createPagoInversor(input, actor)` — `zod`: `credito_id`, `inversionista_id`
       no vacíos; `monto` número ≥ 0; `fecha_pago` ISO válida;
       `metodo_pago: 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO'`;
       `referencia?`, `estado` inicial `'PENDIENTE'`.
       `requireActor`; verificar que el `credito_id` existe y `activo === true`
       (si no, fallo `El crédito no existe o está inactivo`).
       Escribir con `registrado_por` verificado + `appendAuditoria` `CREATE` +
       `revalidatePath('/admin/creditos/pagos-inversores')`.
    2. `updatePagoInversor(id, patch, actor)` — lee previo (inexistente/inactivo →
       fallo); valida; preserva `credito_id`/`inversionista_id` (prohibido reasignar;
       si vienen, se descartan); `updated_at`, `actualizado_por`;
       `appendAuditoria` `UPDATE`.
    3. `softDeletePagoInversor(id, motivo, actor)` — `motivo` obligatorio; baja
       lógica + `appendAuditoria` `SOFT_DELETE`. Prohibido `delete()`.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>CRUD financiero de inversores operativo con ledger por escritura; `tsc` pasa.</done>
</task>

<task type="auto">
  <name>Implementar alta/edición/baja de pagos_y_multas (motivo obligatorio en MULTA)</name>
  <files>[src/app/admin/creditos/actions.ts]</files>
  <action>
    Añadir a `src/app/admin/creditos/actions.ts`:
    1. `createPagoYMulta(input, actor)` — `zod` con refinamiento:
       `tipo: 'PAGO' | 'MULTA'`; `monto` ≥ 0; `fecha` ISO válida;
       `metodo_pago?`; `referencia?`; `estado` inicial `'PENDIENTE'`;
       `.refine(data => data.tipo !== 'MULTA' || (data.motivo ?? '').trim().length > 0,
       { message: 'La multa exige motivo', path: ['motivo'] })`.
       `requireActor`; verificar `credito_id` existente y activo; escribir con
       `registrado_por` + `appendAuditoria` `CREATE` +
       `revalidatePath('/admin/creditos/pagos-multas')`.
    2. `updatePagoYMulta(id, patch, actor)` — lee previo; preserva `credito_id` y
       `tipo` (prohibido convertir PAGO↔MULTA; si vienen, se descartan);
       si el doc es `MULTA`, el patch no puede vaciar `motivo`; `appendAuditoria` `UPDATE`.
    3. `softDeletePagoYMulta(id, motivo, actor)` — baja lógica + ledger `SOFT_DELETE`.
       Prohibido `delete()`.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>MULTA sin motivo es rechazada en create y en update; `tsc` pasa.</done>
</task>

<task type="auto">
  <name>Implementar alta/edición/baja de remisiones_dinero</name>
  <files>[src/app/admin/creditos/actions.ts]</files>
  <action>
    Añadir a `src/app/admin/creditos/actions.ts`:
    1. `createRemisionDinero(input, actor)` — `zod`: `origen`/`destino` no vacíos y
       distintos (refine `origen !== destino`, mensaje `Origen y destino deben diferir`);
       `monto` ≥ 0; `fecha_remision` ISO válida;
       `metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO'`;
       `comprobante_url?` (URL válida si se provee), `responsable_recepcion?`;
       `estado` inicial `'PENDIENTE'`.
       `requireActor`; escribir con `registrado_por` + `appendAuditoria` `CREATE` +
       `revalidatePath('/admin/creditos/remisiones')`.
    2. `updateRemisionDinero(id, patch, actor)` — lee previo; permite avanzar `estado`
       solo en el orden `'PENDIENTE' → 'ENVIADO' → 'RECIBIDO'` o a `'ANULADO'`
       (transición inválida → fallo explícito); `appendAuditoria` `UPDATE`.
    3. `softDeleteRemisionDinero(id, motivo, actor)` — baja lógica + ledger `SOFT_DELETE`.
       Prohibido `delete()`.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Remisiones con validación origen≠destino y máquina de estados; `tsc` pasa.</done>
</task>

## Must-Haves

- Las 3 colecciones operan solo vía `requireActor` + `appendAuditoria` (R-CR10).
- `motivo` obligatorio para `MULTA`; `origen !== destino`; estados de remisión
  con transición válida.
- Cero `delete()` físico; baja lógica con `motivo_baja` obligatorio (R-CR9).
- `npx tsc --noEmit` con código de salida 0.

---
*Created: 2026-09-22*
