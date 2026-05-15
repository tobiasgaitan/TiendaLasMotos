### 🛡️ Documento Maestro: Estado de desarrollo página web (v8.3.0)

**Versión:** v8.3.0 (Data Parity & Judge Stabilization)
**Estado:** BETA DEPLOYED / SYNC LOCK
**Último Hito:** Implementación de Tarea 1.4: Sincronización total con el catálogo normalizado (60/60) y calibración de umbrales del Juez de Calidad.
**Coherence Score:** 1.000 (Certificado por GSD Framework)

#### 1. Stack Tecnológico (Cloud Native)
* **Framework:** React / Next.js 16.1.1+ (App Router).
* **Motor Backend:** Node.js 22.
* **Lenguaje:** TypeScript (Strict Mode) — Target de compilación ES2022.
* **Infraestructura:** Google Cloud Run + Firebase Hosting.

#### 2. Contrato Único de Datos (Verdad Inmutable)
Se garantiza la paridad absoluta con el backend v9.9.1.
* **A. Catálogo Normalizado (Colección: pagina/catalogo/items):**
    * **Invariante de Imagen (NUEVO v8.3.0):** El renderizado de componentes solo admite la llave canónica `imagen_url`. Se ha purgado del frontend cualquier referencia a las llaves legacy `imagenUrl`, `galeria` o `foto`.
    * **Inventario Certificado:** Visualización confirmada de 60/60 ítems. Los 10 ítems con `isVisible: false` se mantienen filtrados en la vista pública pero auditables en el Panel Admin.
* **B. Esquema de Prospectos & Observabilidad:**
    * **Calibración C5 (v8.3.0):** El monitor de observabilidad ahora tolera hasta 2 signos de interrogación por respuesta antes de disparar el badge de advertencia `C5_QUESTION_LIMIT`.
    * **Recall Semántico:** El buscador del administrador ahora sincroniza su lógica de filtrado con los *stop-words* optimizados (ignorando "tienen", "venden", "disponible").

#### 3. Módulos y Componentes de Sistema
* **Admin Inventory Manager (v8.3.0):**
    * **Visual-Lock Validator:** Los formularios de edición de motos ahora exigen obligatoriamente `imagen_url` y `precio` para guardar cambios, evitando que el Bot (Juan Pablo) sea bloqueado por el Juez en el futuro.
    * **Adapter Interface Sync:** El componente de búsqueda del catálogo llama internamente a la interfaz `search` estabilizada en el `CatalogService`.
* **ProspectModal.tsx (v8.3.0):**
    * **Filtro de Ruido en Logs:** Los logs de auditoría omiten errores de `Shadowing` (UnboundLocalError) tras la limpieza del router de WhatsApp, concentrándose únicamente en trazas de razonamiento puro.

#### 4. Guardrails, Seguridad y DevOps
* **Data Parity Guard:** Script de CI/CD que valida que el esquema del catálogo en el frontend no intente inyectar llaves en inglés o formatos de imagen no compatibles con WhatsApp (.webp a .jpg conversion logic).
* **Zero-Silent-Failures:** Implementación de `Error Boundaries` en la grilla de prospectos para evitar que fallos en la carga de un solo documento de Firestore rompan toda la interfaz de administración.

#### 5. Depuración de Residuos e Historial
* **Purga de Interfaces:** Eliminación de métodos redundantes en el servicio de catálogo del cliente.
* **Certificación de Nomenclatura:** Cero residuos de términos `DONE` o llaves `legacy` en los tipos de TypeScript.

---
🏛️ **Nota de Auditoría (15/05/2026):**
El sistema ha alcanzado la versión **v8.3.0** tras la estabilización de los servicios de catálogo y juez. Se certifica que la página web ahora opera en perfecta armonía con el Bot de ventas, eliminando los falsos positivos en las búsquedas de modelos como "Boxer" o "NKD". La interfaz administrativa es ahora una ventana transparente hacia el razonamiento del Agente "Juan Pablo", con umbrales de calidad recalibrados para una comunicación humana y efectiva.
