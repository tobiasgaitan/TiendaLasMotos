---
task: "026"
name: "Remediación integral de accesibilidad (id, name, htmlFor, aria-label) en /admin/creditos/..."
description: "45 controles + 41 labels en 5 archivos; cambio puramente aditivo de atributos DOM"
---

# Quick Task 026: Remediación a11y módulo créditos

## Objective
Añadir `id` + `name` a todos los controles y `htmlFor` a todas las etiquetas (asociación
1:1 id = name = htmlFor), `aria-label` inline en los 2 campos de búsqueda sin label
visible. 5 archivos, un solo commit atómico.

## Conventions
- Prefijos: `cliente-`, `vehiculo-`, `cond-`, `asig-`, `filtro-`, `giro-`, `pago-`, `buscar-`.
- CERO alteración de estado TS, payloads, Firestore, lógica, className, onChange, value,
  disabled, placeholder.
- Excluidos (sin controles): `[id]/page.tsx`, `page.tsx`, `remisiones/page.tsx`.

## Verificación
- Cada control con `id`+`name`; cada `label` con `htmlFor`; `id` únicos por página.
- `npx tsc --noEmit` EXIT 0 · `npm run build` EXIT 0 · `npm run lint` 0 errores.
- Un commit atómico + push a `beta` (sin merge a `main`).

---
*Created: 2026-09-24 by Antigravity*
*Ticket: QWEN-TKT-026*
