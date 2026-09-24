---
task: "024"
name: "Instrumentation hook — setMaxListeners(25) para silenciar MaxListenersExceededWarning"
description: "Deuda 5: hook oficial register() de Next.js; cero cambios en next.config/firebase-admin"
---

# Quick Task 024: Instrumentation hook (setMaxListeners)

## Objective
Crear `src/instrumentation.ts` (hook oficial de Next.js, estable en v16) con
`export async function register()` que ejecuta `process.setMaxListeners(25)` una sola
vez al iniciar el servidor Node. Silencia `MaxListenersExceededWarning` (11 listeners
vs umbral 10, evidenciado 5×/24h en Cloud Run revs 00542/00544/00548) sin alterar
handlers de error de Next.js ni firebase-admin.

## Mandates
- HOOK_REGISTER: `src/instrumentation.ts` con `export async function register()`.
- SET_MAX_LISTENERS: `process.setMaxListeners(25)` con guard `typeof process`.
- ZERO_TOUCH: cero modificaciones a `next.config.ts` (prohibido
  `removeUncaughtErrorAndRejectionListeners`), `src/lib/firebase-admin.ts` (estado
  post-rollback certificado) y consumidores.
- VERIFICATION: build verde + query forense en Cloud Run Beta post-deploy.

## Evidence (pre-ejecución)
- `MaxListenersExceededWarning: 11 uncaughtException listeners added to [process].
  MaxListeners is 10.` — 5 entradas/24h (revs 00542, 00544, 00548).
- `src/instrumentation.ts` no existía; cero refs a `setMaxListeners` en el repo.
- Next `^16.1.1` → hook estable, sin flags.

## Verificación (ejecutada 2026-09-24)
- `grep setMaxListeners(25)` → L15; `tsc` EXIT 0; `build` EXIT 0.
- ZERO_TOUCH: `git diff` vacío; `firebase-admin.ts` intacto (4 eval);
  `removeUncaughtErrorAndRejectionListeners` ausente de next.config.ts.
- Runtime: CI verde → nueva revisión → tráfico forzado → query gcloud
  `textPayload:"MaxListenersExceeded"` sobre revision_name nueva → expect `[]`.

---
*Created: 2026-09-24 by Antigravity*
*Ticket: QUICK-024*
*Status: Ejecutado*
