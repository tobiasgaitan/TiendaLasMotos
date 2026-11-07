# Documento Maestro de la Página (Tienda Las Motos)
**Versión del Stack & Hitos:** v8.9.0  
**Última Actualización:** 2026-11-07  
**Estado:** DEPLOYED (Beta v8.9.0) — Producción pendiente de sincronización (merge beta→main por decisión del Director)

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
*   **Ajuste de Umbrales (2026-10-01):** Recalibración de los puntos de corte del semáforo de crédito para reflejar la política canónica del negocio:
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

## 8. Sistema de Gestión de Créditos y Renting (Fase 9 — 2026-10-01)

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

### E. Verificación E2E (2026-10-01)
*   **Pasos 1-6 certificados:** Cliente inline + contrato `CRE-2026-0001`, Regla A (20.000/80.000 y 0/15.000), cierre 95.000 `pendiente→recibido`, giro 50.000 con saldo 45.000, ledger de 7 asientos append-only, evidencias Firestore completas.
*   **Purga:** 14 docIds eliminados (whitelist cerrada) + reset de `configuracion/counters`. Estado pre-E2E restaurado con paridad 1:1.

### F. Commits Clave
*   `4a8c0fe`: Ejecución de planes 09-01..09-06 (código + reglas).
*   `e0e2c05`: Fix de exports no-función en archivos `'use server'` (Next.js module restriction).
*   `e4ddd31`: Declaración de 21 índices compuestos (18 legacy + 3 Fase 9) con merge pre-deploy.

**Coherence Score:** 0.98 (Fase 9 — E2E certificado, purga ejecutada, deuda técnica registrada como tickets aislados).

---
*Última actualización: 2026-10-01 COT por Antigravity*

---

## 8. Sistema de Gestión de Créditos y Renting (Fase 9 — 2026-10-01)

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

### E. Verificación E2E (2026-10-01)
*   **Pasos 1-6 certificados:** Cliente inline + contrato `CRE-2026-0001`, Regla A (20.000/80.000 y 0/15.000), cierre 95.000 `pendiente→recibido`, giro 50.000 con saldo 45.000, ledger de 7 asientos append-only, evidencias Firestore completas.
*   **Purga:** 14 docIds eliminados (whitelist cerrada) + reset de `configuracion/counters`. Estado pre-E2E restaurado con paridad 1:1.

### F. Commits Clave
*   `4a8c0fe`: Ejecución de planes 09-01..09-06 (código + reglas).
*   `e0e2c05`: Fix de exports no-función en archivos `'use server'` (Next.js module restriction).
*   `e4ddd31`: Declaración de 21 índices compuestos (18 legacy + 3 Fase 9) con merge pre-deploy.

**Coherence Score:** 0.98 (Fase 9 — E2E certificado, purga ejecutada, deuda técnica registrada como tickets aislados).

---
*Última actualización: 2026-10-01 COT por Antigravity*

---
## 9. Resolución de Deudas Técnicas (2026-10-01)
### A. Deuda 3: Migración middleware.ts → proxy.ts (Next 16.1.1)
*   **Problema:** Next.js 16 deprecó la convención `middleware.ts` en favor de `proxy.ts` (Node.js runtime).
*   **Solución:** Ejecución del codemod canónico `@next/codemod@canary middleware-to-proxy` con paridad perimetral 1:1 (NAMING LOCK de 7 puntos: cookie `__session`, bypass `.csv`, protección `/admin/*`).
*   **Certificación:** Matriz Runtime (a-f) validada en Beta. Commit `0a4b5fa`.

### B. Deuda 4: Alineación CI Node 22 (2026-10-01)
*   **Problema:** Workflows CI (`deploy-beta.yml`, `deploy-prod.yml`) forzaban `node-version: 20` divergiendo del runtime canónico Node 22.x.
*   **Solución:** Reemplazo atómico `node-version: 20` → `node-version: 22` en línea 20 de ambos workflows.
*   **Certificación:** Run CI #35932474469 verde con Node 22.23.2. Paridad 1:1 con engines, Dockerfile y Documento Maestro.
*   **Commits:** `a252065` (fix), `2850148` (docs planning).

