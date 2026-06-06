---
task: 008
name: Deploy updateUsuryRates Cloud Function
description: Transpilar TypeScript y desplegar la función updateUsuryRates a Firebase (proyecto tiendalasmotos)
---

# Quick Task 008: Deploy updateUsuryRates Cloud Function

## Objective
Transpilar el código TypeScript de `functions/src` a JavaScript (`functions/lib`) y desplegar explícitamente la Cloud Function `updateUsuryRates` al proyecto Firebase `tiendalasmotos`.

## Tasks

<task type="auto">
  <name>Transpilar TypeScript a JavaScript</name>
  <files>functions/lib/**</files>
  <action>Ejecutar `npm run build` en el directorio `functions/` para generar los artefactos transpilados en `functions/lib/`</action>
  <verify>ls functions/lib/index.js — Debe existir el archivo transpilado</verify>
  <done>El archivo `functions/lib/index.js` existe y la compilación TSC terminó sin errores</done>
</task>

<task type="auto">
  <name>Desplegar función updateUsuryRates</name>
  <files>functions/lib/**</files>
  <action>Ejecutar `npx -y firebase-tools@latest deploy --only functions:updateUsuryRates --project tiendalasmotos`</action>
  <verify>El log de terminal muestra "Deploy complete!" sin errores 403 o de permisos</verify>
  <done>La función `updateUsuryRates` está desplegada exitosamente en Firebase Functions</done>
</task>

---
*Created: 2026-06-05*
