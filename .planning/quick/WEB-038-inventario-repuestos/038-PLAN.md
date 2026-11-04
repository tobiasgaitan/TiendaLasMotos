# WEB-038 — Inventario de Repuestos con Flujo de Aprobación

**Estado:** Plan atómico de solución  
**Alcance:** exclusivamente los 4 puntos solicitados.  
**Doctrina:** NAMING LOCK, Faraday Cage, Zero-Silent-Failures, Anti-Null Masking, ledger append-only, sin borrado físico, sin tocar el bot ni `pagina/catalogo/items`.

---

## 0. Contratos congelados (NAMING LOCK)

Estos nombres quedan fijados para todo el módulo. No se renombran en código, schemas, reglas ni consultas.

### 0.1 Colecciones

| Colección | Propósito | Escritura |
|---|---|---|
| `inventario_repuestos` | Catálogo maestro de repuestos | Solo Admin vía Server Action |
| `conteos_pendientes_repuestos` | Borradores de conteo del asesor | Asesor vía Server Action; Admin revisa |
| `fotos_inventario` | Metadatos de imágenes del asesor | Asesor vía Server Action |
| `historial_auditoria_inventario` | Ledger append-only de aprobaciones/rechazos | Solo servidor |

### 0.2 Rol y campos

| Elemento | Nombre canónico | Prohibido |
|---|---|---|
| Rol | `asesor` | `operario`, `advisor`, `seller` |
| Referencia maestra | `referencia` | `sku`, `codigo`, `id_repuesto` |
| Referencia del borrador | `referencia_sugerida` / `referencia_confirmada` | `referencia_final`, `ref` |
| Estado | `pendiente_revision` / `aprobado` / `rechazado` | `pending`, `approved`, `rejected` |
| Asesor | `asesor_email` / `asesor_uid` | `email_asesor`, `user_id`, `asesor_id` |
| Revisor | `revisado_por` / `revisado_en` | `admin_email`, `aprobado_por` |
| Fecha de creación | `creado_en` | `created_at`, `fecha_registro` |
| Fecha de actualización | `actualizado_en` | `updated_at` |
| Ubicación | `LetraEstante-Nivel-Posicion` (`A-01-05`) | `A1`, `estante_a`, `posición` |
| Operación del ledger | `CREATE` / `UPDATE` | `APPROVE`, `REJECT`, `DELETE` |

### 0.3 Reglas transversales

- No se toca `pagina/catalogo/items` ni el bot de motos.
- No se modifica `historial_auditoria` financiero; el ledger de inventario es una colección separada.
- No se usa `deleteDoc()` en las colecciones nuevas. En este alcance no se define baja lógica; si se requiere, se agrega `activo: boolean` en una migración posterior y se actualiza la matriz, no se borra el documento.
- El ledger se escribe únicamente con `tx.create()` sobre una referencia nueva. Prohibido `tx.set()`, `tx.update()` y `tx.delete()` sobre el ledger.
- `registrado_por` = UID verificado con `verifyIdToken()`. `registrado_por_email` es un campo separado.
- Los campos de confianza (`asesor_email`, `asesor_uid`, `estado`, `revisado_por`, `revisado_en`) se derivan en servidor; nunca se aceptan del cliente.
- Anti-Null Masking: las llaves críticas de configuración se validan con `if (!valor) throw`, no con `?.`.

---

## 1. Punto 1 — Actualización de `src/types/roles.ts`

### 1.1 Archivos

| Archivo | Acción |
|---|---|
| `src/types/roles.ts` | Modificar: `ROLES`, `COLECCIONES`, `ScopePropiedad`, `DEFAULT_MATRIZ`. |
| `src/lib/auth/require-permiso.ts` | Modificar: agregar `asesor_email` a `ScopeDoc`. |
| `src/test/utils/roles.test.ts` | Modificar: casos del rol `asesor` y nuevas colecciones. |
| `scripts/seed-permissions-inventario.ts` | Crear: semilla/merge de `sys_permissions_matrix`. |

### 1.2 Cambios exactos en `src/types/roles.ts`

```ts
export const ROLES = [
  'superadmin',
  'admin',
  'asesor',
  'cobrador',
  'inversor',
  'auditor',
  'admin_creditos',
] as const;

export type Rol = (typeof ROLES)[number];

export type ScopePropiedad =
  | 'email_usuario'
  | 'email_inversor'
  | 'email_admin'
  | 'asesor_email'
  | null;

export const COLECCIONES = [
  'creditos',
  'clientes_credito',
  'pagos_y_multas',
  'pagos_inversores',
  'remisiones_dinero',
  'historial_auditoria',
  'anomalias',
  'sys_admin_users',
  // Nuevas — NAMING LOCK
  'inventario_repuestos',
  'conteos_pendientes_repuestos',
  'fotos_inventario',
  'historial_auditoria_inventario',
] as const;

export type ColeccionPermiso = (typeof COLECCIONES)[number];
```

`Rol` y `ColeccionPermiso` se actualizan automáticamente al derivarse de los arrays. No se crean uniones manuales paralelas.

### 1.3 Matriz `DEFAULT_MATRIZ`

| Rol | `inventario_repuestos` | `conteos_pendientes_repuestos` | `fotos_inventario` | `historial_auditoria_inventario` |
|---|---|---|---|---|
| `superadmin` | create / read / update | create / read / update | create / read / update | read |
| `admin` | create / read / update | create / read / update | create / read / update | read |
| `asesor` | read | create / read — scope `asesor_email` | create / read — scope `asesor_email` | read |
| `auditor` | read | read | read | read |
| `cobrador` | sin acceso | sin acceso | sin acceso | sin acceso |
| `inversor` | sin acceso | sin acceso | sin acceso | sin acceso |
| `admin_creditos` | sin acceso | sin acceso | sin acceso | sin acceso |

