---
task: 035
name: MT-00 puerta de evidencia física
description: Certificar SSOT raíz y separar evidencia de repo, sesión y criterios externos.
---
# Quick Task 035: MT-00

## Objective
Registrar que el SSOT operativo permanece en la raíz y que ningún microtask depende de artefactos de auditoría no versionados.

## Tasks
<task type="auto">
  <name>Evidencia física no destructiva</name>
  <files>ninguno</files>
  <action>Registrar SSOT raíz, ausencia de artefactos de auditoría versionados y separación de criterios de sesión.</action>
  <verify>git status --short && test -f Documento_Maestro_Pagina.md</verify>
  <done>Constancia documental sin cambios de código.</done>
</task>