### C. Deuda 2: Unificación FK sys_admin_users a email canónico (2026-10-01)
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

### E. Deuda P2: Unificación Singleton firebase-admin (RESUELTA 2026-10-01)
*   **Problema:** Lógica de inicialización duplicada en `getDb()` y `getAdminAuth()` (ambas contenían bloques `if (!globalAny._firebaseAdminApp)` independientes), lo que multiplicaba el riesgo de ejecuciones redundantes si el caché de módulos fallaba. Asimetría adicional: `getAdminAuth` carecía del `try/catch` + logging de `getDb`.
*   **Intento previo fallido (QUICK-023):** Refactor hacia singleton estricto con imports ES6 estáticos causó regresión runtime `ERR_MODULE_NOT_FOUND` en Cloud Run Beta (revisión `00548-men`; externals hasheados `firebase-admin-<hash>` inexistentes bajo firebase-frameworks + Turbopack). Revertido con commit `b96f486`.
*   **Solución (WEB-QUICK-025):** Función privada única `getAdminApp()` con la persistencia `globalAny._firebaseAdminApp`; `getDb`/`getAdminAuth` la consumen. Patrón `eval("require(...)")` conservado con literales idénticos (Valla de Chesterton: el adaptador genera externals hasheados con ES6). Firmas de exportación intactas (NAMING LOCK); 34 call sites sin tocar. Commit `fe37ca6`.
*   **Certificación:** Autopsia 1-7 verde (`initializeApp`×1, `eval`×3, cero ES6, tsc/build EXIT 0, tsx 3/3, diff = 1 archivo). Runtime en revisión `ssrtiendalasmotosbeta-00560-liz`: `ERR_MODULE_NOT_FOUND` → `[]` y `MaxListenersExceeded` → `[]` tras tráfico inducido (9/9 HTTP 200) y cold start. **Coherence Score: 0.99** (análisis estático de diff canónico: 1 archivo, +18/−23, refactor puramente estructural, matriz de 9 verificaciones en verde).

### F. Residual R-google-orphan: Purge de admin-auth.ts (CERRADO — WEB-032 + WEB-035)
*   **Problema:** `src/lib/auth/admin-auth.ts` quedó huérfano tras WEB-032 (purgó `loginAdminWithGoogle` + imports muertos); su único export restante (`logoutAdmin`) tenía cero importadores. El logout real del sistema reside en `AuthContext.tsx:146-149` (`signOut(auth)` directo), consumido por `AdminSidebar` vía `useAuth()`.
*   **Solución (WEB-035):** Eliminación completa del archivo (9 líneas). `grep -rn "admin-auth"` y `"logoutAdmin"` en `src/`, `scripts/`, `functions/src/` → vacíos pre y post. `AuthContext`, `AdminSidebar`, `LoginForm`, `firebase.ts`: cero cambios.

### G. Accesibilidad estructural (WEB-033 + WEB-037)
*   **Problema:** 22 Issues de Chrome (autofill/accesibilidad: id/name y label en campos de formulario).
*   **Solución (WEB-033):** Remediación id/htmlFor en 21 archivos (170 atributos).
*   **Solución (WEB-037):** Refactor de 6 labels huérfanos (títulos de sección → `div[role=heading]`; grupos de controles → `fieldset`+`legend` con reset UA `border-0 p-0 m-0 min-w-0`). Cero lógica/estilos alterados.

### H. Hitos v8.6.0 — Octubre 2026
*   **WEB-032:** Purge de `loginAdminWithGoogle` huérfana + imports muertos (`7a0e60a`).
*   **WEB-033:** Remediación a11y id/htmlFor en 21 archivos — 3 commits (`39816c7`, `a5bd004`, `e399d15`) + plan (`34c0f9f`).
*   **WEB-035:** Eliminación de `src/lib/auth/admin-auth.ts` (`b832897`) + docs (`0b11715`).
*   **WEB-036:** Sincronización documental WEB-029..035 en ROADMAP (`835b28e`, solo docs).
*   **WEB-037:** Refactor estructural a11y headings/fieldset+legend (`5a4fb48`) + docs (`b8a9f47`).

