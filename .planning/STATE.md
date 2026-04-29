🛡️ Documento Maestro: Estado de Desarrollo Bot-TiendaLasMotos (v7.8.0)
Versión Actual: v7.8.0 (Estabilización de Pipeline CI/CD y Alineación ADK 2026).

Último Hito: Despliegue exitoso en entorno BETA mediante GitHub Actions tras la resolución de colisiones de parsing en el orquestador y la inyección del manifiesto estructural.

Estado: ESTABLE / DESPLEGADO (BETA)

1. Contexto y Persona (Juan Pablo)
Objetivo: Asesor comercial proactivo.

Zero-Tolerance Hallucination: Prohibido estimar cuotas; uso de calculadora mandatorio.

Regla de Imagen Segura: Sintaxis ![Nombre_Moto](URL) mandatoria.

2. Stack Tecnológico y Dependencias
Python 3.10, Gemini 2.5 Flash, FastAPI, Firestore, Cloud Storage, uv (gestor de paquetes), google-agents-cli v0.1.2.

3. Arquitectura de Infraestructura (GCP)
Cloud Run us-central1, GitHub Actions.

Restauración de Entorno CLI (v7.8.0): Se ha migrado el scope privado a @tobiasgaitan/agent-cli para resolver bloqueos de permisos (403) en GitHub Packages.

Manifiesto de Orquestación (v7.8.0): Implementación obligatoria de pyproject.toml bajo el esquema [tool.agents-cli] para permitir la validación del proyecto por parte del orquestador.

Estándar de Despliegue ADK 2026: Uso de uvx google-agents-cli deploy con banderas nativas (--update-env-vars, --no-confirm-project).

Evasión de Bug de Orquestador: Debido a un defecto en la versión 0.1.2 para procesar EXTRA_ARGS, la política de acceso público (IAM) se delega a un paso nativo de gcloud post-despliegue (add-iam-policy-binding).

4. Persistencia, Memoria y Prompts (Firestore)
Naming Lock Confirmado: Uso exclusivo de la llave habeas_data.

Protección PII: Truncamiento automático a 50 caracteres para nombre y ciudad.

EXTRACTION_SCHEMA Global: Esquema inmutable en ai_brain.py.

5. Base de Conocimiento y Motor Financiero
Inmutabilidad Financiera: Prohibido el hardcodeo de tasas.

Acceso SSOT: Factores obtenidos exclusivamente desde ConfigService.

6. Integración WhatsApp y Orquestación
Zero-Silent-Failures: Capturas explícitas de httpx.HTTPStatusError.

Sincronía de Persistencia: Prohibido el uso de add_task (fire-and-forget) en transiciones de estado críticas; uso de await bloqueante mandatorio antes de responder a la red.

7. Guardrails de Seguridad
BLOQUEO_TOTAL de cálculos manuales.

Catalog Lock: Prohibido recomendar motos fuera de la base de datos oficial.

8. Monitoreo y Debugging
Observabilidad CI/CD: El pipeline de GitHub Actions incluye pasos de depuración estructural (ls -la y pwd) antes del despliegue para verificar la integridad del workspace.

Sección 9: Evaluación y No-Regresión
Score de Evaluación Final: 1.0 (51 pruebas superadas / 0 fallidas).

Certificación: Corregida la regresión en scripts/test_phone_normalization.py y eliminados los SyntaxWarning por secuencias de escape en test_cc_extraction.py.

Sección 10: Deuda Técnica Identificada
Optimización de Mocks: Estandarizar el uso de generadores asíncronos para simular stream() de Firestore en futuras pruebas de orquestación.

🏛️ Nota para el Ingeniero:
PRIORIDAD INMEDIATA: Tras la estabilización del pipeline, la siguiente sesión debe enfocarse exclusivamente en la Sección 10 para cerrar el ciclo de pruebas asíncronas.

El despliegue automático a la rama beta ahora es funcional; cualquier cambio en el código debe ser validado localmente con npx @tobiasgaitan/agent-cli eval antes de hacer push.
