---
task: 042
name: Tier B E — outbox sin fallback global
description: Eliminar clear global de la rama owner-scoped fallida.
---
# Quick Task 042: Tier B E

## Objective
Preservar borradores/fotos del propietario y marcar error ante fallo owner-scoped, sin clear global.

## Tasks
<task type="auto">
  <name>Purga owner-scoped fail-closed</name>
  <files>src/lib/offline/outbox.ts</files>
  <action>Eliminar fallback global, conservar registros, marcar estado_envio error y loggear conteo_id/UID.</action>
  <verify>grep -n 'Purga global explícita sin propietario' src/lib/offline/outbox.ts</verify>
  <done>Rama owner-scoped no ejecuta clear.</done>
</task>
