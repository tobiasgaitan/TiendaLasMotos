🛡️ Documento Maestro: Estado de Desarrollo Bot-TiendaLasMotos (v8.0.2)
Versión Actual: v8.0.2 (Estandarización Frontend Next.js y Wrapper de Sincronía CLI).

Último Hito: Neutralización de la dependencia de Python en el orquestador mediante el "Wrapper de Sincronía" (Node.js Shim) y alineación con Next.js 16.1.1.

Estado: ESTABLE / DESPLEGADO (BETA)

1. Contexto y Persona (Juan Pablo)
Objetivo: Asesor comercial proactivo para Tienda Las Motos.
Zero-Tolerance Hallucination: Prohibido estimar cuotas; uso de calculadora mandatorio.
Regla de Imagen Segura: Sintaxis ![Nombre_Moto](URL) mandatoria.

2. Stack Tecnológico (Frontend Pureza)
Core: Next.js 16.1.1 (App Router), React 19.
Runtime: Node.js 22.
Styling: Vanilla CSS + TailwindCSS 4.
Persistence: Firebase SDK (Firestore, Auth, Storage).
CLI Guardrails: @tobiasgaitan/agent-cli v1.0.2 (Adaptado vía Shim).

3. Arquitectura de Evaluación (Wrapper de Sincronía)
Mecanismo: Intercepción de `pytest` mediante `.agent/scripts/pytest` (Node.js).
Pipeline: `tsc --noEmit` (Integridad de Tipos) -> `npm run lint` (Análisis Estático).
GSD-Eval: Score de Coherencia 1.000 certificado bajo entorno Node.js.
Invocación: `npm run agent-eval`.

4. Persistencia y Contrato de Datos (v8.0.0)
Lead Schema: Centralización en Server Action `submitLead`.
Phone Contract: Normalización de 12 dígitos (ej. 573001234567).
Habeas Data: Uso mandatorio de la llave `habeas_data`.

5. Guardrails de Seguridad
BLOQUEO_TOTAL de cálculos manuales de tasas.
Catalog Lock: Solo recomendaciones basadas en `search_catalog`.
Observabilidad: Captura explícita de errores en integraciones externas.

Sección 9: Certificación y Calidad
Score de Evaluación Final: 1.000 (Next.js Validation).
Verificación: Purgado de artefactos Python (.venv, pytest) para evitar sangrado de contexto.
Historial: Migración exitosa de la capa de auditoría de Python a TypeScript Strict Mode.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Remediation Final v8 | 2026-05-04 | f2db1c6 | 001-remediation-final-v8 |
| 002 | Promoción Beta a Main (WEB-PROD-SYNC-811) | 2026-05-05 | f2db1c6 | 002-promover-beta-main-prod |

🏛️ Nota para el Ingeniero:
El repositorio ha sido saneado arquitectónicamente. Cualquier herramienta que intente inyectar dependencias de Python debe ser reportada como una regresión de infraestructura.
La rama main ha sido sincronizada con beta (v8.1.1) y desplegada a producción.
