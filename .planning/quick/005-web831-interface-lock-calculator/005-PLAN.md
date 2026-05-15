---
task: 005
name: WEB-831 Interface Lock Calculator
description: Hardening de persistencia en QuoteGenerator.tsx — bypass handleDownloadPDF, normalización celular 12-dígitos, alineación habeas_data
---

# Quick Task 005: WEB-831 Interface Lock Calculator

## Objetivo
Corregir 3 regresiones críticas en QuoteGenerator.tsx que permiten bypass de Firestore (PDF path), 
transmisión de celular sin normalizar y posible fallo de tipado en habeas_data.

## Tasks

<task type="auto">
  <name>FIX-1: normalizeCelular helper + handleDownloadPDF submitLead gate</name>
  <files>src/components/calculator/QuoteGenerator.tsx</files>
  <action>
    1. Extraer helper `normalizeCelular(raw: string): string` — strip /\D/g + prefijo "57" si 10 dígitos.
    2. Aplicar normalizeCelular en handleWhatsapp FormData.append("celular").
    3. Refactorizar handleDownloadPDF para construir FormData idéntico al de handleWhatsapp 
       e invocar await submitLead({ success: false }, formData) ANTES de generateQuotationPDF.
       Si submitLead falla, loguear con console.error pero continuar (UX no bloqueante para admin).
  </action>
  <verify>npx tsc --noEmit 2>&1 | head -30</verify>
  <done>TypeScript compila sin errores. handleDownloadPDF persiste en Firestore antes de PDF.</done>
</task>

---
*Created: 2026-05-15T14:58:47-05:00*
