---
task: 038
name: MT-04.A baseline PWA
description: Registrar estado estático de sw.js, PwaRegistrar, purge y manifest.
---
# Quick Task 038: MT-04.A

## Objective
Documentar el estado real del worker y cachés antes de cambios.

## Tasks
<task type="auto">
  <name>Baseline PWA</name>
  <files>.planning/quick/038-web044-mt04a-pwa-baseline/038-SUMMARY.md</files>
  <action>Registrar cache v2, allowlist, registro actual, purge y manifest sin modificar código.</action>
  <verify>grep -nE 'tlm-shell|inventario-asesor|registration' public/sw.js src/components/PwaRegistrar.tsx</verify>
  <done>Baseline documentado.</done>
</task>
