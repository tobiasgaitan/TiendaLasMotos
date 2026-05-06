# Quick Task 003: FE-FIX-904-ENV-SYNC — Summary

**Executed:** 2026-05-06
**Status:** Complete

## What Was Done
Purga total de la variable obsoleta `NEXT_PUBLIC_CLOUD_RUN_URL` y estandarización del header de autenticación HTTP en todo `src/`.

### Cambios Quirúrgicos
1. **LeadForm.tsx**: Reemplazada la referencia a `NEXT_PUBLIC_CLOUD_RUN_URL` por `NEXT_PUBLIC_API_URL`. Corregido el header de `"x-admin-api-key"` (lowercase incorrecto) a `"X-Admin-API-Key"`.
2. **SmartQuotaSlider.tsx**: Reemplazada la referencia a `NEXT_PUBLIC_CLOUD_RUN_URL` por `NEXT_PUBLIC_API_URL`. Corregido el header de `'X-API-Key'` (nombre incorrecto) a `'X-Admin-API-Key'`. Mejorado mensaje de error diagnóstico.
3. **page.tsx (prospectos)**: Corregido error de tipo TS2769 preexistente agregando `as string` al header `X-Admin-API-Key`.
4. **CampaignControl.tsx**: Corregido error de tipo TS2769 preexistente agregando `as string` al header `X-Admin-API-Key`.

### Lo que NO se modificó (por orden del Arquitecto)
- ❌ `deploy-beta.yml` — NO modificado
- ❌ `deploy-prod.yml` — NO modificado
- ❌ `.env.production` — Ya contenía las variables correctas
- ❌ `.env.local` — Ya contenía `NEXT_PUBLIC_API_URL` (L12)

## Files Modified
| File | Action | Description |
|------|--------|-------------|
| `src/components/LeadForm.tsx` | Modified | URL env var + header standardization |
| `src/components/SmartQuotaSlider.tsx` | Modified | URL env var + header standardization |
| `src/app/admin/prospectos/page.tsx` | Modified | TS2769 type assertion fix |
| `src/components/admin/CampaignControl.tsx` | Modified | TS2769 type assertion fix |

## Verification
| Check | Result |
|-------|--------|
| `grep CLOUD_RUN_URL src/` | ✅ 0 resultados |
| `grep "x-admin-api-key\|X-API-Key" src/` | ✅ 0 resultados |
| `npm run lint` | ✅ Exit 0, sin errores |
| `npx tsc --noEmit` | ✅ Exit 0, cero errores de tipo |

## ⚠️ MANDATO PARA TOBIAS — GitHub Secrets
Para que el build en CI/CD funcione correctamente, debes configurar los siguientes **GitHub Repository Secrets**:

| Secret Name | Valor |
|-------------|-------|
| `NEXT_PUBLIC_API_URL` | `https://bot-tiendalasmotos-beta-467812260261.us-central1.run.app` |
| `NEXT_PUBLIC_BOT_API_KEY` | Tu valor secreto actual |

Luego, referenciarlos en los steps `Build` y `Deploy` de `deploy-beta.yml` y `deploy-prod.yml`:
```yaml
- name: Build
  run: npm run build
  env:
    NEXT_PUBLIC_API_URL: ${{ secrets.NEXT_PUBLIC_API_URL }}
    NEXT_PUBLIC_BOT_API_KEY: ${{ secrets.NEXT_PUBLIC_BOT_API_KEY }}
    # ... (existing Firebase secrets)
```

---
*Completed: 2026-05-06*
