# WEB-835: Migración Estructural de Contratos de Datos

## Visión
Migrar de forma segura, limpia y con paridad de datos del 100% todas las referencias del frontend y de administración a la colección heredada `config` hacia la nueva colección canónica `configuracion` en Firestore, garantizando un despliegue atómico en la rama `beta` y eliminando cualquier brecha de inconsistencia.

## Valor Central
Garantizar la continuidad absoluta del negocio en la cotización, visualización de sedes e información de contacto mediante una paridad estructural 1:1, asegurando que ningún cambio altere, renombre o elimine llaves existentes (`phone`, `email`, `quotationCount`, etc.).

## Target Users
- **Clientes del portal público:** Que consultan sedes en el footer, barra superior, y en la vista pública de sedes, además de generar cotizaciones con números correlativos sin interrupciones.
- **Administradores del portal backend:** Que gestionan la información general y sedes desde el Dashboard administrativo.

## Contexto Técnico
- **Framework:** Next.js 16.1.1+ (App Router).
- **Persistencia:** Firebase Firestore (Web SDK v9/v10).
- **Ruta Legacy:** `config`
- **Ruta Nueva Canónica:** `configuracion`
- **Garantía de Sincronía:** Transacciones con bloqueo en `actions/quotation.ts`.

## Requisitos

### Activos
- **R1 - Migración en Acciones Server (actions/quotation.ts):** Cambiar `counters` de `config/counters` a `configuracion/counters`.
- **R2 - Migración en UI Transversal (SmartFooter, TopBar, sedes/page.tsx):** Cambiar `config/general_info` y `config/general/sedes` a `configuracion/general_info` y `configuracion/general/sedes`.
- **R3 - Migración en Dashboard Administrativo (admin/general/page.tsx, admin/sedes/page.tsx, admin/simulador/page.tsx):** Cambiar todas las referencias de lectura, escritura, actualización y eliminación de `config` a `configuracion`.
- **R4 - Validación Cruzada en Beta:** Despliegue en la rama beta (`tiendalasmotos-beta.web.app`) y validación física con datos reales en Firestore.

### Fuera de Alcance
- **Purger de la colección heredada `config`:** No se purgará físicamente la colección `config` en esta fase hasta que el Auditor y Tobias aprueben la migración total y estable en Beta.

## Decisiones Clave

| Decisión | Origen | Razón | Resultado |
|----------|--------|-------|-----------|
| Paridad 1:1 Absoluta | Usuario (Condición Crítica) | Evitar efectos colaterales en la lógica de negocio y APIs | Aprobado |
| Flujo GSD Standard | Usuario | Granularidad de plan atómico formal debido al impacto en God Node | Aprobado |
| Tracking Físico Git | Usuario (PSD) | Auditoría forense obligatoria de estado y roadmap | Aprobado |

---
*Última actualización: 2026-05-17 por Antigravity (Fase GSD New Project)*
