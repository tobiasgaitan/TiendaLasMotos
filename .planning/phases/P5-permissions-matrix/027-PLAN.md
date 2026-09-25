# Fase P5 — Matriz de Permisos Configurables (Plan 027)

## Objetivo
Centralizar roles/permisos (`src/types/roles.ts`), normalizar `rol`/`role` con lectura
resiliente, y aplicar autorización por matriz en Server Actions + UI, con
`sys_permissions_matrix/{rol}` como SSOT configurable.

## Roles canónicos
`superadmin`, `admin`, `cobrador`, `inversor`, `auditor` (`vendedor` → `cobrador` legacy).

## Fases de ejecución
- **F1:** `src/types/roles.ts`, `src/lib/auth/resolve-rol.ts`, `src/test/utils/roles.test.ts`.
- **F2:** `src/lib/auth/require-permiso.ts`, Server Actions (`actions.ts`,
  `financiero-actions.ts`), `firestore.rules`.
- **F3:** `AuthContext`, `ProtectedRoute`, `admin/layout`, `users/page`,
  `AdminSidebar`, `remisiones/page`, `sendUserInvitation.ts`.
- Cada fase: commit atómico + `tsc`/`build`/`lint` EXIT 0. Push a `beta`. Sin merge a `main`.

## Decisiones
- Matriz SSOT: colección `sys_permissions_matrix/{rol}` (fuera del NAMING LOCK Fase 9).
- Clave canónica: `rol`; lectura `doc.rol ?? doc.role`; `vendedor`→`cobrador`.
- FAIL-CLOSED en escrituras (salvo superadmin con DEFAULT_MATRIZ).
- Rules: autorización de escrituras vive en Server Actions; rules solo endurecen lecturas.
- Scope de propiedad por `email_usuario` / `email_inversor` (paridad FK Deuda 2).
