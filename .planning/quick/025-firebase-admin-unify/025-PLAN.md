---
task: "025"
name: "Deuda P2: Unificación singleton firebase-admin (eval conservado)"
description: "getAdminApp() privada única; blindaje de empaquetado; firmas intactas"
---

# Quick Task 025: Deuda P2 — Unificación singleton firebase-admin

## Objective
Eliminar la duplicación de bloques `if (!globalAny._firebaseAdminApp)` entre `getDb()` y
`getAdminAuth()` centralizando la inicialización en `getAdminApp()` privada, MANTENIENDO
el patrón `eval("require(...)")` con literales idénticos (blindaje contra externals
hasheados `firebase-admin-<hash>` bajo firebase-frameworks + Turbopack; evidencia:
QUICK-023 rev `00548-men`, revert `b96f486`). Firmas intactas (NAMING LOCK).

## Evidence
- PSD §9.E (antes: observación pendiente; ahora: resuelta).
- Autopsia 1-7 verde: `initializeApp`×1, `eval`×3, cero ES6, tsc/build EXIT 0,
  tsx 3/3 (ejercita `getAdminAuth`), diff = 1 archivo (+18/−23).
- Runtime rev `ssrtiendalasmotosbeta-00560-liz` (100% tráfico): 9/9 HTTP 200,
  `ERR_MODULE_NOT_FOUND` → `[]`, `MaxListenersExceeded` → `[]`.
- **Coherence Score: 0.99** (diff canónico: 1 archivo, refactor puramente estructural,
  9/9 verificaciones en verde, 0 cambios en consumidores/config).

## Lista atómica de cambios
1. `src/lib/firebase-admin.ts`: `getAdminApp()` privada + `getDb`/`getAdminAuth`
   consumidoras. Commit `fe37ca6`.
2. PSD: §9.E reescrito como "Deuda P2 RESUELTA".
3. STATE.md: línea de Deuda P2 en "Deudas Técnicas Resueltas".
4. ROADMAP.md: entrada Quick-027 (Deuda P2).

## Must-Haves
- Cero ES6 en `firebase-admin.ts`; `next.config.ts`, `instrumentation.ts`,
  consumidores y tests intactos.
- Sin merge a `main` sin certificación del Director.

---
*Created: 2026-09-24 by Antigravity*
*Ticket: WEB-QUICK-025*
*Status: Ejecutado y certificado*
