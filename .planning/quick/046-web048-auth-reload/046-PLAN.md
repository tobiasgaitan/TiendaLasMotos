---
task: 046
name: WEB-048 eliminar reload duro en AuthContext
description: Postergar navegación post-login hasta resolver rol y escribir CLAVE_FLAG_ASESOR.
---
# Quick Task 046: WEB-048

## Objective
Eliminar el reload de AuthContext y mover la navegación post-login a LoginForm, tras resolver rol y consolidar el flag offline.

## Tasks
<task type="auto">
  <name>Navegación post-login sin reload</name>
  <files>src/context/AuthContext.tsx, src/app/admin/login/LoginForm.tsx, tests</files>
  <action>Quitar reload, esperar rol/UID, escribir CLAVE_FLAG_ASESOR y navegar; preservar claves y outbox.</action>
  <verify>npm test && npx tsc --noEmit && npm run lint && npm run build</verify>
  <done>Sin reload, tests/build en verde y flag antes de navegar.</done>
</task>
