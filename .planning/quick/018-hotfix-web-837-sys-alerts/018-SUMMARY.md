# Quick Task 018: hotfix-web-837-sys-alerts — Summary

**Executed:** 2026-07-06
**Status:** Complete

## What Was Done
- Se implementó un Consolidador de Alertas reactivo dual en `src/app/admin/novedades/page.tsx` y `src/app/admin/prospectos/page.tsx` mediante listeners `onSnapshot` secundarios que escuchan la colección `sys_alerts` en tiempo real de forma independiente y aislada.
- Se mantuvieron inmutables la firma, tipados y lógica original de la interfaz `Anomaly` y del componente `AnomaliesBanner`.
- Se normalizaron los documentos de `sys_alerts` al tipo `Anomaly` con asignación forzada de `severity: 'critical'`, prefijo informativo `[FALLO DE RED]` en el mensaje, y mapeo de logs forenses al campo `query` (`error_code` y `endpoint`).
- Se manejaron correctamente las excepciones y fallos de subscripción con registros forenses unificados `console.error` (Zero-Silent-Failures).
- Se actualizaron las funciones `handleDismiss` y `handleClearAll` en novedades para dar soporte multi-colección y depurar tanto `anomalias` como `sys_alerts` de forma dinámica y atómica.
- Se agregó `baseUrl: "."` a `tsconfig.json` para permitir la correcta resolución de paths absolutos (`@/*`) en scripts de prueba.

## Files Modified
| File | Action | Description |
|------|--------|-------------|
| [src/app/admin/novedades/page.tsx](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/src/app/admin/novedades/page.tsx) | Modified | Implementación de la suscripción dual, consolidador y depuración multicanal. |
| [src/app/admin/prospectos/page.tsx](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/src/app/admin/prospectos/page.tsx) | Modified | Sincronización dual de alertas de catálogo y red en el banner de prospectos. |
| [tsconfig.json](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/tsconfig.json) | Modified | Adición de baseUrl para la resolución de paths en las pruebas. |

## Verification
- Se ejecutó de forma exitosa el script de aserciones de contraste WCAG AA (`npx ts-node -O '{"module": "commonjs"}' -r tsconfig-paths/register src/test/components/AnomaliesBanner.test.tsx`), garantizando que la visualización cumple con un contraste WCAG > 4.5:1.
- Se ejecutó un script de aserción lógica (`scratch/verify_novedades_logic.ts`), comprobando que la ausencia de anomalías de catálogo con alertas activas de red destruye correctamente la sección de "Historial Saludable".
- Se ejecutó `npm run build` con éxito asegurando la integridad estática de todas las rutas administrativas modificadas.

---
*Completed: 2026-07-06*
