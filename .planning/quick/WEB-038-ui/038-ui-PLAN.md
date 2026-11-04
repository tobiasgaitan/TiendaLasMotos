# WEB-038-UI — Plan atómico de interfaz

> **Estado:** plan únicamente. No se implementa código en este turno.
>
> **Alcance:** tres puntos atómicos:
> 1. Ruteo/visibilidad del rol `asesor` y alta de `asesor` en usuarios.
> 2. Pantalla móvil de conteo del asesor, con cámara, Storage, Vision y outbox offline.
> 3. Dashboard de aprobaciones/rechazos para `admin`/`superadmin`.
>
> **Fuente de verdad:** el backend WEB-038 ya desplegado y certificado; las Server Actions, colecciones, reglas y claves existentes se consumen, no se recrean.

---

## 0. Contratos, decisiones y límites

### 0.1 NAMING LOCK — inmutable

No se renombran ni se reinterpretan:

| Elemento | Valor canónico |
|---|---|
| Colección maestra | `inventario_repuestos` |
| Conteos pendientes | `conteos_pendientes_repuestos` |
| Fotos | `fotos_inventario` |
| Ledger | `historial_auditoria_inventario` |
| Storage | `inventario_repuestos/{asesor_email}/{uuid}.{ext}` |
| Rol | `asesor` |
| Acciones | `crearConteoPendiente`, `analizarImagenRepuesto`, `listarPendientes`, `aprobarConteo`, `rechazarConteo` |
| Campos | `conteo_id`, `referencia_sugerida`, `referencia_confirmada`, `cantidad_contada`, `ubicacion`, `anotaciones`, `foto_url`, `storage_path`, `nombre_archivo`, `mime_type`, `tamano_bytes`, `etiquetas_vision`, `datos_maestro`, `motivo_rechazo` |

### 0.2 Rutas finales

| Ruta | Rol | Uso |
|---|---|---|
| `/admin/inventario-asesor` | `asesor` | Conteo móvil, cámara, Vision, offline |
| `/admin/inventario-aprobaciones` | `admin`, `superadmin` | Revisión, aprobación y rechazo |
| `/admin/inventory` | `admin`, `superadmin` | Inventario de motos existente; **no se toca** |

### 0.3 Decisiones de arquitectura

**D1 — Rutas dedicadas y actualización del PWA.**
Se usan las rutas solicitadas. El PWA certificado apuntaba a `/admin/inventory?pwa=asesor`; esa ruta es el inventario de motos y no debe mezclarse con repuestos. Por tanto, el `start_url`/`id` del manifiesto y la allowlist del service worker deben trasladarse a `/admin/inventario-asesor`. Esto obliga a revalidar el Punto 4 del PWA y a versionar el caché. Ver sección 4.

**D2 — Cero dependencias nuevas.**
Se reutilizan `firebase`, `firebase/storage`, `next/image`, `lucide-react`, `sonner`, `zod`, `ModalWrapper`, el compresor del outbox y la cámara nativa del navegador. No se agrega ninguna librería de cámara, formularios o modales.

**D3 — El backend no se reimplementa.**
La UI llama exclusivamente a las Server Actions existentes y al outbox existente. No se crean acciones de Firestore nuevas. No se modifican `firestore.rules` ni `storage.rules`.

**D4 — `conteo_id` estable entre Vision, submit online y cola offline.**
El formulario genera un UUID al seleccionar/cambiar la foto. Ese mismo ID se usa para:
- la ruta de Storage,
- el análisis de Vision,
- el `crearConteoPendiente` online,
- el borrador del outbox si se cae la red.

Para lograrlo se amplía el outbox con un parámetro opcional `conteoId` y, si la foto ya fue subida, con la metadata de subida. Es un cambio de cliente, no de contrato de Firestore.

**D5 — Autorización en dos capas.**
- Capa de autenticación: `src/app/admin/layout.tsx` ya monta `ProtectedRoute allowedRoles={[...ROLES]}`.
- Capa de autorización fina: cada página devuelve `<AccesoDenegado />` si el rol no corresponde. No se usa un segundo `ProtectedRoute` porque su comportamiento actual redirige a `/` y ocultaría el mensaje de denegación solicitado.

### 0.4 Fuera de alcance

- `pagina/catalogo/items`, scraping, bot y cualquier lógica del inventario de motos.
- Cambios en `firestore.rules` o `storage.rules`.
- Nuevas colecciones, campos o Server Actions.
- Borrado físico de fotos o documentos.
- Realtime en aprobaciones: la lista se refresca al cargar y después de cada acción.

---

## 1. Punto 1 — Ruteo y visibilidad del asesor

### 1.1 Archivos

| Operación | Archivo | Cambio |
|---|---|---|
| Modificar | `src/lib/auth/sidebar-visibility.ts` | Nuevos nodos y requisito por rol |
| Modificar | `src/lib/auth/landing.ts` | `asesor` → `/admin/inventario-asesor` |
| Modificar | `src/components/AdminSidebar.tsx` | Enlaces de conteo y aprobaciones |
| Modificar | `src/app/admin/users/page.tsx` | Opción `Asesor` en el selector |
| Modificar | `functions/src/sendUserInvitation.ts` | Tipo y etiqueta `Asesor` en la invitación |
| Modificar | `src/test/utils/sidebar-visibility.test.ts` | Casos de los nodos nuevos |
| Modificar | `src/test/utils/landing.test.ts` | Caso `asesor` |
| Modificar | `src/test/utils/users-actions.test.ts` | Aceptación del rol `asesor` |

