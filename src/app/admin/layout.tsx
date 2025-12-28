'use client';

import { useState } from 'react';
import '@/app/globals.css';
import AdminSidebar from '@/components/AdminSidebar';

/**
 * Layout principal del panel administrativo.
 * Estructura "Split":
 * - Desktop: Sidebar estático a la izquierda.
 * - Móvil: Drawer deslizable + Header superior.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen bg-black text-white overflow-hidden relative">

            {/* 1. DESKTOP SIDEBAR (Static, hidden on mobile) */}
            <aside className="hidden md:flex w-64 flex-col border-r border-gray-800 bg-gray-900 overflow-y-auto">
                <AdminSidebar />
            </aside>

            {/* 2. MOBILE SIDEBAR (Drawer, hidden on desktop) */}
            {/* Backdrop (Fondo oscuro al abrir menú en móvil) */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Drawer Panel (El menú deslizable) */}
            <div className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out md:hidden
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="flex justify-end p-4">
                    <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="h-full overflow-y-auto">
                    <AdminSidebar />
                </div>
            </div>

            {/* 3. MAIN CONTENT AREA */}
            <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

                {/* Mobile Header (Hidden on Desktop) */}
                <header className="flex items-center justify-between h-16 px-4 border-b border-gray-800 bg-gray-900 md:hidden z-30">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <span className="text-lg font-bold text-white">Admin Panel</span>
                    </div>
                </header>

                {/* Content Scroll Area */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}