**Decisiones:**

- Ningún rol recibe `delete` en las nuevas colecciones.
- `asesor` no puede crear, editar ni eliminar en `inventario_repuestos`.
- `asesor` solo ve sus propios conteos y fotos mediante `scope: 'asesor_email'`.
- `admin` y `superadmin` son los únicos que promueven conteos a inventario.
- `auditor` solo lee.
- `historial_auditoria_inventario` es read para `asesor` según requisito. Si más adelante se requiere aislamiento por asesor, el ledger debe incluir `asesor_email` y aplicar scope; no se agrega ahora para no romper el contrato solicitado.

### 1.4 Semilla obligatoria de `sys_permissions_matrix`

`requirePermiso()` es fail-closed cuando existe un documento de matriz pero no contiene la colección solicitada. Actualizar `DEFAULT_MATRIZ` no basta si el documento real ya existe.

`scripts/seed-permissions-inventario.ts` debe:

1. Ejecutarse con Admin SDK.
2. Recorrer `superadmin`, `admin`, `asesor` y `auditor`.
3. Si el documento no existe: crearlo con `rol`, `permisos` y `activo: true`.
4. Si existe: leer `permisos`, mergear en memoria solo las claves nuevas y volver a escribir el mapa completo.
5. No sobrescribir permisos existentes ni cambiar `activo`.
6. No tocar `cobrador`, `inversor` ni `admin_creditos`.
7. Verificar en beta que `sys_permissions_matrix/asesor` y `/admin` contienen las nuevas colecciones antes de probar las acciones.

### 1.5 Acoplamientos obligatorios para que el rol sea usable

Estos cambios no son parte del diff de `roles.ts`, pero bloquean la certificación si no se resuelven:

- `src/lib/auth/landing.ts`: mapear `asesor` a la ruta de conteo. Hoy cae en `/admin/simulador`, que es solo admin.
- `src/lib/auth/sidebar-visibility.ts`: agregar nodo de inventario del asesor o cambiar el requisito de `inventario` para usar `inventario_repuestos:read`.
- `src/app/admin/inventory/page.tsx`: el guard actual `puedeVerNodo('inventario')` es `soloAdmin`; debe permitir `asesor` en la pantalla de conteo.
- `src/app/admin/users/page.tsx`: agregar `<option value="asesor">Asesor</option>`.
- `functions/src/sendUserInvitation.ts`: agregar `asesor` al union de roles y a `roleNames`.

### 1.6 Pruebas del Punto 1

- `esRolValido('asesor') === true`.
- `scopeDe(DEFAULT_MATRIZ.asesor, 'conteos_pendientes_repuestos') === 'asesor_email'`.
- `scopeDe(DEFAULT_MATRIZ.asesor, 'fotos_inventario') === 'asesor_email'`.
- `puede(DEFAULT_MATRIZ.asesor, 'inventario_repuestos', 'read') === true`.
- `puede(DEFAULT_MATRIZ.asesor, 'inventario_repuestos', 'create') === false`.
- `puede(DEFAULT_MATRIZ.admin, 'inventario_repuestos', 'create') === true`.
- `puede(DEFAULT_MATRIZ.admin, 'inventario_repuestos', 'delete') === false`.
- `puede(DEFAULT_MATRIZ.auditor, 'historial_auditoria_inventario', 'read') === true`.
- `puede(DEFAULT_MATRIZ.cobrador, 'inventario_repuestos', 'read') === false`.
- Los tests financieros existentes deben seguir pasando.

### 1.7 Dependencias y variables de entorno

- Nuevas dependencias npm: ninguna.
- Variables de entorno: ninguna nueva para este punto.

---

## 2. Punto 2 — Server Actions del Flujo de Aprobación

### 2.1 Archivos

| Archivo | Acción |
|---|---|
| `src/types/inventario.ts` | Crear: contratos puros y DTOs. |
| `src/lib/actions/inventario-schemas.ts` | Crear: schemas Zod compartidos. Sin `'use server'`. |
| `src/app/admin/inventory/actions/crearConteoPendiente.ts` | Crear: Server Action del asesor. |
| `src/app/admin/inventory/actions/aprobarConteo.ts` | Crear: Server Action transaccional del admin. |
| `src/app/admin/inventory/actions/rechazarConteo.ts` | Crear: Server Action de rechazo. |
| `src/app/admin/inventory/actions/listarPendientes.ts` | Crear: lectura de pendientes para dashboard admin. |
| `firestore.rules` | Modificar: bloques de lectura y escritura denegada. |
| `firestore.indexes.json` | Modificar: índices de consulta. |
| `scripts/seed-permissions-inventario.ts` | Crear/compartir con Punto 1. |

**Regla de Next.js:** los archivos `'use server'` solo pueden exportar funciones `async`. Los tipos, constantes y schemas viven en `src/types/inventario.ts` y `src/lib/actions/inventario-schemas.ts`. Esto evita el error de build ya documentado en el proyecto.

### 2.2 Contratos de datos

