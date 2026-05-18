# Estado Actual: DEPLOYED_v8.3.4
**Fase Activa:** N/A (Ciclo Completado)
**Decisiones Clave:**
- Se eliminó el acoplamiento a la base de datos `config`.
- `firestore.rules` garantiza lectura pública no autenticada para `configuracion/general/sedes` y `configuracion/general_info`.


**Versión:** v8.3.4 (Simulator canonical price fix - WEB-836)
**Estado:** DEPLOYED_v8.3.4
**Último Hito:** Corrección quirúrgica del simulador de crédito administrativo usando el precio canónico y fallback robusto, verificado al 100% con compilación y linteo.
**Coherence Score:** 1.000 (Certificado por GSD Framework)

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
* **Hotfix del Simulador (v8.3.4):** Corrección quirúrgica del simulador administrativo WEB-836 para usar precio canónico.

### Tareas Rápidas Completadas

| # | Descripción | Fecha | Commit | Directorio |
|---|-------------|-------|--------|------------|
| 006 | Corrección de precio en el simulador administrativo (WEB-836) | 2026-05-18 | `fadf5e3` | `006-web836-simulator-precio-fix` |

---
*Última actualización: 2026-05-18 por Antigravity*
