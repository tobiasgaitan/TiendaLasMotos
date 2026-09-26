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

---
*Created: 2026-09-25 by Antigravity*
*Ticket: WEB-029*
