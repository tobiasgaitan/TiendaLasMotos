---
task: 040
name: MT-06 suite matching
description: Ampliar matching puro sin nuevas dependencias.
---
# Quick Task 040: MT-06

## Objective
Cubrir casos puros de matching sin Firestore, React ni DOM.

## Tasks
<task type="auto">
  <name>Ampliar suite</name>
  <files>src/test/utils/inventario-matching.test.ts</files>
  <action>Añadir casos de etiqueta vacía, acentos, stopwords, referencia contenida, metadatos, deduplicación, orden y candidato sin referencia.</action>
  <verify>npx --no-install tsx src/test/utils/inventario-matching.test.ts</verify>
  <done>Suite pura pasa con el runner existente.</done>
</task>
