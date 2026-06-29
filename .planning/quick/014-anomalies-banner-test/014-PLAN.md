---
task: 014
name: Implementar suite de pruebas unitarias para AnomaliesBanner y validación de aserciones
description: Se requiere estructurar y adjuntar la prueba unitaria y de renderizado para el componente reactivo AnomaliesBanner para validar que parsea los datos forenses de las anomalías críticamente sin generar fallos silenciosos.
---

# Quick Task 014: Implementar suite de pruebas unitarias para AnomaliesBanner y validación de aserciones

## Objective
Crear el archivo de pruebas `src/test/components/AnomaliesBanner.test.tsx` para validar que `AnomaliesBanner` procesa y renderiza correctamente anomalías críticas con el payload canónico inmutable de Firestore `{ severity: 'ERROR', user_id: '5730000000', query: 'Boxer 100', message: 'CATALOG_VALIDATION_FAIL' }` sin fallos silenciosos y cumpliendo con el contraste de color WCAG AA de forma rigurosa.

## Tasks

<task type="auto">
  <name>Crear el archivo de pruebas de AnomaliesBanner</name>
  <files>src/test/components/AnomaliesBanner.test.tsx</files>
  <action>Crear el archivo de pruebas con aserciones rigurosas de la estructura DOM virtual de React, incluyendo validación matemática de contraste WCAG AA (ratio >= 4.5:1) para el payload canónico mockeado.</action>
  <verify>npx agent-cli eval</verify>
  <done>El archivo de pruebas se compila sin errores, pasa el chequeo de tipos con tsc --noEmit, pasa eslint y el score es 1.000.</done>
</task>
