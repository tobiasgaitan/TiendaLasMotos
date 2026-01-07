"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";

import { deleteSession } from "@/app/admin/login/actions";

/**
 * Componente de barra lateral (Sidebar) para el panel administrativo.
 * 
 * - Muestra estadísticas del usuario actual (Foto, Nombre, Rol).
 * - Maneja el cierre de sesión usando AuthContext.
 * - Navegación a Inventario y Prospectos.
 */
export default function AdminSidebar() {
    const { user, role, loading, logout } = useAuth();

    const handleLogout = async () => {
        try {
            // 1. Client-side Firebase Logout
            await logout();

            // 2. Server-side Cookie Deletion
            await deleteSession();

            // 3. FORCE HARD RELOAD to clear React state and prevent black screen
            window.location.href = '/admin/login';
        } catch (error) {
            console.error("Logout failed", error);
            // Fallback
            window.location.href = '/admin/login';
        }
    };

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
                    href="/admin/config"
                    className="flex h-[48px] w-full items-center justify-start gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium hover:bg-blue-600 hover:text-white transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                    </svg>
                    <p>Entidades Financieras</p>
                </Link>

                <Link
                    href="/admin/financial-parameters"
                    className="flex h-[48px] w-full items-center justify-start gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium hover:bg-blue-600 hover:text-white transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                    </svg>
                    <p>Matrículas y SOAT</p>
                </Link>

                <Link
                    href="/admin/inventory"
                    className="flex h-[48px] w-full items-center justify-start gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium hover:bg-blue-600 hover:text-white transition-colors"
                >
                    {/* SVG Icon: Tag/Inventory style */}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                    </svg>
                    <p>Inventario</p>
                </Link>
                <Link
                    href="/admin/prospectos"
                    className="flex h-[48px] w-full items-center justify-start gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium hover:bg-blue-600 hover:text-white transition-colors"
                >
                    {/* SVG Icon: Clipboard/List style */}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                    <p>Prospectos</p>
                </Link>

                <Link
                    href="/admin/simulador"
                    className="flex h-[48px] w-full items-center justify-start gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium hover:bg-blue-600 hover:text-white transition-colors border border-blue-600/30"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-brand-yellow">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5d-2.9-5.05a9 9 0 01-1.88-3.4M6 9a9 9 0 1112.72 8.707" />
                    </svg>
                    <p>Simulador Crédito</p>
                </Link>



                <div className="hidden h-auto w-full grow rounded-md bg-gray-900 md:block"></div>

                {/* Botón Salir */}
                <button
                    onClick={handleLogout}
                    className="mt-auto flex h-[48px] w-full items-center justify-start gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium text-white transition-colors hover:bg-red-600 hover:text-white"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                        className="w-6 h-6"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                        />
                    </svg>
                    <span>Cerrar Sesión</span>
                </button>
            </div>
        </div>
    );
}
