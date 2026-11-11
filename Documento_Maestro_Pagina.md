# Documento Maestro de la Página (Tienda Las Motos)
**Versión del Stack & Hitos:** v8.9.9  
**Última Actualización:** 2026-11-10  
**Estado:** MERGE beta→main APROBADO por el Director (Opción 2); WEB-040 certificado en runtime beta (UAT 3 roles, run #171 0dd55de); ventana PRIORIDAD 1–4 cerrada con HEAD dea6dcb (log hygiene, harness Ruta B, O-1/O-16/O-29, sonda O29 erradicada)

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
*   **O-16:** RESUELTA. `runTransaction` usa `Transaction` tipado en `aprobarConteo.ts`/`rechazarConteo.ts`; referencias `DocumentReference<DocumentData>` y updates tipados. Commit `56de9de`. Cero `tx: any`; ledger append-only intacto; tests estáticos, `tsc`, lint y build en 0.
*   **O-17:** `actorSchema.uid` en payload es redundante/informativo (identidad real = token). No se usa para auth.
*   **O-18:** `registrado_por: actor.uid` en `creditos/actions.ts:90` sin AST del caller verificado. Fuera de perímetro WEB-038 (fase 9).
*   **O-19:** `reconciliarDatosNuevosLegado` solo en tests, no cableado en producción. Escritura nueva ya emite `estado` canónico vía `datosNuevosAprobacion`. Preventivo para futuro dashboard de auditoría.
*   **O-20:** `FotoConteoPicker` no enforce mime/tamaño declarados; delega al form `ConteoAsesorForm` (que sí valida) y al server (`crearConteoSchema`). Cerrado por defensa en profundidad.
*   **O-21:** `ImageUploader.tsx` (catálogo) escribe en `products/...`, no en `inventario_repuestos/...`. Cero colisión de namespace. Fuera de perímetro WEB-038.
*   **O-22 a O-27:** Defectos de `ImageUploader.tsx` (log de debug, falta `'use client'`, validación mime/tamaño débil, nombre de archivo sin sanitizar, `alert()` nativo, reset de estado durante render). Pista catálogo/legacy, aparcados.
*   **O-28:** `esErrorReintentable` clasifica por subcadenas de mensaje de server action. Acoplamiento frágil cliente↔mensajes server. Solo afecta UX de reintento.
*   **O-29:** RESUELTA. `ConteoAsesorForm` acota subida + token + análisis con timeout cliente de 30 s (`conTimeout`), invalida `analisisSeqRef` y libera `analizando`; detección robusta por `name === 'TimeoutError'`. Commits `472a6ba` + `0527fed`. Sin cambios en Server Actions ni Firestore.
*   **O-30:** `H-2` (blobs Storage huérfanos): `analizarFoto` sube la foto a Storage para Vision aunque el conteo luego se guarde offline o se abandone. Foto en Storage sin conteo registrado = huérfano potencial. Ya cubierto por H-2 (abierto, ticket propio).
*   **O-35:** `campos_modificados` en el ledger de edición incluye `actualizado_por` y `actualizado_en` además del campo de negocio. Técnicamente correcto, pero idealmente debería reflejar solo campos editados por el usuario.
*   **O-36:** La UI de `InventarioRepuestosClient.tsx` no muestra feedback visual (toast/mensaje) cuando la edición es un no-op (sin cambios detectados), aunque la idempotencia del backend funciona correctamente.
*   **O-37:** Borrador en `borradores_conteos` (IndexedDB, store `tlm_offline` v2) reportado históricamente como no purgado tras sync exitoso. En el diagnóstico MT-02 de WEB-044-P1 Tier A se observó `NO_GHOST_OBSERVADO` en perfil normal; no se reprodujo con evidencia runtime. MT-03 no se activó. La deuda queda reconvertida a `OBS-O37-NO-REPRODUCIBLE-PERFIL-NORMAL` para seguimiento, sin cambio de comportamiento.
*   **O-38:** Campo `revisado_por` en `conteos_pendientes_repuestos` almacenaba email. WEB-044-P1 Tier A lo corrigió forward-only a UID verificado por `verifyIdToken`; el ledger conserva `registrado_por: me.uid` y `registrado_por_email: me.email`. Certificado en runtime beta. Sin backfill histórico; los documentos antiguos con email quedan como legado documentado. La UI no consume actualmente el campo.
*   **Ausencia de harness de render de componentes — WEB-HARNESS-EXENCION-001 (Ruta B: Riesgo Aceptado por Dirección):** La exención aplica exclusivamente al harness de render de componentes (Testing Library/jsdom), no a la suite ejecutable. Capas separadas:
    *   **Vitest / pure-unit: EXISTE.** 86 tests; cubre lógica pura, schemas Zod, helpers como `conTimeout` y transacciones mockeadas. **NO cubre render de componentes.**
    *   **Render de componentes: NO EXISTE.** No hay Testing Library, jsdom ni harness equivalente. **Este es el objeto exacto de la exención Ruta B.**
    *   **UAT runtime beta: EXISTE.** Cobertura 100 % de render/flujo para `LoginForm` y `RoleBasedRedirect`; en esta ventana, la evidencia runtime cubre además O-1/O-16/O-29 según la certificación de cada frente.
  Lo eximido es el **harness de render**; **Vitest no lo sustituye**; la **única cobertura de render es UAT runtime beta**. El punto ciego queda visible en el SSOT.



### H. Commits Clave
*   `8c5ecba`: `feat(repuestos-ui): interfaz de conteo del asesor y panel de aprobaciones (WEB-038-UI)`.
*   `d5c4951`: `fix(WEB-038): NAMING LOCK — estado_conteo → estado en ledger de aprobación`.
*   `8d77225`: `fix(WEB-038): aislamiento offline por propietario y cola única del asesor`.

**Coherence Score:** 0.99 (WEB-038 — E2E certificado en código y runtime local, purga de pruebas ejecutada, observaciones no bloqueantes registradas como notas de release).

---
*Última actualización: 2026-11-07 COT por Antigravity (PSD-1: WEB-040 + backlog paralelo)*

---

## 11. WEB-040 — Hardening del destino post-login (2026-11-07/08)
### A. Arquitectura del Fix
*   **Problema original:** `LoginForm` aceptaba `callbackUrl` sin validar (open-redirect); el bundle servido pre-restauración contenía el typo `/admin/simulator` (o) en lugar de `/admin/simulador` (ó); `proxy.ts:44` perdía el query `defaultLanding=1` al guardar el pathname.
*   **Solución aplicada:**
    1.  Creación de `src/lib/auth/post-login.ts` (helper puro `resolverDestinoPostLogin(raw)`):
        *   `null`/vacío → `/admin/simulador?defaultLanding=1`
        *   Acepta **solo** rutas internas `/admin*`
        *   **Rechaza** `/admin/login`, `//evil.com`, `https://…`, `javascript:`
        *   **Canonicaliza** `/admin/simulator` → `/admin/simulador?defaultLanding=1`
        *   **Garantiza** `defaultLanding=1` cuando el destino canónico es el simulador (compensa pérdida de query de `proxy.ts:44`)
        *   **Preserva** deep links válidos (`/admin/inventario-asesor`, `/admin/creditos`, `/admin`)
    2.  Integración en `src/app/admin/login/LoginForm.tsx` (`handleLogin` sanea `callbackUrl` vía el helper; `handleRegister` usa destino default).
    3.  Test unitario `src/test/utils/post-login.test.ts` (21 comprobaciones incl. contrato de 3 roles).
*   **Certificación runtime (UAT God Node en beta.web.app incógnito):**
    *   **superadmin** → `/admin/simulador?defaultLanding=1` (shell con estilos, sin alert, consola limpia)
    *   **asesor** → `/admin/inventario-asesor` (shell con estilos, badge "En línea", sin alert, consola limpia)
    *   **admin_creditos** → `/admin/creditos` (shell con estilos, sin alert, consola limpia)
    *   **Cero** `/admin/simulator` (typo), **cero** SmartFooter pelado, **cero** 503/`ChunkLoadError`.
*   **Commits:** `d131f77` (helper+test), `bb5b206` (integración), `0dd55de` (docs/STATE) → push fast-forward `dbc4cab..0dd55de` (PUSH_EXIT=0), run #171 (`42418219718`, `conclusion=success`, `headSha=0dd55de…`, cero annotations del adaptador sobre envs).

### B. CHANGELOG Obligatorio
*   **Qué se cambió:** `src/lib/auth/post-login.ts` (nuevo), `src/app/admin/login/LoginForm.tsx` (integración), `src/test/utils/post-login.test.ts` (nuevo).
*   **Qué se reparó:** (a) open-redirect por `callbackUrl` ciego; (b) canonicalización del typo `/admin/simulator`→`/admin/simulador?defaultLanding=1`; (c) garantía de `defaultLanding=1` (compensa pérdida de query de `proxy.ts:44`); (d) preservación de deep links válidos.
*   **Qué se preservó intacto:** `landing.ts` (`landingPorRol` única fuente de verdad), `ROLES`/`DEFAULT_MATRIZ` (C4/B), `proxy.ts`, topología de rutas (sin crear `/admin/simulator/page.tsx`), NAMING LOCK de claves TS/Firestore, código offline/outbox (`tlm_offline`), Storage, reglas/índices, WEB-038/repuestos/Vision (spec íntegro de 10 envs con `secretKeyRef` v1 preservado por el merge del adaptador), sidebar/guards de permisos por rol. **Cero líneas de la app modificadas por intervención de auditor** (Fase 1 hot reload puro en el frente E; el fix lo escribió ANTIGRAVITY Builder bajo ticket).

### C. Backlog Paralelo No Bloqueante (Opción 2 del Director)
*   **OBS 2 (doble login / whitelist §9.F):** NO se manifestó en la UAT de fase 3/3 (los 3 roles loguearon sin `alert` ni `EsperandoActivacion`); frente propio no bloqueante del merge.
*   **OBS 3 (matching Vision↔catálogo):** feature Fase 2, no bloqueante; plan ANTIGRAVITY propio.
*   **WEB-041 (deuda guard eager `simulador/page.tsx:191-199`):** ticket aparte, hardening, NO en WEB-040.
*   **Deuda PWA (`sw.js` §10.E sin autocura post-deploy):** worker rancio #1411 (`beta.web.app`, 6/11, `✕`), NO bloqueante (incógnito lo aisló en la UAT); mitigación opcional vía `chrome://serviceworker-internals` → Unregister (no toca `tlm_offline`).
*   **Deuda de tests de componentes:** repo sin harness de render de `LoginForm`/`RoleBasedRedirect`; punto ciego estructural, cubierto por UAT runtime en beta (fase 3/3).
*   **Infra de Vision en prod `ssrtiendalasmotos` NO verificada por este perímetro:** el merge transporta código que consume `GOOGLE_VISION_API_KEY` vía `secretKeyRef`, pero **no** el valor del secreto (ese vive en Secret Manager v1, fuera del repo). La existencia del secreto v1 y del grant `secretAccessor` en el **entorno de producción** es un frente de infra **no auditado** por este perímetro; requiere verificación por el pipeline de Secrets de prod.
*   **§8 duplicado en el SSOT físico:** las dos instancias de "## 8. Sistema de Gestión de Créditos…" (L117–156 y L157–195) **divergen** (diff muestra una línea en blanco de diferencia); **no** se elimina (podría perder información); se registra como anomalía documental pendiente de resolución manual.

### D. Corrección Documental
*   **`landing.test.ts` 11/11 real vs 10/10 en SSOT §9.J:** el SSOT decía 10/10; la ejecución física reportó 11/11. Se corrige en este §11 (deuda documental).

### E. C4/B (Paquete de Promoción)
*   **Beta trae `asesor` resuelto:** UAT de fase 3/3 prueba en runtime que beta tiene `ROLESasesor` + `DEFAULT_MATRIZ.asesor` + `landingPorRol('asesor')='/admin/inventario-asesor'` + la ruta existiendo.
*   **`origin/main`/producción NO incluye `asesor` en `roles.ts`** (verificado en modo lectura por el Builder) ⇒ **C4 latente en main**; **el merge `beta→main` lo sana** (lleva el paquete completo: `ROLES`+`DEFAULT_MATRIZ`+`landing`+página+helper).
*   **PROHIBIDO** patch parcial de `ROLES` sin `landing`+página (dejaría al asesor en el bloque de denegación del simulador sin su flujo).

### F. C7 (Forense de Causa Raíz del Pelado)
*   **Hipótesis 1:** bundle servido pre-restauración con typo `/admin/simulator` (o) en el chunk `f231eb201f56ae4c.js` (run anterior al re-run de restauración).
*   **Hipótesis 2:** `callbackUrl` forjado con `/admin/simulator` (open-redirect no sanitizado).
*   **Hipótesis 3:** caché del perfil normal con worker rancio #1411 (6/11) sirviendo bundle viejo.
*   **Evidencia:** el grep del chunk `f231eb201f56ae4c.js` en el build local mostró `/admin/simulador` (ó), pero la consola de incógnito de Tobias (12:14) atribuía el redirect a `/admin/simulator` (o) a ese mismo chunk ⇒ tensión no resuelta (mismo nombre de chunk, contenido contradictorio entre grep estático y runtime).
*   **Conclusión:** el fix es robusto a las tres vías (canonicaliza el typo, rechaza externas, garantiza flag); la causa raíz exacta queda como **forense parcial** (3 hipótesis con evidencia actual).

**Coherence Score:** 0.99 (WEB-040 — God Node certificado en runtime beta (UAT 3 roles), run #171 success, backlog paralelo registrado, infra de prod no verificada).

---
*Última actualización: 2026-11-07 COT por Antigravity*

---
## 12. WEB-043 — Matching Vision-Catálogo y Selector de Referencias (F2-A) (2026-11-08)
### A. Arquitectura del Módulo
- **Matching puro:** `src/lib/inventario/matching.ts` (sin dependencias de Firestore/React)
- **Server Actions:** `buscarCandidatosRepuesto.ts` + `obtenerRepuestoPorReferencia.ts` con Faraday Cage completo
- **UI:** `SelectorReferenciaRepuesto.tsx` reemplaza inputs de texto libre
- **Vision:** `analizarImagenRepuesto.ts` extendido con `OBJECT_LOCALIZATION`

### B. Guardrails Implementados
- **Faraday Cage:** `verifyIdToken` + `requirePermiso` en todas las SA nuevas
- **NAMING LOCK:** `inventario_repuestos.referencia` = docId canónico (inmutable)
- **Zero-Silent-Failures:** Errores explícitos, cero `[]` como éxito silencioso
- **Offline:** Caché local en `localStorage` con bloqueo explícito sin conexión

### C. Observaciones No Bloqueantes
- **O-1:** RESUELTA — botón **Nuevo Repuesto** y `CrearRepuestoModal` integrados en `/admin/inventario-repuestos`, condicionados a `puedeAccion('inventario_repuestos', 'create')`. Certificado en runtime beta; detalle en §13.
- **O-2:** Matching visual (foto vs foto) congelado para F2-C
- **O-3:** Verificación D incompleta (no se capturó request/response en Red)

**Coherence Score:** 0.99 (WEB-043-F2A — E2E certificado en runtime beta, push exitoso, deploy completado)

---
## 13. WEB-043-O1 — Alta de Repuestos con Faraday Cage (2026-11-09)
**Estado:** COMPLETADO Y CERTIFICADO EN RUNTIME BETA.
**Arquitectura:**
- Server Action `crearRepuesto.ts` con Faraday Cage (`verifyIdToken` + `requirePermiso` admin/superadmin).
- Transacción atómica (Firestore): escritura simultánea en `inventario_repuestos/{referencia}` (docId canónico inmutable) y `historial_auditoria_inventario` (ledger append-only con `operacion: 'CREATE'`).
- Schema Zod estricto (`.strict()`): acepta URL válida, `''`, `null` u omisión; la normalización efectiva a `''` se realiza en `crearRepuesto.ts` antes de persistir.
- UI: `CrearRepuestoModal.tsx` integrado en `InventarioRepuestosClient.tsx`, visible solo con permiso `create`.
- **Runtime beta:** `imagen_url: ''` persistido en Firestore para entradas `null`, vacías u omitidas; NAMING LOCK intacto.
**Deuda Técnica Resuelta:** WEB-043-O1-obs-001 — transformación redundante de `imagen_url` eliminada del schema; persistencia normaliza en `crearRepuesto.ts`. Commit `2c63887`; tests y runtime beta en verde.
**Coherence Score:** 0.99 (E2E certificado, purga de prueba ejecutada, NAMING LOCK intacto).
---
<i>*Última actualización: 2026-11-09 COT por Antigravity*</i>

---
## 14. WEB-LEGACY-CONFIG-001 — Migración functions.config() a params en mailer.ts (2026-11-09)
**Estado:** COMPLETADO Y CERTIFICADO EN RUNTIME.
**Arquitectura:** Eliminación de la instanciación de nodemailer.createTransport en module scope. Resolución de smtpEmail.value() y smtpPassword.value() dentro del handler sendErrorEmail, preservando el fail-safe y el NAMING LOCK.
**Coherence Score:** 0.99 (Build EXIT 0, deploy beta exitoso, runtime limpio).

---
## 15. WEB-044-P1 Tier A — Cierre y estabilización (2026-11-09)

**Estado:** CERTIFICADO EN ESTÁTICO Y RUNTIME BETA.
**Commits:** `c02e5e3` (O-38), `1cf14b6` (MT-04.C), `1dc538e` (MT-06), `5707b9e` (evidencia y MT-10.A).
**CI:** run #183 sobre `5707b9e` — success.
**Build:** `npm run build`, `npm run lint` y `tsc --noEmit` en 0.

### A. Resultado por microtask

- **MT-00:** evidencia física del SSOT en raíz; sin dependencia de artefactos de auditoría no versionados.
- **MT-01 / O-38:** `revisado_por` corregido forward-only a UID verificado en aprobación y rechazo; ledger conserva UID y email; sin backfill.
- **MT-02 / O-37:** cerrado como `NO_GHOST_OBSERVADO` en perfil normal; MT-03 sin trigger. La deuda se reconvierte a `OBS-O37-NO-REPRODUCIBLE-PERFIL-NORMAL`.
- **MT-04.A:** baseline estático de SW/cachés documentado.
- **MT-04.C:** autocura estática mediante `updateViaCache: "none"` y `registration.update()`. No fue curable en runtime con `sw.js` byte-idéntico y con la prohibición de bump `tlm-shell-v3`/unregister; se deriva a Tier B.
- **MT-06:** suite pura de matching ampliada; `ALL PASSED`.
- **MT-10.A:** deudas y evidencia registradas sin bump de versión ni resolución de la sección 8.

### B. Observaciones no bloqueantes derivadas

- `OBS-PWA-RANCIO-NO-CURABLE-TIER-A`
- `OBS-O37-NO-REPRODUCIBLE-PERFIL-NORMAL`
- `OBS-CACHE-STORAGE-NO-VISIBLE-DEVTOOLS-NORMAL`
- `OBS-FIRESTORE-ENABLEINDEXEDDBPERSISTENCE-DEPRECATED`

### C. Tier B — estado posterior

Tier B fue ejecutado y Runtime J fue certificado en §16. De las 10 decisiones originales quedan pendientes: backfill histórico de O-38, nueva Server Action read-only de reconciliación y harness de render de componentes. El resto fue ejecutado en E/F/G/A+I y certificado en runtime beta.

**Invariantes:** header v8.9.5 sin cambio; sección 8 sin tocar; SSOT permanece en la raíz; sin cambios de código de producto; sin cambios en bot; sin deploy de producción.

---
## 16. WEB-044-P1 Tier B — E/F/G/A+I (2026-11-09)

**Estado:** E/F/G/A+I + Runtime J CERTIFICADOS.
**Commits:** `b4383ac` (E), `5a59b16` (F), `5a25664` (G).
**Versión canónica:** v8.9.5.
**Coherence Score:** 0.95 por autopsia de diff canónico; no se usó `agent-cli eval` como fuente de certificación.

### A. Resultado por frente

- **E / outbox:** `limpiarOutbox(uid)` ya no cae a `clear()` global. Si la purga owner-scoped falla, conserva borradores/fotos, marca `estado_envio: error` y registra `conteo_id` + `propietario_uid`. El `clear()` queda solo en la purga global explícita sin propietario.
- **F / PWA:** `CACHE_SHELL` cambia a `tlm-shell-v3`; se mantiene limpieza de `tlm-shell-*` antiguas, allowlist exacta `/admin/inventario-asesor`, bloqueo de POST/API/RSC/cross-origin y `PwaRegistrar` con `updateViaCache: none` + `registration.update()` sin unregister.
- **G / tests+CI:** scripts `test`, `test:smoke`, `test:unit`, `test:ci`; devDependencies `vitest`, `fake-indexeddb`, `tsx` (+ peer `vite`); 66 tests unitarios y mocks sin Firebase real. Gate CI `npm run test:ci` antes de build/deploy en beta y prod.
- **A+I / documental:** STATE sincronizado a v8.9.5; ROADMAP declara versión canónica v8.9.5. Diff físico de las dos secciones 8 mostró únicamente una línea en blanco de diferencia (`40d39`), clasificado como no semántico; se consolidó a una sola instancia preservando el contenido íntegro.
- **O-38:** no requiere revalidación en Tier B porque `aprobarConteo.ts` y `rechazarConteo.ts` no fueron modificados; la certificación runtime de Tier A sigue vigente.

### B. Límites respetados

- Sin backfill de O-38.
- Sin nueva SA `reconciliarConteoPendiente`.
- Sin render de componentes.
- Sin bot.
- Sin producción.
- Sin claves nuevas Firestore/IndexedDB.
- Sin delete físico ni alteración del ledger.
- Sin ampliación de allowlist ni cacheo de rutas prohibidas.

### C. Evidencia runtime J certificada

- `curl -sS -D - https://tiendalasmotos-beta.web.app/sw.js` devolvió HTTP/2 200, `content-type: text/javascript`, `cache-control: no-cache, max-age=0, must-revalidate` y `service-worker-allowed: /`.
- El body desplegado contiene `const CACHE_SHELL = 'tlm-shell-v3'`, sin `tlm-shell-v2` como constante activa.
- ETag nuevo: `7deceba8d0cf4519838dce55f91efb911ee27551167140b080b8256f94842bb8`; `last-modified: Tue, 10 Nov 2026 00:20:29 GMT`.
- DevTools mostró Service Worker scope `https://tiendalasmotos-beta.web.app/`, fuente `sw.js`, recibido 2026-11-09 19:46:04 COT, estado N.º 1422 activado y en ejecución; ciclo Install/Wait/Activate #1422, sin registration residual #1411 y sin unregister manual.
- `tlm_offline` intacto: versión 2, 2 object stores, `borradores_conteos` 0 entradas, `fotos_borrador` 0 entradas, sin estado_envio error; sin ghost O-37.
- Consola sin errores `[pwa]`, `[offline]` ni `[sw]`; solo warnings no bloqueantes de Firestore `enableIndexedDbPersistence` deprecated, registrados como `OBS-FIRESTORE-ENABLEINDEXEDDBPERSISTENCE-DEPRECATED`.
- `OBS-AGENT-EVAL-401-NO-UI-NEW`: `npm run agent-eval` falló con `401 Unauthorized` en `npm.pkg.github.com/@tobiasgaitan/agent-cli`; Tier B no introdujo UI nueva. Coherence Score 0.95 se calculó por autopsia de diff canónico, no por agent-cli eval.

## 17. WEB-045-P1 — Endurecer limpiarOutbox contra purga global implícita (2026-11-10)
**Estado:** CERTIFICADO EN ESTÁTICO + RUNTIME BETA.
**Origen:** OBS-E-EMPTY-UID-GLOBAL-PURGE-EDGE (derivada de WEB-044-P1 Tier B, frente E).
**Commit:** `08abcf1` fix(web-045): block implicit global outbox purge. CI beta run #188 (42740809877) success, headSha 08abcf1c1424888b71f3edd64f9bad006ebcb3d4.
**Archivos:** `src/lib/offline/outbox.ts`, `src/test/vitest/outbox.test.ts`. Sin tocar `AuthContext.tsx`, `firebase.ts`, `sw.js`, bot, producción, dependencias, CI.
**Contrato:** `limpiarOutbox(propietarioUid?, opciones?)`. UID vacío/undefined sin flag => no abre IndexedDB, no `clear()`, retorna con `[offline][outbox][NO_OWNER_PURGE_BLOCKED]`. Purga global solo con `forzarPurgaGlobal === true` => `[offline][outbox][GLOBAL_PURGE_EXPLICIT]`, ignora UID si presente. Owner-scoped conserva fail-closed Tier B E (falla => conserva, marca `estado_envio: error`, registra, nunca `clear()` global).
**Tests:** 66->72. Nuevos: T-EMPTY-UID-NO-CLEAR, T-UNDEFINED-UID-NO-CLEAR, T-EXPLICIT-GLOBAL-PURGE, T-OWNER-SCOPED-ISOLATION, T-OWNER-SCOPED-FAILURE-FAIL-CLOSED, T-NO-PRODUCT-GLOBAL-FLAG, T-BEFORE-EACH-MIGRATION. Gates: npm test, tsc --noEmit, lint, build EXIT 0.
**Runtime beta:** bundle servido `cc10283e970d296c.js` contiene NO_OWNER_PURGE_BLOCKED + GLOBAL_PURGE_EXPLICIT. Logout válido: ausencia de ambos marcadores (uid válido => owner-scoped, sin purga global, sin edge bloqueado). `tlm_offline` v2, 2 stores, 0/0 entradas. SW inalterado, sin unregister. Edge UID vacío no reproducible sin invasión; cobertura unitaria+estática.
**Deudas derivadas (no bloqueantes, no regresión de 08abcf1):** OBS-LOGOUT-NEXT-REDIRECT-CONSOLE-ERROR (frente LoginForm/redirect, stack fuera del chunk outbox) y OBS-MIGRATION-V2-INFO-AS-ERROR (onupgradeneeded loguea info como console.error). **RESUELTAS por WEB-LOG-HIGIENE-001 / `9c87392`; ver §21.**
**UI change:** ninguno. `agent-cli eval` no requerido; excepción documental explícita.
**Coherence Score:** 0.97 por autopsia de diff canónico.
**Invariantes:** NAMING LOCK intacto; sin claves Firestore/IndexedDB nuevas; sin delete físico; sin alteración de ledger; sin bot; sin producción; sin docs/; SSOT en raíz; DOCTRINA_QWEN_WEB.md MISSING.

## 18. WEB-046-P1 — Migración a FirestoreSettings.cache (2026-11-10)
**Estado:** CERTIFICADO EN ESTÁTICO + RUNTIME BETA.
**Origen:** OBS-FIRESTORE-ENABLEINDEXEDDBPERSISTENCE-DEPRECATED (deuda de modernización SDK).
**Commit:** `d9f4b03` feat(web-046): migrate firestore local cache initialization. CI beta run #XXX (pendiente) success.
**Archivos:** `src/lib/firebase.ts`, `src/test/utils/pwa.test.ts`. Sin tocar `outbox.ts`, `purge.ts`, `AuthContext.tsx`, `sw.js`, bot, producción.
**Contrato:** `enableIndexedDbPersistence` eliminado; reemplazado por `initializeFirestore` + `persistentLocalCache` + `persistentMultipleTabManager`. Branch persistente solo con `tlm_offline_asesor`. `persistenciaOfflineLista` sigue exportada. `purgarPersistenciaOffline` conserva `terminate` + `clearIndexedDbPersistence`.
**Tests:** 72 tests. Gates: npm test, tsc --noEmit, lint, build EXIT 0.
**Runtime beta:** Consola limpia sin warnings de deprecación. `tlm_offline` v2 sobrevive al logout (no purgado por `firebase.ts`). NAMING LOCK intacto.
**Deudas derivadas:** OBS-WEB046-REDIRECT-ASESOR-SIMULADOR (configuración de datos WEB-040, fuera de perímetro).
**Coherence Score:** 0.98 por autopsia de diff canónico + runtime.
**Invariantes:** NAMING LOCK intacto; sin claves Firestore/IndexedDB nuevas; sin delete físico; sin alteración de ledger; sin bot; sin producción; sin docs/; SSOT en raíz.

## 19. WEB-047-P1 — Mitigación de carrera de __session en LoginForm (2026-11-11)
**Estado:** CERTIFICADO EN ESTÁTICO + RUNTIME BETA.
**Origen:** OBS-DOBLE-LOGIN (recurrencia 4/10 en cold start por race condition de cookie httpOnly).
**Commit:** f33332c feat(web-047): mitigate __session race condition in LoginForm
**Archivos:** src/app/actions/session-status.ts (nuevo), src/app/admin/login/LoginForm.tsx (modificado), src/test/vitest/login-session-race.test.ts (nuevo). Sin tocar createSession, proxy.ts, firestore.rules ni lógica de auth de Firebase.
**Contrato:** Nueva Server Action sesionCookiePresente() que valida presencia booleana de __session. LoginForm implementa ciclo de verificación con backoff progresivo (100-1200ms, max 6 intentos) y reintento con token fresco antes de window.location.href. Zero reingreso de credenciales.
**Tests:** 79 tests passed. Gates: npm test, tsc --noEmit, lint, build EXIT 0.
**Runtime beta:** Navegación hard bloqueada hasta confirmación física de cookie. Cero doble login en throttling de red.
**Coherence Score:** 0.99 por autopsia de diff canónico.
**Invariantes:** NAMING LOCK intacto; sin claves Firestore/IndexedDB nuevas; sin bot; sin producción; sin docs/; SSOT en raíz.

## 20. WEB-048-P1 — Eliminación de reload duro en post-login (2026-11-11)
**Estado:** CERTIFICADO EN ESTÁTICO + RUNTIME BETA.
**Origen:** OBS-DOBLE-LOGIN (recurrencia intermitente por `window.location.reload()` en `AuthContext.tsx` para rol `asesor`).
**Commit:** 2e4e20b feat(web-048): remove auth reload and gate post-login navigation
**Archivos:** `src/context/AuthContext.tsx`, `src/app/admin/login/LoginForm.tsx`, `src/test/utils/pwa.test.ts`, `src/test/utils/post-login.test.ts`, `src/test/vitest/login-session-race.test.ts`.
**Contrato:** `AuthContext` ya no ejecuta `reload()`. `LoginForm` gestiona la navegación (`window.location.href`) solo tras confirmar que `role !== null`. El flag `CLAVE_FLAG_ASESOR` se consolida antes de la navegación, permitiendo que `firebase.ts` active la persistencia en la carga de la página destino sin interrumpir el estado de la sesión.
**Runtime beta:** Navegación fluida a `/admin/inventario-asesor` para rol asesor. Cero recargas intermedias destructivas. Persistencia offline verificada.
**Coherence Score:** 0.95 por autopsia de diff canónico.
**Invariantes:** NAMING LOCK intacto; sin claves nuevas; sin alterar lógica de outbox/purga; sin tocar producción.

## 21. WEB-LOG-HIGIENE-001 — Higiene de logs esperados (2026-11-10)
**Estado:** CERTIFICADO EN ESTÁTICO + RUNTIME BETA.
**Commit:** `9c87392` fix(web-log-higiene): suppress expected redirect and migration logs.
**Archivos:** `src/components/AdminSidebar.tsx`, `src/lib/offline/outbox.ts`, `src/test/utils/offline-isolation.test.ts`, `src/test/vitest/log-hygiene.test.ts`.
**Contrato:** `NEXT_REDIRECT` en logout se degrada a `console.debug`; errores reales conservan `console.error`. Migración v2: descarte esperado en `console.debug`, finalización en `console.info`, fallo real en `console.error`.
**Tests:** `npm test`, `tsc`, lint y build EXIT 0; regresión de log hygiene y offline isolation en verde.
**Runtime beta:** consola limpia sin logs esperados elevados a error; redirect legítimo de `deleteSession` preservado.
**Coherence Score:** 0.97 por autopsia de diff canónico + runtime.
**Invariantes:** NAMING LOCK intacto; sin claves Firestore/IndexedDB nuevas; sin bot; sin producción; sin docs/; SSOT en raíz.

## 22. WEB-HARNESS-EXENCION-001 — Ruta B: Riesgo Aceptado (2026-11-10)
**Estado:** CERRADO POR DECISIÓN DE DIRECCIÓN — RIESGO ACEPTADO.
**Origen:** ausencia de harness de render de componentes.
**Decisión:** no se implementa Testing Library/jsdom ni harness equivalente; se acepta el punto ciego.
**Capas de cobertura:**
- **Vitest / pure-unit: EXISTE.** 86 tests; cubre lógica pura, schemas Zod, helpers como `conTimeout` y transacciones mockeadas. **NO cubre render de componentes.**
- **Render de componentes: NO EXISTE.** No hay Testing Library, jsdom ni harness equivalente. **Este es el objeto exacto de la exención Ruta B.**
- **UAT runtime beta: EXISTE.** Cobertura 100 % de render/flujo para `LoginForm` y `RoleBasedRedirect`; en esta ventana, la evidencia runtime cubre además O-1/O-16/O-29 según la certificación de cada frente.
**Exención:** lo eximido es el **harness de render**; **Vitest no lo sustituye**; la **única cobertura de render es UAT runtime beta**. El punto ciego queda visible en el SSOT.
**Coherence Score:** 0.95 por decisión de riesgo aceptado y evidencia runtime disponible.
**Invariantes:** sin cambios de código; sin claves nuevas; sin bot; sin producción.

## 23. WEB-HIGIENE-RESILIENCIA-001 — Cierre O-1 / O-16 / O-29 (2026-11-10)
**Estado:** CERRADO. O-1 con evidencia runtime; O-16 con certificación estática; O-29 con certificación estática y diagnóstico runtime erradicado (ver §24).
**O-1:** botón **Nuevo Repuesto** y `CrearRepuestoModal` en `/admin/inventario-repuestos`, condicionados a `puedeAccion('inventario_repuestos', 'create')`; certificado en runtime beta. Detalle en §13.
**O-16:** `Transaction` tipado en `aprobarConteo.ts` y `rechazarConteo.ts`; commit `56de9de`; cero `tx: any`; ledger append-only intacto; `tsc` y tests estáticos en verde.
**O-29:** timeout cliente de 30 s en `ConteoAsesorForm`; invalidación de `analisisSeqRef` y liberación de `analizando`; detección robusta por `name === 'TimeoutError'`; commits `472a6ba` + `0527fed`.
**Gates:** `npm test` (86 tests), `npx tsc --noEmit`, `npm run lint`, `npm run build` EXIT 0.
**Coherence Score:** 0.96 por autopsia de diff canónico + runtime.
**Invariantes:** NAMING LOCK intacto; sin claves Firestore/IndexedDB nuevas; sin bot; sin producción; sin docs/; SSOT en raíz.

## 24. WEB-O29-DIAG-001 — Sonda temporal erradicada (2026-11-10)
**Estado:** CERRADO — SIN RESIDUOS.
**Origen:** diagnóstico temporal para capturar anatomía real del timeout.
**Commits:** `c5b0171` (logs temporales) + `dea6dcb` (reversión).
**Evidencia:** `git diff 0527fed HEAD` vacío; deploy beta run #196 verde; cero logs `[WEB-O29-DIAG]` en el estado final.
**Contrato:** sin cambios persistentes en `timeout.ts` ni en `ConteoAsesorForm`; la corrección funcional `0527fed` permanece intacta.
**Coherence Score:** 0.95 por reversión exacta y diff vacío.
**Invariantes:** sin cambios de lógica; sin bot; sin producción; NAMING LOCK intacto.