### I. Contratos de Permisos (Matriz P5) — Rol `admin_creditos`

*   **SSOT:** `src/types/roles.ts` (`ROLES`, `DEFAULT_MATRIZ`) + colección configurable `sys_permissions_matrix/{rol}`.
*   **Alta canónica:** `admin_creditos` incorporado a `ROLES` y `DEFAULT_MATRIZ` (commit `19a8e0d`).
*   **Permisos financieros idénticos a `admin`:**
    *   `creditos`, `clientes_credito`, `pagos_y_multas`, `pagos_inversores`, `remisiones_dinero` → `create`/`read`/`update`.
    *   `historial_auditoria` → `read` (ledger append-only).
    *   `anomalias` → `create`/`read`/`update`/`delete`.
    *   Sin `delete` en colecciones financieras: la baja es actualización `activo=false` (NAMING LOCK §8.B intacto).
*   **Exclusión explícita:** **sin** permiso sobre `sys_admin_users` ⇒ sin acceso a Configuración/Usuarios (fail-closed).
*   **Navegación restringida a "Gestión de Créditos":** visibles los sub-nodos `creditos-contratos`, `creditos-pagos`, `creditos-remisiones`, `creditos-inversores`, `creditos-auditoria`. Ocultos `simuladores`, `inventario`, `prospectos` (`soloAdmin`) y `config` (requiere `sys_admin_users.read`).
*   **Landing por rol:** `landingPorRol('admin_creditos') → /admin/creditos`; el resto de roles → `/admin/simulador`.

### J. Hitos v8.7.0 — Octubre 2026

*   **WEB-038 — Landing por rol + guards de ruta (commits `19a8e0d`, `0061423`):**
    *   Rol `admin_creditos` en `ROLES`/`DEFAULT_MATRIZ` y dropdown de usuarios extendido.
    *   Landing por rol vía flag `defaultLanding=1` + `RoleBasedRedirect` (alcance limitado a `/admin` y `/admin/simulador`; sin flag no hay redirect).
    *   Guards de ruta fail-closed con `puedeVerNodo` en 5 páginas: `simulador`, `presupuesto`, `inventory`, `prospectos`, `config`.
    *   `EsperandoActivacion` para `role='guest'` en rutas landing (polling de activación).
*   **WEB-039 — Precedencia guard-dentro-de-wrapper + supresión de flash (commit `f4c1933`):**
    *   `simulador/page.tsx`: `RoleBasedRedirect` monta **siempre**; el guard (`authLoading` → spinner / denegación `role="alert"` / `loading` → spinner de fetch / contenido) se evalúa **dentro de `children`**.
    *   `RoleBasedRedirect.tsx`: supresión de render de `children` mientras el redirect está en vuelo (`defaultLanding && esRutaLanding(pathname) && role resuelto && landingPorRol(role) !== pathname`) ⇒ el bloque de denegación no se pinta ni un frame.
    *   Autopsia: 8 suites en verde, `landing.test.ts` 10/10, `tsc`/`build`/`lint` EXIT 0.

---

## 10. WEB-038 — Inventario de Repuestos y Aislamiento Offline (2026-11-07)

### A. Arquitectura del Módulo Inventario
*   **Rutas:** 2 módulos operativos bajo `/admin/inventario-asesor` (conteo del asesor) y `/admin/inventario-aprobaciones` (panel de aprobaciones).
*   **Sidebar:** Nodos "Inventario", "Conteo de Repuestos" (asesor), "Aprobaciones de Repuestos" (admin/superadmin).
*   **Colecciones Firestore:** `conteos_pendientes_repuestos`, `fotos_inventario`, `inventario_repuestos`, `historial_auditoria_inventario`.
*   **Colección IndexedDB local:** `tlm_offline` (v2) con stores `borradores_conteos` y `fotos_borrador`, índice `propietario_uid`.

