### 🛡️ Documento Maestro: Estado de desarrollo página web (v8.3.3)

**Versión:** v8.3.3 (Data Contract Path Migration - WEB-835)
**Estado:** READY_TO_EXECUTE / DEPLOYED_v8.3.2
**Último Hito:** Plan de migración (01-migrate-config-references-PLAN.md) registrado y aprobado por el motor GSD, listo para su ejecución.
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

---
*Última actualización: 2026-05-17 por Antigravity*