No se modifica `src/lib/actions/users-schemas.ts`: `ROLES` ya incluye `asesor` y `rolSchema` ya lo acepta.

### 1.2 Cambios exactos

#### `src/lib/auth/sidebar-visibility.ts`

- Ampliar `NodoSidebar`:

```ts
export type NodoSidebar =
    | 'simuladores'
    | 'inventario'
    | 'inventario-asesor'
    | 'inventario-aprobaciones'
    | 'prospectos'
    | 'config'
    | 'config-usuarios'
    | 'creditos-contratos'
    | 'creditos-pagos'
    | 'creditos-remisiones'
    | 'creditos-inversores'
    | 'creditos-auditoria';
```

- Ampliar `RequisitoNodo` para permitir roles explícitos:

```ts
type RequisitoNodo =
    | { soloAdmin: true }
    | { coleccion: ColeccionPermiso; accion: Accion; rolesPermitidos?: Rol[] };
```

- Registrar:

```ts
'inventario-asesor': {
    coleccion: 'conteos_pendientes_repuestos',
    accion: 'create',
    rolesPermitidos: ['asesor'],
},
'inventario-aprobaciones': {
    coleccion: 'conteos_pendientes_repuestos',
    accion: 'update',
    rolesPermitidos: ['admin', 'superadmin'],
},
```

- Mantener sin cambios:

```ts
inventario: { soloAdmin: true },
simuladores: { soloAdmin: true },
prospectos: { soloAdmin: true },
```

- En `puedeVerNodo`, después de validar el rol:

```ts
if (req.rolesPermitidos && !req.rolesPermitidos.includes(rol as Rol)) {
    return false;
}
return puede(matriz[rol as Rol], req.coleccion, req.accion);
```

Resultado esperado:

| Rol | `inventario` (motos) | `inventario-asesor` | `inventario-aprobaciones` |
|---|---:|---:|---:|
| `asesor` | No | Sí | No |
| `admin` | Sí | No | Sí |
| `superadmin` | Sí | No | Sí |
| `auditor` | No | No | No |
| `cobrador` | No | No | No |
| `inversor` | No | No | No |

#### `src/lib/auth/landing.ts`

```ts
export function landingPorRol(rol: string | null | undefined): string {
    const r = (rol ?? '').toLowerCase().trim();
    if (r === 'asesor') return '/admin/inventario-asesor';
    if (r === 'admin_creditos') return '/admin/creditos';
    return '/admin/simulador';
}
```

Actualizar el comentario del contrato. No se modifica `RoleBasedRedirect`: el login sigue entrando por `/admin/simulador?defaultLanding=1` y el helper redirige al asesor a su ruta.

#### `src/components/AdminSidebar.tsx`

- Importar iconos adicionales de `lucide-react` (`Camera`/`ClipboardList` y `ClipboardCheck`).
- Insertar los enlaces en el bloque de ítems simples, con las mismas clases visuales del sidebar:

```tsx
{!loading && puedeVerNodo('inventario-asesor') && (
    <Link
        href="/admin/inventario-asesor"
        className={`flex items-center gap-3 p-2 text-sm font-medium rounded-lg transition-colors ${
            isActive('/admin/inventario-asesor')
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
    >
        <Camera className="w-5 h-5" />
        Conteo de Repuestos
    </Link>
)}