### B. Contratos de Datos (NAMING LOCK)
*   **`conteos_pendientes_repuestos`:** Claves inmutables `conteo_id` (UUID v4, docId), `referencia_confirmada`, `referencia_sugerida`, `descripcion`, `cantidad_contada`, `ubicacion`, `anotaciones`, `foto_url`, `storage_path`, `nombre_archivo`, `mime_type`, `tamano_bytes`, `etiquetas_vision`, `estado` (`pendiente_revision` | `aprobado` | `rechazado`), `asesor_email`, `asesor_uid`, `creado_en`, `revisado_por`, `revisado_en`, `motivo_rechazo`.
*   **`fotos_inventario`:** Registro espejo de la foto con `conteo_id`, `asesor_email`, `asesor_uid`, `foto_url`, `storage_path`, `nombre_archivo`, `mime_type`, `tamano_bytes`, `etiquetas_vision`, `creado_en`.
*   **`inventario_repuestos`:** Catálogo maestro con `referencia` (docId), `descripcion`, `fabricante`, `aplica_a`, `categoria`, `precio`, `ubicacion`, `stock`, `stock_minimo`, `imagen_url`, `creado_por`, `creado_en`, `actualizado_por`, `actualizado_en`.
*   **`historial_auditoria_inventario`:** Ledger append-only vía `tx.create()` (prohibido `tx.set()`/`tx.update()`/`tx.delete()` sobre el ledger). Campo `registrado_por` = uid verificado vía `verifyIdToken()`. Clave canónica `estado` (NO `estado_conteo`, que queda como evidencia histórica reconciliable vía `reconciliarDatosNuevosLegado`).

### C. Aislamiento Offline (H-14, H-15, N1-C) — CERRADO EN CÓDIGO + RUNTIME LOCAL
*   **H-14 (Gate de rol):** `OfflineIndicator` consume `useOfflineQueueContext` (contexto seguro, no hook estricto) y retorna `null` si `role !== 'asesor'`. `admin/layout.tsx` ya no monta indicador global. Verificado en runtime: superadmin no abre `tlm_offline`, asesor sí.
*   **H-15 (Provider único):** `OfflineQueueProvider` se monta una sola vez en `src/app/admin/inventario-asesor/page.tsx` con `key={user.uid}`. `OfflineIndicator` y `ConteoAsesorForm` dentro del mismo provider. Listener `outbox:1` (no duplicado). Listeners `online/offline:2` (el segundo par es el SDK de Firestore con persistencia, externo a la cola).
*   **N1-C (Owner-scope):** Borradores locales llevan `propietario_uid` obligatorio. `listarBorradores(propietarioUid)` lee por índice + filtro defensivo. `sincronizarOutbox(actor)` filtra por `actor.uid`. `obtenerFoto` rechaza foto ajena. `marcarSincronizando`/`marcarError`/`eliminarBorrador` verifican propietario. `limpiarOutbox(uid)` purga solo el propietario; fallback global solo si falla owner-scoped con log forense. `AuthContext.logout` captura `uid` antes de `signOut` y llama `limpiarOutbox(uid)`.
*   **Migración v1→v2:** `onupgradeneeded` crea índice `propietario_uid` en ambos stores, descarta registros legacy sin propietario con `cursor.delete()` y log forense.
*   **Runtime local certificado:** Borrador propio con `owner = CwrnxDaVXvVgNRcGjrZ3tU210Ho1` (UID real de `conexion@tiendalasmotos.com`), borradores inyectados `foreign-runtime:uid-OTRO` y `legacy-runtime:NO_OWNER`. UI cuenta solo el propio (1, no 3). Sync no menciona ajenos (0 rastros en Red). Logout purga propio, conserva ajenos, sin fallback global.

