---
task: 007
name: WEB-836 Usury Rate Bot Fix
description: Fix ERR_BAD_REQUEST in Cloud Function updateUsuryRates and add syncedWithUsura guard
---

# Quick Task 007: WEB-836 Usury Rate Bot Fix

## Objective
Fix the broken Socrata API call in `usuryRateBot.ts` (wrong dataset ID and schema) and add the `syncedWithUsura` guard to the batch update logic.

## Root Cause Analysis (Verified Physically)

### 1. Dataset ID is WRONG
- **Old ID `32sa-8pi3`** → This is **TRM** (Tasa Representativa del Mercado / Dollar Exchange Rate)
- **Correct ID `pare-7x5i`** → "Tasa de interés bancario corriente - TIBC" (SFC)
- Confirmed via: `https://www.datos.gov.co/api/views/metadata/v1/32sa-8pi3` → name: "Tasa de Cambio Representativa del Mercado- TRM"

### 2. Schema Keys Changed
| Old Key | New Key | Notes |
|---------|---------|-------|
| `tasa_efectiva_anual` | `interes_bancario_corriente` | Has `%` suffix (e.g. "19.19%") |
| `vigencia_hasta` | `vigencia_hasta` | Same |
| `vigencia_desde` | `vigencia_desde` | Same |
| `modalidad` | `modalidad` | Same key, but value is now UPPERCASE |

### 3. Modalidad Value Case Mismatch
- Old: `"Consumo y Ordinario"` (Title Case)
- New: `"CONSUMO Y ORDINARIO"` (UPPERCASE)

### 4. Rate Semantics
- The dataset returns **IBC** (Interés Bancario Corriente), NOT the usury rate directly
- **Tasa de Usura = IBC × 1.5** (by Colombian law, Art. 305 C.P.)
- Old code assumed `tasa_efectiva_anual` was the usury rate directly

### 5. Missing `syncedWithUsura` Guard
- Frontend (`ConfigModal.tsx` L96-101) has a checkbox for `syncedWithUsura`
- Type (`financial.ts` L53) defines `syncedWithUsura?: boolean`
- **But `usuryRateBot.ts` only checks `manualOverride` — ignores `syncedWithUsura`**
- Per ticket: ONLY update entities where `syncedWithUsura === true`

## Tasks

<task type="auto">
  <name>Fix Socrata Query and syncedWithUsura Guard</name>
  <files>functions/src/usuryRateBot.ts</files>
  <action>
    1. Change DATASET_URL from `32sa-8pi3` to `pare-7x5i`
    2. Update UsuryData interface: rename `tasa_efectiva_anual` → `interes_bancario_corriente`
    3. Change modalidad filter from `"Consumo y Ordinario"` → `"CONSUMO Y ORDINARIO"`
    4. Parse `interes_bancario_corriente` stripping "%" suffix before parseFloat
    5. Calculate usury rate = IBC × 1.5 (the actual usury ceiling)
    6. Add `syncedWithUsura === true` guard to batch update (entity must opt-in)
    7. Update JSDoc to reflect new semantics
  </action>
  <verify>Create and run a standalone Node.js script that fetches from the corrected endpoint and prints the extracted usury rate</verify>
  <done>Script prints valid rate; TypeScript compiles without errors</done>
</task>

---
*Created: 2026-06-05*
