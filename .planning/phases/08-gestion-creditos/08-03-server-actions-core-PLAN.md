---
phase: 8
plan: 3
name: Server Actions core — requireActor, auditoría, creditos y clientes_credito
wave: 2
depends_on:
  - 1
  - 2
files_modified:
  - src/app/admin/creditos/actions.ts
requirements:
  - R-CR3
  - R-CR8
  - R-CR9
  - R-CR10
  - R-CR11
---

# Plan 8-3: Server Actions core — requireActor, auditoría, creditos y clientes_credito

## Objective

Crear `src/app/admin/creditos/actions.ts` (`'use server'`) con el helper `requireActor`
(verificación de idToken → `registrado_por`), el helper `appendAuditoria` (append a
`historial_auditoria` con anterior/nuevo/campos modificados), el CRUD de `creditos`
(con correlativo `CRE-YYYY-XXXX` aditivo en `configuracion/counters`) y el alta/edición
de `clientes_credito` (preservando `fecha_registro`). Toda escritura inyecta
`registrado_por` verificado. **Gate C7: no ejecutar este plan sin la confirmación de
Tobias sobre escrituras del bot.** Cumple C5, C7.

## Gate C7 — Contrato cruzado (bloqueante, R-CR11)

> C7 (Contrato compartido): Antes de ejecutar 08-03, Tobias confirma si
> bot-tiendalasmotos escribe sobre alguna de las 6 colecciones. Si sí, pega evidencia
> (documento real o interfaz TS del bot) y re-valido naming antes de cualquier execute.

Si la evidencia del bot introduce claves distintas, se re-valida el naming de 08-01
antes de escribir código (NAMING LOCK).

## Code Patterns (Model Resilience)

Reference these existing files for code style:

- `src/app/actions.ts:1` — Estructura `'use server'` + `zod` (`leadSchema`,
  `safeParse`, retorno `{ success, errors, message }`) + Admin SDK vía `getDb()`
  (`adminDb.collection("prospectos").doc(...)`).
- `src/lib/actions/quotation.ts:8` — `runTransaction` sobre doc
  `configuracion/counters` para correlativos (`quotationCount`/`quotationYear`).
  **SSOT para C5:** añadir campos aditivos `creditoCount`/`creditoYear` con
  `{ merge: true }`; prohibida colección nueva de contadores.
- `src/lib/firebase-admin.ts` — `getDb()` y `getAdminAuth()` (dynamic require,
  instancia global `_firebaseAdminApp`).
- `src/types/creditos.ts` (creado en 08-01) — Tipos `Credito`, `ClienteCredito`,
  `HistorialAuditoria`, `OperacionAuditoria`.
- `src/context/AuthContext.tsx:126` — El cliente provee `user` (`uid`) y
  `await user.getIdToken()`; el Server Action NUNCA invoca `useAuth()`.

Conventions:

- Validación con `zod` (`safeParse`); `celular` se normaliza a 12 dígitos con prefijo
  `57` (contrato UNE v7.0.2, patrón `src/app/actions.ts:78`); `cedula` se valida no
  vacía y se usa como filtro de duplicado (NO como docId salvo decisión del ejecutor
  documentada).
- `fecha_registro` de `clientes_credito` se preserva intacta en UPDATE (prohibido
  sobrescribirla; si el payload la trae, se ignora y se registra en el log).
- Prohibido `delete()` físico: la baja es `activo=false` + `motivo_baja` obligatorio +
  `fecha_baja` + `baja_por` (operación `SOFT_DELETE` en el ledger).
- Zero-Silent-Failures: todo `catch` registra `console.error` con contexto antes de
  retornar el fallo.
- Tras cada mutation exitosa: `revalidatePath('/admin/creditos...')` (`next/cache`).

## Tasks

<task type="auto">
  <name>Crear requireActor y appendAuditoria (núcleo de confianza)</name>
  <files>[src/app/admin/creditos/actions.ts]</files>
  <action>
    Crear `src/app/admin/creditos/actions.ts` con `'use server'` y:
    1. `requireActor(idToken: string): Promise<{ uid: string; email?: string }>`:
       obtiene `getAdminAuth()` de `@/lib/firebase-admin`, ejecuta
       `verifyIdToken(idToken)`; si falla, lanza `Error('No autorizado')`
       (el llamante lo captura y retorna `{ success: false }`).
       NUNCA aceptar un `uid` sin verificar como `registrado_por`.
    2. `appendAuditoria(input: { coleccion: string; documentoId: string;
       operacion: OperacionAuditoria; antes: Record<string, unknown> | null;
       despues: Record<string, unknown> | null; actor: { uid: string; email?: string } })`:
       calcula `campos_modificados` por diff superficial de llaves (para CREATE, todas
       las llaves de `despues`); escribe con `getDb()` en `historial_auditoria` vía
       `add()` con `created_at: FieldValue.serverTimestamp()` (Admin SDK),
       `registrado_por: actor.uid`, `registrado_por_email: actor.email ?? null`,
       `version: 1`. NO emite `update`/`delete` jamás.
    3. Esquemas `zod` compartidos: `actorSchema = z.object({ uid: z.string().min(1),
       idToken: z.string().min(1) })`.

    Match style from: `src/app/actions.ts:1`
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>`requireActor` rechaza tokens inválidos; `appendAuditoria` solo hace `add()`;
  `tsc` pasa.</done>
