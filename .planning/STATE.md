# STATE.md - Tienda Las Motos
**Versión Actual:** v8.9.4
**Fecha:** 2026-11-09
**Rama Activa:** beta
**Última actividad:** 2026-11-09 — WEB-044-P1 Tier A: O-38 forward-only, plantilla forense O-37, baseline PWA, autocura no destructiva, suite matching pura y registro documental de deudas.

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

- **WEB-LEGACY-CONFIG-001 (Migración params mailer):** COMPLETADO. Resolver .value() en runtime dentro de sendErrorEmail, cero functions.config(), deploy beta exitoso (commits 25388fc, dedbabf).
- **WEB-044-P1 Tier A (deudas registradas):** O-37 (ghost post-sync), O-38 (revisado_por email), PWA rancio, ausencia de harness de testing y WEB-043-O1-obs-001. O-38 corregido forward-only; O-37 permanece pendiente de evidencia forense runtime antes de MT-03. Sin bump de versión ni resolución de sección 8.
