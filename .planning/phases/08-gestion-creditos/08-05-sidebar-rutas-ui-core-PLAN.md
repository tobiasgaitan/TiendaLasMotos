---
phase: 8
plan: 5
name: Sidebar CreditCard + rutas App Router + UI créditos y clientes
wave: 3
depends_on:
  - 3
files_modified:
  - src/components/AdminSidebar.tsx
  - src/app/admin/creditos/page.tsx
  - src/app/admin/creditos/nuevo/page.tsx
  - src/app/admin/creditos/[id]/page.tsx
  - src/app/admin/creditos/[id]/editar/page.tsx
  - src/app/admin/creditos/clientes/page.tsx
requirements:
  - R-CR5
  - R-CR6
---

# Plan 8-5: Sidebar CreditCard + rutas App Router + UI créditos y clientes

## Objective

Inyectar el grupo colapsable "Gestión de Créditos" en `AdminSidebar` (icono `CreditCard`
ya importado, clave `creditos` en `openGroups`, contenedor dimensionado para 6 enlaces)
y crear las rutas `/admin/creditos/...` para el CRUD de `creditos` y el alta/edición de
`clientes_credito`, consumiendo los Server Actions de 08-03. Cumple C3 y C4.

## Code Patterns (Model Resilience)

Reference these existing files for code style:

- `src/components/AdminSidebar.tsx:27` — Estructura `openGroups`
  (`simuladores: true, config: false`), `toggleGroup`, helper `isActive(path)`,
  grupos colapsables con `ChevronDown/ChevronRight` y enlaces con estado activo.
  **C3:** añadir clave `creditos: false` SIN alterar `simuladores`/`config`; usar el
  `CreditCard` importado en la línea 21; el contenedor colapsable debe dimensionarse
  para 6 enlaces sin truncamiento (precedente físico v8.4.2 del nodo Bell → `max-h-80`;
  usar `max-h` holgado verificado, ej. `max-h-[26rem]`).
- `src/app/admin/layout.tsx:26` — Guard existente
  `ProtectedRoute allowedRoles={['admin','superadmin']}`. **C3:** las rutas viven bajo
  `/admin/creditos/...`, heredan el guard; prohibido bypass de auth paralelo.
- `src/app/admin/config/page.tsx` — Patrón CRUD cliente: `fetchData` con `getDocs`,
  modal (`isModalOpen`/`editingItem`), `handleSave`/`handleDelete` con `confirm()`,
  tabla presentacional (`ConfigTable`), estados `loading`, iconos `lucide-react`
  (`Plus`, `Loader2`).
- `src/context/AuthContext.tsx:126` — `useAuth()` provee `user`; el formulario envía
  `{ uid: user.uid, idToken: await user.getIdToken() }` al Server Action.
- `src/app/admin/general/page.tsx` — Uso de `toast` (`sonner`) para feedback.
- `src/app/admin/creditos/actions.ts` (08-03) — `createCredito`, `updateCredito`,
  `softDeleteCredito`, `createClienteCredito`, `updateClienteCredito`,
  `softDeleteClienteCredito`.

Conventions:

- **C4 (obligatorio):** Burst Mitigation — botón submit `disabled` durante `pending`
  (estado `saving`); sanitización perimetral de inputs (trim, Faraday Cage: descartar
  claves fuera del contrato antes de invocar el action); tolerancia de lectura de
  `celular` legacy a 10 dígitos (`"3001234567"` → normalizar con prefijo `57`; si no
  es normalizable, error explícito — prohibido null-masking silencioso).
- Lecturas de listado vía client-SDK (`getDocs`/`onSnapshot` — permitido: 08-02 solo
  bloquea *writes* de cliente); TODAS las escrituras vía Server Actions.
- Estilo oscuro del panel (`bg-gray-900`, bordes `border-gray-800`) consistente con
  `admin/config`.

## Tasks

<task type="auto">
  <name>Inyectar grupo Gestión de Créditos en AdminSidebar (C3)</name>
  <files>[src/components/AdminSidebar.tsx]</files>
  <action>
    Editar `src/components/AdminSidebar.tsx`:
    1. Añadir `creditos: false` al estado inicial `openGroups` (línea 32-35) SIN
       modificar `simuladores`/`config`.
    2. Insertar un nuevo grupo colapsable "Gestión de Créditos" (posición: después del
       bloque Simuladores y antes de los SINGLE ITEMS, o donde indique el sello;
       documentar la posición elegida) que replique la estructura del grupo
       `simuladores` (botón `toggleGroup('creditos')`, `ChevronDown/ChevronRight`):
       icono `CreditCard` (ya importado línea 21) con clase de color propia
       (ej. `text-amber-500`), título `Gestión de Créditos`.
    3. Contenedor colapsable con `max-h` holgado para **6 enlaces sin truncamiento**
       (precedente v8.4.2 `max-h-80`; usar `max-h-[26rem]` o superior verificado).
    4. Seis `Link` con `isActive()`: `/admin/creditos` (Créditos),
       `/admin/creditos/clientes` (Clientes), `/admin/creditos/pagos-inversores`
       (Pagos Inversores), `/admin/creditos/pagos-multas` (Pagos y Multas),
       `/admin/creditos/remisiones` (Remisiones), `/admin/creditos/auditoria` (Auditoría).
  </action>
  <verify>npx tsc --noEmit && npm run build</verify>
  <done>El grupo renderiza 6 enlaces visibles sin truncamiento; `simuladores`/`config`
  intactos; build pasa.</done>
