# ROADMAP: Centralización de Captura de Leads (Contrato v8.3.2)

**Versión Canónica Vigente:** v8.9.13

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
- [x] **Quick-007 (WEB-836):** Corrección de integración Socrata API (TIBC) y blindaje de actualización en batch (syncedWithUsura) en Cloud Functions. Completado (2026-06-05).
- [x] **Quick-009 (BOT-TECH-DEBT-837):** Migración SMTP a params (v2) en mailer.ts y sendUserInvitation.ts con pruebas en mailer.spec.ts. Completado (2026-06-05).
- [x] **Quick-010 (BOT-TECH-DEBT-838):** Migración de sendUserInvitation.ts a Cloud Functions v2 onCall, con tests unitarios correspondientes. Completado (2026-06-05).
- [x] **Quick-011 (BOT-TECH-DEBT-839):** Refactor global Fail-Safe mailer para desacoplar `sendErrorEmail` y parametrizar correos vía `ADMIN_ALERT_EMAILS`. Completado (2026-06-05) con Coherence Score 1.000.
- [x] **Quick-015 (WEB-DOC-INIT-843):** Inicializar Documento_Maestro_Pagina.md con el histórico consolidado v8.4.1. Completado (2026-06-29).
- [x] **Quick-018 (WEB-837):** Unificación reactiva de sys_alerts y anomalias en novedades y prospectos. Completado (2026-07-06) con Coherence Score 1.000.
- [x] **Quick-019 (WEB-837-REVISED-FINAL):** Normalización de parámetros en hooks `useMemo` y fijación del plazo a 36 meses en buscador público y administrativo. Completado (2026-07-13) con Coherence Score 1.000.
- [x] **Quick-020 (WEB-838):** Barrera de sincronía isMounted en buscador público y administrativo. Completado (2026-07-13) con Coherence Score 1.000.
- [x] **Quick-021 (WEB-838):** Normalización de seguro de vida fijo en el hook useMemo. Completado (2026-07-13) con Coherence Score 1.000.
- [x] **Quick-022 (WEB-SCORE-THRESHOLD-001):** Recalibración de umbrales del semáforo de crédito en getScoreBadge (verde ≥750, amarillo ≥500 y <750, rojo <500); Safe-Fallback preservado; NAMING LOCK score_resultado inmutable. Completado (2026-08-07) con Coherence Score 0.97.

---

# MILESTONE 3: Módulo de Gestión de Créditos (CRUD) — Fase 8 (REVERTIDA)

## Progreso

| Fase | Nombre | Estado | Planes | Fecha |
|------|--------|--------|--------|-------|
| 8 | Módulo de Gestión de Créditos (CRUD) | REVERTIDA | 08-01..08-06 | 2026-09-22 |

## Fases

### Fase 8: Módulo de Gestión de Créditos (CRUD) — REVERTIDA
**Meta:** CRUD operativo sobre las 6 colecciones canónicas con NAMING LOCK, Server Actions con registrado_por verificado, ledger historial_auditoria inmutable, nodo CreditCard en sidebar y rutas /admin/creditos/....
**Estado:** REVERTIDA (mismatch contractual con el Documento de Negocio; la Fase 9 impone su propio esquema sobre colecciones limpias).
**Commits de revert:** 1a6f54b (remove Fase 8 code, rules, and counters), 7e59b72 (remove Fase 8 block — contract reverted).

- [x] **Quick-023 (Deuda 3):** Migración middleware.ts a proxy.ts (Next 16.1.1). Completado (2026-09-23) con paridad perimetral 1:1 certificada.