</task>

<task type="auto">
  <name>Implementar CRUD de creditos con correlativo CRE-YYYY-XXXX (C5)</name>
  <files>[src/app/admin/creditos/actions.ts]</files>
  <action>
    Añadir a `src/app/admin/creditos/actions.ts`:
    1. `getNextNumeroCredito(): Promise<string>` — `runTransaction` sobre
       `doc(configuracion/counters)` (Admin SDK): lee `creditoCount`/`creditoYear`
       (0 si ausentes — estrictamente aditivo, `{ merge: true }`, no toca
       `quotationCount`/`quotationYear`); retorna `CRE-YYYY-XXXX` (XXXX zero-padded 4).
    2. `createCredito(input, actor)` — valida con `zod` (montos ≥ 0, `plazo_meses` entero
       > 0, `cliente_id`/`moto_id` no vacíos); `requireActor(actor.idToken)`; asigna
       `numero_credito`, `estado` inicial `'SOLICITADO'`, `fecha_solicitud` server,
       `registrado_por = uid verificado`, `activo: true`, `created_at/updated_at`;
       escribe el doc; `appendAuditoria` con operación `CREATE`; `revalidatePath`.
    3. `updateCredito(id, patch, actor)` — lee doc previo (si no existe o
       `activo === false`, retorna fallo); valida patch; preserva `numero_credito` y
       `fecha_solicitud` (prohibido modificarlos; si vienen en el patch, se descartan);
       actualiza `updated_at`, `actualizado_por`; `appendAuditoria` `UPDATE` con diff.
    4. `softDeleteCredito(id, motivo, actor)` — exige `motivo` no vacío; escribe
       `activo=false`, `motivo_baja`, `fecha_baja`, `baja_por`; `appendAuditoria`
       `SOFT_DELETE`. Prohibido `delete()`.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Correlativo aditivo funcional; update preserva `numero_credito`/`fecha_solicitud`;
  baja solo lógica; `tsc` pasa.</done>
</task>

<task type="auto">
  <name>Implementar alta/edición de clientes_credito (NAMING LOCK físico)</name>
  <files>[src/app/admin/creditos/actions.ts]</files>
  <action>
    Añadir a `src/app/admin/creditos/actions.ts`:
    1. `createClienteCredito(input, actor)` — valida con `zod`: `cedula` (string no
       vacío, trim), `nombres`, `celular` (normalizar a 12 dígitos `57…`; si tras
       limpiar no tiene 10 o 12 dígitos, fallo explícito — prohibido null-masking),
       `direccion`, `fecha_registro` (acepta ISO del formulario; por defecto server);
       extensiones opcionales `tipo_documento`, `apellidos`, `email`, `ciudad`.
       Verifica duplicado por query `where('cedula', '==', ...)` (si existe y activo,
       fallo `Ya existe un cliente con esa cédula`).
       Escribe con `registrado_por` verificado + `appendAuditoria` `CREATE`.
    2. `updateClienteCredito(id, patch, actor)` — lee previo; **preserva
       `fecha_registro`** (si el patch la trae, se descarta y se loguea);
       permite editar `nombres`, `celular`, `direccion` y extensiones; `cedula`
       editable solo si no colisiona con otro doc activo; `appendAuditoria` `UPDATE`.
    3. `softDeleteClienteCredito(id, motivo, actor)` — igual patrón de baja lógica
       (`SOFT_DELETE` en ledger). Prohibido `delete()`.

    Match style from: `src/app/actions.ts:39` (normalización 12 dígitos)
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Alta/edición Respeta las 5 claves inmutables y preserva `fecha_registro`;
  duplicados por `cedula` rechazados; `tsc` pasa.</done>
</task>

## Must-Haves

- Gate C7 resuelto por escrito antes de ejecutar cualquier task de este plan.
- `registrado_por` proviene SIEMPRE del uid verificado por `verifyIdToken`.
- Toda escritura (Create/Update/Soft-delete) genera su entrada en
  `historial_auditoria` con anterior/nuevo/campos modificados.
- C5: contador estrictamente aditivo (`creditoCount`/`creditoYear`) vía
  `runTransaction`; cero colecciones nuevas.
- Cero `delete()` físico en el archivo; `npx tsc --noEmit` con salida 0.

---
*Created: 2026-09-22*
