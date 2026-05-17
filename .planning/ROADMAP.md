# ROADMAP: Centralización de Captura de Leads (Contrato v8.3.1)

## Fase 1: Migración de Calculadoras y Verificación Final [COMPLETADO]
- [cite_start]**Objetivo**: Eliminar la persistencia descentralizada en `QuoteGenerator.tsx` y centralizar todo el tráfico en la Server Action `submitLead`[cite: 143].
- **Tareas**:
  - [x] Refactorizar `LeadForm.tsx` (Completado)
  - [x] Refactorizar `SmartQuotaSlider.tsx` (Completado)
  - [x] [cite_start]Refactorizar `QuoteGenerator.tsx` (Completado - WEB-831) [cite: 143]
  - [x] [cite_start]Verificación de integridad con `agent-cli eval` [cite: 144]
  - [x] [cite_start]Despliegue y validación manual en Beta [cite: 142]

## Fase 2: Auditoría y Cierre de Deuda Técnica [COMPLETADO]
- [cite_start]**Objetivo**: Asegurar que no existan llamadas residuales a `addDoc` en la colección `prospectos` en todo el repositorio[cite: 168].
- **Tareas**:
  - [x] [cite_start]Grep exhaustivo de `addDoc(collection(db, "prospectos")` [cite: 168]
  - [x] [cite_start]Verificación de normalización de 12 dígitos en Firestore real[cite: 143].

## Fase 3: Reactividad y Depuración Estructural [COMPLETADO]
- **Objetivo**: Implementar reactividad en tiempo real en el Dashboard y eliminar código legacy redundante.
- **Tareas**:
  - [x] Tarea 3.2: Implementación de reactividad `onSnapshot` en el Dashboard de Prospectos (Confirmada).
  - [x] Tarea 3.3: Purga de código legacy - Eliminación del nodo huérfano `src/app/admin/leads` (WEB-833).