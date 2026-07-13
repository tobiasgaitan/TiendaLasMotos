---
task: 019
name: Corrección Cupo Presupuesto y Remoción Crediorbe
description: Aislamiento a 36 meses, creación de pruebas unitarias de caracterización y exclusión perimetral refinada de Crediorbe (insensible a mayúsculas/minúsculas).
---

# Quick Task 019: Corrección Cupo Presupuesto y Remoción Crediorbe

## Objective
Aislar el cálculo del cupo a 36 meses, crear pruebas unitarias de caracterización matemática en src/test/utils/reverseCalculator.test.ts para evitar futuros falsos positivos, refinar el filtro de exclusión de Crediorbe y actualizar la integración en el validador pytest del agente.

## Tasks

<task type="auto">
  <name>Modificar reverseCalculator.ts</name>
  <files>src/lib/utils/reverseCalculator.ts</files>
  <action>Establecer el parámetro meses por defecto en 36.</action>
  <verify>npx tsx -e "import { calculateMaxLoan } from './src/lib/utils/reverseCalculator'; console.log(calculateMaxLoan(450000, 0).maxLoanAmount)"</verify>
  <done>La firma tiene 36 como parámetro por defecto.</done>
</task>

<task type="auto">
  <name>Crear reverseCalculator.test.ts</name>
  <files>src/test/utils/reverseCalculator.test.ts</files>
  <action>Crear suite de pruebas unitarias con aserciones para cupo > 10M y tasas 0 (Banco de Bogotá).</action>
  <verify>npx tsx src/test/utils/reverseCalculator.test.ts</verify>
  <done>Las pruebas se ejecutan y pasan exitosamente.</done>
</task>

<task type="auto">
  <name>Integrar tests en pytest</name>
  <files>.agent/scripts/pytest</files>
  <action>Modificar el script para correr las pruebas unitarias de frontend automáticamente.</action>
  <verify>node .agent/scripts/pytest</verify>
  <done>El shim ejecuta tanto tsc, eslint como las suites de pruebas unitarias.</done>
</task>

<task type="auto">
  <name>Modificar buscador/page.tsx</name>
  <files>src/app/buscador/page.tsx</files>
  <action>Cambiar argumento a 36 en useMemo, refinar filtro de Crediorbe para id y name.</action>
  <verify>node .agent/scripts/pytest</verify>
  <done>El componente compila y pasa todas las validaciones.</done>
</task>

<task type="auto">
  <name>Modificar admin/presupuesto/page.tsx</name>
  <files>src/app/admin/presupuesto/page.tsx</files>
  <action>Cambiar argumento a 36 en useMemo, refinar filtro de Crediorbe para id y name.</action>
  <verify>node .agent/scripts/pytest</verify>
  <done>El componente compila y pasa todas las validaciones.</done>
</task>

---
*Created: 2026-07-13*
