---
task: 017
name: hotfix-crear-pagina-novedades
description: Fallo de enrutamiento (Error 404) debido a la inexistencia física del directorio y componente de página para la ruta /admin/novedades vinculada en el Sidebar.
---

# Quick Task 017: hotfix-crear-pagina-novedades

## Objective
Crear el directorio físico 'src/app/admin/novedades' y construir e inyectar el componente 'page.tsx' dentro de dicho directorio para renderizar el panel reactivo de AnomaliesBanner y la visualización de los reportes de auditoría de anomalías de catálogo detectadas en tiempo real en la base de datos Firestore, aplicando logs forenses de acuerdo a Zero-Silent-Failures.

## Tasks

<task type="auto">
  <name>Crear y configurar la página de novedades y auditoría</name>
  <files>src/app/admin/novedades/page.tsx</files>
  <action>Crear el archivo src/app/admin/novedades/page.tsx con la implementación reactiva para mostrar AnomaliesBanner y un visor detallado de reportes de auditoría de Firestore. Implementar control forense de excepciones y logs Zero-Silent-Failures.</action>
  <verify>cat src/app/admin/novedades/page.tsx && npm run lint && PATH="$(pwd)/.agent/scripts:$PATH" npx @tobiasgaitan/agent-cli eval</verify>
  <done>El archivo page.tsx se crea correctamente, no presenta errores de compilación de TypeScript/ESLint con npm run lint, y la suite de pruebas/evaluador devuelve un score exitoso.</done>
</task>

---
*Created: 2026-06-30*