</task>

<task type="auto">
  <name>Crear rutas de créditos: listado, nuevo, detalle y edición</name>
  <files>[src/app/admin/creditos/page.tsx, src/app/admin/creditos/nuevo/page.tsx, src/app/admin/creditos/[id]/page.tsx, src/app/admin/creditos/[id]/editar/page.tsx]</files>
  <action>
    1. `src/app/admin/creditos/page.tsx` (`"use client"`): listado de `creditos`
       (client-SDK `getDocs` con `where('activo', '==', true)` + `orderBy('created_at')`
       según índices disponibles; fallback `orderBy` en memoria si falta índice).
       Columnas: `numero_credito`, cliente (`cliente_id`), `capital_financiado`,
       `cuota_mensual`, `estado` (badge), acciones Editar/Ver/Baja. Botón
       "Nuevo crédito" → `/admin/creditos/nuevo`. Baja con `confirm()` +
       prompt de motivo → `softDeleteCredito` (requiere `motivo_baja`).
    2. `src/app/admin/creditos/nuevo/page.tsx`: formulario con Burst Mitigation
       (`saving` deshabilita submit), Faraday Cage (trim + whitelist), `useAuth()`
       para `{ uid, idToken }` → `createCredito`; éxito → `toast` + redirect a
       `/admin/creditos`; fallo → `toast.error` con mensaje del action
       (Zero-Silent-Failures en UI: `console.error` del fallo).
    3. `src/app/admin/creditos/[id]/page.tsx`: detalle de solo lectura del crédito
       (incluye `numero_credito`, `registrado_por`, timestamps) + accesos a editar.
    4. `src/app/admin/creditos/[id]/editar/page.tsx`: formulario precargado →
       `updateCredito` (nunca expone `numero_credito`/`fecha_solicitud` como editables).
    Las 4 rutas heredan el guard de `src/app/admin/layout.tsx` (cero auth paralelo).
  </action>
  <verify>npm run build</verify>
  <done>CRUD de `creditos` navegable bajo `/admin/creditos`; build pasa.</done>
</task>

<task type="auto">
  <name>Crear ruta de clientes_credito con tolerancia celular legacy (C4)</name>
  <files>[src/app/admin/creditos/clientes/page.tsx]</files>
  <action>
    Crear `src/app/admin/creditos/clientes/page.tsx` (`"use client"`):
    1. Listado (client-SDK, solo `activo === true`) con columnas `cedula`, `nombres`,
       `celular`, `direccion`, `fecha_registro` (+ `tipo_documento` si existe).
    2. Modal alta/edición (patrón `ConfigModal` de `admin/config`): campos `cedula`,
       `nombres`, `celular`, `direccion`, `fecha_registro` (date input), extensiones
       opcionales `tipo_documento`, `apellidos`, `email`, `ciudad`.
    3. **C4:** Burst Mitigation en guardar; Faraday Cage perimetral; lectura tolerante:
       al renderizar, `celular` legacy de 10 dígitos (`"3001234567"`) se normaliza a
       `57…` para visualización/validación; si un valor no es normalizable, se muestra
       error explícito en la fila (prohibido `?.`/fallback silencioso que oculte el dato).
    4. Escrituras → `createClienteCredito` / `updateClienteCredito` /
       `softDeleteClienteCredito` con `{ uid, idToken }` de `useAuth()`.
  </action>
  <verify>npm run build</verify>
  <done>Alta/edición de clientes respeta las 5 claves inmutables y C4; build pasa.</done>
</task>

## Must-Haves

- C3: rutas bajo el guard existente; `CreditCard` de la línea 21; clave `creditos`
  añadida sin tocar `simuladores`/`config`; 6 enlaces sin truncamiento.
- C4: Burst Mitigation + Faraday Cage + tolerancia celular legacy en todos los
  formularios de este plan.
- Cero escrituras client-SDK (todas vía Server Actions de 08-03).
- `npm run build` con código de salida 0.

---
*Created: 2026-09-22*
