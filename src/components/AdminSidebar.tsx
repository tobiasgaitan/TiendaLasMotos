"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";

/**
 * Componente de barra lateral (Sidebar) para el panel administrativo.
 * 
 * - Muestra estadísticas del usuario actual (Foto, Nombre, Rol).
 * - Maneja el cierre de sesión usando AuthContext.
 * - Navegación a Inventario y Prospectos.
 */
export default function AdminSidebar() {
    const { user, role, loading, logout } = useAuth();

    return (
        <div className="flex h-full flex-col px-3 py-4 md:px-2">
            {/* Título / Logo */}
            <Link
                className="mb-2 flex h-20 items-end justify-start rounded-md bg-blue-600 p-4"
                href="/"
            >
                <div className="w-32 text-white md:w-40">
                    <span className="text-xl font-bold">TiendaMotos</span>
                </div>
            </Link>

            {/* User Profile Section */}
            <div className="mb-4 flex flex-col items-center justify-center rounded-md bg-gray-900 p-4 border border-gray-800">
                {loading ? (
                    <p className="text-sm text-gray-400">Cargando...</p>
                ) : user ? (
                    <div className="flex flex-col items-center gap-2 text-center">
                        {user.photoURL ? (
                            <Image
                                src={user.photoURL}
                                alt={user.displayName || "Usuario"}
                                width={48}
                                height={48}
                                className="rounded-full border-2 border-blue-500"
                            />
                        ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-700 text-xl font-bold text-gray-300 border-2 border-gray-600">
                                {user.displayName ? user.displayName.charAt(0).toUpperCase() : "U"}
                            </div>
                        )}
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-white">
                                {user.displayName || user.email}
                            </span>
                            <span className="text-xs font-mono text-blue-400 uppercase tracking-wider bg-blue-900/30 px-2 py-0.5 rounded-full mt-1">
                                {role || "Invitado"}
                            </span>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">No autenticado</p>
                )}
            </div>

            {/* Enlaces de Navegación */}
            <div className="flex grow flex-col space-y-2">
                <Link
                    href="/admin/inventory"
                    className="flex h-[48px] w-full items-center justify-start gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium hover:bg-blue-600 hover:text-white transition-colors"
                >
                    <p>Inventario</p>
                </Link>
                <Link
                    href="/admin/leads"
                    className="flex h-[48px] w-full items-center justify-start gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium hover:bg-blue-600 hover:text-white transition-colors"
                >
                    <p>Prospectos</p>
                </Link>

                <div className="hidden h-auto w-full grow rounded-md bg-gray-900 md:block"></div>

                {/* Botón Salir */}
                <button
                    onClick={() => logout()}
                    className="flex h-[48px] w-full items-center justify-start gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium hover:bg-red-600 hover:text-white transition-colors"
                >
                    <div>Cerrar Sesión</div>
                </button>
            </div>
        </div>
    );
}
