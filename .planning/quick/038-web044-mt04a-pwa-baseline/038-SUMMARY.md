# Quick Task 038: MT-04.A — Summary

**Executed:** 2026-11-09
**Status:** Complete (baseline estático)

## Current State Verified

- `public/sw.js` usa `tlm-shell-v2`.
- Allowlist de navegación exacta: `/admin/inventario-asesor` y `/admin/inventario-asesor/`.
- No cachea POST, `/api`, `_rsc`, Auth, Firestore ni Storage.
- `install` usa `skipWaiting`; `activate` limpia `tlm-shell-*` y usa `clients.claim()`.
- `PwaRegistrar.tsx` registra `/sw.js` solo para asesor/producción.
- `purge.ts` elimina Cache Storage y desregistra workers solo en logout; no toca IndexedDB.
- `manifest.json` conserva `start_url` y `scope`.

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `.planning/quick/038-web044-mt04a-pwa-baseline/038-PLAN.md` | Created | Plan baseline |
| `.planning/quick/038-web044-mt04a-pwa-baseline/038-SUMMARY.md` | Created | Baseline |

## Verification

- Lectura física de `public/sw.js`, `PwaRegistrar.tsx`, `purge.ts`, `firebase.json` y `manifest.json`.
- No se modificó código.
