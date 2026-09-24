---
task: "022"
name: "Unificación FK sys_admin_users — Ruta A' (email canónico)"
description: "Refactor de contrato y UI: uid_* → email_* (Opción 1), dropdowns emiten email normalizado"
---

# Quick Task 022: Unificación FK sys_admin_users (Ruta A')

## Objective
Alinear los nombres de los campos FK con la realidad física del dato (emails):
renombrar `uid_admin`/`uid_usuario`/`uid_inversor` → `email_admin`/`email_usuario`/
`email_inversor`/`email_cobrador` (Opción 1) y normalizar los dropdowns para que siempre
emitan el email canónico (`toLowerCase/trim`). NO modificar `sys_admin_users` ni
`AuthContext`. NO migrar datos (GATE 2: conteo 0 en creditos/pagos_inversores/
remisiones_dinero — colecciones vacías).

## Gates
- GATE 1 (QWEN): cero consumo ejecutable del bot sobre estos campos/colecciones. Cerrado.
- GATE 2: inspección Admin SDK del string `Nn6XP2U0JxK23s0Fjew6` en las 3 colecciones →
  conteo 0. Cerrado 2026-09-24. Sin migración.

## Evidence (causa raíz)
- `nuevo/page.tsx:71-77`, `editar:84-90`, `inversores:67-73`: dropdown con
  `uid: data.uid || d.id`; ningún doc de `sys_admin_users` tiene campo `uid`
  (verificado vía REST: 5 docs, claves sin `uid`) → la FK guardada es el docId
  (email en 4/5 casos; auto-ID `Nn6XP...` en 1).
- `actions.ts:203`: `asignaciones` se persiste tal cual llega.
- `financiero-actions.ts:47`: `requireAdmin` ya resuelve por `email` (sin cambios).
- `registrado_por` (Auth uid vía `verifyIdToken`) NO se toca.

## Conventions
- Opción 1 de naming: `email_admin`, `email_usuario`, `email_inversor`, `email_cobrador`.
- `registrado_por`, `baja_por`, `actualizado_por` siguen siendo Auth uid (correcto).
- Donde el servidor deriva el email del actor (`me.email`), exigir no vacío.
- Cero cambios en `sys_admin_users`, `AuthContext`, `admin-auth`, `LoginForm`, `users/*`, rules.

## Tasks

<task type="auto">
  <name>Contratos: types + schemas de Server Actions</name>
  <files>[src/types/creditos.ts, src/app/admin/creditos/actions.ts, src/app/admin/creditos/financiero-actions.ts]</files>
  <action>
    1. `src/types/creditos.ts`: `CreditoAsignaciones` → `email_admin/email_usuario/
       email_inversor` (+ comentario FK-por-email); `PagoInversor` → `email_admin/
       email_inversor`; `RemisionDinero` → `email_cobrador/email_admin`.
    2. `actions.ts`: `asignacionesSchema` con las 3 claves `email_*`.
    3. `financiero-actions.ts`: `pagoInversorSchema.email_inversor`;
       `createPagoInversor` guarda `email_admin = me.email` (normalizado, no vacío) y
       `email_inversor` del payload; `updatePagoInversor` preserva `email_*`;
       `generarCierreCaja` guarda `email_cobrador = me.email`, `email_admin = ''`;
       `aprobarRemision` escribe `email_admin = me.email`. `requireAdmin` intacto.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Contratos renombrados; tsc pasa.</done>
</task>

<task type="auto">
  <name>UI: dropdowns con email canónico + payloads email_*</name>
  <files>[src/app/admin/creditos/nuevo/page.tsx, src/app/admin/creditos/[id]/editar/page.tsx, src/app/admin/creditos/inversores/page.tsx, src/app/admin/creditos/remisiones/page.tsx, src/app/admin/creditos/[id]/page.tsx]</files>
  <action>
    1. `nuevo`, `editar`, `inversores`: `SysUser = { email, label }`; mapeo
       `email: (data.email || d.id).toLowerCase().trim()`; estados y payloads con
       claves `email_*`; selects con `key/value = u.email`.
    2. `inversores`: agrupación/giros/filtro por `email_inversor`; display de giros.
    3. `remisiones`: query `where('email_cobrador','==', user.email normalizado)`
       (guard si email ausente); display `r.email_cobrador`. Query de pagos por
       `registrado_por` intacta.
    4. `[id]/page.tsx`: filas de detalle con labels `email_*`.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>UI emite solo emails canónicos; tsc pasa.</done>
</task>

<task type="auto">
  <name>Limpieza total + build + commit/push beta</name>
  <files>[]</files>
  <action>
    1. `grep -rn 'uid_admin\|uid_inversor\|uid_usuario' src/` → vacío.
    2. `npm run build` (EXIT 0).
    3. Commit + push a `beta`. PROHIBIDO merge a `main` sin certificación.
  </action>
  <verify>Grep vacío; build verde; push a beta.</verify>
  <done>Refactor certificado en beta.</done>
</task>

## Must-Haves
- Cero resultados del grep de nomenclatura legacy en `src/`.
- `tsc` EXIT 0; build EXIT 0.
- `sys_admin_users` y `AuthContext` intactos; sin migración de datos.
- Sin merge a `main`.

---
*Created: 2026-09-24 by Antigravity*
*Ticket: WEB-DEBT-002*
