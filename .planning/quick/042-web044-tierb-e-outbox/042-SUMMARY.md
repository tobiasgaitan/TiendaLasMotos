# Quick Task 042: Tier B E — Summary

**Executed:** 2026-11-09
**Status:** Complete

## What Was Done

`limpiarOutbox(uid)` conserva borradores y fotos cuando falla la purga owner-scoped. Marca `estado_envio: error`, conserva `ultimo_error` y registra `conteo_id`/`propietario_uid`. El `clear()` global quedó únicamente en la purga explícita sin propietario.

## Verification

- `grep -n 'clear()' src/lib/offline/outbox.ts` muestra clear solo en la rama global explícita.
- Suite Vitest MT-08: 11 casos, incluida ausencia de fallback global.
- Commit: `b4383ac`.
