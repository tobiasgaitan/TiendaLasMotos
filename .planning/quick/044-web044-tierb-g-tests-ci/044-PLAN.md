---
task: 044
name: Tier B G — harness y gate CI
description: Vitest, fake-indexeddb, tsx y tests fail-closed.
---
# Quick Task 044: Tier B G

## Objective
Agregar runner reproducible y gate CI antes de build/deploy.

## Tasks
<task type="auto">
  <name>Harness y suites</name>
  <files>package.json, package-lock.json, vitest.config.mts, src/test/vitest/, .github/workflows/deploy-beta.yml, .github/workflows/deploy-prod.yml</files>
  <action>Agregar scripts, dependencias, setup fake-indexeddb, suites MT-07/MT-08/MT-09/NAMING LOCK y gate CI.</action>
  <verify>npm test</verify>
  <done>npm test EXIT 0 y CI ejecuta test:ci antes de build/deploy.</done>
</task>
