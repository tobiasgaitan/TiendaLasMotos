---
task: 013
name: Implementar panel AnomaliesBanner con escucha activa
description: Integrar un panel reactivo de anomalías críticas de catálogo dentro de src/app/admin/prospectos/page.tsx, consumiendo una nueva colección 'anomalias' mediante onSnapshot para alertar fallos de validación en tiempo real.
---

# Quick Task 013: Implementar panel AnomaliesBanner con escucha activa

## Objective
Integrar un panel reactivo de anomalías críticas de catálogo dentro de `src/app/admin/prospectos/page.tsx`, consumiendo una nueva colección 'anomalias' mediante `onSnapshot` para alertar fallos de validación en tiempo real, con diseño inmutable y cumplimiento estricto de WCAG AA.

## Tasks

<task type="auto">
  <name>Crear componente AnomaliesBanner.tsx</name>
  <files>src/components/admin/AnomaliesBanner.tsx</files>
  <action>Diseñar y codificar el componente secundario que muestra las anomalías con campos inmutables (severity, user_id, query, message) y contraste WCAG AA con estilos forzados inline.</action>
  <verify>npm run build</verify>
  <done>El archivo existe y compila correctamente.</done>
</task>

<task type="auto">
  <name>Integrar AnomaliesBanner en ProspectsPage</name>
  <files>src/app/admin/prospectos/page.tsx</files>
  <action>Inicializar un segundo useEffect con consulta ordenada por fecha descendente a la colección 'anomalias', almacenar en estado local y renderizar AnomaliesBanner sobre la tabla o en el dashboard preservando la lógica de leads intacta.</action>
  <verify>npm run build</verify>
  <done>La página de prospectos integra el panel reactivo sin regresiones en las columnas Score ni WhatsApp.</done>
</task>
