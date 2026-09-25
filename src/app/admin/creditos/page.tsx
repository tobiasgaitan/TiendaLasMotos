"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Loader2, Eye, Pencil, Ban } from "lucide-react";
import { softDeleteCredito } from "./actions";
import type { CreditoConId, ClienteCreditoConId, PagoYMultaConId } from "@/types/creditos";
import { calcularMoraRenting } from "@/lib/actions/creditos-calc";

// Helpers locales (inline por página — set de archivos 09-05)
function toDate(v: unknown): Date | null {
    if (!v) return null;
    if (v instanceof Date) return v;
    const t = v as { toDate?: () => Date };
    if (typeof t.toDate === 'function') {
        try { return t.toDate(); } catch { return null; }
    }
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
}

function fmtCOP(n: number): string {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    }).format(n);
}

export default function CreditosListPage() {
    const { user, loading: authLoading, puedeAccion } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [creditos, setCreditos] = useState<CreditoConId[]>([]);
    const [clientes, setClientes] = useState<Record<string, ClienteCreditoConId>>({});
    const [recibidoPorCredito, setRecibidoPorCredito] = useState<Record<string, number>>({});

    useEffect(() => { setMounted(true); }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [credSnap, cliSnap, pagosSnap] = await Promise.all([
                getDocs(query(collection(db, "creditos"), where("activo", "==", true))),
                getDocs(collection(db, "clientes_credito")),
                getDocs(query(collection(db, "pagos_y_multas"), where("activo", "==", true))),
            ]);
            const creds = credSnap.docs.map((d) => ({ id: d.id, ...d.data() } as CreditoConId));
            // Orden en memoria por fecha_registro desc (sin depender de índice)
            creds.sort((a, b) => {
                const ta = toDate(a.fecha_registro)?.getTime() ?? 0;
                const tb = toDate(b.fecha_registro)?.getTime() ?? 0;
                return tb - ta;
            });
            setCreditos(creds);

            const cliMap: Record<string, ClienteCreditoConId> = {};
            cliSnap.docs.forEach((d) => { cliMap[d.id] = { id: d.id, ...d.data() } as ClienteCreditoConId; });
            setClientes(cliMap);

            const sum: Record<string, number> = {};
            pagosSnap.docs.forEach((d) => {
                const p = d.data() as PagoYMultaConId;
                const v = typeof p.valor_pagado_cliente === 'number' ? p.valor_pagado_cliente : 0;
                sum[p.id_credito] = (sum[p.id_credito] ?? 0) + v;
            });
            setRecibidoPorCredito(sum);
        } catch (error) {
            console.error("[creditos] Error cargando contratos:", error);
            toast.error("Error cargando los contratos.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (mounted) fetchData(); }, [mounted, fetchData]);

    const handleBaja = async (id: string) => {
        const motivo = window.prompt("Motivo de la baja lógica (obligatorio):");
        if (motivo === null) return;
        if (!motivo.trim()) {
            toast.error("La baja exige un motivo.");
            return;
        }
        if (!user) {
            toast.error("Sesión inválida.");
            return;
        }
        try {
            const res = await softDeleteCredito(id, motivo.trim(), {
                uid: user.uid, idToken: await user.getIdToken(),
            });
            if (res.success) {
                toast.success(res.message || "Baja registrada.");
                await fetchData();
            } else {
                toast.error(res.message || "No se pudo dar de baja.");
            }
        } catch (error) {
            console.error("[creditos] Baja falló:", error);
            toast.error("Error al dar de baja.");
        }
    };

    if (!mounted || loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando contratos…
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Gestión de Contratos</h1>
                    <p className="text-sm text-gray-400">Créditos y renting — {creditos.length} activos</p>
                </div>
                {!authLoading && puedeAccion('creditos', 'create') && (
                <Link
                    href="/admin/creditos/nuevo"
                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus className="w-4 h-4" /> Nuevo crédito
                </Link>
                )}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase text-gray-400 border-b border-gray-800">
                        <tr>
                            <th className="px-4 py-3">Contrato</th>
                            <th className="px-4 py-3">Placa</th>
                            <th className="px-4 py-3">Cliente</th>
                            <th className="px-4 py-3">Modalidad</th>
                            <th className="px-4 py-3">Cuota</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {creditos.map((c) => {
                            const cli = clientes[c.id_cliente];
                            const fechaReg = toDate(c.fecha_registro) ?? new Date();
                            const totalRecibido = recibidoPorCredito[c.id] ?? 0;
                            const mora = c.condiciones
                                ? calcularMoraRenting(c.condiciones, fechaReg, totalRecibido)
                                : null;
                            const enMora = mora?.estado === 'en_mora';
                            return (
                                <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                    <td className="px-4 py-3 font-mono text-xs text-gray-300">
                                        {c.numero_credito || c.id.slice(0, 8)}
                                    </td>
                                    <td className="px-4 py-3 font-semibold text-white">
                                        {c.vehiculo?.placa || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">
                                        {cli ? `${cli.nombres} · ${cli.cedula}` : c.id_cliente.slice(0, 8)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">
                                        {c.condiciones?.modalidad_credito || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">
                                        {c.condiciones ? fmtCOP(c.condiciones.valor_cuota) : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {mora && c.condiciones?.modalidad_credito === 'renting' ? (
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${enMora ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'}`}>
                                                {enMora ? `en_mora (${fmtCOP(mora.saldo_mora)})` : 'activo'}
                                            </span>
                                        ) : (
                                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-700/40 text-gray-300 border border-gray-600/40">
                                                activo
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-2">
                                            <Link href={`/admin/creditos/${c.id}`} title="Ver"
                                                className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700">
                                                <Eye className="w-4 h-4" />
                                            </Link>
                                            {!authLoading && puedeAccion('creditos', 'update') && (
                                            <Link href={`/admin/creditos/${c.id}/editar`} title="Editar"
                                                className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700">
                                                <Pencil className="w-4 h-4" />
                                            </Link>
                                            )}
                                            {!authLoading && puedeAccion('creditos', 'update') && (
                                            <button onClick={() => handleBaja(c.id)} title="Baja lógica"
                                                className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/10">
                                                <Ban className="w-4 h-4" />
                                            </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {creditos.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                                    Sin contratos activos. Crea el primero con “Nuevo crédito”.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
