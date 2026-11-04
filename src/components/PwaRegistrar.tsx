"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * WEB-038 — Registra el service worker manual únicamente cuando el rol
 * resuelto es asesor y en producción. El registro se hace después de la
 * recarga controlada de persistencia offline.
 */
export default function PwaRegistrar() {
    const { role, loading } = useAuth();

    useEffect(() => {
        if (loading || role !== "asesor") return;
        if (process.env.NODE_ENV !== "production") return;
        if (typeof navigator === "undefined") return;
        if (!("serviceWorker" in navigator)) return;

        navigator.serviceWorker
            .register("/sw.js", { scope: "/" })
            .catch((error) =>
                console.error(
                    "[pwa] Registro del service worker falló:",
                    error
                )
            );
    }, [role, loading]);

    return null;
}
