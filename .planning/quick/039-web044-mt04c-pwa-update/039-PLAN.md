---
task: 039
name: MT-04.C autocura PWA no destructiva
description: Añadir registration.update y updateViaCache none sin unregister ni IndexedDB.
---
# Quick Task 039: MT-04.C

## Objective
Permitir actualización del worker sin tocar tlm_offline.

## Tasks
<task type="auto">
  <name>Actualización no destructiva</name>
  <files>src/components/PwaRegistrar.tsx, src/test/utils/pwa.test.ts</files>
  <action>Registrar con updateViaCache none, ejecutar registration.update, no unregister, no IDB, no reload. Ajustar aserción estática existente.</action>
  <verify>npx --no-install tsx src/test/utils/pwa.test.ts</verify>
  <done>PwaRegistrar actualiza sin destruir datos.</done>
</task>
