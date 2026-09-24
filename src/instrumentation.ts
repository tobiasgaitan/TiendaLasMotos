/**
 * Instrumentation Hook (Quick 024 — Deuda 5 MaxListeners).
 *
 * Hook oficial de Next.js: `register()` se ejecuta UNA sola vez al iniciar el
 * servidor Node.js, antes de que se instancien los servidores.
 *
 * Eleva el umbral de listeners del proceso a 25 para silenciar
 * `MaxListenersExceededWarning` (11 uncaughtException listeners vs umbral 10)
 * SIN alterar los handlers de error de Next.js ni de firebase-admin.
 *
 * ZERO_TOUCH: next.config.ts, src/lib/firebase-admin.ts y consumidores intactos.
 */
export async function register() {
    if (typeof process !== 'undefined' && typeof process.setMaxListeners === 'function') {
        process.setMaxListeners(25);
    }
}