```ts
// src/types/inventario.ts
import type { Timestamp } from 'firebase/firestore';

export type EstadoConteo = 'pendiente_revision' | 'aprobado' | 'rechazado';

export interface ConteoPendiente {
  referencia_sugerida: string;
  referencia_confirmada: string;
  descripcion: string;
  cantidad_contada: number;
  ubicacion: string;              // "A-01-05"
  anotaciones: string;
  foto_url: string;               // URL de fotos_inventario
  estado: EstadoConteo;
  motivo_rechazo: string;         // "" mientras no se rechace
  asesor_email: string;           // desde token verificado
  asesor_uid: string;             // desde token verificado
  creado_en: Timestamp;
  revisado_por: string;           // "" mientras está pendiente
  revisado_en: Timestamp | null;
}

export interface InventarioRepuesto {
  referencia: string;             // PK, docId, inmutable tras aprobación
  descripcion: string;
  fabricante: string;
  aplica_a: string[];
  categoria: string;
  precio: number;
  ubicacion: string;              // "A-01-05"
  stock: number;
  stock_minimo: number;
  imagen_url: string;
  creado_por: string;             // email admin
  creado_en: Timestamp;
  actualizado_por: string;        // email admin
  actualizado_en: Timestamp;
}

export interface FotoInventario {
  conteo_id: string;              // docId de conteos_pendientes_repuestos
  asesor_email: string;
  asesor_uid: string;
  foto_url: string;
  storage_path: string;
  nombre_archivo: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  tamano_bytes: number;
  etiquetas_vision: string[];
  creado_en: Timestamp;
}

export interface HistorialAuditoriaInventario {
  coleccion_afectada:
    | 'inventario_repuestos'
    | 'conteos_pendientes_repuestos'
    | 'fotos_inventario';
  documento_id: string;
  referencia: string | null;
  conteo_id: string | null;
  operacion: 'CREATE' | 'UPDATE';
  datos_anteriores: Record<string, unknown> | null;
  datos_nuevos: Record<string, unknown> | null;
  campos_modificados: string[];
  registrado_por: string;         // UID verificado
  registrado_por_email: string;
  creado_en: Timestamp;
  version: 1;
}

export interface InventarioActionResult {
  success: boolean;
  message?: string;
  id?: string;
  idempotente?: boolean;
}
```

**Notas de NAMING LOCK:**

- `conteos_pendientes_repuestos` es un documento por referencia contada; no es un array de items.
- `fotos_inventario/{conteo_id}` usa el mismo ID del conteo porque el schema solicitado tiene una sola `foto_url`.
- `referencia` es el docId de `inventario_repuestos` y no se renombra después de aprobada.
- `cantidad_contada` se copia a `stock` del inventario. Es un conteo físico: sobrescribe, no incrementa.
- `motivo_rechazo` se escribe como `''` en pendiente/aprobado y con texto obligatorio en rechazado.
- `revisado_por` se escribe como `''` y `revisado_en` como `null` mientras está pendiente.

### 2.3 Schemas Zod

```ts
// src/lib/actions/inventario-schemas.ts
import { z } from 'zod';

export const referenciaSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9._-]{0,63}$/, 'Referencia inválida');

export const ubicacionSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]-\d{2}-\d{2}$/, 'Ubicación inválida. Formato: A-01-05');

export const crearConteoSchema = z.object({
  conteo_id: z.string().uuid(), // docId generado por el outbox para idempotencia
  referencia_sugerida: z.string().trim().max(64).default(''),
  referencia_confirmada: referenciaSchema,
  descripcion: z.string().trim().min(2).max(200),
  cantidad_contada: z.coerce.number().int().min(0).max(1_000_000),
  ubicacion: ubicacionSchema,
  anotaciones: z.string().trim().max(500).default(''),
  foto_url: z.string().url(),
  etiquetas_vision: z.array(z.string().trim().max(80)).max(10).default([]),
});

export const aprobarConteoSchema = z.object({
  conteo_id: z.string().uuid(),
  datos_maestro: z
    .object({
      fabricante: z.string().trim().min(1).max(100),
      aplica_a: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
      categoria: z.string().trim().min(1).max(100),
      precio: z.coerce.number().finite().min(0),
      stock_minimo: z.coerce.number().int().min(0),
      imagen_url: z.string().url().optional(),
    })
    .optional(),
});

export const rechazarConteoSchema = z.object({
  conteo_id: z.string().uuid(),
  motivo_rechazo: z.string().trim().min(5).max(500),
});

export const listarPendientesSchema = z.object({
  estado: z
    .enum(['pendiente_revision', 'aprobado', 'rechazado'])
    .default('pendiente_revision'),
});
```

### 2.4 `crearConteoPendiente.ts`

**Responsabilidad:** validar rol `asesor` y crear el borrador + metadatos de foto.

**Flujo:**

1. Validar `actor` con Zod (`{ uid, idToken }`).
2. `verifyIdToken()` y obtener `{ uid, email }` verificados.
3. `requirePermiso(me, 'conteos_pendientes_repuestos', 'create', { asesor_email: me.email })`.
4. Verificar explícitamente `rol === 'asesor'`; si no, fallar con “Solo un asesor puede crear conteos”.
5. Exigir también `fotos_inventario:create` con `scope: { asesor_email: me.email }`.
6. Validar `crearConteoSchema`.
7. Validar que `foto_url` sea de Firebase Storage:
   - Host `firebasestorage.googleapis.com`.
   - Ruta decodificada con prefijo `inventario_repuestos/{asesor_email}/`.
8. Transacción:
   - `conteoRef = db.collection('conteos_pendientes_repuestos').doc(data.conteo_id)`.
   - Leer `conteoRef`; si existe y `asesor_email` coincide, devolver `success: true, idempotente: true`.
   - `tx.create(conteoRef, { ...campos, estado: 'pendiente_revision', motivo_rechazo: '', asesor_email, asesor_uid, creado_en: new Date(), revisado_por: '', revisado_en: null })`.
   - `tx.create(db.collection('fotos_inventario').doc(data.conteo_id), { conteo_id, asesor_email, asesor_uid, foto_url, storage_path, nombre_archivo, mime_type, tamano_bytes, etiquetas_vision, creado_en: new Date() })`.
9. `revalidatePath('/admin/inventory')`.
10. Devolver `{ success: true, id: data.conteo_id }`.

**Faraday Cage:** `asesor_email`, `asesor_uid`, `estado`, `motivo_rechazo`, `revisado_por` y `revisado_en` se fijan en servidor. El cliente no puede inyectarlos.

### 2.5 `aprobarConteo.ts`

