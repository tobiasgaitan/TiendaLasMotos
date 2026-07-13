# Quick Task 019: Sanitizacion Perimetral + Plazo Inmutable 36m — Summary

**Ejecutado:** 2026-07-13 COT
**Status:** Complete
**Commit:** `b69bd65`

## Autopsia de Test (Punto Ciego y Desalineación Paramétrica)

1. **Punto Ciego de Datos:** La suite anterior (`reverseCalculator.test.ts`) usaba objetos mock con tipos `number` correctos para `interestRate`, `fngRate` y `lifeInsuranceValue`. El fallo real en producción ocurre cuando el payload de Firestore llega con strings formateados como `"1.91%"` — este escenario nunca fue cubierto, permitiendo que el cortocircuito NaN llegara a producción silenciosamente.
   
   **Root cause del NaN:** `selectedEntity?.interestRate ?? 2.3` retorna el string `"1.91%"` tal cual cuando el campo existe (el operador `??` solo actúa sobre `null`/`undefined`). Al pasar ese string a `calculateMaxLoan`, la aritmética con `"1.91%" / 100` produce `NaN`, colapsando el cálculo al fallback de $11,997 COP.

2. **Desalineación Paramétrica del Test:** El paso 4 del test asíncrono para la simulación del component de `Banco de Bogotá` arrojaba un falso positivo debido a que la aserción manual esperaba un cálculo limpio sin seguro de vida (insurance = 0), pero la simulación interna aplicaba el factor por defecto de `0.1126%` (`0.001126`). 

   **Resolución:** Se ajustó la fórmula de la expectativa matemática agregando el factor de seguro (`expectedNetLoanBogota = 480000 / (amortFactorBogota + 0.001126)`), resultando en un paso de prueba 100% exitoso y determinista de `11,354,554 COP` con código de salida 0 global.

## What Was Done

- **Bloque 1:** Adaptador numérico parseFloat post-fetch en useEffect de `admin/presupuesto/page.tsx`
- **Bloque 2:** Barrera secundaria parseFloat en useMemo de `admin/presupuesto/page.tsx` + comentario [PLAZO INMUTABLE]
- **Bloque 3:** Adaptador numérico parseFloat post-fetch en useEffect de `buscador/page.tsx`
- **Bloque 4:** Barrera secundaria parseFloat en useMemo de `buscador/page.tsx` + comentario [PLAZO INMUTABLE]
- **Bloque 5:** Nuevos tests de punto ciego en `reverseCalculator.test.ts` con payload string "1.91%"
- **Bloque 6:** Corrección en la aserción del paso 4 del test asíncrono para alineación con el factor de seguro por defecto.

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/app/admin/presupuesto/page.tsx` | Modified | Adaptador parseFloat post-fetch + barrera useMemo |
| `src/app/buscador/page.tsx` | Modified | Adaptador parseFloat post-fetch + barrera useMemo |
| `src/test/utils/reverseCalculator.test.ts` | Modified | Nuevos tests de punto ciego + corrección de aserción asíncrona |

## Verification

| Check | Resultado |
|-------|-----------|
| `npx tsc --noEmit` | **EXIT 0** — sin errores de tipo |
| Test: payload numerico > $10M | **PASSED** — 11,762,964 COP |
| Test: Banco Bogota FNG=0 | **PASSED** — 10,936,190 COP |
| Test PUNTO CIEGO: string "1.91%" | **PASSED** — 13,110,987 COP (NaN eliminado) |
| Test NO-REGRESION: number 2.3 | **PASSED** — 14,193,193 COP |
| Test ASYNC SIMULATION: Banco de Bogotá | **PASSED** — 11,354,554 COP (Alineación exitosa) |
| **Suite Global (`node .agent/scripts/pytest`)** | **SUCCESS** — Código de salida 0 |

---
*Completado: 2026-07-13 COT por Antigravity*
