---
task: WEB-040
name: Post-login destination hardening
description: Resolver seguro del destino post-login para eliminar el open-redirect y canonicalizar /admin/simulator sin crear topología nueva.
---

# Quick Task WEB-040: Post-login destination hardening

## Objective

Aislar el destino posterior al login en un helper puro que rechace URLs externas,
`/admin/login` y el slug inexistente `/admin/simulator`, canonicalice el destino
válido a `/admin/simulador?defaultLanding=1` y preserve deep links internos de
`/admin`. `RoleBasedRedirect` sigue siendo la única fuente de verdad para aplicar
`landingPorRol(role)`.

## Tasks

<task type="auto">
  <name>Crear helper puro y test de regresión</name>
  <files>src/lib/auth/post-login.ts, src/test/utils/post-login.test.ts</files>
  <action>
    Crear `resolverDestinoPostLogin(raw)` con las reglas aprobadas:
    - null/vacío → `/admin/simulador?defaultLanding=1`
    - aceptar solo rutas internas `/admin*`
    - rechazar `/admin/login`, `//evil.com`, `https://...` y rutas no admin
    - canonicalizar `/admin/simulator` → `/admin/simulador?defaultLanding=1`
    - garantizar `defaultLanding=1` en el destino simulador
    - preservar `/admin/inventario-asesor`, `/admin/creditos` y `/admin`
    Añadir el test de contrato, incluyendo los tres roles del GOD NODE.
  </action>
  <verify>npx tsx src/test/utils/post-login.test.ts</verify>
  <done>El test pasa y demuestra que `/admin/simulator` nunca es devuelto.</done>
</task>

<task type="auto">
  <name>Integrar el helper en LoginForm y verificar</name>
  <files>src/app/admin/login/LoginForm.tsx</files>
  <action>
    Consumir `resolverDestinoPostLogin` en `handleLogin` y `handleRegister`.
    No modificar `landing.ts`, `ROLES`, `DEFAULT_MATRIZ` ni `proxy.ts`.
    No crear `src/app/admin/simulator/page.tsx` ni ningún slug nuevo.
  </action>
  <verify>npx tsc --noEmit &amp;&amp; npm run lint &amp;&amp; npx tsx src/test/utils/landing.test.ts &amp;&amp; npx tsx src/test/utils/roles.test.ts &amp;&amp; npx tsx src/test/utils/post-login.test.ts &amp;&amp; npm run build</verify>
  <done>Calidad EXIT 0 y el bundle compilado no introduce `/admin/simulator` como destino.</done>
</task>

---
*Created: 2026-11-07*
