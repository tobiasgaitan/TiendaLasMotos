# Quick Task 007: WEB-836 Usury Rate Bot Fix — Summary

**Executed:** 2026-06-05
**Status:** Complete

## What Was Done

Fixed 3 critical bugs in `usuryRateBot.ts` that caused `ERR_BAD_REQUEST`:

### Bug 1: Wrong Dataset ID
The original code used dataset `32sa-8pi3`, which is actually the **TRM (Dollar Exchange Rate)**, NOT the TIBC. The correct dataset is `pare-7x5i` ("Tasa de interés bancario corriente - TIBC").

### Bug 2: Schema Key Mismatch
The Socrata API field changed from `tasa_efectiva_anual` → `interes_bancario_corriente`. Additionally, the new field returns values with a `%` suffix (e.g., `"19.19%"`) which required parsing. The `modalidad` filter value also changed from Title Case to UPPERCASE (`"CONSUMO Y ORDINARIO"`).

### Bug 3: Missing syncedWithUsura Guard
The batch update logic only checked `manualOverride` but the frontend (`ConfigModal.tsx`) has a `syncedWithUsura` checkbox (labeled "AUTO") that must be `true` for entities to be auto-updated. Added the guard: entities now require `syncedWithUsura === true` AND `manualOverride !== true`.

### Additional Improvements
- Added `IBC × 1.5` calculation to derive the actual usury rate ceiling (Art. 305 C.P. Colombia)
- Added forensic logging for Socrata API error responses (status + body)
- Added `lastUsuryEA` and `lastIBCEA` fields to Firestore updates for audit trail
- Improved batch summary logging with counts for each skip reason

## Files Modified
| File | Action | Description |
|------|--------|-------------|
| `functions/src/usuryRateBot.ts` | Modified | Fixed dataset ID, schema, modalidad filter, added syncedWithUsura guard |
| `functions/test-usury-endpoint.mjs` | Created | Standalone verification script for the corrected endpoint |

## Verification

### Endpoint Verification (Standalone Script)
```
=== WEB-836: Usury Rate Endpoint Verification ===

[2] Raw API Response:
{
  "resolucion": "823",
  "fecha_resolucion": "2026-05-29T00:00:00.000",
  "vigencia_desde": "2026-06-01T00:00:00.000",
  "vigencia_hasta": "2026-06-30T00:00:00.000",
  "interes_bancario_corriente": "19.19%",
  "modalidad": "CONSUMO Y ORDINARIO"
}

=== RESULTS ===
[3] IBC (E.A.):         19.19%
[4] Usury Rate (E.A.):  28.79%  (IBC × 1.5)
[5] Usury Rate (M.V.):  2.1308%

✅ VERIFICATION PASSED — Endpoint is functional.
```

### TypeScript Compilation
`npx tsc --noEmit` — **Zero errors**.

---
*Completed: 2026-06-05*
