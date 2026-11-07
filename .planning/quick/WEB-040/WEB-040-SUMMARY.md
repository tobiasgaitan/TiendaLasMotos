# Quick Task WEB-040: Post-login destination hardening — Summary

**Executed:** 2026-11-07
**Status:** Complete (local beta; not pushed, merged, or deployed)

## What Was Done

- Added `resolverDestinoPostLogin(raw)` as a pure helper in `src/lib/auth/post-login.ts`.
  - `null`/empty/whitespace → `/admin/simulador?defaultLanding=1`
  - accepts only internal `/admin*` paths
  - rejects `/admin/login`, protocol-relative URLs, external URLs, `javascript:` and non-admin paths
  - canonicalizes `/admin/simulator` and `/admin/simulator/` to `/admin/simulador?defaultLanding=1`
  - guarantees `defaultLanding=1` on the simulator destination
  - preserves `/admin/inventario-asesor`, `/admin/creditos`, `/admin` and valid query strings
- Wired the helper into `handleLogin` for `callbackUrl` and into `handleRegister` for the default redirect.
- Added `src/test/utils/post-login.test.ts` with 21 checks, including the three GOD NODE roles via `landingPorRol`.
- Did **not** modify `landing.ts`, `ROLES`, `DEFAULT_MATRIZ`, `proxy.ts`, offline/outbox code, Storage, rules/indexes, or any route topology.
- Did **not** create `src/app/admin/simulator/page.tsx` or rename any slug.

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/lib/auth/post-login.ts` | Created | Pure post-login destination sanitizer/canonicalizer |
| `src/test/utils/post-login.test.ts` | Created | 21 regression checks for fallback, canonicalization, open-redirect rejection and role contract |
| `src/app/admin/login/LoginForm.tsx` | Modified | Uses the helper in `handleLogin` and `handleRegister` |
| `.planning/quick/WEB-040/WEB-040-PLAN.md` | Created | Quick task plan |
| `.planning/quick/WEB-040/WEB-040-SUMMARY.md` | Created | This summary |

## Verification

| Check | Result |
|-------|--------|
| `npx tsx src/test/utils/post-login.test.ts` | 21/21 PASS |
| `npx tsx src/test/utils/landing.test.ts` | 11/11 PASS (existing SSOT says 10/10; documentary debt noted) |
| `npx tsx src/test/utils/roles.test.ts` | PASS, including asesor/role regressions |
| `npx tsc --noEmit` | EXIT 0 |
| `npm run lint` | EXIT 0 |
| `npm run build` | EXIT 0; route table includes `/admin/simulador`, `/admin/inventario-asesor`, `/admin/creditos`; no `/admin/simulator` route |
| Local `next start` route probe | `/admin`, `/admin/simulador`, `/admin/inventario-asesor`, `/admin/creditos`, `/admin/simulator` all return 307 to login when unauthenticated (middleware gate, not a role UAT) |

## Blind Spot / Limitations

- There is still no component-level test for `LoginForm` or `RoleBasedRedirect`; the new test covers the pure helper and the role contract. A bad consumer wiring would not be caught by a render test in this repository because no React test framework is installed.
- Browser UAT with real `admin`, `asesor`, and `admin_creditos` sessions was **not executed**: no credentials or authorized test accounts are available in the repository, and creating production users/data is outside this task's scope.
- `proxy.ts:44` still drops the query string; the helper compensates by forcing `defaultLanding=1`, so this remains a non-blocking C1 cleanup candidate as approved.
- The eager guard debt at `simulador/page.tsx:191-199` remains assigned to WEB-041.

## Commits

- `d131f77` — `feat(quick-WEB-040): resolver seguro de destino post-login`
- `bb5b206` — `feat(quick-WEB-040): integrar resolver en LoginForm`
- Documentation commit is recorded in `STATE.md`.

---
*Completed: 2026-11-07*
