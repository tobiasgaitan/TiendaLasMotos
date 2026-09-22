# Phase 8: Módulo de Gestión de Créditos (CRUD) — Context

**Gathered:** 2026-09-22
**Status:** Ready for planning
**Branch:** beta
**Depth:** standard (`.planning/config.json`)

## Phase Boundary

Construir el Módulo de Gestión de Créditos (CRUD) de la plataforma web tiendalasmotos:

1. Esquema de datos (TypeScript Interfaces + Firestore Schema) para las 6 colecciones
   canónicas del módulo.
2. Nuevo nodo superior (grupo colapsable) en `src/components/AdminSidebar.tsx`
   utilizando el icono `CreditCard` ya importado.
3. Rutas en App Router bajo el prefijo `/admin/creditos/...`.
4. Server Actions para el CRUD. Toda operación de escritura (Create/Update) DEBE
   inyectar obligatoriamente el campo `registrado_por: user.uid` (verificado) y
   registrar la operación en la colección `historial_auditoria`.
5. `historial_auditoria` funciona como Ledger inmutable de trazabilidad.

`sys_admin_users` queda FUERA del CRUD del módulo (ya es consumida por
`src/context/AuthContext.tsx` para resolución de roles vía query por email,
campos `role`/`rol`).

## Implementation Decisions

### Colecciones canónicas (NAMING LOCK)

- **DECIDED (usuario):** Los nombres canónicos e inmutables de las 7 colecciones ya
  existentes en Firestore son: `clientes_credito`, `creditos`, `historial_auditoria`,
  `pagos_inversores`, `pagos_y_multas`, `remisiones_dinero`, `sys_admin_users`.
- **DECIDED (usuario):** `sys_admin_users` queda FUERA del CRUD del módulo. El esquema
  del módulo cubre las 6 restantes.
- **DECIDED (usuario):** Prohibido renombrar o inventar colecciones (NAMING LOCK).

### Sello de naming — Sección 1 del usuario (verbatim, carácter por carácter)

> 1. SELLO DE NAMING (respuesta al punto exigido)
> No congelo tal cual. Dictamino con evidencia física de esta sesión:
> clientes_credito — esquema canónico por NAMING LOCK de evidencia física. La captura de consola Firestore (proyecto tiendalasmotos, nam5, 2026-09-22) pegada por Tobias exhibe el documento XSh6FVoyUGKrfMkCFnvR con las claves cedula, celular, direccion, fecha_registro, nombres. Esas cinco claves quedan inmutables. La proposición del planificador (tipo_documento, numero_documento, supresión de direccion) constituye intento de renombre sobre campos que conectan con Firestore compartida: habría sido Fallo Crítico de escribirse. Regla canónica:
> cedula = clave de número de documento. Prohibido sustituirla por numero_documento/tipo_documento. Si el negocio exige tipo de documento, se admite tipo_documento aditivo y opcional, jamás sustitutivo.
> nombres, celular, direccion inmutables. apellidos, email, ciudad admitidos solo como extensiones aditivas.
> fecha_registro = estampilla de registro de negocio en esta colección. El created_at del BaseAuditable no se aplica aquí (prohibida doble fuente de verdad); updated_at sí aplica.
> Las otras 5 colecciones + BaseAuditable + ledger. No existe esquema físico previo (colecciones verificadas vacías). La proposición del planificador queda congelada como esquema canónico inicial en el instante en que se escriba en 08-01-PLAN.md: BaseAuditable (registrado_por, registrado_por_email, actualizado_por, created_at, updated_at, activo, motivo_baja, fecha_baja, baja_por), interfaces de dominio según su tabla, historial_auditoria append-only con version, y formato numero_credito = CRE-YYYY-XXXX. Desde esa escritura, NAMING LOCK total sobre todas las claves.

### Alcance del CRUD

- **DECIDED (usuario):** CRUD total en `creditos` (entidad maestra); alta/edición en
  `clientes_credito`, `pagos_inversores`, `pagos_y_multas` y `remisiones_dinero`;
  `historial_auditoria` es append-only y de solo lectura (ledger inmutable de trazabilidad).
- **DECIDED (usuario):** Prohibido el borrado físico en colecciones financieras: el esquema
  propone bandera de estado/baja lógica por colección (`activo=false` + `motivo_baja`,
  `fecha_baja`, `baja_por`).
