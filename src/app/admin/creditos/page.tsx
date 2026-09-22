"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { softDeleteCredito } from "./actions";
import { Plus, Loader2, Pencil, Eye, Ban } from "lucide-react";
import { toast } from "sonner";

interface CreditoRow {
    id: string;
    numero_credito?: string;
    cliente_id?: string;
    capital_financiado?: number;
    cuota_mensual?: number;
    estado?: string;
}

const ESTADO_COLORS: Record<string, string> = {
    SOLICITADO: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    APROBADO: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    DESEMBOLSADO: "bg-teal-500/10 text-teal-400 border-teal-500/30",
    ACTIVO: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    PAGADO: "bg-green-500/10 text-green-400 border-green-500/30",
    MOROSO: "bg-red-500/10 text-red-400 border-red-500/30",
    RECHAZADO: "bg-gray-500/10 text-gray-400 border-gray-500/30",
    ANULADO: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
};

/**
 * Listado de créditos (Fase 8).
 * Lecturas vía client-SDK (permitido: 08-02 solo bloquea writes).
 * Escrituras SOLO vía Server Actions. Hereda el guard de admin/layout.
 */
export default function CreditosPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [creditos, setCreditos] = useState<CreditoRow[]>([]);
    const [bajaId, setBajaId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const q = query(collection(db, "creditos"), where("activo", "==", true));
            const snap = await getDocs(q);
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CreditoRow);
            setCreditos(rows);
        } catch (error) {
            console.error("[creditos UI] Error cargando créditos:", error);
            toast.error("Error cargando créditos");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading) fetchData();
    }, [authLoading, fetchData]);

    const handleBaja = async (id: string, numero: string) => {
        if (!user) {
            toast.error("Sin sesión");
            return;
        }
        if (!confirm(`¿Dar de baja (lógica) el crédito ${numero}? Esta acción no se puede deshacer.`)) return;
        const motivo = window.prompt("Motivo de la baja (obligatorio):", "");
        if (!motivo || motivo.trim().length === 0) {
            toast.error("La baja exige un motivo.");
            return;
        }
        setBajaId(id); // Burst Mitigation: lock transicional
        try {
            const idToken = await user.getIdToken();
            const res = await softDeleteCredito(id, motivo.trim(), { uid: user.uid, idToken });
            if (res.success) {
                toast.success(res.message ?? "Baja registrada.");
                await fetchData();
            } else {
                toast.error(res.message ?? "Error en la baja.");
            }
        } catch (error) {
            console.error("[creditos UI] Error en baja:", error);
            toast.error("Error en la baja.");
        } finally {
            setBajaId(null);
        }
    };

    if (authLoading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-amber-500 w-10 h-10" />
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8 bg-gray-950 min-h-screen text-slate-200">
            <div className="flex justify-between items-center border-b border-gray-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">Créditos</h1>
                    <p className="text-gray-400 mt-2">Gestión de créditos otorgados (Fase 8).</p>
                </div>
                <button
                    onClick={() => router.push("/admin/creditos/nuevo")}
                    className="flex items-center gap-2 bg-amber-600 text-white px-6 py-2.5 rounded-lg hover:bg-amber-700 shadow-lg font-bold transition-all active:scale-95"
                >
                    <Plus size={18} /> Nuevo crédito
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-amber-500 w-10 h-10" />
                </div>
            ) : creditos.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                    No hay créditos activos. Crea el primero con “Nuevo crédito”.
                </div>
            ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-400 border-b border-gray-800">
                                <th className="px-4 py-3">Número</th>
                                <th className="px-4 py-3">Cliente ID</th>
                                <th className="px-4 py-3 text-right">Capital</th>
                                <th className="px-4 py-3 text-right">Cuota</th>
                                <th className="px-4 py-3">Estado</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {creditos.map((c) => (
                                <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                    <td className="px-4 py-3 font-mono text-amber-400">{c.numero_credito ?? c.id}</td>
                                    <td className="px-4 py-3 font-mono text-xs text-gray-300">{c.cliente_id ?? "—"}</td>
                                    <td className="px-4 py-3 text-right">${Number(c.capital_financiado ?? 0).toLocaleString("es-CO")}</td>
                                    <td className="px-4 py-3 text-right">${Number(c.cuota_mensual ?? 0).toLocaleString("es-CO")}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs border ${ESTADO_COLORS[c.estado ?? ""] ?? "bg-gray-500/10 text-gray-400 border-gray-500/30"}`}>
                                            {c.estado ?? "—"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end gap-2">
                                            <Link
                                                href={`/admin/creditos/${c.id}`}
                                                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                                                title="Ver detalle"
                                            >
                                                <Eye size={16} />
                                            </Link>
                                            <Link
                                                href={`/admin/creditos/${c.id}/editar`}
                                                className="p-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400"
                                                title="Editar"
                                            >
                                                <Pencil size={16} />
                                            </Link>
                                            <button
                                                onClick={() => handleBaja(c.id, c.numero_credito ?? c.id)}
                                                disabled={bajaId === c.id}
                                                className="p-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Baja lógica"
                                            >
                                                {bajaId === c.id ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
