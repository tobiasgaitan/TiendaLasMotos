# Requisitos de Migración (WEB-835)

## Visión General
Esta migración reemplaza todas las referencias locales y remotas del frontend al nodo heredado `config` de Firestore por la nueva colección canónica `configuracion`.

## V1 — Obligatorio (Must Have)
Estos requisitos representan los cambios estructurales e integración necesarios para lograr una transición transparente con paridad de datos 1:1.

| ID  | Requisito | Archivos Impactados | Estado |
|-----|-----------|---------------------|--------|
| R1  | Migración de contadores atómicos en transacciones. | `src/lib/actions/quotation.ts` | Pendiente |
| R2  | Migración de consulta de información general (teléfono) en barra superior. | `src/components/TopBar.tsx` | Pendiente |
| R3  | Migración de consulta de redes y sedes activas en pie de página. | `src/components/SmartFooter.tsx` | Pendiente |
| R4  | Migración de carga de sedes en la vista pública de ubicaciones. | `src/app/sedes/page.tsx` | Pendiente |
| R5  | Migración de gestión de información general en administración. | `src/app/admin/general/page.tsx` | Pendiente |
| R6  | Migración de gestión ABM (Alta, Baja, Modificación) de sedes en administración. | `src/app/admin/sedes/page.tsx` | Pendiente |
| R7  | Migración de obtención de sedes en el simulador de créditos en administración. | `src/app/admin/simulador/page.tsx` | Pendiente |
| R8  | Despliegue en la rama `beta` y verificación E2E con datos reales de Firestore. | N/A | Pendiente |

## V2 — Backlog (Nice to Have)
| ID  | Requisito | Prioridad | Estado |
|-----|-----------|-----------|--------|
| R9  | Purga física del nodo heredado `config` en Firestore tras validación en producción. | Media | Pendiente |

---
*Última actualización: 2026-05-17 por Antigravity*
