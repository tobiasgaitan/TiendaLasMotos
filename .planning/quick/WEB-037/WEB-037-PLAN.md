---
task: "WEB-037"
name: "Refactor estructural a11y: headings + fieldset/legend (6 labels huérfanos)"
description: "Solo refactor HTML estructural; CERO lógica/estado/handlers/estilos"
---

# WEB-037: Refactor estructural de accesibilidad

## Objective
Convertir los 6 `<label>` sin control asociable (títulos de sección y grupos de
controles) en `div[role=heading]` y `fieldset`+`legend`, con resets UA
(`border-0 p-0 m-0 min-w-0` en fieldset, `p-0` en legend). Estrategia *wrap, don't
replace*: ningún `div` con layout se sustituye.

## Cambios (4 archivos)
- `EditProductModal.tsx`: L244→heading, L252→heading, L253→legend+fieldset.
- `sedes/page.tsx`: L265→legend+fieldset.
- `simulador/page.tsx`: L324→legend+fieldset.
- `CampaignControl.tsx`: L421→heading (estilo inline intacto).

## Invariants
CERO lógica/handlers/estado/estilos. Labels con htmlFor (WEB-033) y a11y TKT-026 intactos.

## Verificación
- Greps de contenido por rol semántico; `fieldset`×3 con reset completo.
- `tsc`/`build` EXIT 0, `lint` 0 errores, suites sin regresión.
- Commits: código + docs. Push a `beta`. Sin merge a `main`.

---
*Ticket: WEB-037*
