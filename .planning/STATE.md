# STATE.md - Tienda Las Motos
**Versión Actual:** v8.9.0
**Fecha:** 2026-11-07
**Rama Activa:** beta

## Estado de Módulos
- **WEB-038 (Inventario Repuestos):** COMPLETADO. 
  - Conteo asesor y aprobaciones: CERTIFICADO (v8.8.0).
  - Ruta de gestión de catálogo (`/admin/inventario-repuestos`): CERTIFICADO (v8.9.0).
  - Idempotencia y Ledger append-only: VERIFICADO EN RUNTIME.
  - Observaciones registradas: O-15 a O-36 (no bloqueantes).

## Decisiones Clave Recientes
1. Separación estricta de `/admin/inventory` (motos legacy) y `/admin/inventario-repuestos` (repuestos).
2. Guard de rol fail-closed: solo `admin` y `superadmin` pueden acceder y editar el catálogo de repuestos.
3. Edición transaccional con comparación server-side para evitar asientos de ledger innecesarios (no-op).
