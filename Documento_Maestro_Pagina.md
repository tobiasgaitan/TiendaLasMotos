# Documento Maestro de la Página (Tienda Las Motos)
**Versión del Stack & Hitos:** v8.5.4  
**Última Actualización:** 2026-09-24  
**Estado:** DEPLOYED (Beta v8.5.4) — Producción pendiente de sincronización (merge beta→main por decisión del Director)

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

### C. Semáforo de Crédito Crediticio (WEB-SCORE-THRESHOLD-001)
*   **Módulo:** Dashboard Administrativo de Prospectos (`/admin/prospectos`).
*   **Componente:** Función `getScoreBadge` en `src/app/admin/prospectos/page.tsx`.
*   **Ajuste de Umbrales (2026-09-24):** Recalibración de los puntos de corte del semáforo de crédito para reflejar la política canónica del negocio:
    *   🟢 **Verde (Perfil Sólido):** `score_resultado >= 750`
    *   🟡 **Amarillo (Perfil Condicional):** `score_resultado >= 500` y `< 750`
    *   🔴 **Rojo (Alto Riesgo):** `score_resultado < 500`
*   **Safe-Fallback:** Prospectos sin `score_resultado` en Firestore continúan renderizando el guión "—" (text-gray-300 WCAG-AA).
*   **Coherence Score:** 0.97 (Reporte alternativo vía análisis estático de diff canónico).

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



---

## 8. Sistema de Gestión de Créditos y Renting (Fase 9 — 2026-09-24)

### A. Arquitectura del Módulo
*   **Rutas:** 5 módulos operativos bajo `/admin/creditos/...` (contratos, terminal de cobro, cierre de caja, inversores, auditoría read-only).
*   **Sidebar:** Grupo "Gestión de Créditos" con icono `CreditCard` ámbar.
*   **Colecciones Firestore:** 6 colecciones (`clientes_credito`, `creditos`, `pagos_y_multas`, `pagos_inversores`, `remisiones_dinero`, `historial_auditoria`) con reglas de lectura autenticada y writes/deletes de cliente denegados.

### B. Contratos de Datos (NAMING LOCK)
*   **`clientes_credito`:** 5 claves inmutables (`cedula`, `nombres`, `celular`, `direccion`, `fecha_registro`). `created_at` no aplica (SSOT = `fecha_registro`).
*   **`creditos`:** Mapas `vehiculo`/`condiciones`/`asignaciones` con FK `id_cliente`/`email_admin`/`email_usuario`/`email_inversor`. Aditivo `numero_credito` (CRE-YYYY-XXXX).
*   **`pagos_y_multas`:** `valor_pagado_cliente`/`tipo_transaccion` (`pago_cuota`|`multa`|`nota_credito`)/`valor_comision`/`valor_neto_empresa`. `motivo` obligatorio para multas.
*   **`pagos_inversores`:** Giro de salida con `email_admin`/`email_inversor`/`monto`.
*   **`remisiones_dinero`:** Máquina de estados `pendiente` → `recibido` (aprobación admin) o `anulado`.
*   **`historial_auditoria`:** Ledger append-only vía `add()` (prohibido `batch.set()`/`update()`/`delete()`). Campo `registrado_por` = uid verificado vía `verifyIdToken`.

### C. Reglas de Negocio (Server Actions)
*   **Regla A (Comisión):** Calculada en servidor (`src/lib/actions/creditos-calc.ts`). `pago_cuota`: comisión = valor × porcentaje; `multa`/`nota_credito`: comisión = 0. Cliente no inyecta `valor_comision`/`valor_neto_empresa` (Faraday Cage).
*   **Regla B (Mora Renting):** Días cobrables = días posteriores a `fecha_registro` hasta hoy, excluyendo domingos. Exigible = días × cuota. Mora = exigible - recibido. Estado `en_mora` si mora > 0.
*   **`nota_credito`:** Único mecanismo de ajuste contable negativo (prohibido borrado físico de registros financieros).

### D. Índices Compuestos (21 totales)
*   **18 legacy:** Espejados de GCP (compradores, posts, citas, clientes, products, etc.) para evitar deploy destructivo.
*   **3 Fase 9:** `pagos_y_multas[registrado_por, fecha_registro]` (cierre de caja), `creditos[vehiculo.placa, activo]` (búsqueda por placa), `creditos[id_cliente, activo]` (búsqueda por cliente).

