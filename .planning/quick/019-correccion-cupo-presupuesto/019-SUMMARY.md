# Quick Task 019: Sanitizacion Perimetral + Plazo Inmutable 36m — Summary

**Ejecutado:** 2026-07-13 COT
**Status:** Complete
**Commit:** `ce1d4ca`

## Autopsia de Test (Punto Ciego Reportado)

La suite anterior (`reverseCalculator.test.ts`) usaba objetos mock con tipos `number` correctos
para `interestRate`, `fngRate` y `lifeInsuranceValue`. El fallo real en produccion ocurre cuando
el payload de Firestore llega con strings formateados como `"1.91%"` — este escenario nunca fue
cubierto, permitiendo que el cortocircuito NaN llegara a produccion silenciosamente.

**Root cause del NaN:** `selectedEntity?.interestRate ?? 2.3` retorna el string `"1.91%"` tal cual
cuando el campo existe (el operador `??` solo actua sobre `null`/`undefined`). Al pasar ese string
a `calculateMaxLoan`, la aritmetica con `"1.91%" / 100` produce `NaN`, colapsando el calculo al
fallback de $11,997 COP.

## What Was Done

- Bloque 1: Adaptador numerico parseFloat post-fetch en useEffect de `admin/presupuesto/page.tsx`
- Bloque 2: Barrera secundaria parseFloat en useMemo de `admin/presupuesto/page.tsx` + comentario [PLAZO INMUTABLE]
- Bloque 3: Adaptador numerico parseFloat post-fetch en useEffect de `buscador/page.tsx`
- Bloque 4: Barrera secundaria parseFloat en useMemo de `buscador/page.tsx` + comentario [PLAZO INMUTABLE]
- Bloque 5: Nuevos tests de punto ciego en `reverseCalculator.test.ts` con payload string "1.91%"

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/app/admin/presupuesto/page.tsx` | Modified | Adaptador parseFloat post-fetch + barrera useMemo |
| `src/app/buscador/page.tsx` | Modified | Adaptador parseFloat post-fetch + barrera useMemo |
| `src/test/utils/reverseCalculator.test.ts` | Modified | 2 nuevos tests cubriendo punto ciego string "1.91%" |

## Verification

| Check | Resultado |
|-------|-----------|
| `npx tsc --noEmit` | **EXIT 0** — sin errores de tipo |
| Test: payload numerico > $10M | **PASSED** — 11,762,964 COP |
| Test: Banco Bogota FNG=0 | **PASSED** — 10,936,190 COP |
| Test PUNTO CIEGO: string "1.91%" | **PASSED** — 13,110,987 COP (NaN eliminado) |
| Test NO-REGRESION: number 2.3 | **PASSED** — 14,193,193 COP |

## Nota sobre test pre-existente fallido

El test async "Simulacion Firestore 3000ms" falla con diferencia matematica en Banco de Bogota.
Este fallo es pre-existente al presente hotfix (la discrepancia es por `lifeInsuranceValue=0`
en el mock pero el calculo del reverseCalculator aplica el default de seguro). No es regresion
de los cambios de WEB-837-REVISED-FINAL-PRODUCTION.

---
*Completado: 2026-07-13 COT por Antigravity*
