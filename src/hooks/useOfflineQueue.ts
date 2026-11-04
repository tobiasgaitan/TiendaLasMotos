"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { ActorInput } from "@/lib/actions/inventario-schemas";
import {
    encolarConteo as encolarConteoOutbox,
    EVENTO_OUTBOX,
    listarBorradores,
    sincronizarOutbox,
    type EntradaBorradorConteo,
} from "@/lib/offline/outbox";
import type { OpcionesEncolarConteo } from "@/lib/offline/outbox-utils";

export interface UseOfflineQueueResult {
    online: boolean;
    pendientes: number;
    sincronizando: boolean;
    ultimoError: string | null;
    encolarConteo: (
        entrada: EntradaBorradorConteo,
        foto: File | Blob,
        asesorEmail: string,
        opciones?: OpcionesEncolarConteo
    ) => Promise<string>;
    sincronizarAhora: () => Promise<void>;
    refrescarPendientes: () => Promise<void>;
}

/**
 * WEB-038 — Estado y sincronización del outbox offline del asesor.
 *
 * - Reintenta al recuperar conexión, al montar y cada 30 s (con backoff).
 * - No descarta borradores: los errores quedan visibles en el indicador.
 * - Solo sincroniza con rol asesor y token Firebase vigente.
 */
export function useOfflineQueue(): UseOfflineQueueResult {
    const { user, role } = useAuth();
    const [online, setOnline] = useState<boolean>(() => {
        if (typeof navigator === "undefined") return true;
        return navigator.onLine;
    });
    const [pendientes, setPendientes] = useState(0);
    const [sincronizando, setSincronizando] = useState(false);
    const [ultimoError, setUltimoError] = useState<string | null>(null);
    const sincronizandoRef = useRef(false);

    const actualizarPendientes = useCallback(async (): Promise<void> => {
        try {
            const borradores = await listarBorradores();
            setPendientes(borradores.length);

            const conError = borradores.find(
                (borrador) =>
                    borrador.estado_envio === "error" &&
                    typeof borrador.ultimo_error === "string" &&
                    borrador.ultimo_error.trim().length > 0
            );
            if (conError) {
                setUltimoError(conError.ultimo_error);
            } else if (borradores.length === 0) {
                setUltimoError(null);
            }
        } catch (error) {
            console.error("[offline] No se pudo leer la cola local:", error);
            setUltimoError(
                error instanceof Error
                    ? error.message
                    : "No se pudo leer la cola offline."
            );
        }
    }, []);

    const obtenerActor = useCallback(async (): Promise<ActorInput | null> => {
        if (!user) {
            console.error(
                "[offline] No hay usuario autenticado para sincronizar."
            );
            return null;
        }

        try {
            const idToken = await user.getIdToken();
            return { uid: user.uid, idToken };
        } catch (error) {
            console.error(
                "[offline] No se pudo obtener el token para sincronizar:",
                error
            );
            setUltimoError(
                error instanceof Error
                    ? error.message
                    : "No se pudo obtener el token."
            );
            return null;
        }
    }, [user]);

    const sincronizarAhora = useCallback(async (): Promise<void> => {
        if (role !== "asesor") return;
        if (sincronizandoRef.current) return;

        sincronizandoRef.current = true;
        setSincronizando(true);
        setUltimoError(null);

        try {
            const actor = await obtenerActor();
            if (!actor) return;

            const resultado = await sincronizarOutbox(actor);
            if (resultado.fallidos > 0) {
                setUltimoError(
                    resultado.ultimoError ||
                        `${resultado.fallidos} borrador(es) no se pudieron sincronizar.`
                );
            }
        } catch (error) {
            console.error("[offline] Falló la sincronización del outbox:", error);
            setUltimoError(
                error instanceof Error
                    ? error.message
                    : "Falló la sincronización del outbox."
            );
        } finally {
            sincronizandoRef.current = false;
            setSincronizando(false);
            await actualizarPendientes();
        }
    }, [role, obtenerActor, actualizarPendientes]);

    const encolarConteo = useCallback(
        async (
            entrada: EntradaBorradorConteo,
            foto: File | Blob,
            asesorEmail: string,
            opciones?: OpcionesEncolarConteo
        ): Promise<string> => {
            if (role !== "asesor") {
                const error = new Error(
                    "Solo el rol asesor puede encolar conteos offline."
                );
                console.error("[offline] Encolado rechazado:", error);
                throw error;
            }

            const emailSesion = user && user.email
                ? user.email.trim().toLowerCase()
                : "";
            const emailRecibido = asesorEmail.trim().toLowerCase();
            if (!emailSesion || emailRecibido !== emailSesion) {
                const error = new Error(
                    "El email del asesor no coincide con la sesión actual."
                );
                console.error("[offline] Encolado rechazado:", error);
                throw error;
            }

            const resultado = await encolarConteoOutbox(
                entrada,
                foto,
                emailRecibido,
                opciones
            );
            await actualizarPendientes();

            // navigator.onLine no es confiable: se intenta siempre y el
            // outbox conserva el borrador si la subida falla.
            void sincronizarAhora();

            return resultado.conteo_id;
        },
        [role, user, actualizarPendientes, sincronizarAhora]
    );

    useEffect(() => {
        setOnline(navigator.onLine);

        const alCambiarOutbox = () => {
            void actualizarPendientes();
        };

        const alRecuperarConexion = () => {
            setOnline(true);
            void actualizarPendientes();
            void sincronizarAhora();
        };

        const alPerderConexion = () => {
            setOnline(false);
        };

        window.addEventListener(EVENTO_OUTBOX, alCambiarOutbox);
        window.addEventListener("online", alRecuperarConexion);
        window.addEventListener("offline", alPerderConexion);

        void actualizarPendientes();
        // Se intenta incluso si navigator.onLine dice false.
        void sincronizarAhora();

        const intervalo = window.setInterval(() => {
            void actualizarPendientes();
            void sincronizarAhora();
        }, 30000);

        return () => {
            window.removeEventListener(EVENTO_OUTBOX, alCambiarOutbox);
            window.removeEventListener("online", alRecuperarConexion);
            window.removeEventListener("offline", alPerderConexion);
            window.clearInterval(intervalo);
        };
    }, [actualizarPendientes, sincronizarAhora]);

    return {
        online,
        pendientes,
        sincronizando,
        ultimoError,
        encolarConteo,
        sincronizarAhora,
        refrescarPendientes: actualizarPendientes,
    };
}
