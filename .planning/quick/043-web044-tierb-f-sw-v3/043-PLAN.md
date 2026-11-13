---
task: 043
name: Tier B F — Service Worker v3
description: Forzar worker nuevo sin unregister ni pérdida de IndexedDB.
---
# Quick Task 043: Tier B F

## Objective
Cambiar CACHE_SHELL a tlm-shell-v3 manteniendo allowlist, exclusiones y limpieza de shells antiguos.

## Tasks
<task type="auto">
  <name>Bump shell</name>
  <files>public/sw.js, src/test/utils/pwa.test.ts</files>
  <action>Actualizar constante a v3 y aserción estática.</action>
  <verify>npx --no-install tsx src/test/utils/pwa.test.ts</verify>
  <done>SW v3 y test ALL PASSED.</done>
</task>
