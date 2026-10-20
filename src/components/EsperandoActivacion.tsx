'use client';

/**
 * WEB-038 — Pantalla "Esperando activación" para registro con doc ausente.
 *
 * Polling a `sys_admin_users/{email}` cada 5s. Al detectar el doc:
 * hard navigation (`window.location.href`) al landing por rol — esto
 * re-monta AuthContext y re-resuelve el rol (contrato SSOT).
 *
 * Timeout de 5 min (300_000ms): detiene el polling y muestra mensaje
 * "Contacta al administrador" para evitar costos de lectura de Firestore.
 * Cleanup completo de setInterval y setTimeout en el return del useEffect.
 */

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { resolverRol } from '@/lib/auth/resolve-rol';
import { landingPorRol } from '@/lib/auth/landing';

const POLL_MS = 5000;
const TIMEOUT_MS = 300_000; // 5 min

export default function EsperandoActivacion({ email }: { email: string }) {
    const [agotado, setAgotado] = useState(false);

    useEffect(() => {
        const emailKey = (email ?? '').toLowerCase().trim();
        if (!emailKey) return;

        const interval = setInterval(async () => {
            try {
                const snap = await getDoc(doc(db, 'sys_admin_users', emailKey));
                if (snap.exists()) {
                    clearInterval(interval);
                    clearTimeout(timeout);
                    const rol = resolverRol(snap.data() as Record<string, unknown>);
                    window.location.href = landingPorRol(rol);
                }
            } catch {
                // Silencioso: sigue el polling hasta el timeout.
            }
        }, POLL_MS);

        const timeout = setTimeout(() => {
            clearInterval(interval);
            setAgotado(true);
        }, TIMEOUT_MS);

        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [email]);

    return (
        <div className="flex items-center justify-center py-20">
            <div
                className="bg-amber-50 border border-amber-200 text-amber-800 px-6 py-4 rounded max-w-md text-center"
                role="alert"
            >
                <strong className="font-bold block mb-1">Esperando activación</strong>
                {agotado ? (
                    <span>
                        Tu cuenta aún no ha sido activada. Contacta al administrador si
                        tu cuenta no ha sido activada.
                    </span>
                ) : (
                    <span>
                        Un administrador debe asignarte un rol. Esta pantalla se
                        actualizará automáticamente.
                    </span>
                )}
            </div>
        </div>
    );
}
