---
phase: 8
plan: 6
name: UI financieras + vista auditoría solo-lectura + verificación E2E en Beta
wave: 4
depends_on:
  - 4
  - 5
files_modified:
  - src/app/admin/creditos/pagos-inversores/page.tsx
  - src/app/admin/creditos/pagos-multas/page.tsx
  - src/app/admin/creditos/remisiones/page.tsx
  - src/app/admin/creditos/auditoria/page.tsx
requirements:
  - R-CR7
  - R-CR12
---

# Plan 8-6: UI financieras + vista auditoría solo-lectura + verificación E2E en Beta

## Objective

Crear las 3 rutas UI de las colecciones financieras y la vista de solo lectura de
`historial_auditoria` (sin ningún control de escritura), y cerrar la fase con
verificación E2E sobre datos reales en `https://tiendalasmotos-beta.web.app`
(regla always-on: prohibidos reportes con mocks; prohibidos Preview Channels).
Cumple C4.

## Code Patterns (Model Resilience)

Reference these existing files for code style:

- `src/app/admin/creditos/clientes/page.tsx` (plan 08-05) — Patrón listado + modal
  + Burst Mitigation + Faraday Cage + `useAuth()` → Server Actions. REPLICAR.
- `src/app/admin/creditos/actions.ts` (plan 08-04) — `createPagoInversor`,
  `updatePagoInversor`, `softDeletePagoInversor`, `createPagoYMulta`,
  `updatePagoYMulta`, `softDeletePagoYMulta`, `createRemisionDinero`,
  `updateRemisionDinero`, `softDeleteRemisionDinero`.
- `src/app/admin/novedades/page.tsx` — Patrón de visor de historial con filtrado
  (referencia para la vista de auditoría: filtros por colección/operación/actor).
- `.agent/rules/desarrollobeta.md` — Única URL oficial de validación:
  `https://tiendalasmotos-beta.web.app`. Prohibidos Preview Channels.
- `.agent/rules/prohibiciondereportesbasadosendatossimulados.md` — Cierre solo con
  validación en Beta consultando Firestore real.

Conventions:

- **C4 (obligatorio)** en las 3 rutas financieras: Burst Mitigation, Faraday Cage,
  y tolerancia de lectura sin null-masking silencioso.
- La vista `/admin/creditos/auditoria` es **estrictamente read-only**: ningún botón
  de crear/editar/borrar; solo filtros (colección, operación, actor, rango de fecha)
  y detalle expandible de `datos_anteriores`/`datos_nuevos`/`campos_modificados`.
- Lecturas vía client-SDK autenticado (permitido por 08-02); cero escrituras
  client-SDK en todo el módulo.

## Tasks

<task type="auto">
  <name>Crear rutas UI de pagos_inversores, pagos_y_multas y remisiones_dinero (C4)</name>
  <files>[src/app/admin/creditos/pagos-inversores/page.tsx, src/app/admin/creditos/pagos-multas/page.tsx, src/app/admin/creditos/remisiones/page.tsx]</files>
  <action>
    Replicando el patrón de `clientes/page.tsx` (08-05), crear las 3 páginas
    `"use client"`:
    1. `pagos-inversores/page.tsx`: listado (`credito_id`, `inversionista_id`,
       `monto`, `fecha_pago`, `metodo_pago`, `estado`) + modal alta/edición +
       baja con motivo → actions de 08-04. C4 completo.
    2. `pagos-multas/page.tsx`: listado con badge `tipo` (PAGO/MULTA) + modal donde
       `motivo` se vuelve visible/obligatorio cuando `tipo === 'MULTA'`
       (el servidor re-valida; el cliente solo asiste). C4 completo.
    3. `remisiones/page.tsx`: listado (`origen`, `destino`, `monto`,
       `fecha_remision`, `estado`) + modal; el selector de `estado` solo ofrece
       transiciones válidas (`PENDIENTE→ENVIADO→RECIBIDO` o `ANULADO`) — el servidor
       es la autoridad final. C4 completo.
    Las 3 heredan el guard de `src/app/admin/layout.tsx`.
  </action>
  <verify>npm run build</verify>
  <done>Las 3 rutas financieras operan con C4 y solo escriben vía Server Actions;
  build pasa.</done>
</task>

<task type="auto">
  <name>Crear vista de auditoría de solo lectura (ledger)</name>
  <files>[src/app/admin/creditos/auditoria/page.tsx]</files>
  <action>
    Crear `src/app/admin/creditos/auditoria/page.tsx` (`"use client"`):
    1. Lectura client-SDK de `historial_auditoria` (`orderBy('created_at', 'desc')`
       con límite de página, ej. 50; fallback a orden en memoria si falta índice).
    2. Filtros: `coleccion_afectada` (las 5 operativas), `operacion`
       (CREATE/UPDATE/SOFT_DELETE), `registrado_por` (texto), rango de fechas.
    3. Tabla: timestamp, colección, documento, operación (badge), actor
       (`registrado_por` + email), botón detalle que expande
       `campos_modificados` + diff `datos_anteriores` → `datos_nuevos` (JSON legible).
    4. PROHIBIDO: cualquier botón/formulario de escritura, y cualquier llamada a
       `addDoc/updateDoc/deleteDoc/setDoc` en este archivo (verificar por grep).
  </action>
  <verify>npm run build && grep -nE "addDoc|updateDoc|deleteDoc|setDoc" src/app/admin/creditos/auditoria/page.tsx (debe devolver vacío)</verify>
  <done>Vista de ledger read-only con filtros; cero imports de escritura; build pasa.</done>
</task>

<task type="auto">
  <name>Verificación E2E en Beta con datos reales (R-CR12)</name>
  <files>[]</files>
  <action>
    1. Desplegar rama `beta` en `https://tiendalasmotos-beta.web.app` (flujo
       establecido del repo; Cloud Run + Firebase Hosting).
    2. Recorrido E2E autenticado como admin: abrir grupo "Gestión de Créditos" en el
       sidebar (6 enlaces visibles sin truncamiento) → crear cliente (cedula de prueba
       con prefijo de descarte, ej. `999…`) → crear crédito (verificar formato
       `CRE-YYYY-XXXX`) → editar → registrar pago/multa/remisión → baja lógica con
       motivo → abrir `/admin/creditos/auditoria` y confirmar que CADA escritura
       generó su entrada con `registrado_por` = uid del admin, anterior/nuevo y
       `campos_modificados` correctos.
    3. Confirmar en consola Firestore (proyecto beta) que `historial_auditoria` solo
       creció por appends (cero updates/deletes) y que ningún doc operativo fue
       borrado físicamente.
    4. Registrar TODO fallo con `console.error` + payload (Zero-Silent-Failures);
       prohibido declarar éxito con mocks o Preview Channels.
  </action>
  <verify>Navegación manual en `https://tiendalasmotos-beta.web.app/admin/creditos`
  + documentos reales verificados en consola Firestore del proyecto beta.</verify>
  <done>Fase 8 verificada E2E en Beta con datos reales; ledger íntegro.</done>
</task>

## Must-Haves

- C4 en las 3 rutas financieras; auditoría 100% read-only (grep de escrituras vacío).
- Matriz de operaciones respetada en UI (sin botón de borrado físico en ningún lado).
- Cierre SOLO con evidencia en Beta + Firestore real (R-CR12).
- `npm run build` con código de salida 0.

---
*Created: 2026-09-22*
