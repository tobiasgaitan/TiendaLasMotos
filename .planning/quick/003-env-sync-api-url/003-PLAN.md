---
task: 003
name: FE-FIX-904-ENV-SYNC
description: Estandarizar NEXT_PUBLIC_API_URL y X-Admin-API-Key en todo src/
---

# Quick Task 003: FE-FIX-904-ENV-SYNC

## Objective
Purgar toda referencia a la variable obsoleta `NEXT_PUBLIC_CLOUD_RUN_URL` y estandarizar los headers de autenticación HTTP a `X-Admin-API-Key` en TODO el frontend. Garantizar que `.env.local` y `.env.production` contengan las llaves correctas. **PROHIBIDO modificar archivos .yml de CI/CD.**

## Diagnóstico Forense (Evidencia Física)

### Variables Obsoletas (`NEXT_PUBLIC_CLOUD_RUN_URL`)
| Archivo | Línea | Estado |
|---------|-------|--------|
| `src/components/LeadForm.tsx` | L99 | ❌ Usa `NEXT_PUBLIC_CLOUD_RUN_URL` |
| `src/components/SmartQuotaSlider.tsx` | L273 | ❌ Usa `NEXT_PUBLIC_CLOUD_RUN_URL` |

### Headers Incorrectos
| Archivo | Línea | Header Actual | Correcto |
|---------|-------|---------------|----------|
| `src/components/LeadForm.tsx` | L104 | `x-admin-api-key` (lowercase) | `X-Admin-API-Key` |
| `src/components/SmartQuotaSlider.tsx` | L281 | `X-API-Key` (nombre distinto) | `X-Admin-API-Key` |

### Componentes YA Correctos (sin modificación)
| Archivo | URL | Header | Veredicto |
|---------|-----|--------|-----------|
| `CampaignControl.tsx` | ✅ `NEXT_PUBLIC_API_URL` | ✅ `X-Admin-API-Key` | LIMPIO |
| `ProspectModal.tsx` | ✅ `NEXT_PUBLIC_API_URL` | ✅ `X-Admin-API-Key` | LIMPIO |
| `page.tsx` (prospectos) | ✅ `NEXT_PUBLIC_API_URL` | ✅ `X-Admin-API-Key` | LIMPIO |

## Tasks

<task type="auto">
  <name>Refactorizar LeadForm.tsx</name>
  <files>src/components/LeadForm.tsx</files>
  <action>
    1. L99: Reemplazar `NEXT_PUBLIC_CLOUD_RUN_URL` → `NEXT_PUBLIC_API_URL`
    2. L104: Reemplazar `"x-admin-api-key"` → `"X-Admin-API-Key"`
  </action>
  <verify>grep -n "CLOUD_RUN_URL\|x-admin-api-key" src/components/LeadForm.tsx (debe devolver 0 resultados)</verify>
  <done>Cero referencias a variables/headers obsoletos</done>
</task>

<task type="auto">
  <name>Refactorizar SmartQuotaSlider.tsx</name>
  <files>src/components/SmartQuotaSlider.tsx</files>
  <action>
    1. L273: Reemplazar `NEXT_PUBLIC_CLOUD_RUN_URL` → `NEXT_PUBLIC_API_URL`
    2. L276: Actualizar guard clause de `cloudRunUrl` a `apiUrl`
    3. L277: Actualizar referencia en fetch
    4. L281: Reemplazar `'X-API-Key'` → `'X-Admin-API-Key'`
    5. L289: Actualizar mensaje de error
  </action>
  <verify>grep -n "CLOUD_RUN_URL\|X-API-Key" src/components/SmartQuotaSlider.tsx (debe devolver 0 resultados)</verify>
  <done>Cero referencias a variables/headers obsoletos</done>
</task>

<task type="auto">
  <name>Certificar build y lint</name>
  <files>N/A</files>
  <action>npm run lint && npm run agent-eval</action>
  <verify>Exit code 0 en ambos comandos</verify>
  <done>Score de coherencia ≥ 0.9</done>
</task>

## Requisitos Post-Ejecución para Tobias
> **MANDATO**: Tobias debe configurar los siguientes GitHub Repository Secrets:
> - `NEXT_PUBLIC_API_URL` → `https://bot-tiendalasmotos-beta-467812260261.us-central1.run.app`
> - `NEXT_PUBLIC_BOT_API_KEY` → valor secreto actual
> Y referenciarlos en los steps de Build de `deploy-beta.yml` y `deploy-prod.yml`.

---
*Created: 2026-05-06*