**Responsabilidad:** transacción atómica que crea/actualiza inventario, actualiza el pendiente y appende el ledger.

**Input:** `{ conteo_id, datos_maestro? }`

**Flujo:**

1. Verificar `actor.idToken`.
2. Exigir `requirePermiso(me, 'conteos_pendientes_repuestos', 'update')` y verificar explícitamente `rol === 'admin' || rol === 'superadmin'`.
3. Validar `aprobarConteoSchema`.
4. Transacción con **todas las lecturas antes de las escrituras**:
   - Leer `conteoRef`.
   - Si no existe: fallar.
   - Si `estado === 'aprobado'`: devolver `success: true, idempotente: true` sin escribir.
   - Si `estado === 'rechazado'`: fallar con “El conteo fue rechazado”.
   - Leer `inventarioRef = db.collection('inventario_repuestos').doc(referencia_confirmada)`.
   - Si el inventario no existe, exigir `datos_maestro` completo; si falta, fallar con “Faltan datos maestros para crear la referencia”.
5. Escrituras:
   - **Inventario existente:** `tx.update(inventarioRef, { stock: cantidad_contada, ubicacion, imagen_url: datos_maestro?.imagen_url ?? conteo.foto_url, actualizado_por: me.email, actualizado_en: new Date(), ...(datos_maestro ? { fabricante, aplica_a, categoria, precio, stock_minimo } : {}) })`. `referencia` no se toca.
   - **Inventario nuevo:** `tx.create(inventarioRef, { referencia, descripcion, fabricante, aplica_a, categoria, precio, ubicacion, stock: cantidad_contada, stock_minimo, imagen_url: datos_maestro.imagen_url ?? conteo.foto_url, creado_por: me.email, creado_en: new Date(), actualizado_por: me.email, actualizado_en: new Date() })`.
   - **Pendiente:** `tx.update(conteoRef, { estado: 'aprobado', revisado_por: me.email, revisado_en: new Date(), motivo_rechazo: '' })`.
   - **Ledger:** `tx.create(db.collection('historial_auditoria_inventario').doc(), { coleccion_afectada: 'inventario_repuestos', documento_id: referencia, referencia, conteo_id, operacion: inventarioExistia ? 'UPDATE' : 'CREATE', datos_anteriores: antes, datos_nuevos: despues, campos_modificados, registrado_por: me.uid, registrado_por_email: me.email, creado_en: new Date(), version: 1 })`.
6. `revalidatePath('/admin/inventory')`.
7. Devolver `{ success: true, id: referencia }`.

**Nota de doctrina:** en una transacción no existe `add()`. El equivalente atómico y append-only es `tx.create()` sobre una referencia nueva. Se prohíbe `tx.set()` para expresar intención append-only. Nunca `tx.update()` ni `tx.delete()` sobre el ledger.

### 2.6 `rechazarConteo.ts`

1. Verificar actor.
2. Exigir `conteos_pendientes_repuestos:update` y rol `admin`/`superadmin`.
3. Validar `{ conteo_id, motivo_rechazo }`.
4. Transacción:
   - Leer pendiente.
   - Si ya está `rechazado`: idempotente.
   - Si está `aprobado`: fallar.
   - `tx.update(conteoRef, { estado: 'rechazado', motivo_rechazo, revisado_por: me.email, revisado_en: new Date() })`.
   - `tx.create(ledgerRef, { coleccion_afectada: 'conteos_pendientes_repuestos', documento_id: conteo_id, referencia: conteo.referencia_confirmada, conteo_id, operacion: 'UPDATE', datos_anteriores: { estado: 'pendiente_revision' }, datos_nuevos: { estado: 'rechazado', motivo_rechazo, revisado_por: me.email, revisado_en: new Date() }, campos_modificados: ['estado', 'motivo_rechazo', 'revisado_por', 'revisado_en'], registrado_por: me.uid, registrado_por_email: me.email, creado_en: new Date(), version: 1 })`.
5. No se escribe en `inventario_repuestos`.
6. `revalidatePath('/admin/inventory')`.

### 2.7 `listarPendientes.ts`

- Verificar actor y rol `admin`/`superadmin`.
- Validar `{ estado }` con default `pendiente_revision`.
- Consulta:
  ```ts
  db.collection('conteos_pendientes_repuestos')
    .where('estado', '==', estado)
    .orderBy('creado_en', 'desc')
    .limit(100)
  ```
- Convertir Timestamps a ISO string antes de retornar, porque `Timestamp` no es un valor serializable seguro para Server Actions:
  ```ts
  type PendienteDTO = Omit<ConteoPendiente, 'creado_en' | 'revisado_en'> & {
    id: string;
    creado_en: string;
    revisado_en: string | null;
  };
  ```
- Retornar `{ success: true, pendientes: PendienteDTO[] }`.
- No usar `?.` en el acceso a `data()` ni en llaves críticas.

### 2.8 Reglas de Firestore

Agregar antes del `match /{document=**} { allow read, write: if false; }`:

```javascript
function emailActual() {
  return request.auth.token.email.lower();
}

function rolActual() {
  return get(
    /databases/$(database)/documents/sys_admin_users/$(emailActual())
  ).data.rol;
}

function esAdmin() {
  return request.auth != null
    && request.auth.token.email != null
    && rolActual() in ['superadmin', 'admin'];
}

function esAdminOAuditor() {
  return request.auth != null
    && request.auth.token.email != null
    && rolActual() in ['superadmin', 'admin', 'auditor'];
}

match /conteos_pendientes_repuestos/{conteo} {
  allow read: if request.auth != null
    && request.auth.token.email != null
    && (
      rolActual() in ['superadmin', 'admin', 'auditor']
      || resource.data.asesor_email == emailActual()
    );
  allow create, update, delete: if false;
}

match /inventario_repuestos/{repuesto} {
  allow read: if request.auth != null
    && request.auth.token.email != null
    && rolActual() in ['superadmin', 'admin', 'asesor', 'auditor'];
  allow create, update, delete: if false;
}

match /fotos_inventario/{foto} {
  allow read: if request.auth != null
    && request.auth.token.email != null
    && (
      rolActual() in ['superadmin', 'admin', 'auditor']
      || resource.data.asesor_email == emailActual()
    );
  allow create, update, delete: if false;
}

match /historial_auditoria_inventario/{asiento} {
  allow read: if request.auth != null
    && request.auth.token.email != null
    && rolActual() in ['superadmin', 'admin', 'auditor', 'asesor'];
  allow create, update, delete: if false;
}
```

