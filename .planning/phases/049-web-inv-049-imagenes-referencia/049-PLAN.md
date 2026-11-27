# Fase 049 — Plan de ejecución WEB-INV-049

## Objetivo

Persistir `imagenes_referencia: string[]` (máx. 5 URLs HTTPS de Firebase Storage)
en `inventario_repuestos` y permitir que un administrador las gestione desde
`/admin/inventario-repuestos` mediante un modal con preview, lista y eliminación.

## Invariantes

- `imagen_url`, `referencia`, `referencias_alternativas`, `categoria`,
  `fabricante`, `precio`, `stock`, `stock_minimo` sin renombre ni eliminación.
- Ledger append-only: el asiento UPDATE incluye `imagenes_referencia` en
  `campos_modificados` solo cuando el array cambió.
- Guards existentes: `admin`/`superadmin` + `puedeAccion(..., 'update')`.
- Sin tocar `src/app/admin/inventario-asesor/**`, reglas, índices, offline ni bot.
- Sin dependencias nuevas.

## Archivos

### Núcleo

- `src/types/inventario.ts` — `InventarioRepuesto.imagenes_referencia?`
- `src/types/inventario-repuestos.ts` — `BorradorRepuesto` / `CambiosRepuesto`
- `src/lib/actions/inventario-repuestos-schemas.ts` — schema URL + máximo 5
- `src/lib/inventario/repuestos.ts` — `construirCambiosRepuesto`
- `src/app/admin/inventario-repuestos/actions/crearRepuesto.ts`
- `src/app/admin/inventario-repuestos/actions/editarRepuesto.ts`
- `src/app/admin/inventario-repuestos/actions/listarRepuestos.ts`
- `src/app/admin/inventario-repuestos/InventarioRepuestosClient.tsx`
- `src/app/admin/inventario-repuestos/components/ImagenesReferenciaModal.tsx` (nuevo)

### Tests

- `src/test/utils/inventario-repuestos.test.ts`
- `src/test/vitest/actions.test.ts`
- `src/test/vitest/render/ImagenesReferenciaModal.render.test.tsx` (nuevo)
- `src/test/vitest/naming-lock.test.ts`

### Higiene separada (commit 1)

- `scripts/scan-residuos-prueba.ts` — tipado explícito de `doc` para `tsc`.

## Diseño

1. Zod valida host exacto, HTTPS, prefijo `inventario_repuestos/`, máximo 5 y
   ausencia de duplicados. Campo opcional.
2. `listarRepuestos` mapea el campo a `string[]` (`[]` si falta).
3. `editarRepuesto` compara arrays y solo escribe/audita si cambió. Idempotente.
4. `crearRepuesto` persiste `data.imagenes_referencia ?? []`.
5. El modal sube directo a `inventario_repuestos/{email-admin}/ref-{docId}-{uuid}.{ext}`
   usando las reglas actuales. Persiste solo URLs; nunca base64.
6. El modal actualiza el borrador; la fila persiste con **Guardar** mediante
   `editarRepuesto`.

## Verificación

```bash
npx tsc --noEmit
npm run lint
npm run test:ci
npm run build
git diff --check
```

UAT beta: crear/editar ficha temporal con 1–3 imágenes, verificar Firestore y
ledger, verificar que el asesor no ve el campo y limpiar ficha/blobs.

## Rollback

Patch temporal + `git apply -R`; nunca `git checkout --`. Si ya hay push a beta,
`git revert <sha>` sin force-push.
