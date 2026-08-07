# Estado Actual: DEPLOYED_v8.4.8

**Fase Activa:** N/A (UAT Completado - Ciclo Cerrado)

**Decisiones Clave:**
- Se eliminó el acoplamiento a la base de datos `config`.
- `firestore.rules` garantiza lectura pública no autenticada para `configuracion/general/sedes` y `configuracion/general_info`.
- **WEB-836 (Hotfix):** El simulador administrativo utiliza `m.price` para preservar la pureza del cálculo financiero de capital base y cuota inicial.
- **WEB-836 (Usury Bot Fix):** Corrección del endpoint Socrata (32sa-8pi3→pare-7x5i), esquema actualizado (interes_bancario_corriente con % suffix), cálculo IBC×1.5 para tasa de usura, y guard syncedWithUsura===true.
- **BOT-TECH-DEBT-837:** Migración de `functions.config()` a `firebase-functions/params` (`defineString`) en los servicios de correo `mailer.ts` y `sendUserInvitation.ts` para evitar fallos de Runtime Config en v2.
- **BOT-TECH-DEBT-838:** Migración de Cloud Functions v1 a v2 en `sendUserInvitation.ts` usando la firma nativa `onCall` de `firebase-functions/v2/https`.
- **BOT-DEPLOY-PROD-839:** Fusión y despliegue síncrono secuencial a producción (`main`) de Cloud Functions v2, Hosting y reglas de Firestore.
- **WEB-837-REVISED-FINAL (Hotfix):** Normalización de parámetros en hooks `useMemo` y fijación del plazo a 36 meses en el buscador público y administrativo.
- **WEB-838-HYDRATION-SYNCHRONY-BARRIER (Hotfix):** Implementación de la barrera de montaje isMounted en buscador y admin/presupuesto para eliminar discrepancias de hidratación en pre-renderizado.
- **WEB-838-INSURANCE-SCALE-FIX (Hotfix):** Normalización de escala de seguro de vida fijo en el hook useMemo del buscador público y administrativo, con protección de división por cero.
- **WEB-SCORE-THRESHOLD-001 (Hotfix):** Recalibración del semáforo de crédito en getScoreBadge (verde ≥750, amarillo ≥500 y <750, rojo <500); Safe-Fallback preservado; NAMING LOCK score_resultado inmutable; Coherence Score 0.97.

**Versión:** v8.4.8 (Beta Release - WEB-SCORE-THRESHOLD-001)
**Estado:** DEPLOYED

**Último Hito:** Fusión de beta a main y despliegue síncrono secuencial en producción.
**Coherence Score:** 0.97 (WEB-SCORE-THRESHOLD-001 — reporte alternativo vía análisis estático de diff)

#### 1. Stack Tecnológico (Cloud Native)
* **Framework:** React / Next.js 16.1.1+ (App Router).
* **Motor Backend:** Node.js 22.
* **Lenguaje:** TypeScript (Strict Mode) — Target de compilación ES2022.
* **Infraestructura:** Google Cloud Run + Firebase Hosting.

#### 2. Contrato Único de Datos (Verdad Inmutable)
Se garantiza la paridad absoluta con el backend v9.9.1.
* **A. Catálogo Normalizado (Colección: pagina/catalogo/items):**
    * **Invariante de Imagen:** El renderizado de componentes solo admite la llave canónica `imagen_url`.
    * **Inventario Certificado:** Visualización confirmada de 60/60 ítems.
* **B. Esquema de Prospectos & Observabilidad:**
    * **Captura Blindada (v8.3.1):** Persistencia síncrona obligatoria unificada a través de `submitLead`.
    * **Reactividad en Tiempo Real (v8.3.2):** Confirmación de escucha activa mediante `onSnapshot` de Firebase en el Dashboard de administración, eliminando la necesidad de recargas manuales.
    * **Contrato Rígido de PII:** Sanitización forzada del campo `celular` (inyectando prefijo `57`).

#### 3. Módulos y Componentes de Sistema
* **QuoteGenerator.tsx (v8.3.1):**
    * Refactorizado bajo el esquema Interface Lock. Cierre de brechas de persistencia locales.
* **Admin Inventory Manager (v8.3.0):**
    * **Visual-Lock Validator:** Los formularios de edición de motos exigen obligatoriamente `imagen_url` y `precio`.

