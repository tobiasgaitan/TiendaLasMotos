---
task: "023"
name: "Refactor firebase-admin a singleton estricto con server-only"
description: "Erradicar eval/require dinámico; imports ES6 + getAdminApp() privada sobre globalThis"
---

# Quick Task 023: Refactor firebase-admin (singleton estricto)

## Objective
Refactorizar `src/lib/firebase-admin.ts`: erradicar `eval("require(...)")`, usar imports
ES6 estáticos + paquete `server-only`, y unificar la inicialización en una única función
privada `getAdminApp()` sobre `globalThis`. `getDb`/`getAdminAuth` mantienen sus firmas
exactas. `initializeApp` exactamente una vez por instancia (Cloud Run).

## Mandates
- ERRADICAR_EVAL: cero `eval()` / `require()` dinámico.
- SERVER_ONLY: `import 'server-only'` como primera línea.
- SINGLETON_STRICT: `getAdminApp()` privada con `globalThis`; `getDb`/`getAdminAuth`
  solo la consumen.
- SIGNATURE_LOCK: firmas exactas de `getDb()` y `getAdminAuth()` (14+ consumidores
  intactos).

## Evidence (pre-ejecución)
- 4× `eval("require('firebase-admin/...')")` en `getDb`/`getAdminAuth` (lógica duplicada,
  `global._firebaseAdminApp`).
- 6 archivos consumidores, 34 llamadas (`actions.ts`, `actions/auth.ts`,
  `actions/inventory-normalization.ts`, `creditos/actions.ts`,
  `creditos/financiero-actions.ts`).
- `server-only` NO instalado → `npm install server-only` (dependencies).
- `next.config.ts:15` ya declara `serverExternalPackages` (no se toca).
- `db-check.ts`, `scripts/migrate-images.ts`, `functions/**`: fuera de alcance.

## Lista atómica de cambios
1. `package.json` + `package-lock.json`: `"server-only": "^0.0.1"` en dependencies.
2. `src/lib/firebase-admin.ts` (rewrite ~25 líneas): `import 'server-only'` L1;
   imports estáticos `firebase-admin/app|firestore|auth`; `getAdminApp()` privada con
   `globalThis.__firebaseAdminApp` (tipada); `getDb = (): Firestore`,
   `getAdminAuth = (): Auth`.

## Verificación (ejecutada 2026-09-24)
- `grep -rn 'eval(' src/lib/firebase-admin.ts` → vacío.
- `npx tsc --noEmit` → EXIT 0.
- `npm run build` → EXIT 0 (8/8 rutas `/admin/creditos/...`).
- `npm run lint` → 0 errores.

---
*Created: 2026-09-24 by Antigravity*
*Ticket: QUICK-023*
*Status: Ejecutado*
