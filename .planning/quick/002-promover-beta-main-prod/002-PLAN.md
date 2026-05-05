---
task: 002
name: Promover rama beta a main y desplegar a producción
description: Alineación estructural de entornos. Merge de origin/beta hacia main, certificación con agent-cli eval y push a producción.
ticket_id: WEB-PROD-SYNC-811
---

# Quick Task 002: Promover rama beta a main-prod

## Objective
Sincronizar la rama `main` con los 223 commits (29 críticos de estabilización según reporte) acumulados en `beta`, garantizando que la Verdad Inmutable se refleje en el entorno de producción en Cloud Run.

## Tasks

<task type="auto">
  <name>Sincronización de Ramas (Git Merge)</name>
  <files>main</files>
  <action>Ejecutar checkout a main y merge de origin/beta (no fast-forward en caso de conflictos).</action>
  <verify>git log main..origin/beta --oneline</verify>
  <done>La rama main contiene todos los commits de beta.</done>
</task>

<task type="auto">
  <name>Certificación de Estabilidad (Evaluation)</name>
  <files>N/A</files>
  <action>Ejecutar npm run agent-eval para certificar la estabilidad del AST y dependencias.</action>
  <verify>npm run agent-eval</verify>
  <done>Score de Coherencia 1.000 obtenido.</done>
</task>

<task type="auto">
  <name>Despliegue a Producción (Git Push)</name>
  <files>main</files>
  <action>Realizar git push origin main para disparar la GitHub Action de despliegue.</action>
  <verify>git branch -v</verify>
  <done>Rama main pusheada exitosamente.</done>
</task>

---
*Created: 2026-05-05*