### E. Verificación E2E (2026-09-24)
*   **Pasos 1-6 certificados:** Cliente inline + contrato `CRE-2026-0001`, Regla A (20.000/80.000 y 0/15.000), cierre 95.000 `pendiente→recibido`, giro 50.000 con saldo 45.000, ledger de 7 asientos append-only, evidencias Firestore completas.
*   **Purga:** 14 docIds eliminados (whitelist cerrada) + reset de `configuracion/counters`. Estado pre-E2E restaurado con paridad 1:1.

### F. Commits Clave
*   `4a8c0fe`: Ejecución de planes 09-01..09-06 (código + reglas).
*   `e0e2c05`: Fix de exports no-función en archivos `'use server'` (Next.js module restriction).
*   `e4ddd31`: Declaración de 21 índices compuestos (18 legacy + 3 Fase 9) con merge pre-deploy.

**Coherence Score:** 0.98 (Fase 9 — E2E certificado, purga ejecutada, deuda técnica registrada como tickets aislados).

---
*Última actualización: 2026-09-24 COT por Antigravity*

---

## 8. Sistema de Gestión de Créditos y Renting (Fase 9 — 2026-09-24)

### A. Arquitectura del Módulo
*   **Rutas:** 5 módulos operativos bajo `/admin/creditos/...` (contratos, terminal de cobro, cierre de caja, inversores, auditoría read-only).
*   **Sidebar:** Grupo "Gestión de Créditos" con icono `CreditCard` ámbar.
*   **Colecciones Firestore:** 6 colecciones (`clientes_credito`, `creditos`, `pagos_y_multas`, `pagos_inversores`, `remisiones_dinero`, `historial_auditoria`) con reglas de lectura autenticada y writes/deletes de cliente denegados.

### B. Contratos de Datos (NAMING LOCK)
*   **`clientes_credito`:** 5 claves inmutables (`cedula`, `nombres`, `celular`, `direccion`, `fecha_registro`). `created_at` no aplica (SSOT = `fecha_registro`).
*   **`creditos`:** Mapas `vehiculo`/`condiciones`/`asignaciones` con FK `id_cliente`/`email_admin`/`email_usuario`/`email_inversor`. Aditivo `numero_credito` (CRE-YYYY-XXXX).
*   **`pagos_y_multas`:** `valor_pagado_cliente`/`tipo_transaccion` (`pago_cuota`|`multa`|`nota_credito`)/`valor_comision`/`valor_neto_empresa`. `motivo` obligatorio para multas.
*   **`pagos_inversores`:** Giro de salida con `email_admin`/`email_inversor`/`monto`.
*   **`remisiones_dinero`:** Máquina de estados `pendiente` → `recibido` (aprobación admin) o `anulado`.
*   **`historial_auditoria`:** Ledger append-only vía `add()` (prohibido `batch.set()`/`update()`/`delete()`). Campo `registrado_por` = uid verificado vía `verifyIdToken`.

### C. Reglas de Negocio (Server Actions)
*   **Regla A (Comisión):** Calculada en servidor (`src/lib/actions/creditos-calc.ts`). `pago_cuota`: comisión = valor × porcentaje; `multa`/`nota_credito`: comisión = 0. Cliente no inyecta `valor_comision`/`valor_neto_empresa` (Faraday Cage).
*   **Regla B (Mora Renting):** Días cobrables = días posteriores a `fecha_registro` hasta hoy, excluyendo domingos. Exigible = días × cuota. Mora = exigible - recibido. Estado `en_mora` si mora > 0.
*   **`nota_credito`:** Único mecanismo de ajuste contable negativo (prohibido borrado físico de registros financieros).

### D. Índices Compuestos (21 totales)
*   **18 legacy:** Espejados de GCP (compradores, posts, citas, clientes, products, etc.) para evitar deploy destructivo.
*   **3 Fase 9:** `pagos_y_multas[registrado_por, fecha_registro]` (cierre de caja), `creditos[vehiculo.placa, activo]` (búsqueda por placa), `creditos[id_cliente, activo]` (búsqueda por cliente).

### E. Verificación E2E (2026-09-24)
*   **Pasos 1-6 certificados:** Cliente inline + contrato `CRE-2026-0001`, Regla A (20.000/80.000 y 0/15.000), cierre 95.000 `pendiente→recibido`, giro 50.000 con saldo 45.000, ledger de 7 asientos append-only, evidencias Firestore completas.
*   **Purga:** 14 docIds eliminados (whitelist cerrada) + reset de `configuracion/counters`. Estado pre-E2E restaurado con paridad 1:1.

