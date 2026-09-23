---
task: "020"
name: "Migración middleware.ts → proxy.ts (Next 16) — Deuda 3"
description: "Refactor estructural aislado: codemod canónico middleware-to-proxy con paridad perimetral 1:1"
---

# Quick Task 020: Migración middleware.ts → proxy.ts

## Objective
Migrar la convención deprecada `middleware.ts` a `proxy.ts` (Next 16) usando el codemod
canónico `npx @next/codemod@canary middleware-to-proxy .`, con paridad lógica 1:1 de
todo el perímetro de redirección. Cero cambios en `next.config.ts`. Cero cambios de
comportamiento de redirección.

## Guardrails (obligatorios)

### G1 — Mecanismo oficial
`npx @next/codemod@canary middleware-to-proxy .` ejecutado desde la raíz del repo.
Pre-paso obligatorio en seco: `--dry` (o `--print`) y auditoría del diff antes de aplicar.
PROHIBIDO editar `middleware.ts`/`proxy.ts` a mano salvo que el codemod no cubra un caso
y ello se documente en este plan.

### G2 — NAMING LOCK PERIMETRAL (paridad 1:1, no negociable)
Tras el codemod, verificar carácter por carácter que se preservan SIN alteración:
1. Cookie de sesión: `request.cookies.get('__session')?.value`.
2. Exclusión de login: `const isLoginPage = pathname === '/admin/login'`.
3. Protección admin: `const isAdminPath = pathname.startsWith('/admin') && !isLoginPage`
   y `if (isAdminPath && !session) → redirect /admin/login?callbackUrl=pathname`.
4. Bypass CSV: `if (pathname.endsWith('.csv')) return NextResponse.next()`.
5. `matcher` intacto: `'/((?!api|_next/static|_next/image|favicon.ico|.*\\.csv$).*)'`.
6. Bloque de redirección de login-logged-in permanece COMENTADO (líneas 50-58).
7. Renombrado esperado: `export function middleware(...)` → `export function proxy(...)`;
   archivo `src/middleware.ts` → `src/proxy.ts`.

### G3 — Manejo de config (Cloud Run)
1. `ls next.config.*` → confirmar el archivo real (`next.config.ts`).
2. Constatar que NO existen claves de middleware (`grep -nE
   'skipMiddlewareUrlNormalize|middlewarePrefetch|middlewareClientMaxBodySize|
   externalMiddlewareRewritesResolve' next.config.ts` → vacío).
3. Tras el codemod: `git diff --exit-code next.config.ts` debe dar EXIT 0 (sin cambios).
   Si el codemod toca `next.config.ts`, revertir ese archivo y reportar.
4. Confirmar que `output: 'standalone'` permanece (requisito Docker/Cloud Run).

### G4 — Estructura GSD
Flujo: `/gsd-quick` (refactor estructural aislado). Un solo plan atómico. Sin fase nueva.

## Evidence (inventario pre-ejecución)
- `src/middleware.ts` — 76 líneas, `export function middleware(request: NextRequest)`.
- `next.config.ts` — `output: 'standalone'`, `serverExternalPackages`, sin claves middleware.
- Única referencia a `middleware` en `src/`: la línea 4 del propio archivo.
- Next `^16.1.1` (middleware deprecado desde v16.0.0; proxy = Node.js runtime).

## Tasks

<task type="auto">
  <name>Task 0: Pre-flight — snapshot y validación de config (G3)</name>
  <files>[]</files>
  <action>
    1. `git status --porcelain` y registrar el commit base.
    2. `ls next.config.*` → confirmar `next.config.ts`.
    3. Grep de claves middleware en `next.config.ts` (debe ser vacío).
    4. Guardar hash de `next.config.ts` (`shasum`) para comparación post-codemod.
  </action>
  <verify>Config sin claves middleware; commit base y hash registrados.</verify>
  <done>Pre-flight documentado; autorizado a invocar el codemod.</done>
</task>

<task type="auto">
  <name>Task 1: Dry-run del codemod y auditoría del diff propuesto</name>
  <files>[]</files>
  <action>
    Ejecutar `npx @next/codemod@canary middleware-to-proxy . --dry` (y/o `--print`).
    Inspeccionar la salida y confirmar que SOLO propone:
    - renombrar `src/middleware.ts` → `src/proxy.ts`;
    - `export function middleware` → `export function proxy`;
    - ningún cambio en `next.config.ts`.
    Si propone algo fuera de eso, DETENER y reportar (no aplicar).
  </action>
  <verify>La salida del dry-run coincide con el renombrado esperado; config intacto.</verify>
  <done>Diff propuesto auditado; autorizado a aplicar.</done>