Las escrituras reales viajan por Server Actions con Admin SDK, que ignora reglas. El cliente solo lee.

### 2.9 Índices

Agregar a `firestore.indexes.json`:

```json
{
  "collectionGroup": "conteos_pendientes_repuestos",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "estado", "order": "ASCENDING" },
    { "fieldPath": "creado_en", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "conteos_pendientes_repuestos",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "asesor_email", "order": "ASCENDING" },
    { "fieldPath": "estado", "order": "ASCENDING" },
    { "fieldPath": "creado_en", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "fotos_inventario",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "conteo_id", "order": "ASCENDING" },
    { "fieldPath": "creado_en", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "historial_auditoria_inventario",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "documento_id", "order": "ASCENDING" },
    { "fieldPath": "creado_en", "order": "DESCENDING" }
  ]
}
```

### 2.10 Pruebas del Punto 2

- Asesor crea conteo → 1 documento `pendiente_revision`, 1 documento en `fotos_inventario`.
- Reintento con el mismo `conteo_id` → no duplica; responde idempotente.
- Asesor intenta aprobar → `No autorizado`.
- Admin aprueba referencia existente → actualiza `stock`, `ubicacion`, `actualizado_por`, `actualizado_en`; crea 1 asiento `UPDATE`.
- Admin aprueba referencia nueva sin `datos_maestro` → falla con mensaje explícito.
- Admin aprueba referencia nueva con `datos_maestro` → crea inventario y 1 asiento `CREATE`.
- Doble aprobación → no duplica asientos; responde idempotente.
- Admin rechaza → `estado: 'rechazado'`, `motivo_rechazo` obligatorio, 1 asiento `UPDATE`, sin escrituras en inventario.
- Cliente intenta `setDoc`/`updateDoc`/`deleteDoc` sobre las 4 colecciones → `permission-denied`.
- `listarPendientes` devuelve timestamps ISO y no objetos `Timestamp`.
- `tsc --noEmit`, `npm run build`, `npm run lint` en EXIT 0.

### 2.11 Dependencias y variables de entorno

- Nuevas dependencias npm: ninguna. `zod`, `firebase`, `firebase-admin` ya existen.
- Variables de entorno: ninguna nueva para este punto.

---

## 3. Punto 3 — Server Action de Visión (Google Cloud Vision)

### 3.1 Archivos

| Archivo | Acción |
|---|---|
| `src/app/admin/inventory/actions/analizarImagenRepuesto.ts` | Crear: Server Action con `'use server'`. |
| `src/types/inventario.ts` | Modificar: agregar `VisionSugerencia` y `VisionResult`. |
| `src/lib/actions/vision-mapping.ts` | Crear: mapa puro etiqueta → categoría, sin SDK. |
| `next.config.ts` | Modificar solo si se habilita base64: `experimental.serverActions.bodySizeLimit: '6mb'`. |
| `storage.rules` o consola de Firebase Storage | Reglas de subida/lectura de fotos. |

### 3.2 Contrato de la acción

```ts
export async function analizarImagenRepuesto(
  input: unknown,
  actor: unknown
): Promise<VisionResult>;
```

Input admitido:

```ts
type AnalizarImagenInput =
  | { foto_url: string } // preferido: URL de Firebase Storage
  | {
      imagen_base64: string;
      mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
    };
```

**Preferencia:** `foto_url`. Evita el límite de body de las Server Actions y evita enviar la imagen por el request del servidor. `imagen_base64` queda como fallback para desarrollo o imágenes pequeñas; si se habilita, subir `bodySizeLimit` a `6mb` y validar tamaño máximo de 4 MB.

### 3.3 Flujo seguro

1. Validar `actor` (`{ uid, idToken }`) y verificar `idToken`.
2. Exigir:
   ```ts
   await requirePermiso(me, 'fotos_inventario', 'create', {
     asesor_email: me.email,
   });
   ```
   Verificar explícitamente que el rol sea `asesor` o `admin`/`superadmin`; el asesor es el caso principal.
3. Validar input con Zod. Para `foto_url`:
   - Host exacto `firebasestorage.googleapis.com`.
   - Ruta decodificada con prefijo `inventario_repuestos/{asesor_email}/`.
   - No aceptar otros hosts ni URLs firmadas de terceros.
4. Obtener bytes:
   - `foto_url`: `fetch(foto_url, { signal: AbortSignal.timeout(8000) })`.
   - Verificar `content-type` ∈ `image/jpeg`, `image/png`, `image/webp`.
   - Verificar `content-length` ≤ 5 MB y, después de leer, que el buffer real ≤ 5 MB.
   - `imagen_base64`: quitar prefijo `data:image/...;base64,` si existe; validar base64; tamaño decodificado ≤ 4 MB.
5. Verificar `GOOGLE_VISION_API_KEY` con un `if (!apiKey) throw` explícito. No usar `?.`.
6. Llamar a Vision:
   ```ts
   const res = await fetch('https://vision.googleapis.com/v1/images:annotate', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'X-Goog-Api-Key': apiKey,
     },
     body: JSON.stringify({
       requests: [{
         image: { content: buffer.toString('base64') },
         features: [{ type: 'LABEL_DETECTION', maxResults: 10 }],
       }],
     }),
     signal: AbortSignal.timeout(8000),
   });
   ```
