# ROADMAP: Centralización de Captura de Leads (Contrato v8.0.0)

## Fase 1: Migración de Calculadoras y Verificación Final [EN PROGRESO]
- **Objetivo**: Eliminar la persistencia descentralizada en `QuoteGenerator.tsx` y centralizar todo el tráfico en la Server Action `submitLead`.
- **Tareas**:
  - [x] Refactorizar `LeadForm.tsx` (Completado)
  - [x] Refactorizar `SmartQuotaSlider.tsx` (Completado)
  - [/] Refactorizar `QuoteGenerator.tsx` (Pendiente)
  - [ ] Verificación de integridad con `agent-cli eval`
  - [ ] Despliegue y validación manual en Beta

## Fase 2: Auditoría y Cierre de Deuda Técnica
- **Objetivo**: Asegurar que no existan llamadas residuales a `addDoc` en la colección `prospectos` en todo el repositorio.
- **Tareas**:
  - [ ] Grep exhaustivo de `addDoc(collection(db, "prospectos")`
  - [ ] Verificación de normalización de 12 dígitos en Firestore real.
