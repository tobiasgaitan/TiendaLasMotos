# Estado del Proyecto Web & Documento Maestro (v8.3.9)

## Hito Principal: WEB-835 — Migración Estructural de Contratos de Datos

### Visión
Migrar de forma segura, limpia y con paridad de datos del 100% todas las referencias del frontend y de administración a la colección heredada `config` hacia la nueva colección canónica `configuracion` en Firestore, garantizando un despliegue atómico en la rama `beta` y eliminando cualquier brecha de inconsistencia.

### Valor Central
Garantizar la continuidad absoluta del negocio en la cotización, visualización de sedes e información de contacto mediante una paridad estructural 1:1, asegurando que ningún cambio altere, renombre o elimine llaves existentes (`phone`, `email`, `quotationCount`, etc.).

### Contexto Técnico
- **Framework:** Next.js 16.1.1+ (App Router).
- **Persistencia:** Firebase Firestore (Web SDK v9/v10).
- **Ruta Legacy:** `config`
- **Ruta Nueva Canónica:** `configuracion`
- **Garantía de Sincronía:** Transacciones con bloqueo en `actions/quotation.ts`.

---

## Hito Ad-hoc: WEB-836 — Simulator Price Fix (Hotfix)

### Descripción
Corregir de forma quirúrgica e integral la violación de lógica financiera y colisión de variables en el simulador administrativo (`SimulatorPage`). Ahora el simulador inyecta el valor base canónico (`m.price`) en lugar del valor comercial con descuento (`m.precio`) durante el ciclo de actualización de `handleMotoChange`, garantizando que el Capital Base y la Cuota Inicial en planes de crédito se calculen correctamente basándose en el precio real libre de bonos temporales.

### Métricas de Calidad
- **Coherence Score:** 1.000 (Certificado por GSD Framework)
- **Tipo de Cierre:** UAT Completo y verificado visualmente en Beta.
- **Rama Remota de Despliegue:** `beta`

---

## Hito Ad-hoc: BOT-TECH-DEBT-839 — Fail-Safe Mailer Refactor

### Descripción
Refactorizar y desacoplar la utilidad `sendErrorEmail` en `functions/src/mailer.ts` de la lógica exclusiva de "Tasa de Usura". Se generalizó el módulo para permitir su reutilización como interceptor global de errores en toda la arquitectura de Cloud Functions, parametrizando los correos destinatarios de alerta de administración mediante la variable `ADMIN_ALERT_EMAILS`.

### Métricas de Calidad
- **Coherence Score:** 1.000 (Certificado por GSD Framework)
- **Tipo de Cierre:** Unit Tests exitosos y validación de soporte multi-correo.
- **Rama Remota de Despliegue:** `beta`

---

## Decisiones Clave

| Decisión | Origen | Razón | Resultado |
|----------|--------|-------|-----------|
| Paridad 1:1 Absoluta | Usuario (Condición Crítica) | Evitar efectos colaterales en la lógica de negocio y APIs | Aprobado |
| Flujo GSD Standard | Usuario | Granularidad de plan atómico formal debido al impacto en God Node | Aprobado |
| Tracking Físico Git | Usuario (PSD) | Auditoría forense obligatoria de estado y roadmap | Aprobado |
| Uso de m.price (WEB-836) | Auditor / Usuario | Corregir perversión del Capital Base y la Cuota Inicial | Aprobado (v8.3.4) |
| Desacoplamiento de Mailer | Usuario (BOT-TECH-DEBT-839) | Modularización de utilidades para Cloud Functions | Aprobado (v8.3.9) |

---
*Última actualización: 2026-06-05 por Antigravity (Protocolo de Sincronía Documental v8.3.9)*
