# Fase 049 — WEB-INV-049: imágenes de referencia por repuesto

## Contexto

El catálogo maestro `inventario_repuestos` (21.256 documentos) no tiene imágenes de
referencia. `imagen_url` existe pero está normalizado a `''` por diseño. El matching
visual foto-vs-foto (Objetivo 2) tiene denominador cero.

WEB-INV-049 es el primer ticket de la serie WEB-INV-049 → WEB-INV-050 → WEB-INV-051.
Añade un campo aditivo `imagenes_referencia: string[]` y una UI de curaduría para
administradores en `/admin/inventario-repuestos`.

## Decisiones del Director

- Campo aditivo; `imagen_url` permanece intacto (NAMING LOCK).
- Máximo 5 imágenes por ficha.
- URLs HTTPS canónicas de `firebasestorage.googleapis.com`.
- Persistencia opcional: fichas legacy sin el campo siguen válidas.
- Solo `admin`/`superadmin` ven y editan el campo.
- El flujo del Asesor no se modifica.
- Sin dependencias nuevas, sin cambios en reglas ni índices.
- UAT en beta con Firebase real y ficha temporal.

## Riesgos aceptados (observaciones no bloqueantes)

- `OBS-WEB-INV-049-BLOBS-HUERFANOS-001`: quitar una URL del array no borra el
  objeto de Storage; requiere limpieza manual o ticket posterior.
- `OBS-WEB-INV-049-CAMPO-LEGIBLE-ASESOR-001`: las reglas de Firestore permiten
  leer el documento completo al asesor; la restricción de este ticket es de UI.

## Fuera de alcance

Matching visual, carga de imágenes en el alta, borrado de blobs, cambios de
reglas/índices, compresión de imágenes, flujo del asesor y bot.
