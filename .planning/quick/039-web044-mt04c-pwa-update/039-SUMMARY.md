# Quick Task 039: MT-04.C — Summary

**Executed:** 2026-11-09
**Status:** Complete (autocura no destructiva)

## What Was Done

`PwaRegistrar.tsx` ahora registra `/sw.js` con `updateViaCache: "none"` y ejecuta `registration.update()`.
No desregistra el worker, no recarga la página, no toca IndexedDB, `localStorage` ni `tlm_offline`.
Se ajustó la aserción estática existente en `pwa.test.ts` para el nuevo registro seguro.

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/components/PwaRegistrar.tsx` | Modified | Update de worker no destructivo |
| `src/test/utils/pwa.test.ts` | Modified | Aserción de registro/update |

## Verification

- `npx --no-install tsx src/test/utils/pwa.test.ts` → ALL PASSED.
- `PwaRegistrar` contiene `registration.update()` y `updateViaCache: "none"`.
- No contiene `unregister`, `indexedDB` ni `tlm_offline`.

## Commit

`1cf14b6`