</task>

<task type="auto">
  <name>Task 2: Aplicar el codemod canónico (G1)</name>
  <files>[src/middleware.ts, src/proxy.ts]</files>
  <action>
    Ejecutar `npx @next/codemod@canary middleware-to-proxy .` desde la raíz.
    No editar archivos a mano.
  </action>
  <verify>Existe `src/proxy.ts`; `src/middleware.ts` ya no existe.</verify>
  <done>Codemod aplicado.</done>
</task>

<task type="auto">
  <name>Task 3: Auditoría de paridad perimetral (G2) y config (G3)</name>
  <files>[src/proxy.ts, next.config.ts]</files>
  <action>
    1. `git diff --find-renames src/middleware.ts src/proxy.ts` → confirmar que el único
       cambio es `middleware`→`proxy`; cuerpo, comentarios y `matcher` idénticos.
    2. Verificar los 7 puntos del NAMING LOCK PERIMETRAL (G2) con `grep -n`.
    3. `git diff --exit-code next.config.ts` (EXIT 0) y comparar `shasum` con Task 0.
    4. `grep -rn "middleware" src/` → solo el nombre del archivo `proxy.ts` si aparece
       en comentarios; cero referencias funcionales colgantes.
  </action>
  <verify>Diff = renombrado puro; 7 puntos G2 presentes; `next.config.ts` sin cambios.</verify>
  <done>Paridad 1:1 demostrada por diff; config intacto.</done>
</task>

<task type="auto">
  <name>Task 4: Verificación estática (tsc + build)</name>
  <files>[]</files>
  <action>
    `npx tsc --noEmit` (EXIT 0) y `npm run build` (EXIT 0).
    Confirmar que el build reconoce la convención: la tabla de rutas muestra
    `ƒ Proxy (Middleware)` y que `output: 'standalone'` sigue generando `.next/standalone`.
  </action>
  <verify>`tsc` EXIT 0; `npm run build` EXIT 0; proxy reconocido en el output.</verify>
  <done>Compilación y build limpios; sin regresión de standalone.</done>
</task>

<task type="manual">
  <name>Task 5: Matriz de paridad runtime (DIFERIDA — gate Auditor)</name>
  <files>[]</files>
  <action>
    NO ejecutar hasta certificación del Auditor. Checklist de redirección a validar en
    `https://tiendalasmotos-beta.web.app` (única URL oficial, prohibidos Preview Channels):
    a) `/admin` sin cookie `__session` → 302 a `/admin/login?callbackUrl=/admin`.
    b) `/admin/creditos` sin cookie → 302 a `/admin/login?callbackUrl=/admin/creditos`.
    c) `/admin/login` sin cookie → 200 (no redirige; sin loop).
    d) `/admin/login` con cookie → NO redirige (bloque comentado preservado).
    e) `/algo.csv` sin cookie → 200 (bypass CSV).
    f) `/` y rutas públicas → 200 sin interferencia.
  </action>
  <verify>Matriz a–f verificada en beta tras certificación del Auditor.</verify>
  <done>Paridad de redirección confirmada en runtime.</done>
</task>

## Must-Haves
- `src/proxy.ts` existe con `export function proxy`; `src/middleware.ts` eliminado.
- Diff = renombrado puro; los 7 puntos del NAMING LOCK PERIMETRAL intactos.
- `next.config.ts` sin cambios (`git diff --exit-code` = 0); `output: 'standalone'` intacto.
- `npx tsc --noEmit` y `npm run build` con EXIT 0.
- Cero cambios de comportamiento de redirección (demostrado por diff + matriz runtime diferida).
- Sin deploy a producción; sin E2E hasta certificación del Auditor.

## Rollback
Si el codemod produce un diff no esperado: `git checkout -- .` (revierte rename y edición)
y reportar. No dejar estado intermedio.

## Risks
- **Runtime Node.js por defecto en proxy:** el módulo solo usa `next/server`; sin APIs
  edge-only → sin impacto. Documentado.
- **Codemod sobre `next.config.ts`:** no hay claves middleware → transform no-op; validado
  por hash y `git diff --exit-code`.
- **Prompt interactivo del codemod:** confirmar comportamiento; usar flags de CI si aplica.

---
*Created: 2026-09-23 COT by Antigravity*
*Ticket: WEB-020*
