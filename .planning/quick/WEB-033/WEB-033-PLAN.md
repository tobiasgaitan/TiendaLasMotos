---
task: "WEB-033"
name: "Remediación a11y integral (106 controles, 85 labels, 20 archivos)"
description: "Solo añadir id + htmlFor por Regla del Cirujano; CERO lógica/CSS/estado"
---

# WEB-033: Remediación a11y integral

## Objective
Añadir `id` único a cada `<input>`/`<select>`/`<textarea>` sin id y `htmlFor`
a cada `<label>`, en 20 archivos fuera de `/admin/creditos` (ya remediado en
TKT-026). Preservar `aria-label` existentes. Unicidad de id por archivo.

## Mapeo de rutas (ticket → real)
- `components/admin/FinancialParams.tsx` → `components/admin/FinancialParametersManager.tsx`
- `components/admin/Inventory.tsx` → `components/InventoryTable.tsx`
- `components/admin/ImageUploader.tsx` → `components/ImageUploader.tsx`

## Prefijos por scope
cfg-*, slider-*, prospecto-*, producto-*, quote-*, lead-*, general-*, user-*,
sede-*, sim-*, presu-*, novedad-*, config-*, giro-/pago- (n/a), campana-*,
bulk-*, finparam-*, inv-*, imgupload-*, login-*, buscar-*.

## Commits (3)
1. `a11y(components): add id+htmlFor to all form controls [WEB-033-1/3]`
2. `a11y(admin): add id+htmlFor to admin panel forms [WEB-033-2/3]`
3. `a11y(public): add id+htmlFor to login/buscador forms [WEB-033-3/3]`

Push a origin/beta. NO merge a main.

## Verificación (por commit)
- Greps de cierre → vacío (inputs/selects/textarea sin id; labels sin htmlFor).
- `tsc`/`build` EXIT 0, `lint` 0 errores.
- `git diff` = solo adiciones de atributos.

---
*Ticket: WEB-033*
