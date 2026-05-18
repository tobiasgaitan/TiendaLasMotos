# Quick Task 006: WEB-836 Simulator Price Fix — Summary

**Executed:** 2026-05-18
**Status:** Complete

## What Was Done
Corregimos de forma quirúrgica e integral la violación de lógica financiera y colisión de variables en el simulador administrativo (`SimulatorPage`). Ahora el simulador inyecta el valor base canónico (`m.price`) en lugar del valor comercial con descuento (`m.precio`) durante el ciclo de actualización de `handleMotoChange`, garantizando que el Capital Base y la Cuota Inicial en planes de crédito se calculen correctamente basándose en el precio real libre de bonos temporales.

1. **Tipado del Contrato:** Añadimos la propiedad opcional `price?: number;` a la interfaz `Moto` en `src/types/index.ts`.
2. **Mapeo de Firestore:** Inyectamos la llave física `price` mapeada desde los documentos de la colección de Firestore en la función `getCatalogoMotos()` dentro de `src/lib/firestore.ts`, con un fallback tolerante y robusto a `precio` (`Number(data["price"]) || Number(data["precio"]) || 0`).
3. **Lógica de Simulador:** Modificamos el callback `handleMotoChange` en `src/app/admin/simulador/page.tsx` para usar `m.price || m.precio` tanto para establecer el precio como para calcular el pago inicial (`calculatedDownPayment`). Esto mantiene intacto el array de dependencias del `useCallback` y respeta al 100% las restricciones quirúrgicas.

## Files Modified
| File | Action | Description |
|------|--------|-------------|
| [src/types/index.ts](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/src/types/index.ts) | Modified | Añadida propiedad `price?: number;` a la interfaz `Moto`. |
| [src/lib/firestore.ts](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/src/lib/firestore.ts) | Modified | Mapeada la llave `price` desde los documentos de Firestore con fallback robusto. |
| [src/app/admin/simulador/page.tsx](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/src/app/admin/simulador/page.tsx) | Modified | Actualizada la actualización imperativa de precios y cuota inicial para usar el precio canónico. |

## Verification
- **Compilación de Next.js (`npm run build`):** Exitosa. Compiló 23/23 rutas estáticas y dinámicas usando Turbopack sin advertencias de tipado estricto.
- **Auditoría Estática y Linteo (`npm run agent-eval`):** Exitosa. `tsc --noEmit` y `eslint` pasaron exitosamente. Coherence Score verificado de **1.000**.

---
*Completed: 2026-05-18*
