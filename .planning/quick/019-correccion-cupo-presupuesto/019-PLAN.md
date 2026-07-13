---
task: "019"
name: "Corrección Cupo Presupuesto — Sanitización Perimetral y Plazo 36m"
description: "WEB-837-REVISED-FINAL-PRODUCTION: Cortocircuito NaN por tipos String con % desde Firestore"
---

# Quick Task 019: Sanitización Perimetral Post-Fetch + Plazo Inmutable 36m

## Objective
Implementar adaptador numérico parseFloat post-fetch en useEffect de buscador y admin/presupuesto,
y confirmar argumento 36 como inmutable en useMemo de calculateMaxLoan. Añadir test de caso borde
con payload string tipo "1.91%" que era el punto ciego de la suite anterior.

## Tasks

<task type="auto">
  <name>Bloque 1: Sanitización post-fetch en admin/presupuesto/page.tsx</name>
  <files>src/app/admin/presupuesto/page.tsx</files>
  <action>Reemplazar el .map(d => ({ id: d.id, ...d.data() } as FinancialEntity)) con adaptador parseFloat</action>
  <verify>grep -n "parseFloat" src/app/admin/presupuesto/page.tsx | grep interestRate</verify>
  <done>grep devuelve la línea con parseFloat(String(raw.interestRate</done>
</task>

<task type="auto">
  <name>Bloque 2: Barrera secundaria useMemo en admin/presupuesto/page.tsx</name>
  <files>src/app/admin/presupuesto/page.tsx</files>
  <action>Reemplazar lectura directa ?? por parseFloat en interest/fng/insurance + comentario [PLAZO INMUTABLE]</action>
  <verify>grep -n "parseFloat\|PLAZO INMUTABLE" src/app/admin/presupuesto/page.tsx</verify>
  <done>Ambas líneas presentes</done>
</task>

<task type="auto">
  <name>Bloque 3: Sanitización post-fetch en buscador/page.tsx</name>
  <files>src/app/buscador/page.tsx</files>
  <action>Reemplazar el .map(d => ({ id: d.id, ...d.data() } as FinancialEntity)) con adaptador parseFloat</action>
  <verify>grep -n "parseFloat" src/app/buscador/page.tsx | grep interestRate</verify>
  <done>grep devuelve la línea con parseFloat(String(raw.interestRate</done>
</task>

<task type="auto">
  <name>Bloque 4: Barrera secundaria useMemo en buscador/page.tsx</name>
  <files>src/app/buscador/page.tsx</files>
  <action>Reemplazar lectura directa ?? por parseFloat en interest/fng/insurance + comentario [PLAZO INMUTABLE]</action>
  <verify>grep -n "parseFloat\|PLAZO INMUTABLE" src/app/buscador/page.tsx</verify>
  <done>Ambas líneas presentes</done>
</task>

<task type="auto">
  <name>Bloque 5: Test de caso borde string con % en reverseCalculator.test.ts</name>
  <files>src/test/utils/reverseCalculator.test.ts</files>
  <action>Añadir test que simule payload Firestore con tipos string "1.91%" para cubrir el punto ciego</action>
  <verify>npx tsx src/test/utils/reverseCalculator.test.ts</verify>
  <done>Todos los tests pasan con PASSED</done>
</task>

---
*Created: 2026-07-13 COT by Antigravity*
