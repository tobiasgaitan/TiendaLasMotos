---
task: "031"
name: "Endurecimiento de lectura sys_admin_users: whitelist server-side + getDoc por docId"
description: "verificarWhitelist pre-auth con rate-limit; AuthContext y admin-auth migran de query+getDocs a getDoc; rules con list restringido (deploy POST-P1)"
---

# Quick Task 031: Endurecimiento de lectura sys_admin_users

## Objective
1. Nueva Server Action `verificarWhitelist(email)` (Admin SDK, pre-auth, rate-limit
   5/60s por email, logging forense) consumida por `LoginForm` en lugar del `getDoc`
   cliente.
2. `AuthContext` y `admin-auth.ts`: migrar `query+getDocs` a `getDoc(doc(db,
   'sys_admin_users', emailKey))`; `resolverRol` si `exists`, si no `'guest'`.
3. `firestore.rules`: `get: if request.auth != null`; `list` restringido a
   admin/superadmin/auditor vía `get()` cruzado; `write: if false` intacto.
4. INVARIANTE DE SECUENCIA: código a beta pre-P1; endurecimiento de rules SOLO
   tras deploy prod de P1 (por Tobias).

## Precondición (cumplida 2026-09-28)
Migración manual del doc `Nn6XP2U0JxK23s0Fjew6` → `tobiasgaitan@gmail.com` limpio
(`rol=superadmin`, `active=true`, sin `role` legacy). Detectado docId corrupto con
espacios iniciales; corregido por Tobias en consola; verificado por Builder.

## Conventions
- Contrato `useAuth` idéntico (10 consumidores intactos).
- CERO cambios en Server Actions, schemas, a11y, gating UI, ledger, invitation.
- Commit atómico `feat(p5-read-hardening)` + push a `beta`. Sin merge a `main`.

## Verificación
- Suites antes/después sin regresión.
- `tsc`/`build` EXIT 0, `lint` 0 errores.
- Gate runtime (Tobias): no-regresión login + rol para los 5 roles; listado
  operativo admin/superadmin/auditor; sondas REST (get/runQuery sin auth → 403;
  cobrador → 403; superadmin → 200); reversión + purga.

---
*Created: 2026-09-28 by Antigravity*
*Ticket: WEB-031*
