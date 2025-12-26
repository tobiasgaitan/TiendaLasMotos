'use client';

import { useState } from 'react';
import '@/app/globals.css';
import AdminSidenav from '@/app/ui/admin-sidenav';

/**
 * Layout principal del panel administrativo con funcionalidad responsive y sidebar móvil.
 * 
 * @component
 * @description Convierte el layout en un Client Component para manejar el estado del menú lateral (abierto/cerrado) en dispositivos móviles.
 * Implementa un Sidebar deslizable (off-canvas) en móviles y estático en desktop.
 * Mantiene la importación de `globals.css` y `AdminSidenav`.
 * 
 * @param {Object} props - Propiedades del componente layout.
 * @param {React.ReactNode} props.children - Contenido de la página hija renderizada dentro del layout.
 * @returns {JSX.Element} Estructura completa del dashboard con navegación responsive.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen w-full bg-black text-white overflow-hidden">

            {/* HEADER MÓVIL: Visible solo en móviles (md:hidden) */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-gray-900 border-b border-gray-800 flex items-center px-4 z-30 w-full">
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 text-white hover:bg-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Toggle Menu"
                >
                    {/* Icono Hamburger */}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                </button>
                <span className="ml-4 font-bold text-lg">Admin Panel</span>
            </div>

            {/* OVERLAY: Fondo oscuro cuando el menú está abierto en móvil */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
                    onClick={() => setSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* SIDEBAR CONTAINER: Responsive (Drawer móvil / Estático desktop) */}
            <div className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 
                flex flex-col transition-transform duration-300 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                md:relative md:translate-x-0 md:flex md:flex-none
            `}>
                {/* Botón Cerrar en móvil (Opcional pero buena UX dentro del drawer) */}
                <div className="md:hidden flex justify-end p-2">
                    <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <AdminSidenav />
            </div>

            {/* MAIN CONTENT AREA */}
            {/* Added pt-16 only on mobile to account for fixed header */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative pt-16 md:pt-0">
                <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
                    {children}
                </main>
            </div>
        </div>
    );
}