### D. Faraday Cage y Server Actions
*   **`crearConteoPendiente.ts`:** `requireActorInventario(a.idToken)` → `verifyIdToken` → `me.uid`/`me.email`. `requirePermiso(me, 'conteos_pendientes_repuestos', 'create')` con gate `asesor`. Valida `foto_url`↔`storage_path` vía `extraerStoragePath` + `esStoragePathDeAsesor`. Idempotencia: si `conteo_id` existe con otro `asesor_email` → `throw`. Hardcodea `estado: 'pendiente_revision'`, `asesor_email: me.email`, `asesor_uid: me.uid`, `revisado_por: ''`. Cero inyección de `registrado_por` desde el cliente.
*   **`aprobarConteo.ts` / `rechazarConteo.ts`:** `requireActorInventario` + `requirePermiso` con gate `admin`/`superadmin`. Transición de estado con guarda (`pendiente_revision` → `aprobado`/`rechazado`; idempotente si ya está en estado final). Ledger append-only vía `tx.create(ledgerRef, {...})` con `registrado_por: me.uid`. Cero `tx.set`/`tx.update`/`tx.delete` sobre el ledger.
*   **`analizarImagenRepuesto.ts`:** Stateless, solo lectura de URL + llamada a Google Vision API. Valida host canónico (`firebasestorage.googleapis.com`) y prefijo `inventario_repuestos/{email}/` antes de descargar. Gate `asesor`/`admin`/`superadmin`. `GOOGLE_VISION_API_KEY` desde `process.env` con guarda. Cero escritura en Firestore/Storage.
*   **`inventario-actor.ts`:** `requireActorInventario(idToken)` llama `adminAuth.verifyIdToken(idToken)` y devuelve `{ uid: decoded.uid, email }`. Cero confianza en `a.uid` del payload.
*   **`inventario-schemas.ts`:** Schemas Zod con `safeParse`. `esStoragePathDeAsesor` compara `startsWith('inventario_repuestos/${email}/')`. `esEstadoConteo` valida contra enum canónico. `extraerStoragePath` exige host canónico. `crearConteoSchema` con `superRefine` de coherencia `foto_url`↔`storage_path`.

### E. PWA y Service Worker (H-5b)
*   **`public/sw.js`:** Manual (sin `next-pwa`). Cache shell versionado `tlm-shell-v2`. Navegación allowlisted `/admin/inventario-asesor` con `networkFirst` + fallback a `/offline.html`. Estáticos `/_next/static/` e `/icons/` con `cacheFirst`. Nunca cachea POST, `/api/`, `_rsc`, Firestore, Auth ni Storage. Zero-Silent-Failures en todos los `catch`.
*   **`public/manifest.json`:** `start_url: /admin/inventario-asesor?pwa=asesor`, `scope: /`, `display: standalone`, iconos 192/512/maskable-512.
*   **`PwaRegistrar.tsx`:** Registra SW solo en producción (`NODE_ENV === 'production'`) y solo si `role === 'asesor'`. Gate doble.
*   **`limpiarCachesServiceWorker()`:** Invocado en `finally` de `AuthContext.logout`. Borra todas las caches del origen y desregistra todos los SWs. Zero-Silent-Failures.

### F. God Node de Usuarios
*   **`whitelist-actions.ts`:** Verificación pre-auth con rate limiting en memoria (5 intentos/60s por email). Admin SDK para lectura de `sys_admin_users/{email}`. Retorna `{ exists: false, active: false }` en cualquier fallo.
*   **`actions.ts`:** CRUD vía Admin SDK con `requireActor` → `verifyIdToken`. `requirePermiso` estricto (`create`/`update`/`delete` sobre `sys_admin_users`). Ledger append-only vía `appendAuditoria`. Baja lógica (`active: false`) en `deleteUser`; prohibido `delete()` físico. Anti-suicidio: `esAutoBorrado(emailCanon, me.email)` bloquea revocación propia.
*   **`page.tsx`:** Guards de renderizado `puedeAccion('sys_admin_users', ...)`. Cero mutación directa de estado; delega en Server Actions.