- **DECIDED (usuario):** Toda escritura inyecta `registrado_por`.
- **DECIDED (usuario):** El plan incluye una matriz explícita de operaciones permitidas
  por colección para auditoría.

### Seguridad de registrado_por

- **DECIDED (usuario):** Verificar idToken. El cliente obtiene `user` de `useAuth()`
  (`src/context/AuthContext.tsx`) y envía `uid` + `await user.getIdToken()` al Server
  Action; el action valida con `getAdminAuth().verifyIdToken()` (`src/lib/firebase-admin.ts`)
  y usa el **uid verificado** como `registrado_por` (anti-spoofing).

### Integración en planning

- **DECIDED (usuario):** Extender el proyecto GSD existente como **Fase 8**
  (`.planning/phases/08-gestion-creditos/`), con actualización aditiva de
  `ROADMAP.md`, `REQUIREMENTS.md` y `STATE.md`. Sin re-inicializar (se preserva el
  histórico v8.4.8).

### Condiciones técnicas C1–C7 del usuario (verbatim)

> C1 (Naming): 08-CONTEXT.md y 08-01-PLAN.md deben reflejar el dictamen de la sección 1 carácter por carácter.
> C2 (Reglas): Antes de desplegar 08-02, constancia escrita en este chat de que no existe writer legítimo vía client-SDK sobre las 6 colecciones (las reglas bloquearán writes de cliente; el Admin SDK las ignora). Sin esa constancia, el despliegue de reglas queda vetado.
> C3 (Sidebar/rutas): 08-05 debe (a) montar las rutas bajo el guard existente del layout /admin (cero bypass de auth paralelo), (b) dimensionar el max-h del contenedor colapsable para 6 enlaces sin truncamiento (precedente físico v8.4.2: el nodo Bell exigió escalar a max-h-80), (c) usar CreditCard ya importado en AdminSidebar.tsx:21 y añadir la clave creditos a openGroups sin alterar simuladores/config.
> C4 (Formularios): 08-05/08-06 obligados a Burst Mitigation (lock transicional del botón submit durante el pending), sanitización perimetral de inputs (Paraday Cage), y tolerancia de lectura ante valores legacy de celular a 10 dígitos sin null-masking silencioso (valor físicamente observado: "3001234567").
> C5 (Contador): Reuso de configuracion/counters estrictamente aditivo (creditoCount, creditoYear) vía runTransaction según SSOT. Prohibida colección nueva de contadores.
> C6 (Set de escritura): Exactamente los 7 archivos declarados + actualización aditiva de ROADMAP/REQUIREMENTS/STATE. Cero escritura de código en modo plan. /gsd-execute prohibido hasta mi revisión y sello final.
> C7 (Contrato compartido): Antes de ejecutar 08-03, Tobias confirma si bot-tiendalasmotos escribe sobre alguna de las 6 colecciones. Si sí, pega evidencia (documento real o interfaz TS del bot) y re-valido naming antes de cualquier execute. No audito el bot, pero la Firestore compartida es contrato cruzado.

### AI Discretion

- Detalle visual interno de formularios/tablas (densidad, paginación, orden de columnas)
  — discreción del ejecutor, respetando C3 y C4.
- Orden interno de tasks dentro de cada plan, siempre que se respeten `wave` y `depends_on`.

## Specific Ideas

- Taxonomía de rutas (propuesta del planificador, aceptada por el usuario vía
  "o la taxonomía que propongas"): segmentos kebab-case en URL ↔ snake_case en
  colecciones —
  `/admin/creditos` (listado), `/nuevo`, `/[id]`, `/[id]/editar`, `/clientes`,
  `/pagos-inversores`, `/pagos-multas`, `/remisiones`, `/auditoria`.
- Correlativo `numero_credito = CRE-YYYY-XXXX` vía `configuracion/counters` aditivo
  (patrón `src/lib/actions/quotation.ts`), sin inventar colección.
- `id` (docId Firestore) NO pertenece a `BaseAuditable`; se adjunta en lectura con
  `{ id: doc.id, ...data }` (patrón `src/app/admin/config/page.tsx:45`).

## Deferred Ideas

- Purga o renombre de campos legacy: vetado por NAMING LOCK.
- Escrituras de `bot-tiendalasmotos` sobre las 6 colecciones: gate C7 pendiente de
  confirmación de Tobias antes de ejecutar 08-03.

---
*Phase: 08-gestion-creditos*
*Context gathered: 2026-09-22*
