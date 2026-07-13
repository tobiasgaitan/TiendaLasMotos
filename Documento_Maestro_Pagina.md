# Documento Maestro de la Página (Tienda Las Motos)
**Versión del Stack & Hitos:** v8.4.7  
**Última Actualización:** 2026-07-13  
**Estado:** DEPLOYED (Entorno Beta & Producción Sincronizados - Hotfix WEB-838-INSURANCE-SCALE-FIX)

---

## 1. Stack Tecnológico Primario (Verdad Inmutable)
El sistema está construido bajo una infraestructura nativa en la nube (Cloud-Native) con los siguientes contratos rígidos de tecnología:

*   **Runtime:** Node.js v22.x
*   **Framework Principal:** Next.js 16.1.1+ (App Router)
*   **Biblioteca de UI:** React 19.0.0 (Soporte nativo para Server Actions en componentes cliente/servidor)
*   **Estilos y Layout:** TailwindCSS v4.0.0+ junto con reglas de CSS nativo.
*   **Base de Datos y Backend:** Firebase Firestore (SDK v11.1.0) & Firebase Admin SDK v13.0.1.
*   **Despliegue e Infraestructura:** Google Cloud Run (para Server Actions y servidor Next.js) + Firebase Hosting.

---

## 2. Flujos Reactivos y de Datos (Tiempo Real)
El sistema implementa patrones reactivos mediante el SDK de Firestore para asegurar la propagación instantánea de cambios de estado sin necesidad de recargas manuales:

### A. Escucha Reactiva de Prospectos (Leads)
*   **Módulo:** Dashboard Administrativo de Leads.
*   **Tecnología:** Escucha activa mediante `onSnapshot` sobre la colección `prospectos`.
*   **Comportamiento:** Sincronización instantánea de nuevos prospectos en la interfaz. El pipeline aplica una sanitización de PII forzada (truncado de campos `nombre` y `ciudad` a 50 caracteres y adición obligatoria del prefijo de país `57` al campo `celular`).

### B. Escucha Reactiva de Anomalías de Catálogo y Alertas de Red
*   **Componente:** `AnomaliesBanner` (v8.4.1)
*   **Colección de Firestore:** `anomalias` y `sys_alerts` (colección dedicada e independiente de transacciones).
*   **Comportamiento:** Suscripción reactiva dual en tiempo real en los paneles de Novedades e Inventario/Prospectos. El consolidador reactivo mapea de forma dinámica los documentos de `sys_alerts` (fallos de red HTTP 4xx/5xx, caídas de base de datos) a la interfaz inalterable `Anomaly` con severidad crítica (`severity: 'critical'`), destruyendo la vista de "Historial Saludable" cuando se presenten alertas de red, sin alterar la firma de la interfaz original ni sus aserciones WCAG.
*   **Enlace de Navegación (v8.4.2):** Nodo de navegación hacia la ruta `/admin/novedades` utilizando el icono `Bell` de Lucide React, con la escala del contenedor ampliada de forma quirúrgica a `max-h-80` para evitar truncamientos en la interfaz.
*   **Página Administrativa de Novedades (v8.4.3):** Creación e implementación de la ruta `/admin/novedades` mediante el componente de página de cliente reactivo que renderiza el panel `AnomaliesBanner` en tiempo real y muestra un visor de historial de auditoría con opciones de filtrado y descartado de anomalías de catálogo.
*   **Consolidador Multicanal (v8.4.4):** Implementación de la unificación reactiva de `sys_alerts` y `anomalias` en la página de auditoría de novedades y en el panel de prospectos, logrando una visibilidad completa de incidentes de red e infraestructura sin alterar firmas de tipado.

---

## 3. Resguardo de Parches Financieros Históricos (WEB-836)
Se declaran como componentes inmutables de la lógica de negocio los siguientes parches financieros corregidos en iteraciones previas:

