### 🛡️ Documento Maestro: Estado de desarrollo página web (v8.3.1)

**Versión:** v8.3.1 (Interface Lock & Lead Capture Enforcement)
**Estado:** BETA DEPLOYED / TESTING VALIDATION
**Último Hito:** Cierre de regresión crítica WEB-831. Bloqueo de interfaz en `QuoteGenerator.tsx` garantizando persistencia síncrona obligatoria y normalización estricta de 12 dígitos.
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
    * **Captura Blindada (v8.3.1):** Persistencia síncrona obligatoria implementada tanto en el flujo de envío de WhatsApp como en el de generación y descarga de cotizaciones en PDF, unificando la entrada a través de `submitLead`.
    * **Contrato Rígido de PII:** Sanitización forzada del campo `celular` eliminando caracteres no numéricos e inyectando de forma determinista el código de país (`57`).

#### 3. Módulos y Componentes de Sistema
* **QuoteGenerator.tsx (v8.3.1):**
    * Refactorizado bajo el esquema Interface Lock. Cierre de brechas de persistencia locales y extracción del helper síncrono `normalizeCelular`.
* **Admin Inventory Manager (v8.3.0):**
    * **Visual-Lock Validator:** Los formularios de edición de motos exigen obligatoriamente `imagen_url` y `precio`.

#### 4. Guardrails, Seguridad y DevOps
* **Zero-Silent-Failures:** Control forense de excepciones en la Server Action; los fallos de red hacia el proveedor externo no interrumpen la ejecución del cliente pero se registran de forma estructurada en la consola del administrador.

#### 5. Depuración de Residuos e Historial
* **Purga de Interfaces:** Cero métodos redundantes o llamadas directas descentralizadas a `addDoc` sobre la colección de prospectos desde calculadoras de UI.
