"use client";

import { useAuth } from "@/context/AuthContext";
import AccesoDenegado from "@/components/inventario/AccesoDenegado";
import ConteoAsesorForm from "./ConteoAsesorForm";

export default function InventarioAsesorPage() {
    const { user, role, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-red-500" />
                    <p className="animate-pulse text-gray-400">
                        Validando sesión…
                    </p>
                </div>
            </div>
        );
    }

    if (role !== "asesor") {
        return (
            <AccesoDenegado mensaje="Esta pantalla es exclusiva del rol asesor. Si necesitas aprobar conteos, usa Aprobaciones de Repuestos." />
        );
    }

    if (!user) {
        return (
            <AccesoDenegado mensaje="No hay una sesión activa. Inicia sesión de nuevo." />
        );
    }

    if (typeof user.email !== "string" || !user.email.trim()) {
        return (
            <AccesoDenegado mensaje="Tu usuario no tiene un correo asociado. Contacta al administrador." />
        );
    }

    return <ConteoAsesorForm />;
}