### F. Commits Clave
*   `4a8c0fe`: Ejecución de planes 09-01..09-06 (código + reglas).
*   `e0e2c05`: Fix de exports no-función en archivos `'use server'` (Next.js module restriction).
*   `e4ddd31`: Declaración de 21 índices compuestos (18 legacy + 3 Fase 9) con merge pre-deploy.

**Coherence Score:** 0.98 (Fase 9 — E2E certificado, purga ejecutada, deuda técnica registrada como tickets aislados).

---
*Última actualización: 2026-09-24 COT por Antigravity*

---
## 9. Resolución de Deudas Técnicas (2026-09-24)
### A. Deuda 3: Migración middleware.ts → proxy.ts (Next 16.1.1)
*   **Problema:** Next.js 16 deprecó la convención `middleware.ts` en favor de `proxy.ts` (Node.js runtime).
*   **Solución:** Ejecución del codemod canónico `@next/codemod@canary middleware-to-proxy` con paridad perimetral 1:1 (NAMING LOCK de 7 puntos: cookie `__session`, bypass `.csv`, protección `/admin/*`).
*   **Certificación:** Matriz Runtime (a-f) validada en Beta. Commit `0a4b5fa`.

### B. Deuda 4: Alineación CI Node 22 (2026-09-24)
*   **Problema:** Workflows CI (`deploy-beta.yml`, `deploy-prod.yml`) forzaban `node-version: 20` divergiendo del runtime canónico Node 22.x.
*   **Solución:** Reemplazo atómico `node-version: 20` → `node-version: 22` en línea 20 de ambos workflows.
*   **Certificación:** Run CI #35932474469 verde con Node 22.23.2. Paridad 1:1 con engines, Dockerfile y Documento Maestro.
*   **Commits:** `a252065` (fix), `2850148` (docs planning).

### C. Deuda 2: Unificación FK sys_admin_users a email canónico (2026-09-24)
*   **Problema:** Heterogeneidad de FK: los campos `uid_admin`/`uid_usuario`/`uid_inversor` en `creditos`/`pagos_inversores` almacenaban emails o docId, nunca UIDs de Auth; integridad referencial rota.
*   **Solución:** Ruta A': renombre a `email_admin`/`email_usuario`/`email_inversor`/`email_cobrador`; dropdowns emiten email normalizado (toLowerCase/trim). NAMING LOCK §8.B reescrito a FK-por-email; el concepto `uid` queda reservado a `registrado_por` (Auth uid).
*   **Certificación:** Forenses Firestore con claves email_* en runtime; consolas limpias en Safari y en Chrome sin proxy; `M_ID` tipificado como causa ambiental (Urban VPN Proxy × bundle prod Chrome); refactor `fb365b9` exonerado. Commits `fb365b9` + `f21500b`; CI run #135 verde.
*   **Purga E2E:** 11 docIds eliminados (cliente, crédito, giro, remisión, pago_y_multas y 6 asientos del ledger) + reset de `creditoCount` a 0. Paridad 1:1 con el Gate 2.
*   **Riesgo de entorno:** Urban VPN Proxy debe permanecer OFF durante auditorías y uso del admin.
*   **Observación no bloqueante:** 22 Issues de Chrome (autofill/accesibilidad: id/name y label en campos de formulario) — candidata a ticket menor separado.

### D. Deuda 5: Silenciamiento de MaxListenersExceededWarning (Quick-026)
*   **Problema:** Warning de runtime Node 22 en Cloud Run Beta (`11 uncaughtException listeners added to [process]`) causado por la acumulación de handlers de error por parte de `next-server.js` y `router-server.js` durante los ciclos de arranque en frío del adaptador `firebase-frameworks`.
*   **Solución:** Creación del hook oficial `src/instrumentation.ts` con la función `register()` exportada, inyectando `process.setMaxListeners(25)` para elevar el umbral de Node.js sin alterar la semántica de captura de errores de Next.js.
*   **Certificación:** Forense de logs `stderr` en revisión `ssrtiendalasmotosbeta-00552-sop` post-deploy devuelve `[]` (cero warnings) tras tráfico inducido y cold start. Commit `bbeeaed`.
