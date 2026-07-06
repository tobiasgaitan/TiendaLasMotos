---
task: 018
name: hotfix-web-837-sys-alerts
description: Implementar un Consolidador de Alertas reactivo dentro de 'src/app/admin/novedades/page.tsx' y 'src/app/admin/prospectos/page.tsx' que abra un listener 'onSnapshot' secundario sobre la nueva colección unificada 'sys_alerts'.
---

# Quick Task 018: hotfix-web-837-sys-alerts

## Objective
Resolver el falso positivo de estado saludable en el panel de control mediante el consumo y unificación en tiempo real de la colección de incidentes de red de infraestructura `sys_alerts` con la de catálogo `anomalias`.

## Tasks

<task type="auto">
  <name>Modificar src/app/admin/novedades/page.tsx</name>
  <files>src/app/admin/novedades/page.tsx</files>
  <action>Implementar la suscripción reactiva dual a la colección `sys_alerts` y a la colección `anomalias`. Unificar ambas colecciones mapeando los documentos de `sys_alerts` al tipo `Anomaly` asignándoles obligatoriamente la propiedad `severity: critical` e inyectando un prefijo en el mensaje. Mantener el registro forense con console.error ante fallos.</action>
  <verify>npx ts-node src/test/components/AnomaliesBanner.test.tsx</verify>
  <done>El componente compila correctamente y el panel unifica ambas colecciones reactivamente sin alterar la firma de la interfaz Anomaly.</done>
</task>

<task type="auto">
  <name>Modificar src/app/admin/prospectos/page.tsx</name>
  <files>src/app/admin/prospectos/page.tsx</files>
  <action>Implementar la misma suscripción reactiva dual a `sys_alerts` y `anomalias`, consolidándolas para el AnomaliesBanner en el panel de control de prospectos.</action>
  <verify>npm run build</verify>
  <done>El panel de prospectos compila y recibe las anomalías de sistema unificadas en el banner reactivo.</done>
</task>

---
*Created: 2026-07-06*
