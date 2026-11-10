# STATE.md - Tienda Las Motos
**Versión Actual:** v8.9.5
**Fecha:** 2026-11-09
**Rama Activa:** beta
**Última actividad:** 2026-11-09 — WEB-044-P1 Tier B + Runtime J CERTIFICADOS: worker #1422, `tlm-shell-v3`, `tlm_offline` v2 intacto, 0 ghosts, consola PWA limpia y CI verde.

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

- **WEB-LEGACY-CONFIG-001 (Migración params mailer):** COMPLETADO. Resolver .value() en runtime dentro de sendErrorEmail, cero functions.config(), deploy beta exitoso (commits 25388fc, dedbabf).
- **WEB-044-P1 Tier A (CERTIFICADO):** O-38 forward-only certificado en runtime beta (`revisado_por` UID; ledger UID+email; sin backfill). MT-02 cerrado como `NO_GHOST_OBSERVADO`; MT-03 sin trigger; O-37 reconvertido a `OBS-O37-NO-REPRODUCIBLE-PERFIL-NORMAL`. MT-04.C estático OK; runtime no curable en Tier A por `sw.js` byte-idéntico y prohibición de bump/unregister; derivado a Tier B. MT-06 ALL PASSED. Commits `c02e5e3`/`1cf14b6`/`1dc538e`/`5707b9e`; CI #183 success.
- **Observaciones no bloqueantes Tier A:** `OBS-PWA-RANCIO-NO-CURABLE-TIER-A`, `OBS-O37-NO-REPRODUCIBLE-PERFIL-NORMAL`, `OBS-CACHE-STORAGE-NO-VISIBLE-DEVTOOLS-NORMAL`, `OBS-FIRESTORE-ENABLEINDEXEDDBPERSISTENCE-DEPRECATED`.
- **Tier B CERTIFICADO (E/F/G/A+I + Runtime J):** E: `limpiarOutbox(uid)` ya no cae a `clear()` global; conserva borradores, marca error y registra UID/conteo_id. F: `CACHE_SHELL = 'tlm-shell-v3'` sin unregister ni tocar IndexedDB. G: `tsx`/Vitest/fake-indexeddb, scripts `test`/`test:unit`/`test:ci`, 66 tests unitarios y gate CI previo a build/deploy. A+I: STATE/ROADMAP en v8.9.5 y sección 8 consolidada tras diff no semántico (solo línea en blanco). J: worker #1422 activado 2026-11-09 19:46:04 COT, `sw.js` v3 desplegado, `tlm_offline` v2 con 2 stores, 0 borradores, 0 fotos, sin ghost O-37, consola PWA limpia; warnings `enableIndexedDbPersistence` deprecated no bloqueantes. O-38 no se revalidó porque las acciones no cambiaron en Tier B. Coherence Score 0.95 por autopsia de diff canónico. Tier B no incluye backfill, SA de reconciliación, render de componentes ni producción.
- **OBS-AGENT-EVAL-401-NO-UI-NEW:** `npm run agent-eval` falló con `401 Unauthorized` en `npm.pkg.github.com/@tobiasgaitan/agent-cli`; Tier B no introdujo UI nueva. Coherence 0.95 se calculó por autopsia de diff canónico, no por agent-cli eval.

## Cierre WEB-045-P1 (2026-11-10)
- **WEB-045-P1 CERTIFICADO (estático + runtime beta):** `limpiarOutbox` endurecido; UID vacío/undefined ya no cae a `clear()` global (`NO_OWNER_PURGE_BLOCKED`); purga global solo con `forzarPurgaGlobal:true` (`GLOBAL_PURGE_EXPLICIT`); owner-scoped fail-closed Tier B E intacto. Commit `08abcf1`, CI #188 success. 72 tests. `tlm_offline` v2 intacto en runtime. Deudas derivadas: OBS-LOGOUT-NEXT-REDIRECT-CONSOLE-ERROR, OBS-MIGRATION-V2-INFO-AS-ERROR. Sin UI, sin bot, sin producción. Versión canónica v8.9.6.

## Cierre WEB-046-P1 (2026-11-10)
- **WEB-046-P1 CERTIFICADO (estático + runtime beta):** Migración de `enableIndexedDbPersistence` a `FirestoreSettings.cache` (Firebase v11.1.x). `tlm_offline` sobrevive al logout. Sin warnings de deprecación. Commit `d9f4b03`. 72 tests. Deuda derivada: OBS-WEB046-REDIRECT-ASESOR-SIMULADOR (configuración WEB-040). Versión canónica v8.9.7.