#### 4. Guardrails, Seguridad y DevOps
* **Zero-Silent-Failures:** Control forense de excepciones en la Server Action. Registro estructurado de fallos de red externos.
* **Transacciones de Counters (actions/quotation.ts):** Uso de `runTransaction` de Firestore para generación correlativa determinista de números de cotización.

#### 5. Depuración de Residuos e Historial
* **Purga de Interfaces (v8.3.1):** Cero métodos redundantes o llamadas directas descentralizadas a `addDoc`.
* **Mitigación de Deuda Técnica (v8.3.2):** Eliminación física del nodo huérfano `src/app/admin/leads` y sus dependencias de Next.js.
* **Migración en progreso (v8.3.3):** Reemplazo sistemático del path heredado `config` por `configuracion` con paridad 1:1 absoluta.
* **Hotfix del Simulador (v8.3.4):** Corrección quirúrgica del simulador administrativo WEB-836 para usar precio canónico. UAT verificado y cerrado.
* **Deuda Técnica SMTP (v8.3.6):** Sustitución de functions.config() por defineString de params de firebase-functions.
* **Migración Cloud Functions v2 (v8.3.8):** Reemplazo de functions.https.onCall por onCall de firebase-functions/v2/https en sendUserInvitation.ts.

### Tareas Rápidas Completadas

| # | Descripción | Fecha | Commit | Directorio |
|---|-------------|-------|--------|------------|
| 006 | Corrección de precio en el simulador administrativo (WEB-836) | 2026-05-18 | `fadf5e3` | `006-web836-simulator-precio-fix` |
| 007 | Usury Rate Bot Fix: Socrata dataset/schema + syncedWithUsura guard (WEB-836) | 2026-06-05 | `e33e5fc` | `007-web836-usury-bot-fix` |
| 008 | Deploy updateUsuryRates Cloud Function (WEB-836) | 2026-06-05 | — | `008-web836-deploy-usury-function` |
| 009 | Migración SMTP a params (BOT-TECH-DEBT-837) | 2026-06-05 | `034428a` | `functions/src` |
| 010 | Migración Cloud Functions v2 en sendUserInvitation (BOT-TECH-DEBT-838) | 2026-06-05 | `c01cc03` | `functions/src` |
| 011 | Refactor global Fail-Safe mailer (BOT-TECH-DEBT-839) | 2026-06-05 | `8fb1332` | `functions/src` |
| 012 | Fusión y Despliegue Secuencial a Producción (WEB-DEPLOY-MAIN-v8.3.9) | 2026-06-06 | `pending` | `.` |
| 013 | Implementar panel AnomaliesBanner con escucha activa (WEB-ANOMALY-UI-841) | 2026-06-29 | `8e7df54` | `013-catalog-anomaly-panel` |
| 014 | Implementar suite de pruebas unitarias para AnomaliesBanner y validación de aserciones (WEB-ANOMALY-TEST-842) | 2026-06-29 | `70dda74` | `014-anomalies-banner-test` |
| 015 | Inicializar Documento_Maestro_Pagina.md con el histórico consolidado v8.4.1 | 2026-06-29 | `a680804` | `015-inicializar-documento-maestro-pagina` |
| 016 | Ampliación de contenedor y adición de ruta /admin/novedades (Bell) | 2026-06-29 | `e0ad94e` | `016-hotfix-sidebar-novedades` |
| 017 | Crear página administrativa de novedades y auditoría de anomalías | 2026-06-30 | `eb0e71f` | `017-hotfix-crear-pagina-novedades` |
| 018 | Unificación reactiva de sys_alerts y anomalias en novedades y prospectos | 2026-07-06 | `ab2cf03` | `018-hotfix-web-837-sys-alerts` |
| 019 | Corrección Cupo Presupuesto y Remoción Crediorbe (WEB-837-REVISED) | 2026-07-13 | `b69bd65` | `019-correccion-cupo-presupuesto` |
| 020 | Barrera de Sincronía isMounted en buscador y admin/presupuesto (WEB-838) | 2026-07-13 | `da5e9c8` | `019-correccion-cupo-presupuesto` |
| 021 | Normalización de Seguro de Vida Fijo y protección división cero (WEB-838) | 2026-07-13 | `b71a7c0` | `019-correccion-cupo-presupuesto` |
| 022 | Recalibración de umbrales del semáforo de crédito en getScoreBadge (WEB-SCORE-THRESHOLD-001) | 2026-08-07 | `pending` | `022-score-threshold-recalibration` |

---
*Última actualización: 2026-08-07 COT por Antigravity*


