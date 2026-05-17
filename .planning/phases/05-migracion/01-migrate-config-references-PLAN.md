---
phase: 5
plan: 1
name: Migración estructural de referencias config a configuracion
wave: 1
depends_on: []
files_modified:
  - firestore.rules
  - src/lib/actions/quotation.ts
  - src/components/TopBar.tsx
  - src/components/SmartFooter.tsx
  - src/app/sedes/page.tsx
  - src/app/admin/general/page.tsx
  - src/app/admin/sedes/page.tsx
  - src/app/admin/simulador/page.tsx
requirements:
  - R1
  - R2
  - R3
  - R4
  - R5
  - R6
  - R7
  - R8
---

# Plan 5-1: Migración estructural de referencias config a configuracion

## Objective
Actualizar todas las referencias de Firebase de la colección legacy 'config' al nuevo nodo canónico 'configuracion' en la base de datos de producción y de pruebas. Esto incluye ajustar las reglas de seguridad en `firestore.rules` para evitar fallos de permisos denegados en vistas públicas y asegurar la paridad absoluta 1:1 de contratos de datos.

## Code Patterns (Model Resilience)
Reference these existing files for code style:
- [firestore.rules](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/firestore.rules) — Modificación de reglas de lectura pública y escritura autenticada.
- [quotation.ts](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/src/lib/actions/quotation.ts) — Transacción atómica de incremento del cotizador.
- [TopBar.tsx](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/src/components/TopBar.tsx) — Recuperación del contacto de WhatsApp `general_info`.
- [SmartFooter.tsx](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/src/components/SmartFooter.tsx) — Recuperación de sedes y `general_info`.
- [page.tsx (sedes)](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/src/app/sedes/page.tsx) — Carga Server-side dinámica de sedes activas.
- [page.tsx (admin/general)](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/src/app/admin/general/page.tsx) — Guardado administrativo en `general_info`.
- [page.tsx (admin/sedes)](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/src/app/admin/sedes/page.tsx) — Operaciones CRUD para el panel de sedes.
- [page.tsx (admin/simulador)](file:///Users/tobiasgaitangallego/Antigravity-TiendaLasMotos/src/app/admin/simulador/page.tsx) — Carga de sedes en el selector del simulador de crédito.

Conventions:
- **Inmutabilidad**: Paridad estricta 1:1 de campos y llaves.
- **Control de Errores**: Captura detallada (Zero-Silent-Failures) con log forense estructurado (`console.error`) de Firestore.
- **Firebase imports**: Usar modular SDK v9+.

## Tasks

<task type="auto">
  <name>Modificar firestore.rules para habilitar lectura pública de configuracion</name>
  <files>
    [firestore.rules]
  </files>
  <action>
    Modificar el archivo `firestore.rules` para agregar reglas específicas de lectura pública a los paths públicos en la nueva colección `configuracion`.
    Reemplazar la regla:
    `match /configuracion/{document=**} { allow read: if request.auth != null; }`
    Con:
    `match /configuracion/general/sedes/{document=**} { allow read: if true; allow write: if request.auth != null; }`
    `match /configuracion/general_info { allow read: if true; allow write: if request.auth != null; }`
    `match /configuracion/{document=**} { allow read: if request.auth != null; allow write: if request.auth != null; }`
  </action>
  <verify>
    Validar localmente la sintaxis de las reglas con el simulador de Firebase o usando el comando seco: npx firebase deploy --only firestore:rules --dry-run
  </verify>
  <done>
    Las reglas de seguridad permiten la lectura pública y escritura autenticada sobre los nodos requeridos de 'configuracion'.
  </done>
</task>

<task type="auto">
  <name>Actualizar transacciones del Cotizador en actions/quotation.ts</name>
  <files>
    [src/lib/actions/quotation.ts]
  </files>
  <action>
    Reemplazar la referencia de "config" por "configuracion" en la obtención del doc de contadores:
    Línea 11:
    `const counterRef = doc(db, "config", "counters");`
    Cambiar a:
    `const counterRef = doc(db, "configuracion", "counters");`
  </action>
  <verify>
    Probar el flujo de cotización localmente para confirmar que incrementa correctamente el cotizador en la colección 'configuracion/counters'.
  </verify>
  <done>
    El contador de cotizaciones se lee y actualiza atómicamente en la colección canónica.
  </done>
</task>

<task type="auto">
  <name>Actualizar barra superior en TopBar.tsx</name>
  <files>
    [src/components/TopBar.tsx]
  </files>
  <action>
    Reemplazar la referencia de "config" por "configuracion" en la carga de general_info:
    Línea 43:
    `const configRef = doc(db, "config", "general_info");`
    Cambiar a:
    `const configRef = doc(db, "configuracion", "general_info");`
  </action>
  <verify>
    Verificar que el número de teléfono y el enlace de contacto se cargan correctamente en la TopBar sin errores de Firestore.
  </verify>
  <done>
    TopBar lee la información de contacto desde la colección configuracion.
  </done>
</task>

<task type="auto">
  <name>Actualizar pie de página en SmartFooter.tsx</name>
  <files>
    [src/components/SmartFooter.tsx]
  </files>
  <action>
    Reemplazar referencias de "config" por "configuracion" en las cargas de sedes y general_info:
    Línea 35:
    `const sedesRef = collection(db, "config/general/sedes");`
    Cambiar a:
    `const sedesRef = collection(db, "configuracion/general/sedes");`
    Línea 44:
    `const configRef = doc(db, "config", "general_info");`
    Cambiar a:
    `const configRef = doc(db, "configuracion", "general_info");`
  </action>
  <verify>
    Verificar que el footer cargue las sedes y los enlaces sociales/datos de contacto sin errores.
  </verify>
  <done>
    El footer recupera sedes y redes sociales de configuracion.
  </done>
</task>

<task type="auto">
  <name>Actualizar la vista pública de sedes en app/sedes/page.tsx</name>
  <files>
    [src/app/sedes/page.tsx]
  </files>
  <action>
    Reemplazar la referencia de la colección en la línea 24:
    `const sedesRef = collection(db, "config/general/sedes");`
    Cambiar a:
    `const sedesRef = collection(db, "configuracion/general/sedes");`
  </action>
  <verify>
    Navegar a la ruta /sedes y verificar que la lista de ubicaciones cargue correctamente en el frontend.
  </verify>
  <done>
    La página pública de sedes consulta la colección canónica de configuracion.
  </done>
</task>

<task type="auto">
  <name>Actualizar el formulario general de administración en app/admin/general/page.tsx</name>
  <files>
    [src/app/admin/general/page.tsx]
  </files>
  <action>
    Reemplazar referencias de "config" por "configuracion" en las operaciones de lectura (línea 43) y escritura (línea 64):
    Línea 43:
    `const docRef = doc(db, "config", "general_info");` -> `const docRef = doc(db, "configuracion", "general_info");`
    Línea 64:
    `await setDoc(doc(db, "config", "general_info"), formData);` -> `await setDoc(doc(db, "configuracion", "general_info"), formData);`
  </action>
  <verify>
    Ingresar al panel administrativo `/admin/general` y verificar que los datos se lean y se guarden con éxito en la colección 'configuracion/general_info'.
  </verify>
  <done>
    El administrador de información general opera sobre la colección canónica.
  </done>
</task>

<task type="auto">
  <name>Actualizar el panel CRUD administrativo de sedes en app/admin/sedes/page.tsx</name>
  <files>
    [src/app/admin/sedes/page.tsx]
  </files>
  <action>
    Reemplazar todas las referencias de "config/general/sedes" por "configuracion/general/sedes" en:
    - Línea 34: `getDocs(collection(db, 'config/general/sedes')),` -> `getDocs(collection(db, 'configuracion/general/sedes')),`
    - Línea 93: `await updateDoc(doc(db, 'config/general/sedes', editingSede.id), dataToSave);` -> `await updateDoc(doc(db, 'configuracion/general/sedes', editingSede.id), dataToSave);`
    - Línea 96: `await addDoc(collection(db, 'config/general/sedes'), dataToSave);` -> `await addDoc(collection(db, 'configuracion/general/sedes'), dataToSave);`
    - Línea 120: `await deleteDoc(doc(db, 'config/general/sedes', id));` -> `await deleteDoc(doc(db, 'configuracion/general/sedes', id));`
  </action>
  <verify>
    Probar el flujo CRUD completo (crear sede, actualizar sede, eliminar sede) en /admin/sedes y comprobar los cambios en la base de datos Firebase real.
  </verify>
  <done>
    Las operaciones de ABM de sedes de administración se ejecutan en la colección de configuracion.
  </done>
</task>

<task type="auto">
  <name>Actualizar el selector de sedes en el simulador administrativo en app/admin/simulador/page.tsx</name>
  <files>
    [src/app/admin/simulador/page.tsx]
  </files>
  <action>
    Reemplazar la referencia de la colección en la línea 58:
    `getDocs(collection(db, 'config/general/sedes'))`
    Cambiar a:
    `getDocs(collection(db, 'configuracion/general/sedes'))`
  </action>
  <verify>
    Acceder al simulador en `/admin/simulador` y corroborar que el selector de sedes muestre las sedes activas de la colección configuracion sin errores.
  </verify>
  <done>
    El selector del simulador administrativo lee las sedes desde la colección canónica de configuracion.
  </done>
</task>

## Must-Haves
- Paridad absoluta de las llaves en Firestore, sin alteraciones de campos existentes.
- Carga fluida de la información del SmartFooter, TopBar y Sedes para usuarios públicos (unauthenticated reads autorizados).
- Escrituras correctas de administradores sobre 'configuracion/general_info' y 'configuracion/general/sedes'.
- npx agent-cli eval con puntuación >= 0.9.
- Verificación exitosa en el entorno real Beta (tiendalasmotos-beta.web.app).

---
*Created: 2026-05-17 by Antigravity*