### A. Corrección del Simulador Administrativo (Simulator Price Fix)
*   **Problema original:** El simulador administrativo calculaba el capital base y la cuota inicial utilizando una propiedad obsoleta llamada `precio`.
*   **Solución aplicada:** Corrección quirúrgica en `handleMotoChange` para usar la propiedad canónica `price` (obtenida directamente del catálogo normalizado). Esto preserva la consistencia de precios en la base de datos y la interfaz de usuario de cotizaciones.

### B. Corrección del Bot de Tasa de Usura (Usury Rate Bot Fix)
*   **Servicio:** Cloud Function `updateUsuryRates`.
*   **Integración Externa:** Socrata API (Superintendencia Financiera de Colombia).
*   **Detalles del Parche:**
    1.  **Dataset Correcto:** Sincronización reorientada al dataset `pare-7x5i` (Tasa de Interés Bancario Corriente - TIBC), corrigiendo el uso erróneo de la TRM (`32sa-8pi3`).
    2.  **Mapeo de Esquema:** Campo mapeado a `interes_bancario_corriente`. El valor retornado (e.g., `"19.19%"`) se limpia de sufijos de porcentaje y se convierte a punto flotante.
    3.  **Filtro de Consulta:** Modalidad configurada estrictamente en mayúsculas: `"CONSUMO Y ORDINARIO"`.
    4.  **Cálculo Legal:** Tasa de usura final calculada multiplicando la Tasa de Interés Bancario Corriente por 1.5 (`IBC * 1.5`) según el Art. 305 del Código Penal Colombiano.
    5.  **Banderas de Control (Flags):** La sincronización automática a Firestore solo actualiza entidades que cumplan la condición lógica: `syncedWithUsura === true` AND `manualOverride !== true`.
    6.  **Trazabilidad:** Se graban los campos `lastUsuryEA` y `lastIBCEA` en Firestore para auditoría financiera.

---

## 4. Guardrails Globales: Zero-Silent-Failures
Para evitar fallas silenciosas en producción, se implementan de forma obligatoria las siguientes directivas de observabilidad y depuración forense:

1.  **Prohibición de Captura Genérica Silenciosa:** Queda estrictamente prohibido usar bloques `try/except` o `try/catch` vacíos o que solo retornen fallos genéricos amigables sin registrar el stack trace.
2.  **Inyección Forense de Logs:** Todo bloque de captura de errores debe registrar obligatoriamente el error usando `logger.exception(e)` (Python) o `console.error(err)` (Node/TypeScript) antes de invocar la respuesta de fallback.
3.  **Registro de Payloads de Red:** Si ocurre un fallo en una API externa (Meta, Socrata, Firebase), el log debe incluir el cuerpo completo de la petición y el texto crudo de la respuesta de error del proveedor (`e.response.text` o equivalente).
4.  **Anti-Null Masking:** Prohibido el uso de encadenamientos opcionales (`?.`) o métodos tolerantes a fallas (`.get()`) en llaves de configuración críticas para evitar enmascarar propiedades renombradas o eliminadas. Si falta una llave requerida por el LLM, el sistema debe arrojar un error explícito.
5.  **Bypass de Componentes Vacíos:** Para APIs de Meta, no se deben enviar arrays vacíos (`[]`) en llaves críticas de componentes si el proveedor externo no lo tolera. Se requiere lógica condicional para omitir la llave entera.

---