{!loading && puedeVerNodo('inventario-aprobaciones') && (
    <Link
        href="/admin/inventario-aprobaciones"
        className={`flex items-center gap-3 p-2 text-sm font-medium rounded-lg transition-colors ${
            isActive('/admin/inventario-aprobaciones')
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
    >
        <ClipboardCheck className="w-5 h-5" />
        Aprobaciones de Repuestos
    </Link>
)}
```

- Conservar el enlace existente `Inventario` → `/admin/inventory` con `puedeVerNodo('inventario')`.
- No mostrar “Aprobaciones” a `asesor` ni “Conteo de Repuestos” a `admin`/`superadmin`.

#### `src/app/admin/users/page.tsx`

Agregar en el `<select id="user-rol">`:

```tsx
<option value="asesor">Asesor</option>
```

Preferiblemente entre `Cobrador` y `Administrador`. El valor se guarda como `rol` canónico mediante el schema existente.

#### `functions/src/sendUserInvitation.ts`

- Añadir `asesor` a la unión de `InvitationData.role`.
- Añadir `asesor: 'Asesor'` a `roleNames`.

Esto evita que la invitación muestre el identificador crudo. No se cambia la autorización de la función ni se toca `usuryRateBot.ts`.

### 1.3 Guardas y defensa en profundidad

- `landingPorRol` no concede acceso por sí solo; solo decide el destino posterior al login.
- El sidebar es una ayuda visual, no una frontera de seguridad.
- Las fronteras reales son las guardas de página del Punto 2 y Punto 3, más las Server Actions.
- `/admin/inventory` seguirá devolviendo `AccesoDenegado` a `asesor` porque su nodo sigue siendo `soloAdmin`.
- Si un `asesor` navega manualmente a `/admin/inventario-aprobaciones`, la página debe devolver `<AccesoDenegado />`. Si un `admin` navega a `/admin/inventario-asesor`, igual.

### 1.4 Pruebas de validación

Unitarias/estáticas:

- `src/test/utils/sidebar-visibility.test.ts`:
  - `asesor` ve `inventario-asesor`.
  - `asesor` no ve `inventario-aprobaciones` ni `inventario`.
  - `admin` y `superadmin` ven `inventario-aprobaciones`.
  - `admin` y `superadmin` no ven `inventario-asesor`.
  - `auditor`, `cobrador`, `inversor` y `guest` no ven los nodos nuevos.
- `src/test/utils/landing.test.ts`:
  - `asesor` → `/admin/inventario-asesor`.
  - `admin_creditos` conserva `/admin/creditos`.
  - El resto conserva `/admin/simulador`.
- `src/test/utils/users-actions.test.ts`:
  - `userCreateSchema.parse({ nombre, email, rol: 'asesor', active: true })` es válido.
- Verificación manual:
  - Login como `asesor` termina en `/admin/inventario-asesor`.
  - Sidebar del asesor: solo “Conteo de Repuestos” (más sus nodos permitidos); no “Inventario”, no “Aprobaciones”.
  - Admin: ve “Inventario” y “Aprobaciones de Repuestos”; no ve “Conteo de Repuestos”.
  - El formulario de usuarios permite crear un `asesor`.
  - La invitación muestra “Asesor”.

### 1.5 Criterio de aceptación

- El asesor no depende de `/admin/inventory` ni del inventario de motos.
- El admin conserva el inventario de motos intacto.
- No hay rutas nuevas visibles para roles no autorizados.
- No hay cambios en colecciones, reglas ni campos.

---

## 2. Punto 2 — Pantalla móvil de conteo del asesor

### 2.1 Archivos

| Operación | Archivo | Cambio |
|---|---|---|
| Crear | `src/app/admin/inventario-asesor/page.tsx` | Ruta, guarda de rol y shell |
| Crear | `src/app/admin/inventario-asesor/ConteoAsesorForm.tsx` | Formulario y flujo online/offline |
| Crear | `src/components/inventario/FotoConteoPicker.tsx` | Cámara nativa, preview y validación local |
| Crear | `src/components/inventario/SugerenciasVision.tsx` | Chips de etiquetas/sugerencias |
| Crear | `src/components/inventario/AccesoDenegado.tsx` | Estado de denegación reutilizable |
| Crear | `src/lib/offline/upload-foto.ts` | Compresión y subida a Storage |
| Modificar | `src/hooks/useOfflineQueue.ts` | Pasar `conteoId`/foto ya subida al outbox |
| Modificar | `src/lib/offline/outbox.ts` | Aceptar `conteoId` estable y metadata de foto |
| Modificar | `public/manifest.json` | `id`/`start_url` al nuevo route |
| Modificar | `public/sw.js` | Allowlist y caché del nuevo route |
| Modificar | `src/lib/offline/outbox-utils.ts` | `esRutaInventario` alineado |
| Modificar | `src/test/utils/pwa.test.ts` | Nuevas expectativas del PWA |

### 2.2 Dependencias nuevas

**Ninguna.** Se usa:

- `firebase/storage` (`ref`, `uploadBytes`, `getDownloadURL`).
- `firebase/firestore` solo para lecturas de aprobación (Punto 3).
- `lucide-react`, `sonner`, `next/image`.
- `prepararFotoConteo`, `construirStoragePath`, `normalizarNombreArchivo`, `generarConteoId` del outbox existente.
- `crearConteoPendiente` y `analizarImagenRepuesto` existentes.

### 2.3 Guarda de la ruta

`src/app/admin/inventario-asesor/page.tsx`:

```tsx
'use client';

import { useAuth } from '@/context/AuthContext';
import AccesoDenegado from '@/components/inventario/AccesoDenegado';
import ConteoAsesorForm from './ConteoAsesorForm';

export default function InventarioAsesorPage() {
    const { user, role, loading } = useAuth();

    if (loading) {
        return <div role="status">Cargando…</div>;
    }

    if (role !== 'asesor') {
        return <AccesoDenegado mensaje="Esta pantalla es exclusiva del rol asesor." />;
    }

    if (!user || typeof user.email !== 'string' || !user.email) {
        return <AccesoDenegado mensaje="Sesión inválida. Vuelve a iniciar sesión." />;
    }

    return <ConteoAsesorForm />;
}
```

Notas:

- La autenticación la aporta `AdminLayout` + `ProtectedRoute`.
- No se usa `user?.email` en esta validación crítica: se comprueba `!user` primero.
- La página no recibe datos por props; el formulario obtiene `user`/`role` del contexto.

### 2.4 Cámara y foto

`FotoConteoPicker`:

- Input nativo:

```tsx
<input
    type="file"
    accept="image/jpeg,image/png,image/webp"
    capture="environment"
    aria-label="Tomar o elegir foto del repuesto"
    onChange={handleChange}
/>
```

- `capture="environment"` abre la cámara trasera en móviles compatibles; en escritorio cae al selector de archivos. No se usa `getUserMedia`, por lo que no hay permisos extra ni nueva dependencia.
- Validar antes de aceptar:
  - `esMimeFotoPermitido(file.type)`.
  - `file.size <= MAX_FOTO_BYTES` (5 MB).
- Mostrar preview local con `URL.createObjectURL`; revocar el objeto anterior al cambiar/desmontar.
- Ofrecer “Repetir foto” y “Quitar”; al cambiar la foto se invalida la subida anterior y se genera un nuevo `conteo_id`.
- Mensajes de error claros: formato no permitido, archivo demasiado grande, cámara no disponible.
- No se sube la foto al seleccionarla si el usuario está offline; se conserva el `File`/`Blob` para el outbox.

### 2.5 Subida a Storage

`src/lib/offline/upload-foto.ts`:

```ts
export interface FotoSubida {
    foto_url: string;
    storage_path: string;
    nombre_archivo: string;
    mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
    tamano_bytes: number;
}

export async function prepararYSubirFoto(
    foto: File | Blob,
    asesorEmail: string,
    conteoId: string
): Promise<FotoSubida>
```

Implementación:

- Validar `asesorEmail` y `conteoId` (UUID) antes de tocar Storage.
- `prepararFotoConteo(foto, conteoId)` para comprimir a ≤1.5 MB y normalizar MIME/nombre.
- `construirStoragePath(asesorEmail, conteoId, mime_type)`.
- `normalizarNombreArchivo(...)`.
- Subir con:

```ts
const storageRef = ref(storage, storagePath);
await uploadBytes(storageRef, preparada.blob, {
    contentType: preparada.mime_type,
    customMetadata: { conteo_id: conteoId },
});
const foto_url = await getDownloadURL(storageRef);
```

- La ruta resultante debe ser exactamente:

```text
inventario_repuestos/{asesor_email}/{uuid}.{ext}
```

- `try/catch` con `console.error('[inventario-ui] ...', error)` antes de propagar o devolver el fallo.
- No se crea una Server Action de subida: Storage Rules ya limita la escritura al prefijo del asesor autenticado y el outbox certificado ya usa este mismo camino.

### 2.6 Formulario

Campos editables:

| Campo | Regla |
|---|---|
| Foto | Obligatoria; JPG/PNG/WebP; ≤5 MB; compresión ≤1.5 MB |
| `referencia_sugerida` | Opcional; ≤64; se puede prellenar con la mejor etiqueta de Vision |
| `referencia_confirmada` | Obligatoria; `^[A-Z0-9][A-Z0-9._-]{0,63}$` |
| `descripcion` | Obligatoria; 2–200 caracteres |
| `cantidad_contada` | Entero; 0–1,000,000 |
| `ubicacion` | Obligatoria; `^[A-Z]-\d{2}-\d{2}$`; placeholder `A-01-05` |
| `anotaciones` | Opcional; ≤500 |
| `etiquetas_vision` | Solo lectura/edición por chips; ≤10 |

- `referencia_confirmada` y `ubicacion` se normalizan a mayúsculas al salir del campo, pero el servidor vuelve a validar.
- `referencia_sugerida` no se copia automáticamente a `referencia_confirmada`; el asesor debe confirmar.
- Mostrar el `conteo_id` no es necesario; se mantiene en estado.
- Botón “Guardar conteo” deshabilitado mientras se sube, analiza o guarda.

### 2.7 Flujo de Vision

1. Si hay conexión, tras seleccionar la foto:
   - `prepararYSubirFoto(foto, email, conteoId)`.
   - Obtener actor:

```ts
const idToken = await user.getIdToken();
const actor = { uid: user.uid, idToken };
```

   - Llamar:

```ts
const resultado = await analizarImagenRepuesto(
    { foto_url: subida.foto_url },
    actor
);
```

2. Si `resultado.success`:
   - Guardar `resultado.etiquetas` en el estado de sugerencias.
   - Mostrar chips con `resultado.sugerencias` (etiqueta + score).
   - Si `referencia_sugerida` está vacía, prellenarla con la etiqueta de mayor score.
   - No escribir en Firestore.
3. Si falla:
   - Mostrar aviso no bloqueante (“No se pudo analizar la imagen; puedes completar manualmente”).
   - Mantener la foto y el formulario utilizables.
   - No encolar un análisis fallido.
4. Si no hay conexión:
   - No llamar a Vision.
   - Mostrar “Sin conexión: el análisis de imagen no está disponible; el conteo se guardará para enviarse después”.
   - Conservar la foto local para el outbox.

`analizarImagenRepuesto` es stateless y no debe crear documentos; la UI no debe intentar persistir sus sugerencias por separado.

### 2.8 Flujo de guardado online/offline

El formulario mantiene un solo `conteoId` por foto. Al cambiar la foto se genera uno nuevo con `generarConteoId()`.

#### Caso A — Online y subida/action exitosas

1. Si la foto ya fue subida para Vision, reutilizar `fotoSubida`.
2. Si no, ejecutar `prepararYSubirFoto`.
3. Llamar directamente a `crearConteoPendiente` con:

```ts
{
    conteo_id: conteoId,
    referencia_sugerida,
    referencia_confirmada,
    descripcion,
    cantidad_contada,
    ubicacion,
    anotaciones,
    foto_url: fotoSubida.foto_url,
    storage_path: fotoSubida.storage_path,
    nombre_archivo: fotoSubida.nombre_archivo,
    mime_type: fotoSubida.mime_type,
    tamano_bytes: fotoSubida.tamano_bytes,
    etiquetas_vision,
}
```

4. Si `success === true` (o `idempotente === true`):
   - `toast.success('Conteo enviado a revisión.')`.
   - Limpiar formulario, preview y `fotoSubida`.
   - Generar un nuevo `conteoId`.
   - `await refrescarPendientes()`.
5. Si `success === false`:
   - Mostrar `message` al usuario.
   - No encolar automáticamente un error de validación; el asesor debe corregir.

#### Caso B — Offline o fallo de red

1. Si no hay conexión, o si la subida/action lanza una excepción de red:
   - Llamar al outbox con el **mismo** `conteoId`:

```ts
await encolarConteo(entrada, foto, email, {
    conteoId,
    fotoSubida, // si la subida ya se completó
});
```

   - El outbox guarda el borrador y la foto (o la URL ya subida).
   - `toast.success('Guardado en el dispositivo. Se enviará al recuperar conexión.')`.
   - Limpiar el formulario.
   - No se pierde el conteo si el navegador se cierra.
2. Si `crearConteoPendiente` devuelve `success: false` por un error de infraestructura (timeout, Firestore no disponible, error interno), **no** descartar el formulario: mostrar `message` y ofrecer “Guardar para reintentar”; al aceptar, encolar con el mismo `conteoId`.
   - Si el mensaje corresponde a validación/autorización (por ejemplo, “Datos inválidos”, “No autorizado”, “Faltan datos”), mostrar el error y no encolar: el asesor debe corregir.
   - Registrar con `console.error` antes de mostrar el fallback.
3. Si `encolarConteo` falla:
   - Mostrar error y conservar el formulario lleno.
   - `console.error` obligatorio.
4. El `OfflineIndicator` ya está montado globalmente en `src/app/admin/layout.tsx`; la ruta lo hereda. **No se monta dos veces** para evitar dos indicadores superpuestos.

#### Ajuste necesario del outbox

Para que el caso B use el mismo ID y no duplique la foto:

- `src/lib/offline/outbox.ts`:
  - `encolarConteo(entrada, foto, asesorEmail, opciones?: { conteoId?: string; fotoSubida?: FotoSubida })`.
  - Si `opciones.conteoId` existe, usarlo después de validarlo como UUID; si no, `generarConteoId()`.
  - Si `opciones.fotoSubida` existe, guardar `foto_url` en el payload y no volver a comprimir/subir la foto; el sync usará la URL existente.
  - Si no existe, conservar el comportamiento actual: comprimir, guardar blob y subir en el sync.
  - Mantener `console.error` en el `catch` antes de relanzar.
- `src/hooks/useOfflineQueue.ts`:
  - Ampliar la firma de `encolarConteo` con el cuarto parámetro opcional y pasarlo al outbox.
  - Mantener las validaciones de rol y de email de sesión.
  - Mantener el disparo de `sincronizarAhora()` y `actualizarPendientes()`.

Esto es compatible hacia atrás: las llamadas existentes siguen funcionando sin el cuarto parámetro.

### 2.9 Reglas de robustez

- Todo `try/catch` llama `console.error(...)` antes de cualquier fallback o mensaje.
- No se usa `?.` para validar `user`, `user.email`, `role`, `conteoId`, `fotoSubida` ni claves de payload.
- No se descarta un borrador por un error de red.
- No se marca como enviado hasta que la Server Action devuelva `success: true` o `idempotente: true`.
- No se sube nada a `pagina/catalogo/items`.
- No se toca el botón de scraping ni el inventario de motos.

### 2.10 Pruebas de validación

Unitarias/estáticas:

- `npx tsx src/test/utils/pwa.test.ts` con la allowlist actualizada.
- `npx tsx src/test/utils/inventario-schemas.test.ts` y `src/test/utils/inventario-actions.test.ts` deben seguir pasando.
- Verificar por código/PR que:
  - La ruta de subida contiene `inventario_repuestos/{email}/{uuid}.{ext}`.
  - Se llama a `analizarImagenRepuesto` solo con `foto_url` y actor.
  - Se usa `capture="environment"`.
  - No existe una escritura directa a `pagina/catalogo/items`.
  - `OfflineIndicator` sigue en `admin/layout.tsx` y no se duplica en `inventario-asesor`.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `git diff --check`.

Manuales:

1. Login como `asesor`; entrar a `/admin/inventario-asesor`.
2. Tomar foto con cámara trasera; verificar preview y orientación aceptable.
3. Verificar sugerencias de Vision y que se puedan editar los campos.
4. Guardar online; confirmar `conteos_pendientes_repuestos` y la ruta exacta de Storage.
5. Poner DevTools en offline; guardar otro conteo; confirmar IndexedDB `tlm_offline` y el indicador.
6. Volver online; confirmar sincronización, documento creado y borrador eliminado.
7. Repetir con foto >5 MB (rechazo) y >1.5 MB (compresión).
8. Entrar como `admin` a `/admin/inventario-asesor`; debe verse `AccesoDenegado`.
9. Confirmar que el asesor no ve el inventario de motos.

### 2.11 Criterio de aceptación

- La pantalla funciona en móvil y en escritorio.
- La foto se sube exactamente al prefijo del asesor.
- Vision solo sugiere; nunca persiste.
- Un conteo offline sobrevive a recarga y se sincroniza con idempotencia.
- El asesor no puede acceder al inventario de motos ni a aprobaciones.

---

## 3. Punto 3 — Dashboard de aprobaciones

### 3.1 Archivos

| Operación | Archivo | Cambio |
|---|---|---|
| Crear | `src/app/admin/inventario-aprobaciones/page.tsx` | Ruta y guarda de rol |
| Crear | `src/app/admin/inventario-aprobaciones/AprobacionesClient.tsx` | Lista, refresco y acciones |
| Crear | `src/components/inventario/AprobarConteoModal.tsx` | Modal de aprobación y datos maestros |
| Crear | `src/components/inventario/RechazarConteoModal.tsx` | Modal de rechazo |
| Crear | `src/lib/inventario/ui-helpers.ts` | Helpers puros de formato/validación |
| Crear | `src/test/utils/inventario-ui.test.ts` | Pruebas de helpers |

No se modifica ninguna Server Action ni regla.

### 3.2 Dependencias nuevas

**Ninguna.** Se reutilizan:

- `listarPendientes`, `aprobarConteo`, `rechazarConteo` existentes.
- `ModalWrapper` existente.
- `sonner` (`toast`).
- `next/image` para miniaturas de `firebasestorage.googleapis.com` (ya está en `next.config.ts`).
- `firebase/firestore` (`doc`, `getDoc`) solo para pre-chequear si la referencia existe.
- `zod`/schemas existentes para validar datos maestros.

### 3.3 Guarda de la ruta

`src/app/admin/inventario-aprobaciones/page.tsx`:

```tsx
'use client';

import { useAuth } from '@/context/AuthContext';
import AccesoDenegado from '@/components/inventario/AccesoDenegado';
import AprobacionesClient from './AprobacionesClient';

export default function InventarioAprobacionesPage() {
    const { user, role, loading, puedeAccion } = useAuth();

    if (loading) {
        return <div role="status">Cargando…</div>;
    }

    if (!user || typeof user.email !== 'string' || !user.email) {
        return <AccesoDenegado mensaje="Sesión inválida. Vuelve a iniciar sesión." />;
    }

    const esAdmin = role === 'admin' || role === 'superadmin';
    const puedeAprobar = puedeAccion(
        'conteos_pendientes_repuestos',
        'update'
    );

    if (!esAdmin || !puedeAprobar) {
        return (
            <AccesoDenegado mensaje="Solo administradores pueden revisar conteos." />
        );
    }

    return <AprobacionesClient />;
}
```

- `admin` y `superadmin` pasan.
- `auditor` no pasa aunque tenga `read`.
- `asesor`, `cobrador`, `inversor`, `guest` no pasan.
- La Server Action vuelve a validar; la UI no es la única frontera.

### 3.4 Carga de datos

`AprobacionesClient`:

- Estado: `pendientes`, `loading`, `error`, `accionEnCurso`, `conteoAprobando`, `conteoRechazando`.
- `cargarPendientes()`:

```ts
const idToken = await user.getIdToken();
const actor = { uid: user.uid, idToken };
const resultado = await listarPendientes(
    { estado: 'pendiente_revision' },
    actor
);
```

- Si `resultado.success` es falso, lanzar/mostrar `resultado.message`.
- `try/catch` con `console.error` antes de mostrar error.
- Cargar al montar y después de cada aprobación/rechazo.
- El servidor limita a 100; no se requiere paginación en esta entrega.
- Botón “Actualizar” para reintentar manualmente.
- Estado vacío: “No hay conteos pendientes.”
- Estado de error: mensaje + botón “Reintentar”.
- No hay suscripción realtime.

### 3.5 Presentación

Cada pendiente muestra:

- Miniatura de `foto_url` (con fallback si falla la imagen).
- `referencia_sugerida` y `referencia_confirmada` (destacar la confirmada).
- `descripcion`.
- `cantidad_contada`.
- `ubicacion`.
- `asesor_email`.
- `creado_en` formateado en `es-CO`.
- Botones “Aprobar” y “Rechazar”.

Diseño:

- Desktop: tabla con `overflow-x-auto`.
- Móvil: tarjetas apiladas; botones a ancho completo.
- `aria-label` en botones y miniatura.
- No mostrar enlaces de edición ni acciones no solicitadas.

### 3.6 Modal de aprobación

`AprobarConteoModal` recibe el `PendienteDTO` y el callback de éxito.

1. Al abrir, pre-chequear si la referencia existe:

```ts
const snap = await getDoc(doc(db, 'inventario_repuestos', referencia));
setEsReferenciaNueva(!snap.exists());
```

- Si la lectura falla: `console.error`, marcar `esReferenciaNueva` como `null`/desconocido y mostrar los campos maestros como opcionales con la nota “Si la referencia es nueva, completa los datos maestros”.
- El servidor sigue siendo la autoridad final; si falta `datos_maestro`, devolverá un error accionable.

2. Si `esReferenciaNueva === true`:
   - Campos obligatorios:
     - `fabricante` (1–100).
     - `aplica_a` (lista separada por comas; mínimo 1, máximo 50; cada ítem 1–100).
     - `categoria` (1–100).
     - `precio` (número ≥0).
     - `stock_minimo` (entero ≥0).
   - `imagen_url` no se expone; si no se envía, el backend usa `foto_url`.

3. Si `esReferenciaNueva === false`:
   - Mostrar “Referencia existente: el stock se sobrescribirá con el conteo”.
   - Los datos maestros son opcionales; un toggle “Actualizar datos maestros” permite enviarlos.
   - No exigir campos para actualizar solo stock/ubicación.

4. `construirDatosMaestro()` en `ui-helpers.ts`:
   - `parseAplicaA(texto)` separa por comas, hace `trim`, elimina vacíos y deduplica.
   - Convierte `precio`/`stock_minimo` a número.
   - Devuelve `undefined` si no hay datos maestros que enviar.
   - `try/catch` y `console.error` si una conversión falla.

5. Enviar:

```ts
const resultado = await aprobarConteo(
    {
        conteo_id: pendiente.id,
        datos_maestro: datosMaestro, // undefined si no aplica
    },
    actor
);
```

6. Si `success` es verdadero:
   - `toast.success('Conteo aprobado.')`.
   - Cerrar modal.
   - `await cargarPendientes()`.
7. Si falla:
   - Mostrar `message`.
   - Mantener el modal abierto para corregir.
8. Deshabilitar el botón mientras `accionEnCurso` para evitar doble submit.

### 3.7 Modal de rechazo

`RechazarConteoModal`:

- Campo `motivo_rechazo` obligatorio.
- Validación cliente: `trim().length >= 5` y `<= 500`.
- Contador de caracteres visible.
- Botón “Rechazar” deshabilitado si no cumple.
- Enviar:

```ts
const resultado = await rechazarConteo(
    { conteo_id: pendiente.id, motivo_rechazo },
    actor
);
```

- Éxito: toast, cerrar, recargar lista.
- Error: mostrar mensaje, conservar el texto, `console.error`.
- No se borra físicamente el conteo.

### 3.8 Helpers puros

`src/lib/inventario/ui-helpers.ts`:

```ts
export function parseAplicaA(texto: string): string[]
export function formatearFecha(iso: string): string
export function validarMotivoRechazo(texto: string): boolean
export function construirDatosMaestro(input: {
    fabricante: string;
    aplicaA: string;
    categoria: string;
    precio: string | number;
    stockMinimo: string | number;
}): DatosMaestroInput | undefined
```

- `formatearFecha` devuelve `—` para vacío o fecha inválida; nunca lanza.
- `parseAplicaA` nunca devuelve `undefined`; devuelve `[]` si no hay ítems.
- `construirDatosMaestro` devuelve `undefined` si todos los campos están vacíos; si hay datos parciales, devuelve el objeto y deja que el schema/Server Action reporte el error.
- No usar `?.` en las llaves críticas de estos helpers.

### 3.9 Reglas de robustez

- Todo `try/catch` llama `console.error` antes del fallback.
- No se usa `?.` para `resultado.success`, `resultado.message`, `pendiente.id`, `referencia_confirmada`, `datos_maestro` ni `motivo_rechazo`.
- No se inventan datos maestros ni se envían strings vacíos como números.
- La lista se recarga después de cada acción para reflejar el estado real del servidor.
- No se modifica el ledger desde el cliente.

### 3.10 Pruebas de validación

Unitarias:

- `src/test/utils/inventario-ui.test.ts`:
  - `parseAplicaA('motor, frenos, , motor')` → `['motor', 'frenos']`.
  - `parseAplicaA('   ')` → `[]`.
  - `formatearFecha('')` → `—`; `formatearFecha('fecha-invalida')` → `—`; fecha ISO válida no vacía.
  - `validarMotivoRechazo('abc')` → `false`; `'abcde'` → `true`; `'  abcde  '` → `true`.
  - `construirDatosMaestro` vacío → `undefined`; completo → objeto con `aplica_a` normalizado y números.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `git diff --check`.

Manuales:

1. Admin entra a `/admin/inventario-aprobaciones` y ve la lista.
2. La foto, referencia, cantidad, ubicación, asesor y fecha se muestran correctamente.
3. Aprobar una referencia existente sin `datos_maestro`; el stock y la ubicación cambian.
4. Aprobar una referencia nueva sin `datos_maestro`; el modal exige los campos y el servidor rechaza si faltan.
5. Aprobar una referencia nueva con datos maestros; se crea `inventario_repuestos` y el conteo queda `aprobado`.
6. Rechazar con menos de 5 caracteres; el botón no permite o el servidor rechaza.
7. Rechazar con 5+ caracteres; el conteo queda `rechazado` y la lista se refresca.
8. `asesor` entra directo a la ruta; ve `AccesoDenegado`; no ve el enlace en el sidebar.
9. `auditor` entra directo; ve `AccesoDenegado`; no puede aprobar/rechazar.
10. Confirmar que no se crea ningún documento en `fotos_inventario` desde esta pantalla.

### 3.11 Criterio de aceptación

- Solo `admin`/`superadmin` ven y usan la pantalla.
- Aprobar/rechazar producen feedback y refrescan la lista.
- Los datos maestros solo se exigen cuando la referencia es nueva.
- El rechazo exige motivo de al menos 5 caracteres.
- No se toca el inventario de motos ni el bot.

---

## 4. Dependencia transversal — PWA y allowlist offline

### 4.1 Problema

El PWA certificado en WEB-038 usa:

- `manifest.id = /admin/inventory`
- `manifest.start_url = /admin/inventory?pwa=asesor`
- `public/sw.js`: `CACHE_KEY_INVENTARIO = '/admin/inventory'`
- Allowlist exacta de `/admin/inventory` y `/admin/inventory/`

La nueva ruta de asesor es `/admin/inventario-asesor`. Si no se actualiza el PWA, el icono instalado abrirá la pantalla equivocada y el service worker no cacheará la ruta nueva.

### 4.2 Cambios exactos

| Archivo | Cambio |
|---|---|
| `public/manifest.json` | `id` → `/admin/inventario-asesor`; `start_url` → `/admin/inventario-asesor?pwa=asesor` |
| `public/sw.js` | `CACHE_KEY_INVENTARIO` → `/admin/inventario-asesor`; allowlist exacta de la ruta nueva; bump de caché a `tlm-shell-v2` |
| `src/lib/offline/outbox-utils.ts` | `esRutaInventario` acepta la ruta nueva y su variante con `/`; rechaza `/admin/inventory` |
| `src/test/utils/pwa.test.ts` | Nuevas expectativas de manifest, allowlist y versión de caché |
| `public/offline.html` | Sin cambio (el texto genérico sigue siendo válido) |

No se cambia `scope` (`/`), iconos, colores ni `PwaRegistrar`.

### 4.3 Pruebas PWA

- `npx tsx src/test/utils/pwa.test.ts`.
- Verificar:
  - `manifest.id === '/admin/inventario-asesor'`.
  - `manifest.start_url === '/admin/inventario-asesor?pwa=asesor'`.
  - `esRutaInventario('/admin/inventario-asesor')` y con `/` → `true`.
  - `esRutaInventario('/admin/inventory')` → `false`.
  - `sw` contiene `tlm-shell-v2`.
- Manual:
  - Instalar/actualizar el PWA como asesor.
  - Abrir offline; debe cargar `/admin/inventario-asesor`.
  - Enviar un conteo offline; volver online; sincronizar.
  - Confirmar que el admin no instala este PWA por error.

### 4.4 Nota de migración

Los asesores con el PWA anterior instalado pueden conservar temporalmente el `start_url` viejo hasta que el manifiesto se actualice. El bump de caché y la reinstalación/actualización del PWA resuelven el caso. Si se decide **no** tocar el PWA certificado, la alternativa segura es mantener `/admin/inventory?pwa=asesor` y montar el formulario de asesor por rama de rol en esa ruta; este plan recomienda la ruta dedicada porque separa repuestos del inventario de motos.

---

## 5. Matriz de validación global

Ejecutar al finalizar los tres puntos:

```text
npx tsc --noEmit
npm run lint
npm run build
git diff --check
npx tsx src/test/utils/roles.test.ts
npx tsx src/test/utils/landing.test.ts
npx tsx src/test/utils/sidebar-visibility.test.ts
npx tsx src/test/utils/users-actions.test.ts
npx tsx src/test/utils/inventario-schemas.test.ts
npx tsx src/test/utils/inventario-actions.test.ts
npx tsx src/test/utils/pwa.test.ts
npx tsx src/test/utils/inventario-ui.test.ts
npm --prefix functions run build
```

Pruebas de seguridad mínimas:

- `asesor` no puede ver ni ejecutar aprobaciones/rechazos.
- `admin` no puede ver el formulario de conteo del asesor.
- `auditor` no puede aprobar/rechazar.
- Ninguna ruta nueva se apoya solo en el sidebar.
- Ninguna escritura toca `pagina/catalogo/items` ni el bot.

Pruebas de datos:

- La ruta de Storage es exactamente `inventario_repuestos/{asesor_email}/{uuid}.{ext}`.
- `conteo_id` se conserva entre Vision, submit online y outbox.
- Un reintento no crea un conteo duplicado.
- `analizarImagenRepuesto` no escribe en Firestore.
- `aprobarConteo` solo recibe `datos_maestro` cuando se decide enviarlo.
- `rechazarConteo` nunca recibe un motivo menor a 5 caracteres.

---

## 6. Orden de implementación y atomicidad

Cada punto debe poder revisarse y revertirse sin los otros, salvo la dependencia PWA del Punto 2.

1. **Punto 1**
   - Sidebar/landing/roles/usuarios.
   - Tests de visibilidad y landing.
   - No requiere los formularios nuevos para compilar si los enlaces se agregan después; si se agregan antes, las rutas deben existir para evitar 404.
   - Orden recomendado: primero crear las páginas del Punto 2/3 o agregar los enlaces después de esas páginas.

2. **Punto 2**
   - Página + formulario + cámara + Storage + Vision + outbox.
   - Actualizar PWA y allowlist.
   - Tests PWA y manuales offline.
   - Es el punto de mayor riesgo; no mezclar con cambios de aprobaciones.

3. **Punto 3**
   - Página + lista + modales.
   - Tests de helpers y manuales de aprobación/rechazo.
   - No requiere cambios de backend.

4. **Cierre**
   - Ejecutar matriz global.
   - Revisar que `git diff --check` no reporte whitespace.
   - No crear commit si el usuario no lo pide.

---

## 7. Riesgos y decisiones que requieren atención

| Riesgo | Mitigación |
|---|---|
| Cambiar el `start_url` del PWA certificado | Revalidar Punto 4, bump `tlm-shell-v2`, probar instalación/offline y documentar migración |
| Duplicar `conteo_id` al pasar de online a offline | UUID estable + `encolarConteo` con `conteoId` + idempotencia del backend |
| Subir la foto dos veces | Reutilizar `fotoSubida` y guardar `foto_url` en el outbox |
| Huérfanos de Storage si el asesor abandona tras Vision | Aceptado en esta entrega; Storage no permite delete; no se implementa purga |
| `getDoc` de pre-chequeo falla | Mostrar campos maestros opcionales y dejar que la Server Action decida |
| `next/image` con URL de Firebase | Ya existe `firebasestorage.googleapis.com` en `next.config.ts`; usar `unoptimized` si se requiere |
| `ProtectedRoute` redirige en vez de mostrar denegación | Guarda de página explícita con `<AccesoDenegado />`; el layout sigue protegiendo autenticación |
| Admin ve brevemente enlaces por `loading` | Condicionar los ítems nuevos a `!loading && puedeVerNodo(...)` |

---

## 8. Resultado esperado

Al terminar los tres puntos:

- El `asesor` inicia sesión y aterriza en una pantalla móvil de conteo de repuestos.
- Puede tomar foto, recibir sugerencias de Vision, editar los campos y guardar online u offline.
- El conteo offline se sincroniza con idempotencia y sin duplicados.
- El `admin`/`superadmin` revisa los pendientes, ve la foto y los datos, aprueba con o sin datos maestros y rechaza con motivo.
- Ningún rol no autorizado puede ver ni ejecutar las pantallas nuevas.
- El inventario de motos, el bot y `pagina/catalogo/items` permanecen intactos.
