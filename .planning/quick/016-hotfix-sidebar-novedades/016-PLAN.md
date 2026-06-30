---
task: 016
name: hotfix-sidebar-novedades
description: Ampliación del contenedor colapsable e integración de la ruta de Reportes/Novedades en el Sidebar Administrativo.
---

# Quick Task 016: hotfix-sidebar-novedades

## Objective
Ampliar la capacidad del contenedor colapsable de configuración del sistema de max-h-60 a max-h-80 e inyectar el enlace a la ruta /admin/novedades utilizando el icono Bell en el Sidebar Administrativo para la visualización de anomalías del catálogo e informes de auditoría.

## Tasks

<task type="auto">
  <name>Modificar Sidebar Administrativo</name>
  <files>src/components/AdminSidebar.tsx</files>
  <action>Cambiar la clase max-h-60 a max-h-80 en el contenedor colapsable de config. Agregar un Link hacia /admin/novedades con el icono Bell e implementar estilos de contraste WCAG nativos.</action>
  <verify>PATH="$(pwd)/.agent/scripts:$PATH" npx @tobiasgaitan/agent-cli eval</verify>
  <done>El archivo AdminSidebar.tsx compila, incluye el nuevo Link y el evaluador de accesibilidad y contraste de la suite de pruebas del proyecto retorna un score exitoso.</done>
</task>