7. Si `!res.ok`:
   - `const texto = await res.text();`
   - `console.error('[vision] HTTP', res.status, texto.slice(0, 2000));`
   - Devolver `{ success: false, message: 'No se pudo analizar la imagen.' }`.
8. Parsear `responses[0].labelAnnotations`.
9. Sanitizar:
   - Filtrar `score >= 0.60`.
   - `etiqueta = description.trim().slice(0, 80)`.
   - Deduplicar por etiqueta en minúsculas.
   - Ordenar por score descendente.
   - Máximo 10.
10. Devolver:
    ```ts
    {
      success: true,
      etiquetas: string[],
      sugerencias: Array<{ etiqueta: string; score: number }>
    }
    ```
11. **No escribir en Firestore.** La acción es stateless y solo sugiere.

### 3.4 Mapeo de etiquetas

`src/lib/actions/vision-mapping.ts`:

```ts
const MAPA_CATEGORIAS: Record<string, string> = {
  'tire': 'LLANTAS',
  'automotive tire': 'LLANTAS',
  'brake': 'FRENOS',
  'vehicle brake': 'FRENOS',
  'battery': 'BATERIAS',
  'car battery': 'BATERIAS',
  'motor oil': 'ACEITES',
  'oil': 'ACEITES',
  'air filter': 'FILTROS',
  'spark plug': 'ENCENDIDO',
  'shock absorber': 'SUSPENSION',
  'chain': 'TRANSMISION',
  'sprocket': 'TRANSMISION',
  'helmet': 'ACCESORIOS',
};
```

La UI puede pre-llenar `referencia_sugerida` con la etiqueta de mayor score, pero **no** debe asumir que esa etiqueta es una referencia comercial. `referencia_confirmada` siempre la escribe o valida el asesor.

### 3.5 Contrato con la UI

- La UI llama a `analizarImagenRepuesto` al tomar/seleccionar la foto.
- Las etiquetas se muestran como chips y sugerencias.
- El asesor puede sobrescribir `referencia_sugerida` y debe confirmar `referencia_confirmada`.
- Nunca hay autosave ni escritura automática en Firestore.
- Si Vision falla, el formulario sigue funcionando manualmente.
- Las etiquetas finales se envían a `crearConteoPendiente` dentro de `etiquetas_vision`; el servidor las valida y las guarda en `fotos_inventario`.

### 3.6 Reglas de Firebase Storage

