---
task: "029"
name: "CRUD sys_admin_users a Server Actions + rules write:false (D2)"
description: "createUser/updateUser/deleteUser con Admin SDK y requirePermiso; baja lógica; gate manual de deploy de reglas"
---

# Quick Task 029: sys_admin_users por Server Actions

## Objective
Eliminar escrituras por SDK cliente a `sys_admin_users` (vector de auto-asignación de
rol). Tres Server Actions con Admin SDK + `requirePermiso` + ledger append-only.
Endurecer `firestore.rules` a `write: false`.

## Decisiones
- Baja lógica (`active: false` + auditoría SOFT_DELETE). PROHIBIDO `delete()` físico.
- Guard anti-suicidio: `emailKey !== me.email` (403).
- `updateUser` limpia la clave legacy `role` vía `deleteField()`; escribe `rol`.
- Invitación (`sendUserInvitation`) sin cambios, invocada desde la página tras éxito.
- Regla legacy `config/SUPERADMIN`: ya eliminada en repo (commit `3c27ebc`); verificada.

## GATE MANUAL — deploy de reglas (NO lo ejecuta el Builder ni el CI)
Secuencia obligatoria:
1. **(a)** Merge del refactor a `beta` (este commit) → deploy hosting automático.
2. **(b)** Verificar CRUD por actions en beta (superadmin crea/edita/desactiva usuario
   de prueba; cobrador recibe denegación server-side; purga posterior).
3. **(c)** SOLO tras (b): Tobias ejecuta manualmente
   `firebase deploy --only firestore:rules --project tiendalasmotos`.
4. **(d)** Smoke test post-deploy: `setDoc` directo de cliente autenticado debe fallar
   con `permission-denied`; el panel CRUD sigue operativo (Admin SDK ignora rules).

## Verificación
- `users-actions.test.ts` 9/9 (antes y después del refactor de página).
- `tsc`/`build` EXIT 0, `lint` 0 errores; suites existentes sin regresión.
- Commit atómico `feat(p5-d2)` + push a `beta`. Sin merge a `main`.

## WEB-029-FIX-1 — Eliminación del centinela de cliente (2026-09-27)
- **Defecto:** `users-schemas.ts` (módulo puro) inyectaba `deleteField()` del SDK
  cliente en `payload.role`; el Admin SDK lo rechaza (clase no serializable) y
  `updateUser` fallaba al 100% en beta; el ledger heredaba el centinela vía spread.
  Evidencia: error runtime 27/sep + autopsia grep (única ocurrencia).
- **Fix:** `users-schemas.ts` sin import de `firebase/firestore`;
  `construirPayloadUsuario` retorna solo campos JSON-planos (sin clave `role`);
  nuevo export puro `DEBE_LIMPIAR_ROLE_LEGACY(antes) => ('role' in antes)`.
- **`updateUser`:** importa `FieldValue` de `firebase-admin/firestore`; UNA sola
  `batch.set(ref, { ...updates, ...(limpiar ? { role: FieldValue.delete() } : {}) },
  { merge: true })` con un único `batch.commit()`; ledger `despues` JSON-plano con
  `delete despues.role` cuando aplica la limpieza.
- **Tests:** caso sentinel sustituido por "payload NO contiene clave role" +
  "borrado legacy condicional" (true con `{role}`, false con `{rol}`/null);
  suite mantiene 9 casos.
- **Invariantes:** `createUser`, `deleteUser`, `firestore.rules`, `users/page.tsx`,
  `sendUserInvitation.ts` — cero cambios.

## WEB-029-FIX-2 — Accessor blindado de FieldValue (2026-09-28)
- **Regresión:** el fix 79ad583 añadió `import { FieldValue } from
  "firebase-admin/firestore"` (ES6 estático) en `src/app/admin/users/actions.ts`.
  Bajo firebase-frameworks + Turbopack los externals se hashean y el import no
  resuelve en Cloud Run ⇒ ERR_MODULE_NOT_FOUND / HTTP 500 en las tres actions.
  Evidencia: sondas runtime 27/sep 10:02 p.m. (create también falla con 500).
  Regresión del precedente QUICK-023 / Deuda P2.
- **Fix:** eliminado el import ES6; nuevo accessor `getFieldValue()` en
  `src/lib/firebase-admin.ts` con literal `eval("require('firebase-admin/firestore')")`
  idéntico al de `getDb` (Valla de Chesterton); `updateUser` consume
  `getFieldValue().delete()` dentro del batch atómico de un solo commit.
- **Regla vinculante:** *"Cero imports ES6 de `firebase-admin/*` en `src/` fuera del
  módulo blindado `src/lib/firebase-admin.ts`."* Excepciones: `src/lib/db-check.ts` y
  `src/scripts/migrate-images.ts` (scripts CLI ejecutados con `tsx`, no bundleados).
- **Invariantes FIX-2:** `users-schemas.ts` puro sin centinelas; ledger JSON-plano con
  clave ausente; lógica `createUser`/`deleteUser` intacta; `firestore.rules`,
  `users/page.tsx`, `sendUserInvitation.ts` sin cambios.

---
*Created: 2026-09-25 by Antigravity*
*Ticket: WEB-029*
