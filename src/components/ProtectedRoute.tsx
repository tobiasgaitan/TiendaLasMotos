"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

interface ProtectedRouteProps {
    children: ReactNode;
    allowedRoles?: string[];
}

/**
 * Componente Wrapper para protección de rutas.
 * 
 * Verifica si el usuario está autenticado y si tiene el rol adecuado.
 * - Si no hay usuario -> Redirige a /admin/login.
 * - Si hay usuario pero rol incorrecto -> Redirige a / o muestra alerta.
 * - Muestra un spinner mientras verifica el estado (loading).
 * 
 * @param allowedRoles Array de strings con los roles permitidos (ej: ['admin', 'superadmin']).
 */
export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
    const { user, role, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                // Si no hay usuario, ir a login
                router.push("/admin/login");
            } else if (allowedRoles && role && !allowedRoles.includes(role)) {
                // Si hay usuario pero el rol no es permitido
                // Podríamos redirigir a una página de 403 o al home
                alert("Acceso denegado: No tienes permisos suficientes.");
                router.push("/");
            }
        }
    }, [user, role, loading, allowedRoles, router]);

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-900 text-white">
                <Spinner />
            </div>
        );
    }

    // Si no hay user, null (mientras redirige)
    if (!user) return null;

    // Si hay roles requeridos y el usuario no cumple, null (mientras redirige)
    if (allowedRoles && role && !allowedRoles.includes(role)) return null;

    return <>{children}</>;
}

function Spinner() {
    return (
        <svg
            className="h-8 w-8 animate-spin text-blue-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
        >
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            ></circle>
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
        </svg>
    );
}
