---
task: 019
name: Corrección Cupo Presupuesto y Remoción Crediorbe
description: Normalizar la firma matemática del presupuesto multiplicando por 30 en los hooks useMemo de ambas páginas, y aplicar un filtro perimetral .filter() en el mapeo de Firestore para erradicar a Crediorbe de la plataforma, delegando la selección por defecto a la primera entidad financiera remanente.
---

# Quick Task 019: Corrección Cupo Presupuesto y Remoción Crediorbe

## Objective
Corregir la desescala dimensional del cupo de crédito y filtrar Crediorbe para establecer la primera entidad financiera remanente como predeterminada tanto en la interfaz pública como administrativa.

## Tasks

<task type="auto">
  <name>Modificar reverseCalculator.ts</name>
  <files>src/lib/utils/reverseCalculator.ts</files>
  <action>Ajustar la firma de calculateMaxLoan para recibir monthlyBudget y eliminar la declaración local del mismo.</action>
  <verify>node -e "const { calculateMaxLoan } = require('./src/lib/utils/reverseCalculator'); console.log(calculateMaxLoan(450000, 0))"</verify>
  <done>La función acepta el presupuesto mensual directamente.</done>
</task>

<task type="auto">
  <name>Modificar buscador/page.tsx</name>
  <files>src/app/buscador/page.tsx</files>
  <action>Multiplicar dailyBudget por 30 en useMemo y filtrar Crediorbe de entList.</action>
  <verify>node .agent/scripts/pytest</verify>
  <done>El componente compila correctamente y no tiene errores de tipos o lint.</done>
</task>

<task type="auto">
  <name>Modificar admin/presupuesto/page.tsx</name>
  <files>src/app/admin/presupuesto/page.tsx</files>
  <action>Multiplicar dailyBudget por 30 en useMemo y filtrar Crediorbe de entList.</action>
  <verify>node .agent/scripts/pytest</verify>
  <done>El componente compila correctamente y no tiene errores de tipos o lint.</done>
</task>

---
*Created: 2026-07-13*
