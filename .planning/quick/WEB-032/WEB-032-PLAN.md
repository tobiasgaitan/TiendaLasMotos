---
task: "WEB-032"
name: "Purge loginAdminWithGoogle huérfana + imports muertos"
description: "REWRITE de admin-auth.ts: solo logoutAdmin + signOut/auth; AuthContext intacto"
---

# WEB-032: Purge loginAdminWithGoogle

## Objective
Eliminar la función huérfana `loginAdminWithGoogle` (cero importadores), su const
`googleProvider` y sus imports exclusivos (`GoogleAuthProvider`, `signInWithPopup`,
`db`, `doc`, `getDoc`). Preservar `logoutAdmin` + `signOut` idénticos.

## Invariants
- `AuthContext.tsx` (su `loginWithGoogle` independiente): cero cambios.
- `firebase.ts`: cero cambios. Ningún otro archivo en `src/` modificado.

## Verificación (ejecutada)
- `loginAdminWithGoogle` en `src/` → vacío.
- `GoogleAuthProvider|signInWithPopup` en `admin-auth.ts` → vacío; en
  `AuthContext.tsx` → presente.
- `logoutAdmin|signOut` en `admin-auth.ts` → presente.
- `tsc`/`build` EXIT 0, `lint` 0 errores.
- `git diff --stat` → solo `src/lib/auth/admin-auth.ts`.
- Commit `purge(auth)...` + push a `beta`. Sin merge a `main`.

---
*Ticket: WEB-032*
