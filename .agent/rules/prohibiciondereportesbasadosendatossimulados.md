---
trigger: always_on
---

1. Prohibición de Reportes Basados en 'Mocks' (Datos Simulados):

No se aceptarán como 'finalizadas' tareas cuya validación se haya realizado únicamente en entornos locales o con datos simulados (scripts de prueba unitaria).

La única validación válida para el cierre de un ticket es la realizada sobre el entorno Beta (tiendalasmotos-beta.web.app) consultando la base de datos real de Firebase.