## 5. Normalización de Parámetros de UI y Plazo a 36 Meses (WEB-837-REVISED-FINAL)
*   **Problema:** Desincronización de escala de variables asíncronas en los hooks `useMemo` de las calculadoras de cupo/presupuesto. Las páginas frontend continuaban inyectando el argumento rígido de 48 meses al calculador, y el factor de seguros sin normalizar provocaba un cortocircuito NaN que congelaba el cupo estimado en $11,997 COP.
*   **Solución Aplicada:**
    1.  **Normalización de Parámetros**: Modificación de los bloques `useMemo` de cálculo derivado en `src/app/buscador/page.tsx` y `src/app/admin/presupuesto/page.tsx` para evaluar la existencia real y limpia de las propiedades de la entidad financiera seleccionada utilizando el operador de coalescencia nula `??` para evitar la coerción incorrecta de tasas en $0$.
        ```typescript
        const interest = selectedEntity?.interestRate ?? 2.3;
        const fng = selectedEntity?.fngRate ?? 0;
        const insurance = selectedEntity?.lifeInsuranceValue ?? 0.1126;
        ```
    2.  **Sincronización a 36 Meses**: Se garantiza que el tercer argumento de la función `calculateMaxLoan` esté fijado de forma inmutable en el valor numérico `36` en ambas páginas, garantizando paridad matemática.
    3.  **Certificación**: Validación exitosa del tipado TypeScript y pruebas unitarias standalone de rango matemático de `reverseCalculator` en el script local `.agent/scripts/pytest`.

---

## 6. Barrera de Sincronía de Hidratación en App Router (WEB-838-HYDRATION-SYNCHRONY-BARRIER)
*   **Problema:** Discrepancia de hidratación (Hydration Mismatch) asíncrona en Next.js. El servidor pre-renderiza de forma estática la vista del cliente ('use client') antes de que Firestore instancie el payload flotante, atrapando el estado reactivo en los valores de fallback mínimos por defecto.
*   **Solución Aplicada:**
    1.  **Barrera isMounted**: Inyección de un estado controlado de montaje `isMounted` en `src/app/buscador/page.tsx` y `src/app/admin/presupuesto/page.tsx`.
    2.  **Ciclo de Montaje Síncrono**: Activar el estado en un `useEffect` local de montaje (con bypass de ESLint de cascading renders).
    3.  **Retorno Seguro**: Retornar `null` si `!isMounted` para forzar a Next.js a procesar la renderización de las ecuaciones matemáticas y el catálogo únicamente del lado del cliente hidratado.
    4.  **Preservación de Lógica**: Mantenimiento intacto del cálculo de plazo de 36 meses y los adaptadores `parseFloat` perimetrales e intermedios.
    5.  **Certificación**: Compilación de producción local con `npm run build` exitosa y código de salida 0 en la suite de pruebas unitarias `.agent/scripts/pytest`.

---

## 7. Normalización de Seguro de Vida Fijo (WEB-838-INSURANCE-SCALE-FIX)
*   **Problema:** Inyección errónea del costo fijo absoluto del seguro de vida ($15.000 COP) directamente en el parámetro `insuranceRate` de `calculateMaxLoan` para Banco de Bogotá y Brilla, interpretándolo como una tasa mensual del 15.000%, lo que colapsaba el cupo de crédito a $11.997 COP.
*   **Solución Aplicada:**
    1.  **Inmutabilidad del Núcleo**: Se mantuvo intacto el archivo central `reverseCalculator.ts` sin alterar ninguna línea de cálculo de `calculateMaxLoan`.
    2.  **Capa Adaptadora en useMemo**: Se inyectó una capa adaptadora matemática en el hook `useMemo` de `src/app/buscador/page.tsx`, `src/app/admin/presupuesto/page.tsx` y en el componente de simulación de pruebas `reverseCalculator.test.ts`.
    3.  **Fórmula de Tasa Equivalente**: Se calcula dinámicamente la tasa mensual equivalente que deduzca del presupuesto mensual el valor fijo del seguro: `insurance = 100 * (insurance * amortFactor) / (budget - insurance)`.
    4.  **Blindaje contra División por Cero**: Si el presupuesto es menor o igual al seguro de vida mensual, se cortocircuita la tasa a `0` para evitar divisiones por cero o valores indeterminados (`NaN`, `Infinity`).
    5.  **Suite de Pruebas Unitarias**: Se agregaron dos pruebas específicas en `reverseCalculator.test.ts` para verificar la exactitud matemática y el comportamiento del cortocircuito de seguridad.


