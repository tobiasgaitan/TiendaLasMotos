---
phase: 8
plan: 2
name: Reglas Firestore — bloqueo de writes de cliente e inmutabilidad del ledger
wave: 1
depends_on: []
files_modified:
  - firestore.rules
requirements:
  - R-CR2
---

# Plan 8-2: Reglas Firestore — bloqueo de writes de cliente e inmutabilidad del ledger

## Objective

Añadir a `firestore.rules` las reglas de las 6 colecciones del módulo: lectura
autenticada y **bloqueo total de escrituras de cliente** (`allow write: if false`) en
las 5 colecciones operativas y en `historial_auditoria`. Todas las escrituras del módulo
viajan por Server Actions con Admin SDK (`src/lib/firebase-admin.ts`), que ignora las
reglas — por eso bloquear writes de cliente NO rompe el CRUD y SÍ garantiza que el
ledger solo se escriba por la ruta de código confiable. Cumple C2 (gate de constancia
antes del deploy).

## Code Patterns (Model Resilience)

Reference these existing files for code style:

- `firestore.rules` — Sintaxis `rules_version = '2'`, bloques `match` existentes
  (ej. `match /prospectos/{document} { allow create: if true; allow read, update, delete: if request.auth != null; }`).
- `src/lib/firebase-admin.ts` — `getDb()` inicializa Admin SDK vía ADC; el Admin SDK
  **ignora** `firestore.rules` (todas las escrituras del módulo usan esta vía).
- `src/middleware.ts` — Protección de rutas `/admin/*` vía cookie `__session`
  (las reglas exigen `request.auth != null` para lectura).

Conventions:

- **C2 (gate):** antes de `firebase deploy --only firestore:rules`, emitir en el chat
  la constancia escrita de ausencia de writer legítimo client-SDK sobre las 6
  colecciones. Sin constancia, el despliegue queda vetado.
- Zero-Silent-Failures: cualquier error de despliegue se registra con `console.error`
  y payload completo; prohibido fallo silencioso.
- No alterar reglas existentes de otras colecciones (paridad 1:1 del resto del archivo).

## Tasks

<task type="auto">
  <name>Emitir constancia C2 de ausencia de writers client-SDK (gate pre-deploy)</name>
  <files>[]</files>
  <action>
    1. Ejecutar búsqueda exhaustiva de referencias client-SDK a las 6 colecciones en
       `src/**`, `scripts/**`, `functions/src/**` (patrones `collection(db,`,
       `"creditos"`, `"clientes_credito"`, `"pagos_inversores"`, `"pagos_y_multas"`,
       `"remisiones_dinero"`, `"historial_auditoria"`).
    2. Escribir en el chat la constancia literal:
       `CONSTANCIA C2 — No existe writer legítimo vía client-SDK sobre
       clientes_credito, creditos, pagos_inversores, pagos_y_multas,
       remisiones_dinero ni historial_auditoria. Todas las escrituras del módulo
       viajan por Server Actions con Admin SDK (ignora firestore.rules).`
       Si la búsqueda devuelve algún writer, DETENER el plan y reportar el hallazgo
       (el deploy de reglas queda vetado hasta resolverlo).
  </action>
  <verify>La constancia C2 está escrita en el chat y la búsqueda devuelve 0 writers.</verify>
  <done>Gate C2 superado por escrito; autorizado a modificar `firestore.rules`.</done>
</task>

<task type="auto">
  <name>Añadir reglas de las 6 colecciones del módulo a firestore.rules</name>
  <files>[firestore.rules]</files>
  <action>
    Insertar ANTES de la regla por defecto (`match /{document=**}`) y SIN modificar las
    reglas existentes, el siguiente bloque (colecciones en orden alfabético):

    ```firestore
    // 3. Módulo de Gestión de Créditos (Fase 8) — NAMING LOCK
    // Todas las escrituras viajan por Server Actions (Admin SDK, ignora reglas).
    // Se bloquea todo write de cliente; el ledger es append-only vía código confiable.
    match /clientes_credito/{document} { allow read: if request.auth != null; allow write: if false; }
    match /creditos/{document} { allow read: if request.auth != null; allow write: if false; }
    match /historial_auditoria/{document} { allow read: if request.auth != null; allow write: if false; }
    match /pagos_inversores/{document} { allow read: if request.auth != null; allow write: if false; }
    match /pagos_y_multas/{document} { allow read: if request.auth != null; allow write: if false; }
    match /remisiones_dinero/{document} { allow read: if request.auth != null; allow write: if false; }
    ```

    Reglas de edición:
    1. No tocar ningún bloque `match` preexistente.
    2. `sys_admin_users` NO se modifica (fuera de alcance).
    3. Registrar con `console.error` estructurado cualquier fallo de despliegue
       (Zero-Silent-Failures).
  </action>
  <verify>git diff firestore.rules — el diff muestra ÚNICAMENTE el bloque añadido, sin
  alteraciones a reglas preexistentes.</verify>
  <done>`firestore.rules` contiene las 6 reglas; el resto del archivo intacto.</done>
</task>

<task type="auto">
  <name>Desplegar reglas al proyecto beta y verificar lectura autenticada</name>
  <files>[firestore.rules]</files>
  <action>
    1. Solo si la constancia C2 fue emitida: ejecutar el despliegue de reglas al
       entorno beta (`tiendalasmotos-beta`) con Firebase CLI (`firebase-tools` es
       devDependency del repo).
    2. Verificar en `https://tiendalasmotos-beta.web.app/admin/login` que un admin
       autenticado puede LEER (las vistas del módulo aún no existen; basta con
       confirmar que no hay regresión de permisos en rutas existentes que lean
       colecciones vecinas).
    3. Si el despliegue falla, registrar el error completo y NO continuar a 08-03.
  </action>
  <verify>Navegar a `https://tiendalasmotos-beta.web.app/admin/inventory` autenticado:
  la vista carga sin errores de permisos denegados.</verify>
  <done>Reglas desplegadas en beta sin regresión de permisos.</done>
</task>

## Must-Haves

- Gate C2 emitido por escrito antes de cualquier despliegue.
- Las 6 colecciones legibles solo con `request.auth != null`; todo `write` de cliente
  bloqueado; `historial_auditoria` sin ruta de escritura de cliente.
- Cero modificaciones a reglas preexistentes.
- Solo lectura real en beta verificada (prohibición de reportes con mocks).

---
*Created: 2026-09-22*
