---
task: 037
name: MT-02 diagnóstico O-37
description: Definir reporte forense cerrado sin cambiar comportamiento.
---
# Quick Task 037: MT-02

## Objective
Entregar plantilla forense de O-37 y taxonomía cerrada; no alterar código.

## Tasks
<task type="auto">
  <name>Reporte forense O-37</name>
  <files>.planning/quick/037-web044-mt02-o37-forensics/037-SUMMARY.md</files>
  <action>Documentar campos obligatorios, taxonomía y estado de evidencia runtime pendiente.</action>
  <verify>git grep -n 'O-37' .planning/quick/037-web044-mt02-o37-forensics</verify>
  <done>Plantilla cerrada y sin conclusiones no evidenciadas.</done>
</task>
