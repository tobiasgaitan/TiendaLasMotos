# ROADMAP: Centralización de Captura de Leads (Contrato v8.3.2)

## Fase 1: Migración de Calculadoras y Verificación Final [COMPLETADO]
- **Objetivo**: Eliminar la persistencia descentralizada en `QuoteGenerator.tsx` y centralizar todo el tráfico en la Server Action `submitLead`.
- **Tareas**:
  - [x] Refactorizar `LeadForm.tsx` (Completado)
  - [x] Refactorizar `SmartQuotaSlider.tsx` (Completado)
  - [x] Refactorizar `QuoteGenerator.tsx` (Completado - WEB-831)
  - [x] Verificación de integridad con `agent-cli eval`
  - [x] Despliegue y validación manual en Beta

## Fase 2: Auditoría y Cierre de Deuda Técnica [COMPLETADO]
- **Objetivo**: Asegurar que no existan llamadas residuales a `addDoc` en la colección `prospectos` en todo el repositorio.
- **Tareas**:
  - [x] Grep exhaustivo de `addDoc(collection(db, "prospectos")`
  - [x] Verificación de normalización de 12 dígitos en Firestore real.

## Fase 3: Reactividad y Depuración Estructural [COMPLETADO]
- **Objetivo**: Implementar reactividad en tiempo real en el Dashboard y eliminar código legacy redundante.
- **Tareas**:
  - [x] Tarea 3.2: Implementación de reactividad `onSnapshot` en el Dashboard de Prospectos (Confirmada).
  - [x] Tarea 3.3: Purga de código legacy - Eliminación del nodo huérfano `src/app/admin/leads` (WEB-833).

---

# MILESTONE 2: Migración Estructural de Contratos de Datos (WEB-835)

## Progreso

| Fase | Nombre | Estado | Plan | Fecha |
|------|--------|--------|------|-------|
| 4 | Planificación y Diseño Técnico | Completado | XML Plan | 2026-05-17 |
| 5 | Migración de Servicios y Componentes de Consulta | Completado | 01-migrate-config-references-PLAN.md | 2026-05-17 |
| 6 | Migración de Formularios de Administración y Simulador | Completado | 01-migrate-config-references-PLAN.md | 2026-05-17 |
| 7 | Verificación E2E y Despliegue en Beta | Completado | 006-UAT.md | 2026-05-18 |

## Fases

### Fase 4: Planificación y Diseño Técnico
**Meta:** Establecer los planos y el Documento Técnico de Planificación en español con paridad JSON Voorhees.
**Requisitos:** R1-R8
- [x] Documento Técnico de Planificación con paridad 1:1 de llaves de Firestore
- [x] Planes atómicos XML de la migración estructural

### Fase 5: Migración de Servicios y Componentes de Consulta
**Meta:** Actualizar las consultas públicas y generación de transacciones atómicas.
**Requisitos:** R1, R2, R3, R4
- [x] Modificar `actions/quotation.ts` (counters -> configuracion)
- [x] Modificar `components/TopBar.tsx` (general_info -> configuracion)
- [x] Modificar `components/SmartFooter.tsx` (general_info, sedes -> configuracion)
- [x] Modificar `app/sedes/page.tsx` (sedes -> configuracion)

### Fase 6: Migración de Formularios de Administración y Simulador
**Meta:** Actualizar la lectura y escritura de administración y la carga del simulador.
**Requisitos:** R5, R6, R7
- [x] Modificar `admin/general/page.tsx` (general_info -> configuracion)
- [x] Modificar `admin/sedes/page.tsx` (sedes -> configuracion)
- [x] Modificar `admin/simulador/page.tsx` (sedes -> configuracion)

### Fase 7: Verificación E2E y Despliegue en Beta
**Meta:** Validar de extremo a extremo que no haya fallos silenciosos y desplegar en Beta.
**Requisitos:** R8
- [x] Ejecutar `npx agent-cli eval`
- [x] Subir cambios a rama `beta` e iniciar despliegue en Google Cloud Run / Firebase Hosting
- [x] Validar físicamente sobre `https://tiendalasmotos-beta.web.app`

---

## Tareas Rápidas y Hotfixes (Quick Tasks)
- [x] **Quick-006 (WEB-836):** Simulator Price Fix. Uso de `price` canónico en lugar de `precio` en `handleMotoChange`. Completado, UAT Verificado (2026-05-18) con Coherence Score 1.000.