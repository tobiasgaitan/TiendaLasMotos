"use client";

import { useOfflineQueue } from "@/hooks/useOfflineQueue";

/**
 * WEB-038 — Indicador no bloqueante de conexión y outbox del asesor.
 * Se oculta cuando hay conexión, no hay pendientes y no hay replay activo.
 */
export default function OfflineIndicator() {
    const { online, pendientes, sincronizando, ultimoError } =
        useOfflineQueue();

    if (online && pendientes === 0 && !sincronizando && !ultimoError) {
        return null;
    }

    const colorPunto = !online
        ? "bg-red-500"
        : sincronizando
          ? "bg-amber-400 animate-pulse"
          : "bg-amber-400";

    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed bottom-4 right-4 z-50 max-w-xs rounded-xl border border-gray-700 bg-gray-950/95 px-4 py-3 text-sm text-gray-100 shadow-2xl backdrop-blur"
        >
            <div className="flex items-start gap-3">
                <span
                    aria-hidden="true"
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${colorPunto}`}
                />
                <div className="space-y-1">
                    {!online && (
                        <p>
                            Sin conexión — los conteos se guardarán localmente.
                        </p>
                    )}
                    {sincronizando && <p>Sincronizando…</p>}
                    {pendientes > 0 && (
                        <p>
                            <strong>{pendientes}</strong>{" "}
                            pendiente{pendientes === 1 ? "" : "s"} por
                            sincronizar.
                        </p>
                    )}
                    {ultimoError && (
                        <p className="text-xs text-amber-300">{ultimoError}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
