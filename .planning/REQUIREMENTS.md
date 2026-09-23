# Requisitos de Migración (WEB-835)

## Visión General
Esta migración reemplaza todas las referencias locales y remotas del frontend al nodo heredado `config` de Firestore por la nueva colección canónica `configuracion`.

## V1 — Obligatorio (Must Have)
Estos requisitos representan los cambios estructurales e integración necesarios para lograr una transición transparente con paridad de datos 1:1.

| ID  | Requisito | Archivos Impactados | Estado |
|-----|-----------|---------------------|--------|
| R1  | Migración de contadores atómicos en transacciones. | `src/lib/actions/quotation.ts` | Pendiente |
| R2  | Migración de consulta de información general (teléfono) en barra superior. | `src/components/TopBar.tsx` | Pendiente |
| R3  | Migración de consulta de redes y sedes activas en pie de página. | `src/components/SmartFooter.tsx` | Pendiente |
| R4  | Migración de carga de sedes en la vista pública de ubicaciones. | `src/app/sedes/page.tsx` | Pendiente |
| R5  | Migración de gestión de información general en administración. | `src/app/admin/general/page.tsx` | Pendiente |
| R6  | Migración de gestión ABM (Alta, Baja, Modificación) de sedes en administración. | `src/app/admin/sedes/page.tsx` | Pendiente |
| R7  | Migración de obtención de sedes en el simulador de créditos en administración. | `src/app/admin/simulador/page.tsx` | Pendiente |
| R8  | Despliegue en la rama `beta` y verificación E2E con datos reales de Firestore. | N/A | Pendiente |

## V2 — Backlog (Nice to Have)
| ID  | Requisito | Prioridad | Estado |
|-----|-----------|-----------|--------|
| R9  | Purga física del nodo heredado `config` en Firestore tras validación en producción. | Media | Pendiente |

---
*Última actualización: 2026-05-17 por Antigravity*

# Módulo de Gestión de Créditos — Fase 8 (CRUD)

## Visión General
Construir el CRUD del Módulo de Gestión de Créditos sobre las 6 colecciones canónicas
(`clientes_credito`, `creditos`, `historial_auditoria`, `pagos_inversores`,
`pagos_y_multas`, `remisiones_dinero`) con NAMING LOCK, Server Actions con
`registrado_por` verificado y ledger inmutable. `sys_admin_users` fuera de alcance.

## V1 — Obligatorio (Must Have)

| ID    | Requisito | Plan | Estado |
|-------|-----------|------|--------|
| R-CR1 | Contratos TS + esquema Firestore con NAMING LOCK (sección 1 verbatim). | 08-01 | Planificado |
| R-CR2 | Reglas: lectura autenticada + bloqueo de writes de cliente en las 6 colecciones; gate de constancia C2 pre-deploy. | 08-02 | Planificado |
| R-CR3 | Server Actions core: `requireActor` (verifyIdToken), `appendAuditoria`, CRUD `creditos`, alta/edición `clientes_credito`. Gate C7 pre-ejecución. | 08-03 | Planificado |
| R-CR4 | Server Actions financieras: `pagos_inversores`, `pagos_y_multas` (motivo obligatorio en MULTA), `remisiones_dinero` (origen≠destino, máquina de estados). | 08-04 | Planificado |
| R-CR5 | Sidebar: grupo "Gestión de Créditos" con `CreditCard`, clave `creditos`, 6 enlaces sin truncamiento; rutas `/admin/creditos/...` bajo el guard existente. | 08-05 | Planificado |
| R-CR6 | UI créditos/clientes con C4 (Burst Mitigation, Faraday Cage, tolerancia celular legacy 10 dígitos). | 08-05 | Planificado |
| R-CR7 | UI financieras + vista `historial_auditoria` estrictamente read-only. | 08-06 | Planificado |
| R-CR8 | Correlativo `numero_credito = CRE-YYYY-XXXX` aditivo en `configuracion/counters` (`creditoCount`/`creditoYear`) vía `runTransaction`. | 08-03 | Planificado |
| R-CR9 | Baja lógica (`activo=false` + `motivo_baja`/`fecha_baja`/`baja_por`) en las 5 colecciones operativas; prohibido `delete()` físico. | 08-03/04 | Planificado |
| R-CR10 | `registrado_por` = uid verificado + append a `historial_auditoria` en TODA escritura. | 08-03/04 | Planificado |
| R-CR11 | Gate C7: confirmación de Tobias sobre escrituras del bot antes de ejecutar 08-03. | 08-03 | Bloqueado |
| R-CR12 | Verificación E2E en `https://tiendalasmotos-beta.web.app` con datos reales de Firestore. | 08-06 | Planificado |

---
*Última actualización: 2026-09-22 — Fase 8 planificada (aditivo, sin alterar R1–R9)*

# Sistema de Gestión de Créditos y Renting — Fase 9

## Visión General
Implementar los 5 módulos del Documento de Negocio Fase 9 sobre colecciones limpias
(Fase 8 revertida, sin migración): contratos con mapas `vehiculo`/`condiciones`/
`asignaciones`, terminal de cobro con cálculo de comisión en servidor, cierre de caja
con máquina de estados, dashboard de inversores y auditoría read-only. Overrides QWEN:
`clientes_credito`, `registrado_por`, auth modular v11, ledger con `add()`, rutas
`/admin/creditos/...`.

## V1 — Obligatorio (Must Have)

| ID   | Requisito | Plan | Estado |
|------|-----------|------|--------|
| R9-1 | Contratos TS + esquema Firestore canónico (Documento verbatim + overrides; NAMING LOCK). | 09-01 | Ejecutado |
| R9-2 | Reglas: lectura autenticada + bloqueo de writes/deletes de cliente en las 6 colecciones; gate C2. | 09-02 | Ejecutado (deploy diferido) |
| R9-3 | Server Actions core: `requireActor` (verifyIdToken), `appendAuditoria` con `add()`, CRUD `creditos`, alta/edición `clientes_credito`, validación Int64/Float. | 09-03 | Ejecutado |
| R9-4 | Server Actions financieras: `pagos_y_multas` (comisión Regla A en servidor, motivo en MULTA), `pagos_inversores` (giro), `remisiones_dinero` (pendiente→recibido). | 09-04 | Ejecutado |
| R9-5 | Cálculo renting/mora (Regla B) puro y reutilizable (UI + servidor). | 09-01 | Ejecutado |
| R9-6 | Sidebar: grupo "Gestión de Créditos" con `CreditCard`, clave `creditos`, 5 enlaces sin truncamiento; rutas bajo el guard existente. | 09-05 | Ejecutado |
| R9-7 | UI Módulo 1 Contratos: cliente inline o existente, mapas, dropdowns `sys_admin_users`, validación number. | 09-05 | Ejecutado |
| R9-8 | UI Módulos 2–5: cobro (búsqueda placa/documento + desglose), remisiones (cobrador/admin), inversores (dashboard + giro), auditoría read-only. | 09-06 | Ejecutado |
| R9-9 | Inmutabilidad: ledger append-only con `add()` (prohibido `batch.set()`); `registrado_por` verificado + entrada de auditoría en toda escritura; prohibido `delete()` físico. | 09-03/04 | Ejecutado |
| R9-10 | Verificación E2E en `https://tiendalasmotos-beta.web.app` con datos reales. | 09-06 | Pendiente (runtime) |

---
*Última actualización: 2026-09-22 — Fase 9 ejecutada (aditivo, sin alterar R1–R9 ni R-CR1–R-CR12)*
