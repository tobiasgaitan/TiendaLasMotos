# STATE.md - Tienda Las Motos
**Versión Actual:** v8.9.0
**Fecha:** 2026-11-07
**Rama Activa:** beta
**Última actividad:** 2026-11-07 — WEB-040 quick task: hardening del destino post-login (local, sin push).

## Estado de Módulos
- **WEB-038 (Inventario Repuestos):** COMPLETADO. 
  - Conteo asesor y aprobaciones: CERTIFICADO (v8.8.0).
  - Ruta de gestión de catálogo (`/admin/inventario-repuestos`): CERTIFICADO (v8.9.0).
  - Idempotencia y Ledger append-only: CERTIFICADO EN RUNTIME BETA (ciclo completo: asesor offline → IndexedDB → sync → Firestore → superadmin aprueba → ledger append-only con UID verificado → catálogo creado → no-op idempotente → purga selectiva).
  - Observaciones registradas: O-15 a O-38 (no bloqueantes). O-37 (borrador no purgado post-sync) y O-38 (revisado_por con email vs UID) descubiertas en E2E runtime 2026-11-07.

## Decisiones Clave Recientes
1. Separación estricta de `/admin/inventory` (motos legacy) y `/admin/inventario-repuestos` (repuestos).
2. Guard de rol fail-closed: solo `admin` y `superadmin` pueden acceder y editar el catálogo de repuestos.
3. Edición transaccional con comparación server-side para evitar asientos de ledger innecesarios (no-op).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| WEB-040 | Hardening del destino post-login: open-redirect cerrado + `/admin/simulator` canonicalizado, con test de 21 checks | 2026-11-07 | `d131f77` + `bb5b206` | `.planning/quick/WEB-040/` |
