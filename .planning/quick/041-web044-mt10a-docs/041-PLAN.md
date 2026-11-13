---
task: 041
name: MT-10.A deuda documental
description: Registrar deudas WEB-044 sin cambiar versión ni sección 8.
---
# Quick Task 041: MT-10.A

## Objective
Registrar O-37, O-38, PWA rancio, ausencia de harness y WEB-043-O1-obs-001.

## Tasks
<task type="auto">
  <name>Registro no destructivo</name>
  <files>Documento_Maestro_Pagina.md, .planning/STATE.md, .planning/ROADMAP.md</files>
  <action>Añadir deudas y estado de harness; no cambiar versión canónica, no tocar sección 8, no mover SSOT.</action>
  <verify>grep -nE 'O-37|O-38|harness|WEB-043-O1-obs-001' Documento_Maestro_Pagina.md .planning/STATE.md .planning/ROADMAP.md</verify>
  <done>Deudas registradas sin alterar versión ni sección 8.</done>
</task>