Si no existe `storage.rules` en el repo, crearlo y referenciarlo en `firebase.json`, o aplicar el equivalente en consola:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /inventario_repuestos/{asesorEmail}/{archivo} {
      allow read: if request.auth != null
        && (
          request.auth.token.email.lower() == asesorEmail
          || request.auth.token.email.lower() in [
            'admin@tiendalasmotos.com'
          ]
        );
      allow write: if request.auth != null
        && request.auth.token.email.lower() == asesorEmail
        && request.resource.size <= 5 * 1024 * 1024
        && request.resource.contentType.matches('image/(jpeg|png|webp)');
    }
  }
}
```

**Nota:** la regla de admin por email hardcodeado es solo ilustrativa. En producción debe resolverse contra `sys_admin_users` o mantenerse la escritura de admin vía Admin SDK. El asesor solo puede escribir en su propio prefijo.

### 3.7 Variables de entorno

- `GOOGLE_VISION_API_KEY` — **solo servidor**. Nunca `NEXT_PUBLIC_`.
- Configurarla en Cloud Run como variable de entorno o secreto (Secret Manager), no solo en el build de GitHub Actions.
- Restringir la API key a Cloud Vision API.
- Habilitar facturación y la API en el proyecto.
- Costo de referencia: ~$1.50 USD por 1000 imágenes; primeros 1000/mes gratis. Aplicar cuota y monitoreo.

### 3.8 Dependencias

- Nuevas dependencias npm: ninguna. Se usa `fetch` nativo.
- No se agrega `@google-cloud/vision`; evita peso y credenciales adicionales.
- Si se elige base64, no se agrega dependencia; solo se ajusta `next.config.ts`.

### 3.9 Pruebas del Punto 3

- Sin `GOOGLE_VISION_API_KEY` → error explícito, sin llamada externa.
- `foto_url` de otro host → rechazo.
- `foto_url` fuera del prefijo del asesor → rechazo.
- Imagen > 5 MB o MIME no permitido → rechazo.
- Respuesta 403/429/500 → `console.error` con status y body truncado; mensaje genérico.
- Timeout de 8 s → log y error controlado.
- `labelAnnotations` vacío o scores < 0.60 → `success: true` con lista vacía.
- Etiquetas con caracteres extraños o > 80 chars → sanitizadas.
- La acción no crea ni actualiza documentos.
- `tsc/build/lint` en EXIT 0.

---

## 4. Punto 4 — Estrategia PWA Offline-First

### 4.1 Archivos

| Archivo | Acción |
|---|---|
| `public/manifest.json` | Crear. |
| `public/sw.js` | Crear: service worker manual. |
| `public/offline.html` | Crear: fallback offline. |
| `public/icons/icon-192.png` | Crear asset. |
| `public/icons/icon-512.png` | Crear asset. |
| `public/icons/icon-maskable-512.png` | Crear asset. |
| `src/app/layout.tsx` | Modificar: metadata manifest, themeColor, `PwaRegistrar`. |
| `src/components/PwaRegistrar.tsx` | Crear: registro del SW solo para asesor. |
| `src/components/OfflineIndicator.tsx` | Crear: indicador visual online/offline y cola pendiente. |
| `src/lib/firebase.ts` | Modificar: persistencia offline condicionada. |
| `src/context/AuthContext.tsx` | Modificar: flag de rol, espera de persistencia, purga en logout. |
| `src/lib/offline/outbox.ts` | Crear: cola IndexedDB de conteos. |
| `src/hooks/useOfflineQueue.ts` | Crear: hook de sincronización y estado. |
| `firebase.json` | Modificar: headers de `/sw.js`, `/manifest.json`, `/icons/**`, `/_next/static/**`. |

### 4.2 `public/manifest.json`

```json
{
  "id": "/admin/inventory",
  "name": "Tienda Las Motos — Inventario de Repuestos",
  "short_name": "TLM Inventario",
  "description": "Conteo y aprobación de inventario de repuestos",
  "lang": "es-CO",
  "dir": "ltr",
  "start_url": "/admin/inventory?pwa=asesor",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#020617",
  "theme_color": "#dc2626",
  "categories": ["business", "productivity"],
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

**Nota:** `start_url` debe apuntar a la ruta que el asesor sí pueda abrir. El guard actual de `/admin/inventory` es `soloAdmin`; debe ajustarse en el plan de UI. Si la ruta final cambia, solo se modifica este string. No debe apuntar a `/admin/simulador`.

Inyección en `src/app/layout.tsx`:

```ts
export const metadata: Metadata = {
  title: "Tienda Las Motos",
  description: "Gestión de inventario y ventas",
  manifest: "/manifest.json",
  applicationName: "Tienda Las Motos",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TLM Inventario",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#dc2626",
};
```

### 4.3 Service Worker

**Decisión:** service worker manual en `public/sw.js`. No se usa `next-pwa` para evitar incompatibilidades con Next.js 16 / Turbopack y para mantener el control del cacheo.

Comportamiento:

- Cache versionada: `tlm-shell-v1`.
- `install`: precachear `/offline.html`, `/manifest.json`, `/icons/icon-192.png`, `/icons/icon-512.png`.
- `activate`: borrar cachés viejas y tomar control.
- `fetch`:
  - Solo `GET`.
  - Solo mismo origen.
  - No cachear `/api/*`, `_rsc`, Firestore (`firestore.googleapis.com`), Auth ni Storage.
  - Navegación: solo allowlist `/admin/inventory`; network-first con fallback a la última copia y, si no existe, a `/offline.html`.
  - Estáticos `/_next/static/*` e `/icons/*`: cache-first.
  - Nunca cachear POST ni respuestas de Server Actions.
- No cachear HTML autenticado con PII de rutas no allowlisted.

Registro: `src/components/PwaRegistrar.tsx`

```tsx
"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

export default function PwaRegistrar() {
  const { role, loading } = useAuth();

  useEffect(() => {
    if (loading || role !== "asesor") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((error) =>
        console.error("[pwa] Registro del service worker falló:", error)
      );
  }, [role, loading]);

  return null;
}
```

Montar `PwaRegistrar` dentro de `AuthProvider` en `src/app/layout.tsx`.

### 4.4 Persistencia offline de Firestore

**Requisito literal:** `enableIndexedDbPersistence()` en `src/lib/firebase.ts`, condicionado al rol `asesor`.

**Problema de orden:** `firebase.ts` se evalúa antes de que `AuthContext` resuelva el rol. No se puede consultar `role` en el módulo. Solución:

1. `AuthContext` resuelve el rol y, si es `asesor`, escribe un flag no sensible en `localStorage`: `tlm_offline_asesor = '1'`.
2. Si el flag cambió de ausente a presente y la persistencia aún no está activa, se hace **una recarga única** de la PWA. Un guard en `sessionStorage` (`tlm_offline_reload_done`) evita bucles.
3. En la recarga, `src/lib/firebase.ts` lee el flag al inicializar y llama a `enableIndexedDbPersistence(db)` antes de que cualquier hook consulte Firestore.
4. Exportar `persistenciaOfflineLista` (promesa) y hacer que `AuthContext` la espere antes de su primer `getDoc` y antes de la suscripción a `sys_permissions_matrix`.
5. Si el rol no es `asesor`, el flag se elimina y no se activa persistencia.

Implementación conceptual en `src/lib/firebase.ts`:

```ts
import {
  getFirestore,
  enableIndexedDbPersistence,
  type Firestore,
} from "firebase/firestore";

const CLAVE_FLAG_ASESOR = "tlm_offline_asesor";

const esNavegador = typeof window !== "undefined";
const persistenciaSolicitada =
  esNavegador && window.localStorage.getItem(CLAVE_FLAG_ASESOR) === "1";

db = getFirestore(app);

export const persistenciaOfflineLista: Promise<void> = persistenciaSolicitada
  ? enableIndexedDbPersistence(db).catch((error) => {
      console.error("[firebase] Persistencia offline no disponible:", error);
    })
  : Promise.resolve();
```

**Manejo de errores:**

- `failed-precondition`: otra pestaña tiene la persistencia. Loguear y continuar en memoria.
- `unimplemented`: navegador incompatible o modo privado. Loguear y continuar en memoria.
- No hacer fallback silencioso: siempre `console.error`.

**Deuda técnica documentada:** en Firebase JS SDK v11 `enableIndexedDbPersistence` está deprecada. El reemplazo canónico es `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`. Se mantiene la API literal por requisito explícito; si el Director autoriza deuda cero, se cambia al reemplazo canónico con el mismo efecto funcional.

**Purga en logout:**

```ts
import { clearIndexedDbPersistence, terminate } from "firebase/firestore";

export async function purgarPersistenciaOffline() {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
    window.localStorage.removeItem("tlm_offline_asesor");
  } catch (error) {
    console.error("[firebase] No se pudo purgar IndexedDB:", error);
  }
}
```

Llamar a `purgarPersistenciaOffline()` en `logout()` de `AuthContext`, después de `signOut(auth)`. Limpiar también el outbox y las cachés del service worker.

### 4.5 Cola de escrituras offline (outbox)

**Aclaración crítica:** `enableIndexedDbPersistence()` cachea lecturas y encola escrituras hechas con el SDK cliente. Las Server Actions son POST y **no se ejecutan offline**. Por eso el flujo del asesor necesita un outbox local:

- `src/lib/offline/outbox.ts` con IndexedDB `tlm_offline`.
- Store `borradores_conteos`: payload de `crearConteoPendiente`, `conteo_id`, `intentos`, `estado_envio`.
- Store `fotos_borrador`: Blob comprimido, `storage_path`, `conteo_id`.
- Flujo:
  1. El asesor guarda el conteo → se escribe primero en el outbox.
  2. Si hay conexión, se sube la foto a Storage.
  3. Se llama `crearConteoPendiente` con el `conteo_id` ya generado.
  4. Si responde `success`, se elimina el borrador.
  5. Si falla por red, se conserva y se reintenta en `online` o al abrir la app.
- `conteo_id` se genera con `crypto.randomUUID()` al crear el borrador y no cambia en los reintentos. Esto da idempotencia sin agregar campos al schema.
- Fotos: comprimir a ≤ 1.5 MB, máximo 5 MB. Una foto por conteo según el schema.
- Reintentos con backoff exponencial y estado visible. Nunca descartar silenciosamente.
- `navigator.onLine` no es confiable: intentar la operación y tratar el error.

### 4.6 Indicador visual offline

`src/components/OfflineIndicator.tsx`:

- Escucha `online`/`offline`.
- Muestra:
  - “Sin conexión — los conteos se guardarán localmente”.
  - “N pendientes por sincronizar” leyendo el outbox.
  - “Sincronizando…” durante el replay.
- Montar en `src/app/admin/layout.tsx` o en la pantalla de inventario del asesor.
- No bloquear el formulario cuando está offline.

### 4.7 Headers de Firebase Hosting

El bloque global actual aplica `Cache-Control: no-cache, no-store, must-revalidate` a `**`, lo que bloquea el cacheo del shell PWA. Agregar overrides **después** del bloque global y verificar con `curl -I` en beta:

```json
{
  "source": "/sw.js",
  "headers": [
    { "key": "Cache-Control", "value": "no-cache, max-age=0, must-revalidate" },
    { "key": "Service-Worker-Allowed", "value": "/" }
  ]
},
{
  "source": "/manifest.json",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=3600" }
  ]
},
{
  "source": "/icons/**",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
  ]
},
{
  "source": "/_next/static/**",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
  ]
}
```

### 4.8 Dependencias y variables de entorno

- Nuevas dependencias npm: ninguna obligatoria. Se usa service worker manual e IndexedDB nativo.
- Opcional: `idb` para simplificar el wrapper de IndexedDB. No es necesario para el MVP.
- No se agrega `next-pwa` por compatibilidad con Next.js 16 / Turbopack.
- Variables de entorno nuevas: ninguna para PWA.
- Las variables de Firebase existentes (`NEXT_PUBLIC_FIREBASE_*`) se mantienen.

### 4.9 Pruebas del Punto 4

- Lighthouse: manifest válido, iconos 192/512, `start_url` responde 200 para asesor, service worker registrado.
- Android Chrome: instalar, abrir standalone, matar la app, abrir offline → shell y datos cacheados.
- iOS Safari: “Agregar a pantalla de inicio”, validar `navigator.standalone` y persistencia.
- Offline: leer inventario cacheado; crear borrador; cerrar app; reconectar; verificar un solo documento creado.
- Reintento con el mismo `conteo_id` → no duplica.
- Logout: IndexedDB, flag y cachés del SW quedan vacías.
- Admin en desktop: no se activa persistencia (salvo que instale la PWA en móvil).
- `curl -I` sobre `/sw.js`, `/manifest.json` y `/icons/icon-192.png` para confirmar headers.
- `tsc/build/lint` en EXIT 0.

---

## 5. Orden de ejecución atómico

| Orden | Punto | Commit sugerido | Depende de |
|---|---|---|---|
| 1 | `roles.ts` + semilla de matriz + tests | `feat(roles): add asesor and repuestos collections` | — |
| 2 | Server Actions de aprobación + reglas + índices | `feat(repuestos): approval flow and append-only ledger` | Punto 1 |
| 3 | Server Action de Vision + Storage rules | `feat(repuestos): vision label suggestions` | Punto 2 (contrato de fotos) |
| 4 | Manifest + SW + persistencia + outbox | `feat(pwa): asesor offline-first repuestos` | Puntos 1–3 |

Cada commit debe pasar:

```bash
npx tsc --noEmit
npm run lint
npm run build
npx tsx src/test/utils/roles.test.ts
```

Certificación en beta primero. No merge a producción hasta validar reglas, matriz, Vision y PWA en dispositivo real.

---

## 6. Fuera de alcance / precondiciones

Estos elementos no forman parte de los 4 puntos, pero bloquean la certificación si no se resuelven:

- Pantallas UI de conteo, aprobación, galería y captura de fotos.
- Ruta real del asesor y ajuste del guard de `/admin/inventory`.
- `landingPorRol`, `MAPA_NODOS`, sidebar y dropdown de usuarios.
- Reglas de Firebase Storage para `inventario_repuestos/{asesor_email}/**`.
- Habilitación de Cloud Vision API, facturación, API key y variable de entorno en Cloud Run.
- Iconos PNG reales de 192/512/maskable.
- Pruebas de instalación PWA en Android e iOS.

**Resultado esperado:** rol `asesor` con permisos mínimos, flujo de aprobación transaccional y auditado, sugerencias de Vision que nunca sobrescriben al humano, y una PWA que permite leer y guardar conteos offline sin debilitar el Faraday Cage de las Server Actions.