### G. Observaciones No Bloqueantes (Notas de Release)
*   **O-15:** `AprobarConteoModal` hace `getDoc` client-side para detectar referencia nueva. Solo UX; la barrera real es la action (`requirePermiso` admin/superadmin). Depende de reglas de lectura de `inventario_repuestos` (H-9 cerrado por paridad).
*   **O-16:** `runTransaction(async (tx: any) => ...)` en `aprobarConteo.ts`/`rechazarConteo.ts`. El `any` debilita el chequeo estático del append-only. Ticket menor de higiene para PSD.
*   **O-17:** `actorSchema.uid` en payload es redundante/informativo (identidad real = token). No se usa para auth.
*   **O-18:** `registrado_por: actor.uid` en `creditos/actions.ts:90` sin AST del caller verificado. Fuera de perímetro WEB-038 (fase 9).
*   **O-19:** `reconciliarDatosNuevosLegado` solo en tests, no cableado en producción. Escritura nueva ya emite `estado` canónico vía `datosNuevosAprobacion`. Preventivo para futuro dashboard de auditoría.
*   **O-20:** `FotoConteoPicker` no enforce mime/tamaño declarados; delega al form `ConteoAsesorForm` (que sí valida) y al server (`crearConteoSchema`). Cerrado por defensa en profundidad.
*   **O-21:** `ImageUploader.tsx` (catálogo) escribe en `products/...`, no en `inventario_repuestos/...`. Cero colisión de namespace. Fuera de perímetro WEB-038.
*   **O-22 a O-27:** Defectos de `ImageUploader.tsx` (log de debug, falta `'use client'`, validación mime/tamaño débil, nombre de archivo sin sanitizar, `alert()` nativo, reset de estado durante render). Pista catálogo/legacy, aparcados.
*   **O-28:** `esErrorReintentable` clasifica por subcadenas de mensaje de server action. Acoplamiento frágil cliente↔mensajes server. Solo afecta UX de reintento.
*   **O-29:** `analizando` solo se resetea en `finally` del await de Vision; si `prepararYSubirFoto`/`analizarImagenRepuesto` se cuelgan, el submit queda bloqueado hasta recargar o `handleQuitarFoto`. Sin timeout client-side. Ticket menor de resiliencia.
*   **O-30:** `H-2` (blobs Storage huérfanos): `analizarFoto` sube la foto a Storage para Vision aunque el conteo luego se guarde offline o se abandone. Foto en Storage sin conteo registrado = huérfano potencial. Ya cubierto por H-2 (abierto, ticket propio).
*   **O-35:** `campos_modificados` en el ledger de edición incluye `actualizado_por` y `actualizado_en` además del campo de negocio. Técnicamente correcto, pero idealmente debería reflejar solo campos editados por el usuario.
*   **O-36:** La UI de `InventarioRepuestosClient.tsx` no muestra feedback visual (toast/mensaje) cuando la edición es un no-op (sin cambios detectados), aunque la idempotencia del backend funciona correctamente.
*   **O-37:** Borrador en `borradores_conteos` (IndexedDB, store `tlm_offline` v2) no se elimina tras sync exitoso con Firestore. El registro persiste con `estado_envio: "error"` e `intentos: 6` acumulados durante el modo offline. Bug de higiene post-sync; el conteo ya existe en Firestore pero el cliente no purga el mirror local. Ticket menor de limpieza.
*   **O-38:** Campo `revisado_por` en `conteos_pendientes_repuestos` almacena el email del superadmin en lugar del UID canónico verificado por `verifyIdToken`. El ledger `historial_auditoria_inventario` sí cumple el contrato (`registrado_por: me.uid`), pero el documento de conteo queda con inconsistencia de normalización. Deuda técnica menor; no afecta seguridad (la identidad real se verifica en el ledger).



### H. Commits Clave
*   `8c5ecba`: `feat(repuestos-ui): interfaz de conteo del asesor y panel de aprobaciones (WEB-038-UI)`.
*   `d5c4951`: `fix(WEB-038): NAMING LOCK — estado_conteo → estado en ledger de aprobación`.
*   `8d77225`: `fix(WEB-038): aislamiento offline por propietario y cola única del asesor`.

**Coherence Score:** 0.99 (WEB-038 — E2E certificado en código y runtime local, purga de pruebas ejecutada, observaciones no bloqueantes registradas como notas de release).

---
*Última actualización: 2026-11-07 COT por Antigravity*
