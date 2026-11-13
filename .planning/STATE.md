# STATE.md - Tienda Las Motos
**Versión Actual:** v8.9.13
**Fecha:** 2026-11-12
**Rama Activa:** beta
**Última actividad:** 2026-11-12 — Cierre OBS-APROBACIONES-SEDE-NO-VISIBLE + OBS-APROBACIONES-COPY-STOCK-FALSO (d25bda4, CI #208); 105 unit + 10 render; limpieza de Invariantes duplicado.

## Estado de Módulos
- **WEB-038 (Inventario Repuestos):** COMPLETADO. 
  - Conteo asesor y aprobaciones: CERTIFICADO (v8.8.0).
  - Ruta de gestión de catálogo (`/admin/inventario-repuestos`): CERTIFICADO (v8.9.4).
  - Idempotencia y Ledger append-only: CERTIFICADO EN RUNTIME BETA (ciclo completo: asesor offline → IndexedDB → sync → Firestore → superadmin aprueba → ledger append-only con UID verificado → catálogo creado → no-op idempotente → purga selectiva).
  - Observaciones registradas: O-15 a O-38 (no bloqueantes). O-37 (borrador no purgado post-sync) y O-38 (revisado_por con email vs UID) descubiertas en E2E runtime 2026-11-09.

## Decisiones Clave Recientes
1. Separación estricta de `/admin/inventory` (motos legacy) y `/admin/inventario-repuestos` (repuestos).
2. Guard de rol fail-closed: solo `admin` y `superadmin` pueden acceder y editar el catálogo de repuestos.
3. Edición transaccional con comparación server-side para evitar asientos de ledger innecesarios (no-op).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| WEB-040 | Hardening del destino post-login: open-redirect cerrado + `/admin/simulator` canonicalizado, con test de 21 checks + UAT 3 roles en beta | 2026-11-09 | `d131f77` + `bb5b206` + `0dd55de` | `.planning/quick/WEB-040/` + run #171 42418219718 success |
| 034 | Resolver params SMTP en runtime en `mailer.ts`; build Functions + deploy de `sendUserInvitation`/`updateUsuryRates` y ejecución manual de `updateUsuryRates` | 2026-11-09 | `25388fc` | `.planning/quick/034-legacy-config-mailer-params/` |
| 035 | MT-00: puerta de evidencia física; SSOT raíz y separación de evidencia de repo/sesión | 2026-11-09 | `—` | `.planning/quick/035-web044-mt00-evidence/` |
| 036 | MT-01: `revisado_por` UID forward-only + contract tests | 2026-11-09 | `c02e5e3` | `.planning/quick/036-web044-mt01-revisado-uid/` |
| 037 | MT-02: plantilla forense O-37; evidencia runtime pendiente | 2026-11-09 | `—` | `.planning/quick/037-web044-mt02-o37-forensics/` |
| 038 | MT-04.A: baseline estático PWA/SW | 2026-11-09 | `—` | `.planning/quick/038-web044-mt04a-pwa-baseline/` |
| 039 | MT-04.C: autocura PWA no destructiva | 2026-11-09 | `1cf14b6` | `.planning/quick/039-web044-mt04c-pwa-update/` |
| 040 | MT-06: suite pura de matching ampliada | 2026-11-09 | `1dc538e` | `.planning/quick/040-web044-mt06-matching/` |
| 041 | MT-10.A: registro documental de deudas sin version/sección 8 | 2026-11-09 | `—` | `.planning/quick/041-web044-mt10a-docs/` |
| 042 | Tier B E: outbox owner-scoped fail-closed sin fallback global | 2026-11-09 | `b4383ac` | `.planning/quick/042-web044-tierb-e-outbox/` |
| 043 | Tier B F: Service Worker `tlm-shell-v3` sin unregister | 2026-11-09 | `5a59b16` | `.planning/quick/043-web044-tierb-f-sw-v3/` |
| 044 | Tier B G: Vitest/fake-indexeddb/tsx + gate CI fail-closed | 2026-11-09 | `5a25664` | `.planning/quick/044-web044-tierb-g-tests-ci/` |
| 045 | Tier B A+I: v8.9.5 + consolidación no semántica sección 8 | 2026-11-09 | `—` | `.planning/quick/045-web044-tierb-ai-docs/` |
| 046 | WEB-048: reload de AuthContext eliminado; navegación post-login tras rol y flag | 2026-11-10 | `2e4e20b` | `.planning/quick/046-web048-auth-reload/` |

- **WEB-LEGACY-CONFIG-001 (Migración params mailer):** COMPLETADO. Resolver .value() en runtime dentro de sendErrorEmail, cero functions.config(), deploy beta exitoso (commits 25388fc, dedbabf).
- **WEB-044-P1 Tier A (CERTIFICADO):** O-38 forward-only certificado en runtime beta (`revisado_por` UID; ledger UID+email; sin backfill). MT-02 cerrado como `NO_GHOST_OBSERVADO`; MT-03 sin trigger; O-37 reconvertido a `OBS-O37-NO-REPRODUCIBLE-PERFIL-NORMAL`. MT-04.C estático OK; runtime no curable en Tier A por `sw.js` byte-idéntico y prohibición de bump/unregister; derivado a Tier B. MT-06 ALL PASSED. Commits `c02e5e3`/`1cf14b6`/`1dc538e`/`5707b9e`; CI #183 success.
- **Observaciones no bloqueantes Tier A:** `OBS-PWA-RANCIO-NO-CURABLE-TIER-A`, `OBS-O37-NO-REPRODUCIBLE-PERFIL-NORMAL`, `OBS-CACHE-STORAGE-NO-VISIBLE-DEVTOOLS-NORMAL`, `OBS-FIRESTORE-ENABLEINDEXEDDBPERSISTENCE-DEPRECATED`.
- **Tier B CERTIFICADO (E/F/G/A+I + Runtime J):** E: `limpiarOutbox(uid)` ya no cae a `clear()` global; conserva borradores, marca error y registra UID/conteo_id. F: `CACHE_SHELL = 'tlm-shell-v3'` sin unregister ni tocar IndexedDB. G: `tsx`/Vitest/fake-indexeddb, scripts `test`/`test:unit`/`test:ci`, 66 tests unitarios y gate CI previo a build/deploy. A+I: STATE/ROADMAP en v8.9.5 y sección 8 consolidada tras diff no semántico (solo línea en blanco). J: worker #1422 activado 2026-11-09 19:46:04 COT, `sw.js` v3 desplegado, `tlm_offline` v2 con 2 stores, 0 borradores, 0 fotos, sin ghost O-37, consola PWA limpia; warnings `enableIndexedDbPersistence` deprecated no bloqueantes. O-38 no se revalidó porque las acciones no cambiaron en Tier B. Coherence Score 0.95 por autopsia de diff canónico. Tier B no incluye backfill, SA de reconciliación, render de componentes ni producción.
- **OBS-AGENT-EVAL-401-NO-UI-NEW:** `npm run agent-eval` falló con `401 Unauthorized` en `npm.pkg.github.com/@tobiasgaitan/agent-cli`; Tier B no introdujo UI nueva. Coherence 0.95 se calculó por autopsia de diff canónico, no por agent-cli eval.

## Cierre WEB-045-P1 (2026-11-10)
- **WEB-045-P1 CERTIFICADO (estático + runtime beta):** `limpiarOutbox` endurecido; UID vacío/undefined ya no cae a `clear()` global (`NO_OWNER_PURGE_BLOCKED`); purga global solo con `forzarPurgaGlobal:true` (`GLOBAL_PURGE_EXPLICIT`); owner-scoped fail-closed Tier B E intacto. Commit `08abcf1`, CI #188 success. 72 tests. `tlm_offline` v2 intacto en runtime. Deudas derivadas: OBS-LOGOUT-NEXT-REDIRECT-CONSOLE-ERROR, OBS-MIGRATION-V2-INFO-AS-ERROR. Sin UI, sin bot, sin producción. Versión canónica v8.9.6.

## Cierre WEB-046-P1 (2026-11-10)
- **WEB-046-P1 CERTIFICADO (estático + runtime beta):** Migración de `enableIndexedDbPersistence` a `FirestoreSettings.cache` (Firebase v11.1.x). `tlm_offline` sobrevive al logout. Sin warnings de deprecación. Commit `d9f4b03`. 72 tests. Deuda derivada: OBS-WEB046-REDIRECT-ASESOR-SIMULADOR (configuración WEB-040). Versión canónica v8.9.7.

## Cierre ventana PRIORIDAD 1–4 (2026-11-10)
- **WEB-LOG-HIGIENE-001 CERTIFICADO (estático+runtime):** `9c87392`; `NEXT_REDIRECT` degradado; migración v2 con debug/info; errores reales intactos.
- **WEB-HARNESS-EXENCION-001 — Ruta B (Riesgo Aceptado):** no existe harness de render (Testing Library/jsdom); Vitest 86 tests cubre lógica pura/Zod/helpers/transacciones mockeadas y NO render; única cobertura de render = UAT runtime beta (LoginForm/RoleBasedRedirect; extensión O-1/O-16/O-29).
- **WEB-043-O1-obs-001 RESUELTA:** `2c63887`; schema conserva `''/null`; `crearRepuesto.ts` normaliza a `''`; runtime Firestore `imagen_url:''`.
- **WEB-HIGIENE-RESILIENCIA-001 CERRADA:** O-1 runtime; O-16 `56de9de`; O-29 `472a6ba`+`0527fed`.
- **WEB-O29-DIAG-001 ERRADICADA:** `c5b0171`→`dea6dcb`; `git diff 0527fed HEAD` vacío; run #196 verde.

## Cierre WEB-HARNESS-RENDER-001 (2026-11-11)
- **WEB-HARNESS-RENDER-001 CERTIFICADO (estático):** Ruta A implementada; Ruta B revocada/superada. Harness de render con Testing Library + jsdom; 3 archivos/10 tests (`harness.smoke`, `LoginForm.render`, `RoleBasedRedirect.render`); `npm run test:render` integrado en `test:ci`; 86 unit intactos; gates npm test, tsc, lint y build EXIT 0.
- **Punto ciego conservado:** el render no sustituye la UAT runtime beta; Firebase Auth real, cookies `__session`, `proxy.ts`, router real, SSR/hidratación, navegación hard y polling real de `EsperandoActivacion` siguen fuera del harness mockeado.

## Cierre WEB-INV-VENTANA-001 (2026-11-12)
- **CERTIFICADO (estático + runtime beta):** `76f88e5`/`e71227f`/`1b19f3a`; CI #202/#203/#204 success. Inventario auto-ID + `referencias_alternativas` + `sede_id`/`inventario_documento_id` en conteos + UX de errores atribuidos + editor inline de alternativas + idempotencia. 101 unit + 10 render. Versión canónica v8.9.11.
- **Infra Vision producción VERIFICADA:** proyecto `tiendalasmotos`; secreto v2 ENABLED; secretAccessor en compute+bot-admin. P5-a CERRADO.
- **Diferidos:** `OBS-APROBACIONES-SEDE-NO-VISIBLE` → RESUELTA → §27.
- **Invariantes:** NAMING LOCK, ledger append-only, bot/docs/§8/O-37/O-38 intactos; sin colecciones nuevas; sin migración.

## Cierre OBS-SEDE-DOCID-CRUDO (2026-11-12)
- **CERTIFICADO:** commit `a85060a`; CI #206 (43348085966) success. `sede_nombre` derivado de lectura, no persistido; `sede_id` intacto; lectura única de `configuracion/general/sedes` sin filtro `isActive`.
- **Fallbacks:** `Sin sede` / `Sede no disponible` + `console.warn` forense con `sede_id` + `documento_id`; fallo de lectura de sedes no aborta el listado.
- **Runtime beta:** 7/7 filas (Santa Marta ×1, `Sin sede` ×6); consola `warn/error` vacía.
- **Tests:** 102 unit + 10 render + smoke; `tsc`, lint y build EXIT 0. Residual inactiva/no-resuelta cubierto por unit tests.
- **Deudas:** OBS-APROBACIONES-COPY-STOCK-FALSO, OBS-DOCTRINA-NO-VERSIONADA, OBS-SSOT-CI-PLACEHOLDER-XXX.

## Observaciones no bloqueantes (2026-11-12)
- **OBS-INVENTORY-NAMESPACE-LEGACY:** `listarPendientes` vive en `src/app/admin/inventory/actions/` (legacy) mientras la UI vive en `src/app/admin/inventario-aprobaciones/`; refactor de namespace fuera del perímetro de este ticket.

## Cierre OBS-APROBACIONES-SEDE-NO-VISIBLE + OBS-APROBACIONES-COPY-STOCK-FALSO (2026-11-12)
- **CERTIFICADO:** commit `d25bda4`; CI #208 (43364257700) success. `sede_nombre` derivado en `PendienteDTO`, no persistido; `sede_id` e `inventario_documento_id` intactos.
- **Fallbacks:** `Sin sede` / `Sede no disponible` + `console.warn` forense con `sede_id` + `inventario_documento_id`; fallo de lectura de sedes no aborta el listado.
- **UI:** columna SEDE en tabla desktop, campo Sede en card móvil 400×625, anchors `doc-{documento_id}` + scroll al hash, enlace “Ver catálogo” y fallback “Sin vínculo”.
- **Copy corregido:** “Al aprobar, el conteo se registra en el ledger de auditoría; el stock del catálogo permanece sin cambios (arqueo independiente).”
- **Tests:** 105 unit + 10 render + smoke; `tsc`, lint y build EXIT 0. Residual V6 “Sin vínculo” cubierto por unit/static.
- **Cleanup:** eliminación del bloque duplicado de invariantes en este archivo.
- **Deuda:** OBS-INVENTORY-NAMESPACE-LEGACY registrada como no bloqueante.
