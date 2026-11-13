---
task: 036
name: MT-01 revisado_por UID
description: Forward-only de revisado_por a me.uid sin backfill ni claves nuevas.
---
# Quick Task 036: MT-01

## Objective
Corregir aprobarConteo y rechazarConteo para persistir me.uid en revisado_por.

## Tasks
<task type="auto">
  <name>Normalizar revisado_por</name>
  <files>src/app/admin/inventory/actions/aprobarConteo.ts, src/app/admin/inventory/actions/rechazarConteo.ts, src/test/utils/inventario-actions.test.ts</files>
  <action>Usar me.uid en conteo y en datos_nuevos del rechazo; conservar registrado_por UID y registrado_por_email; añadir contract test estático.</action>
  <verify>npx --no-install tsx src/test/utils/inventario-actions.test.ts</verify>
  <done>Acciones escriben UID y el test pasa.</done>
</task>
