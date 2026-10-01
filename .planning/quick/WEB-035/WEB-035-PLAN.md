---
task: "WEB-035"
name: "Eliminación completa de admin-auth.ts (cierre R-google-orphan)"
description: "Purge del archivo huérfano; logout real del sistema reside en AuthContext.tsx"
---

# WEB-035: Purge de admin-auth.ts

## Objective
Eliminar `src/lib/auth/admin-auth.ts` (único export: `logoutAdmin` huérfano, cero
importadores). Cierre definitivo del ciclo iniciado en WEB-032 (que purgó
`loginAdminWithGoogle` + imports muertos).

## Evidence
- `grep -rn "admin-auth" src/ scripts/ functions/src/` → vacío (pre y post).
- `grep -rn "logoutAdmin" src/` → vacío (solo su definición, eliminada).
- Logout real: `AuthContext.tsx:146-149` (`signOut(auth)` directo); `AdminSidebar`
  consume `logout` de `useAuth()`. Intactos.

## Invariants
- `AuthContext.tsx`, `AdminSidebar.tsx`, `LoginForm.tsx`, `firebase.ts`: cero cambios.
- Ningún otro archivo en `src/`, `scripts/`, `functions/src/`.

## Verificación (ejecutada)
- Greps post-eliminación → vacíos.
- `tsc`/`build` EXIT 0, `lint` 0 errores.
- `git status` → solo borrado + docs. `git diff --stat` → 0 líneas añadidas en código.
- Commits: `purge(auth)...` + `docs(psd)...`. Push a `beta`. Sin merge a `main`.

---
*Ticket: WEB-035*