- [x] **Quick-024 (Deuda 4):** Alineación CI Node 22 (deploy-beta.yml, deploy-prod.yml). Completado (2026-09-24) con certificación runtime CI #35932474469.
- [x] **Quick-025 (Deuda 2 / WEB-DEBT-002):** Unificación FK sys_admin_users a email canónico (Ruta A'). Completado (2026-09-24) con certificación runtime multi-navegador y purga E2E 1:1.
- [x] **Quick-026 (Deuda 5):** Silenciamiento de `MaxListenersExceededWarning` en Cloud Run Beta vía hook `src/instrumentation.ts` con `process.setMaxListeners(25)`. Completado (2026-09-24) con certificación forense en revisión `ssrtiendalasmotosbeta-00552-sop`.
- [x] **Quick-027 (Deuda P2):** Unificación singleton `firebase-admin` (`getAdminApp()` privada, `eval` conservado, firmas intactas). Completado (2026-09-24) con autopsia 1-7 verde + runtime en revisión `ssrtiendalasmotosbeta-00560-liz` (`ERR_MODULE_NOT_FOUND` → `[]`). Coherence Score 0.99.
- [x] **Quick-029 (WEB-029):** Migración de Users CRUD a Server Actions con Admin SDK. Bloqueo de escrituras desde cliente. Completado (2026-09-28).
- [x] **Quick-030 (WEB-030):** Guards residuales y gating UI para roles sin permiso (auditor/cobrador). Completado (2026-09-28).
- [x] **Quick-031 (WEB-031):** Hardening de lectura de usuarios (verificarWhitelist + getDoc por docId) y endurecimiento de reglas Firestore. Completado (2026-09-28).
- [x] **Quick-032 (WEB-032):** Purge de función huérfana loginAdminWithGoogle y imports exclusivos. Completado (2026-10-01).
- [x] **Quick-033 (WEB-033):** Remediation de accesibilidad (170 atributos id+htmlFor en 21 archivos). Completado (2026-10-01).
- [x] **Quick-035 (WEB-035):** Purge completo de src/lib/auth/admin-auth.ts (archivo huérfano, logout real en AuthContext). Completado (2026-10-01).
- [x] **Quick-037 (WEB-037):** Refactor estructural a11y (3 headings + 3 fieldset/legend con reset UA, 4 archivos). Completado (2026-10-01).
- [x] **Quick-038 (WEB-038):** Landing por rol (`admin_creditos`), flag `defaultLanding` + `RoleBasedRedirect`, guards de ruta en 5 páginas y dropdown extendido. Completado (2026-10-18) con deploy beta.
- [x] **Quick-039 (WEB-039):** Precedencia guard-dentro-de-wrapper + supresión de flash en `RoleBasedRedirect`. Completado (2026-10-19) con deploy beta run `39202182660` success.
- [x] **WEB-038 (v8.9.0):** Módulo de Inventario de Repuestos con Aislamiento Offline. Completado (2026-11-07) con certificación E2E en Beta: flujo asesor offline (IndexedDB) → sync → aprobación superadmin → ledger append-only (UID verificado) → catálogo con edición transaccional idempotente. Observaciones O-37 y O-38 registradas en SSOT.
- [x] **WEB-040 (v8.9.3):** Hardening del destino post-login (open-redirect cerrado + canonicalización de `/admin/simulator` → `/admin/simulador?defaultLanding=1` + garantía de `defaultLanding=1` + preservación de deep links). Completado (2026-11-07/08) con certificación UAT God Node en beta.web.app incógnito (3 roles: superadmin→/admin/simulador, asesor→/admin/inventario-asesor, admin_creditos→/admin/creditos; todos con shell, sin typo, sin pelado, sin alert, sin 503) + run #171 42418219718 success + merge beta→main aprobado (Opción 2).
- [x] **WEB-043 (v8.9.3):** Matching Vision-Catálogo y Selector de Referencias (F2-A). Completado (2026-11-09) con certificación E2E en Beta: matching puro sin dependencias, Server Actions con Faraday Cage, UI sin texto libre, validación de existencia en `crearConteoPendiente.ts`. Observaciones O-1 (alta de repuestos), O-2 (matching visual), O-3 (verificación de red) registradas en backlog.
- [x] **Quick-034 (WEB-LEGACY-CONFIG-001):** Fix runtime module-scope .value() en mailer.ts. Completado (2026-11-09).
- [x] **WEB-044-P1 Tier A (CERTIFICADO):** O-38 forward-only runtime (UID; ledger UID+email; sin backfill); MT-02 cerrado `NO_GHOST_OBSERVADO`; MT-03 sin trigger; O-37 reconvertido a deuda no reproducible en perfil normal; MT-04.C estático OK, runtime no curable en Tier A por `sw.js` byte-idéntico y prohibición de bump/unregister, derivado a Tier B; MT-06 ALL PASSED; CI #183 `5707b9e` success. Commits `c02e5e3`/`1cf14b6`/`1dc538e`/`5707b9e`. Observaciones: `OBS-PWA-RANCIO-NO-CURABLE-TIER-A`, `OBS-O37-NO-REPRODUCIBLE-PERFIL-NORMAL`, `OBS-CACHE-STORAGE-NO-VISIBLE-DEVTOOLS-NORMAL`, `OBS-FIRESTORE-ENABLEINDEXEDDBPERSISTENCE-DEPRECATED`. Tier B CONGELADO con 10 decisiones: backfill O-38; SA read-only de reconciliación; eliminar fallback global de `limpiarOutbox`; `tlm-shell-v3`; Vitest/fake-indexeddb/tsx; gate CI fail-closed; harness de componentes FUERA/DENTRO; versión canónica; sección 8; certificación final. (2026-11-09).
- [x] **WEB-044-P1 Tier B + Runtime J (CERTIFICADO):** E: outbox conserva borradores y no usa `clear()` global en fallo owner-scoped. F: `tlm-shell-v3` y worker #1422 activado 2026-11-09 19:46:04 COT sin unregister ni pérdida de IndexedDB. G: Vitest/fake-indexeddb/tsx, 66 tests unitarios, gate CI fail-closed. A+I: versión canónica v8.9.5 y sección 8 consolidada tras diff no semántico. J: `sw.js` desplegado con HTTP/2 200, ETag `7deceba8d0cf4519838dce55f91efb911ee27551167140b080b8256f94842bb8`, last-modified 2026-11-10T00:20:29Z; `tlm_offline` v2 intacto con 2 object stores, 0 borradores, 0 fotos, sin ghost O-37; consola PWA limpia; O-38 no revalidado porque las acciones no cambiaron. Coherence 0.95 por autopsia de diff canónico. `OBS-AGENT-EVAL-401-NO-UI-NEW`: agent-cli eval bloqueado por 401, sin UI nueva. Sin backfill, SA de reconciliación, render de componentes ni producción. (2026-11-09).
- [x] **WEB-045-P1 (CERTIFICADO 2026-11-10):** Endurecer `limpiarOutbox` contra purga global implícita por UID vacío/undefined. Commit `08abcf1`, CI beta #188 success. Runtime beta certificado: bundle `cc10283e970d296c.js` con `NO_OWNER_PURGE_BLOCKED`+`GLOBAL_PURGE_EXPLICIT`; logout válido sin purga global ni edge; `tlm_offline` v2 intacto. 72 tests. Deudas derivadas no bloqueantes: OBS-LOGOUT-NEXT-REDIRECT-CONSOLE-ERROR, OBS-MIGRATION-V2-INFO-AS-ERROR. Sin UI (eval no requerido, excepción documental), sin bot, sin producción. Coherence 0.97.
- [x] **WEB-048-P1 (2026-11-10):** Eliminado `window.location.reload()` de AuthContext; LoginForm espera rol/UID, consolida `CLAVE_FLAG_ASESOR` y navega después. `CLAVE_RECARGA_OFFLINE` preservada como clave. RoleBasedRedirect sin cambios; outbox owner-scoped intacto. 79 tests, tsc/lint/build verdes. Commit `2e4e20b`.
- [x] **Cierre ventana PRIORIDAD 1–4 (v8.9.9, 2026-11-10):** WEB-LOG-HIGIENE-001 (`9c87392`, estático+runtime); WEB-HARNESS-EXENCION-001 (Ruta B: riesgo aceptado por Dirección; harness de render inexistente, Vitest no lo sustituye, única cobertura de render = UAT runtime beta); WEB-043-O1-obs-001 (`2c63887`, `imagen_url:''` en Firestore); WEB-HIGIENE-RESILIENCIA-001 (O-1 runtime; O-16 `56de9de`; O-29 `472a6ba`+`0527fed`); WEB-O29-DIAG-001 erradicada (`c5b0171`→`dea6dcb`, diff 0527fed..HEAD vacío, run #196 verde). Sin cambios en src/, bot, producción ni NAMING LOCK.
- [x] **WEB-HARNESS-RENDER-001 (v8.9.10, 2026-11-11):** Ruta A implementada; Ruta B revocada/superada. Harness de render con Testing Library + jsdom; 3 archivos/10 tests (`harness.smoke`, `LoginForm.render`, `RoleBasedRedirect.render`); `npm run test:render` integrado en `test:ci`; 86 unit intactos; UAT runtime beta sigue vigente para Firebase Auth real, cookies, proxy, router real, SSR/hidratación, navegación hard y polling real de `EsperandoActivacion`. Sin cambios de producción ni NAMING LOCK.
- [x] **WEB-INV-SEDE-UBICACION-001 (v8.9.11, 2026-11-12):** inventario_repuestos a auto-ID; sede_id/ubicacion libre; documento_id DTO; conteos con sede_id+inventario_documento_id; aprobación sin stock. Commit `76f88e5`, CI #202.
- [x] **WEB-INV-REFERENCIAS-ALTERNATIVAS-001 (v8.9.11, 2026-11-12):** referencias_alternativas normalizadas + búsqueda maestra/alternativa + selector asesor extendido. Commit `e71227f`, CI #203.
- [x] **WEB-INV-REFALT-UX-EDIT-001 (v8.9.11, 2026-11-12):** errores atribuidos por campo/índice + hints + editor inline de alternativas + idempotencia; runtime beta + ledger UPDATE certificados; infra Vision verificada (P5-a cerrado). Commit `1b19f3a`, CI #204. OBS-SEDE-DOCID-CRUDO y OBS-APROBACIONES-SEDE-NO-VISIBLE diferidos.
- [x] **OBS-SEDE-DOCID-CRUDO (v8.9.12, 2026-11-12):** `sede_nombre` derivado de lectura, no persistido; `sede_id` intacto; fallbacks `Sin sede` / `Sede no disponible` + warning; runtime 7/7. Commit `a85060a`, CI #206 (43348085966) success.
- [x] **OBS-APROBACIONES-SEDE-NO-VISIBLE + OBS-APROBACIONES-COPY-STOCK-FALSO (v8.9.13, 2026-11-12):** sede_nombre en aprobaciones, enlace/anchor al catálogo, copy de arqueo independiente y cleanup de Invariantes duplicado. Commit `d25bda4`, CI #208 (43364257700) success.
- [x] **Promoción v8.9.13 beta→main (2026-11-13):** merge `ad3b497` (padres `24d1d0a` + `1a7350d`); deploy main #65 (`43468414966`) success; paridad de árbol `e89726f`; `--theirs` solo en los 3 documentos; `DISCARDED` vacío; sin cambios de código. OBS abiertas no bloqueantes: `OBS-PROD-DATOS-PRUEBA-RESIDUALES` y `OBS-PROMOTE-DIRECT-PUSH-BYPASS-PR`.
- [x] **Cierre OBS-SSOT-CI-PLACEHOLDER-XXX + OBS-SSOT-C4B-STALE-POST-PROMOCION (v8.9.13, 2026-11-14):** §18 sustituye `CI beta run #XXX` por CI beta run #190 (`42755251313`) success en `d9f4b03`; §28 añade la nota de supersesión C4/B; L347 conservada byte-idéntica; sin cambios de código.
