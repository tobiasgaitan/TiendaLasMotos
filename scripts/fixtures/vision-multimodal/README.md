# Validación multimodal — 27 fotos reales

Este directorio contiene el manifiesto de validación de WEB-INV-044. Las
fotos reales **no se commitean**.

## Modelo recomendado

`VISION_MODEL_SLUG` debe apuntar a un modelo multimodal de bajo coste. Slugs
recomendados:

- `z-ai/glm-5.3-flash` (modelo usado en la validación de este ticket).
- `deepseek/deepseek-v4.1-flash-1017` (alternativa de bajo coste). En la
  corrida de 27 fotos con 4000 tokens y timeout de 18 s presentó timeouts y
  respuestas truncadas; no se recomienda con esta configuración.

`VISION_MULTIMODAL_MAX_TOKENS` vale 4000 para evitar truncar el JSON de
conteo en imágenes con muchas unidades. Los modelos de razonamiento (como
`z-ai/glm-5.3-flash`) consumen parte del presupuesto en tokens de
razonamiento; con 2000 la respuesta se truncaba en las fotos más difíciles.
El ticket se amplió de 2000 a 4000 tras la validación de 27 fotos.

## Preparación

1. Crear `scripts/fixtures/vision-multimodal/fotos/`.
2. Agregar las 27 fotos con los nombres exactos del `manifest.json`.
3. Verificar el conteo humano de cada foto con dos personas.
4. Ajustar `esperado` en el manifiesto si el conteo humano difiere.
5. Mantener `no_contable: true` solo para fotos donde el autocompletado
   sería inseguro (saturación, solape imposible de resolver, etc.).

## Ejecución

Agrega `OPENROUTER_API_KEY` y `VISION_MODEL_SLUG` a `.env.local` (ignorado por
git) o pásalos en línea:

```bash
OPENROUTER_API_KEY=... VISION_MODEL_SLUG=z-ai/glm-5.3-flash \
npx tsx scripts/validar-vision-multimodal.ts \
  --manifest scripts/fixtures/vision-multimodal/manifest.json \
  --fotos scripts/fixtures/vision-multimodal/fotos \
  --out scripts/fixtures/vision-multimodal/reporte.md
```

También puedes usar el script de `package.json`:

```bash
npm run test:vision-multimodal
```

## Gates

- 27/27 casos procesados sin errores.
- **0 autocompletados inseguros** en casos `no_contable` (umbral de
  autocompletado: 0.65).
- ≥ 80% de los casos contables dentro de ±1 unidad.
- ≥ 60% de los casos contables exactos.
- Latencia mediana ≤ 10 s y p95 ≤ 25 s.

Si un gate falla, se ajusta el modelo (`VISION_MODEL_SLUG`) o el umbral de
confianza antes de habilitar la función en producción. El prompt, el parser
JSON y la normalización no se modifican en WEB-INV-044-FIX-FINAL.

## Resultado de la corrida (2026-11-25)

Configuración: `z-ai/glm-5.3-flash`, `VISION_MULTIMODAL_MAX_TOKENS=4000`,
`reasoning_effort: "minimal"`, umbral de autocompletado `0.65`.

- 27/27 casos procesados, 0 errores.
- **0 autocompletados inseguros**.
- 21/24 casos contables dentro de ±1 (**88%**, gate ≥80%: cumple).
- 13/24 casos contables exactos (**54%**, gate ≥60%: **no cumple**).
- MAE 0.61; latencia mediana 1.47 s y p95 4.38 s.

El gate de exactitud no se cumple: el modelo tiende a desviarse ±1 unidad en
las fotos desordenadas. Se recomienda un modelo de visión con mejor conteo o
un esquema de consenso de dos pasadas antes de habilitar la función. El
`reasoning_effort` se mantiene en `minimal` porque, con razonamiento completo,
el modelo agota los 4000 tokens o supera el timeout de 18 s.
