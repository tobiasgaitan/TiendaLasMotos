---
task: "021"
name: "Alineación Node 22 en CI — Deuda 4"
description: "Cambio de configuración aislado: node-version 20→22 en deploy-beta.yml y deploy-prod.yml"
---

# Quick Task 021: Alineación Node 22 en CI

## Objective
Alinear estrictamente la versión de Node.js en ambos workflows de CI con el runtime
declarado (Node 22): modificar únicamente `node-version: 20` → `node-version: 22` en la
línea 20 de cada archivo, dentro del bloque `actions/setup-node@v4`. Preservar intactos:
triggers, env vars (incluyendo `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`), secrets, pasos de
build/deploy, configuración Firebase, `package.json`, `Dockerfile` y cualquier otro
archivo. Diff final: exactamente 2 archivos, 2 inserciones, 2 borrados.

## Evidence (pre-ejecución)
- `.github/workflows/deploy-beta.yml:20` → `node-version: 20`.
- `.github/workflows/deploy-prod.yml:20` → `node-version: 20`.
- `package.json:6` → `"engines": { "node": "22" }`.
- `functions/package.json:13` → `"node": "22"`.
- `Dockerfile:1` → `FROM node:22-alpine` (ya alineado).
- Sin `.nvmrc`/`.node-version`.

## Lista atómica de cambios

**Cambio 1 — `.github/workflows/deploy-beta.yml` (línea 20)**
- Antes: `          node-version: 20` → Después: `          node-version: 22`.

**Cambio 2 — `.github/workflows/deploy-prod.yml` (línea 20)**
- Antes: `          node-version: 20` → Después: `          node-version: 22`.

## Conventions
- Sin suite unitaria/E2E: la validación es estructural (grep + diff + YAML).
- No tocar: triggers, env, secrets, pasos, Firebase, `package.json`, `Dockerfile`.
- Prohibido forzar deploy o merge a `main` sin certificación runtime del CI.

## Tasks

<task type="auto">
  <name>Task 1: Alinear node-version en ambos workflows</name>
  <files>[.github/workflows/deploy-beta.yml, .github/workflows/deploy-prod.yml]</files>
  <action>
    En cada archivo, reemplazar la línea 20 `          node-version: 20` por
    `          node-version: 22`, dentro del bloque `actions/setup-node@v4`.
    No modificar ninguna otra línea.
  </action>
  <verify>
    `grep -n "node-version" .github/workflows/deploy-beta.yml .github/workflows/deploy-prod.yml`
    → ambas líneas muestran `node-version: 22`.
    `git diff --stat` → 2 files changed, 2 insertions(+), 2 deletions(-).
    `git diff` → solo 2 hunks, cada uno con `-node-version: 20` / `+node-version: 22`.
  </verify>
  <done>Solo el valor 20→22 cambió; pipeline, env y deploy intactos.</done>
</task>

<task type="auto">
  <name>Task 2: Validación de integridad YAML y no-regresión</name>
  <files>[]</files>
  <action>
    1. Validar YAML de ambos workflows sin ejecutarlos.
    2. `git diff --name-only` → exactamente los 2 workflows.
    3. Confirmar que `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`, triggers, secrets, pasos
       `npm ci`, Build, `Verify Firestore Connection` y `Deploy to Firebase Hosting`
       NO aparecen en el diff.
  </action>
  <verify>YAML válido; `git diff --name-only` = los 2 archivos; cero cambios colaterales.</verify>
  <done>Integridad YAML y perímetro del pipeline demostrados.</done>
</task>

<task type="manual">
  <name>Task 3: Verificación CI runtime (commit + push a beta, observar Actions)</name>
  <files>[]</files>
  <action>
    Commit + push a `beta`. Esperar el run de GitHub Actions y pegar el log del paso
    "Setup Node.js" confirmando instalación de Node 22.x y build verde.
    PROHIBIDO forzar deploy o merge a `main` sin certificación runtime del CI.
  </action>
  <verify>Log de Actions muestra "Setup Node.js" con 22.x y build verde.</verify>
  <done>CI alineado a Node 22 confirmado en runtime.</done>
</task>

## Must-Haves
- Ambos workflows con `node-version: 22`; ninguna otra línea alterada.
- `git diff` = 2 inserciones / 2 borrados exactos.
- Cero cambios en env, secrets, triggers, pasos y configuración Firebase.

---
*Created: 2026-09-23 COT by Antigravity*
*Ticket: WEB-DEBT-004*
