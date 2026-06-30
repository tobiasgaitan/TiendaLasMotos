# Documento Maestro de la Página (Tienda Las Motos)
**Versión del Stack & Hitos:** v8.4.1  
**Última Actualización:** 2026-06-29  
**Estado:** DEPLOYED (Entorno Beta & Producción Sincronizados)

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

### B. Escucha Reactiva de Anomalías de Catálogo
*   **Componente:** `AnomaliesBanner` (v8.4.1)
*   **Colección de Firestore:** `anomalias` (o anomalías detectadas en items de catálogo).
*   **Comportamiento:** Suscripción activa en tiempo real que captura incoherencias de datos de motos (e.g., precios fuera de rango, imágenes rotas o vacías) y renderiza alertas de alta visibilidad para los administradores, cumpliendo con los estándares de contraste WCAG.

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
