---
task: "028"
name: "Guard de página /admin/creditos/nuevo + CTA y acciones por matriz (D4)"
description: "Gating UX por puedeAccion: nuevo (creditos:create), Editar/Baja (creditos:update), Cobrar (pagos_y_multas:create)"
---

# Quick Task 028: Guard D4 en módulo créditos

## Objective
1. Guard de página en `/admin/creditos/nuevo`: bloque `role="alert"` "Acceso denegado"
   para roles sin `creditos:create`, respetando `authLoading` (spinner, sin flash).
2. Ocultar CTA "Nuevo crédito" en `/admin/creditos` vía `puedeAccion('creditos','create')`.
3. Alcance ampliado: Editar/Baja en `page.tsx` (`creditos:update`); Editar
   (`creditos:update`) y Cobrar (`pagos_y_multas:create`) en `[id]/page.tsx`.
4. Barrera de seguridad: `requirePermiso` en Server Actions (commit `3c27ebc`, intacto).

## Punto ciego (fail-open transitorio, reportado pre-cambio)
Durante `authLoading`, la UI no bloquea (spinner visible, sin gate aplicado). El
servidor rechaza de todos modos. Aceptado y documentado (coherente con `puedeVerNodo`).

## Conventions
- CERO alteración de atributos a11y (TKT-026), estado TS, payloads, handleSubmit,
  className, onChange, value, disabled, placeholder.
- Commit atómico `fix(p5-d4)` + push a `beta`. Sin merge a `main`.

## Verificación
- Suites antes/después ALL PASSED sin regresión.
- `tsc`/`build` EXIT 0, `lint` 0 errores.
- Runtime beta: control positivo (superadmin) + control negativo (test_admin mutado a
  cobrador por Tobias, con evidencia del documento antes/después y reversión del rol).

---
*Created: 2026-09-25 by Antigravity*
*Ticket: WEB-028*
