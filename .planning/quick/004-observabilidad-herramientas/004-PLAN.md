---
task: 004
name: Observabilidad de Herramientas IA (WEB-OBS-1.3)
description: Alineación de la UI administrativa con la Arquitectura de Agente Único (Bot v9.7.0)
---

# Quick Task 004: Observabilidad de Herramientas IA

## Objective
Alinear la UI administrativa con el contrato del agente v9.7.0, añadiendo campos de observabilidad (`active_tool`, `tool_status`) al schema de prospectos y estandarizando la nomenclatura de estados (`DONE` → `CLOSED`).

## Tasks

<task type="auto">
  <name>Actualizar prospectUpdateSchema en actions.ts</name>
  <files>src/app/actions.ts</files>
  <action>Añadir `active_tool` (string) y `tool_status` (enum: IDLE, RUNNING, COMPLETED, FAILED) al schema Zod. Sustituir `DONE` por `CLOSED` en el enum de status.</action>
  <verify>npx tsc --noEmit</verify>
  <done>Schema compilando sin errores TS con las nuevas llaves y nomenclatura CLOSED</done>
</task>

<task type="auto">
  <name>Refactorizar ProspectModal.tsx — Indicador de herramienta activa + nomenclatura CLOSED</name>
  <files>src/components/admin/ProspectModal.tsx</files>
  <action>1. Sustituir DONE por CLOSED en interfaz Prospect y STATUS_CONFIG. 2. Añadir active_tool y tool_status a la interfaz Prospect. 3. Añadir indicador visual dinámico (spinner/skeleton) que se activa cuando tool_status === 'RUNNING'.</action>
  <verify>npx tsc --noEmit</verify>
  <done>Modal compilando, spinner visible cuando tool_status es RUNNING, sin referencias a DONE</done>
</task>

<task type="auto">
  <name>Corrección nomenclatura global DONE→CLOSED en page.tsx</name>
  <files>src/app/admin/prospectos/page.tsx</files>
  <action>Sustituir DONE por CLOSED en STATUS_CONFIG del dashboard de prospectos.</action>
  <verify>npx tsc --noEmit</verify>
  <done>Dashboard de prospectos compilando sin errores, STATUS_CONFIG usando CLOSED</done>
</task>

---
*Created: 2026-05-10*
