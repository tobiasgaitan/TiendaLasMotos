---
task: "030"
name: "Guards residuales: ruta editar + gating UI usuarios (R-edit-route, R-users-ui)"
description: "Guard de página en [id]/editar (creditos:update) + CTA/iconos users por matriz; patrón /nuevo"
---

# Quick Task 030: Guards residuales P5

## Objective
1. **R-edit-route:** guard en `/admin/creditos/[id]/editar` (`creditos:update`,
   `role="alert"`, spinner con `authLoading`; patrón idéntico a `/nuevo`).
2. **R-users-ui:** CTA "Nuevo Usuario" (`create`) + Edit2 (`update`) + Trash2
   (`delete`) condicionados por `puedeAccion`; lectura inalterada.

## Punto ciego (reportado pre-cambio)
El gating de UI (condicionales JSX, bloques `role="alert"`) NO está cubierto por
tests unitarios (las suites cubren schemas/actions/matriz, no renderizado).
Cobertura por gate runtime (Tobias, sondas i–v).

## Conventions
- CERO cambios en Server Actions, rules, esquemas, a11y TKT-026, AdminSidebar,
  vista de detalle, lógica de negocio.
- Commit atómico `fix(p5-residual)` + push a `beta`. Sin merge a `main`.

## Verificación
- Suites antes/después sin regresión.
- `tsc`/`build` EXIT 0, `lint` 0 errores.
- Gate runtime (Tobias): (i) detalle cobrador sin Editar/con Cobrar; (ii) URL
  editar directa como cobrador → denegado; (iii) users como auditor sin CTA ni
  iconos; (iv) Terminal cobrador sobre crédito ajeno → denegación server-side;
  (v) reversión + purga con capturas.

---
*Created: 2026-09-28 by Antigravity*
*Ticket: WEB-030*
