/**
 * WEB-038 — Purga de Cache Storage y Service Worker al cerrar sesión.
 *
 * El outbox de IndexedDB y la persistencia de Firestore se purgan en sus
 * módulos respectivos; aquí solo se eliminan las cachés del SW y se
 * desregistra el worker para que un usuario distinto no reciba HTML cacheado.
 */
export async function limpiarCachesServiceWorker(): Promise<void> {
    if (typeof window === "undefined") return;

    try {
        if ("caches" in window) {
            const nombres = await window.caches.keys();
            await Promise.all(
                nombres.map((nombre) => window.caches.delete(nombre))
            );
        }
    } catch (error) {
        console.error("[pwa] No se pudieron limpiar las cachés del SW:", error);
    }

    try {
        if ("serviceWorker" in navigator) {
            const registros =
                await navigator.serviceWorker.getRegistrations();
            await Promise.all(
                registros.map((registro) => registro.unregister())
            );
        }
    } catch (error) {
        console.error(
            "[pwa] No se pudo desregistrar el Service Worker:",
            error
        );
    }
}
