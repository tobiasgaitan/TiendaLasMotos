"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Calculator,
    Search,
    Settings,
    Users,
    FileText,
    Tag,
    LogOut,
    ChevronDown,
    ChevronRight,
    MapPin,
    Building2,
    CreditCard
} from "lucide-react";
import { deleteSession } from "@/app/admin/login/actions";

export default function AdminSidebar() {
    const { user, role, loading, logout } = useAuth();
    const pathname = usePathname();

    // State for Collapsible Groups
    const [openGroups, setOpenGroups] = useState<{ [key: string]: boolean }>({
        simuladores: true,  // Default Open
        config: false
    });

    const toggleGroup = (key: string) => {
        setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleLogout = async () => {
        try {
            await logout();
            await deleteSession();
            window.location.href = '/admin/login';
        } catch (error) {
            console.error("Logout failed", error);
            window.location.href = '/admin/login';
        }
    };

    // Helper to check active state
    const isActive = (path: string) => pathname === path;

    return (
        <div className="flex h-full flex-col px-3 py-4 md:px-2 bg-slate-950 text-slate-300 border-r border-slate-800">
            {/* Logo */}
            <Link
                className="mb-6 flex items-center justify-center rounded-xl bg-blue-600 p-4 shadow-lg shadow-blue-900/20"
                href="/"
            >
                <div className="text-white font-bold text-xl tracking-tight">
                    TiendaMotos
                </div>
            </Link>

            {/* Profile Card */}
            <div className="mb-6 flex items-center gap-3 rounded-xl bg-slate-900 p-3 border border-slate-800">
                {loading ? (
                    <div className="animate-pulse h-10 w-10 rounded-full bg-slate-700" />
                ) : user ? (
                    <>
                        <div className="relative h-10 w-10 shrink-0">
                            {user.photoURL ? (
                                <Image
                                    src={user.photoURL}
                                    alt="Profile"
                                    fill
                                    className="rounded-full object-cover border border-slate-600"
                                />
                            ) : (
                                <div className="h-full w-full rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">
                                    {user.displayName?.charAt(0) || "U"}
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="truncate text-sm font-semibold text-white">
                                {user.displayName || "Usuario"}
                            </span>
                            <span className="text-[10px] font-mono text-blue-400 uppercase tracking-wider">
                                {role || "ADMIN"}
                            </span>
                        </div>
                    </>
                ) : (
                    <span className="text-xs text-slate-500">No session</span>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 overflow-y-auto pr-1 custom-scrollbar">

                {/* --- GROUP: SIMULADORES --- */}
                <div className="space-y-1">
                    <button
                        onClick={() => toggleGroup('simuladores')}
                        className="w-full flex items-center justify-between p-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <Calculator className="w-5 h-5 text-emerald-500 group-hover:text-emerald-400" />
                            <span>Simuladores</span>
                        </div>
                        {openGroups['simuladores'] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    <div className={`space-y-1 pl-4 overflow-hidden transition-all duration-300 ease-in-out ${openGroups['simuladores'] ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                        <Link
                            href="/admin/simulador"
                            className={`flex items-center gap-3 p-2 text-sm rounded-lg transition-colors ${isActive('/admin/simulador') ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                            Simulador Crédito
                        </Link>
                        <Link
                            href="/admin/presupuesto"
                            className={`flex items-center gap-3 p-2 text-sm rounded-lg transition-colors ${isActive('/admin/presupuesto') ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                            Buscador Presupuesto
                        </Link>
                    </div>
                </div>

                <div className="my-2 border-t border-slate-800/50" />

                {/* --- SINGLE ITEMS --- */}
                <Link
                    href="/admin/inventory"
                    className={`flex items-center gap-3 p-2 text-sm font-medium rounded-lg transition-colors ${isActive('/admin/inventory') ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                >
                    <Tag className="w-5 h-5" />
                    Inventario
                </Link>

                <Link
                    href="/admin/prospectos"
                    className={`flex items-center gap-3 p-2 text-sm font-medium rounded-lg transition-colors ${isActive('/admin/prospectos') ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                >
                    <Users className="w-5 h-5" />
                    Prospectos
                </Link>

                <div className="my-2 border-t border-slate-800/50" />

                {/* --- GROUP: CONFIGURACIÓN DEL SISTEMA --- */}
                <div className="space-y-1">
                    <button
                        onClick={() => toggleGroup('config')}
                        className="w-full flex items-center justify-between p-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <Settings className="w-5 h-5 text-purple-500 group-hover:text-purple-400" />
                            <span>Configuración Sistema</span>
                        </div>
                        {openGroups['config'] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    <div className={`space-y-1 pl-4 overflow-hidden transition-all duration-300 ease-in-out ${openGroups['config'] ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'}`}>
                        <Link
                            href="/admin/config"
                            className={`flex items-center gap-3 p-2 text-sm rounded-lg transition-colors ${isActive('/admin/config') ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            <Building2 className="w-4 h-4" />
                            Entidades
                        </Link>
                        <Link
                            href="/admin/financial-parameters"
                            className={`flex items-center gap-3 p-2 text-sm rounded-lg transition-colors ${isActive('/admin/financial-parameters') ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            <FileText className="w-4 h-4" />
                            Matrículas / SOAT
                        </Link>
                        <Link
                            href="/admin/sedes"
                            className={`flex items-center gap-3 p-2 text-sm rounded-lg transition-colors ${isActive('/admin/sedes') ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            <MapPin className="w-4 h-4" />
                            Sedes / Ciudades
                        </Link>
                        <Link
                            href="/admin/users"
                            className={`flex items-center gap-3 p-2 text-sm rounded-lg transition-colors ${isActive('/admin/users') ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            <Users className="w-4 h-4" />
                            Config. Usuarios
                        </Link>
                    </div>
                </div>

            </nav>

            {/* Logout Button */}
            <div className="mt-auto pt-4 border-t border-slate-800">
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 p-3 text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all group"
                >
                    <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span>Cerrar Sesión</span>
                </button>
            </div>
        </div>
    );
}
