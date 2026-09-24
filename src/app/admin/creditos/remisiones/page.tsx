"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { generarCierreCaja, aprobarRemision, anularRemision } from "../financiero-actions";
import type { PagoYMultaConId, RemisionDineroConId } from "@/types/creditos";

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500";

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
function fmtCOP(n: unknown): string {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}
function esHoyBogota(d: Date | null): boolean {
    if (!d) return false;
    const ahora = new Date();
    const utcMs = ahora.getTime() + ahora.getTimezoneOffset() * 60000;
    const bog = new Date(utcMs - 5 * 3600000);
    return d.getFullYear() === bog.getFullYear() && d.getMonth() === bog.getMonth() && d.getDate() === bog.getDate();
}

export default function CierreCajaPage() {
    const { user, role } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [acumuladoHoy, setAcumuladoHoy] = useState(0);
    const [misRemisiones, setMisRemisiones] = useState<RemisionDineroConId[]>([]);
    const [pendientes, setPendientes] = useState<RemisionDineroConId[]>([]);
    const [generando, setGenerando] = useState(false);
    const [procesando, setProcesando] = useState<string | null>(null);

    const isAdmin = ['admin', 'superadmin'].includes((role || '').toLowerCase());

    useEffect(() => { setMounted(true); }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            // Ruta A': las remisiones se filtran por email_cobrador (email canónico).
            const emailCobrador = (user.email ?? '').toLowerCase().trim();
            const pagosSnap = await getDocs(query(collection(db, "pagos_y_multas"), where("registrado_por", "==", user.uid)));
            let mias: RemisionDineroConId[] = [];
            if (emailCobrador) {
                const remSnap = await getDocs(query(collection(db, "remisiones_dinero"), where("email_cobrador", "==", emailCobrador)));
                mias = remSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RemisionDineroConId));
                mias.sort((a, b) => (toDate(b.fecha_registro)?.getTime() ?? 0) - (toDate(a.fecha_registro)?.getTime() ?? 0));
            }
            let suma = 0;
            pagosSnap.docs.forEach((d) => {
                const p = d.data() as PagoYMultaConId;
                if ((p as { activo?: boolean }).activo === false) return;
                if (!esHoyBogota(toDate(p.fecha_registro))) return;
                if (typeof p.valor_neto_empresa === 'number' && Number.isFinite(p.valor_neto_empresa)) {
                    suma += p.valor_neto_empresa;
                }
            });
            setAcumuladoHoy(Math.round(suma * 100) / 100);

            setMisRemisiones(mias);

            if (isAdmin) {
                const pend = await getDocs(query(collection(db, "remisiones_dinero"), where("estado", "==", "pendiente")));
                const list = pend.docs.map((d) => ({ id: d.id, ...d.data() } as RemisionDineroConId));
                list.sort((a, b) => (toDate(b.fecha_registro)?.getTime() ?? 0) - (toDate(a.fecha_registro)?.getTime() ?? 0));
                setPendientes(list);
            }
        } catch (error) {
            console.error("[remisiones] Error cargando:", error);
            toast.error("Error cargando el cierre de caja.");
        } finally {
            setLoading(false);
        }
    }, [user, isAdmin]);

    useEffect(() => { if (mounted) fetchData(); }, [mounted, fetchData]);

    const actorOf = async () => {
        if (!user) throw new Error("Sesión inválida");
        return { uid: user.uid, idToken: await user.getIdToken() };
    };

    const handleGenerar = async () => {
        if (generando) return;
        setGenerando(true);
        try {
            const res = await generarCierreCaja(await actorOf());
            if (res.success) {
                toast.success(`Cierre generado por ${fmtCOP(res.monto)} (pendiente).`);
                await fetchData();
            } else {
                toast.error(res.message || "No se pudo generar.");
            }
        } catch (error) {
            console.error("[remisiones] Generar falló:", error);
            toast.error("Error al generar el cierre.");
        } finally {
            setGenerando(false);
        }
    };

    const handleAprobar = async (id: string) => {
        setProcesando(id);
        try {
            const res = await aprobarRemision(id, await actorOf());
            if (res.success) {
                toast.success("Remisión aprobada (recibido).");
                await fetchData();
            } else {
                toast.error(res.message || "No se pudo aprobar.");
            }
        } catch (error) {
            console.error("[remisiones] Aprobar falló:", error);
            toast.error("Error al aprobar.");
        } finally {
            setProcesando(null);
        }
    };

    const handleAnular = async (id: string) => {
        const motivo = window.prompt("Motivo de la anulación (obligatorio):");
        if (motivo === null || !motivo.trim()) {
            if (motivo !== null) toast.error("La anulación exige un motivo.");
            return;
        }
        setProcesando(id);
        try {
            const res = await anularRemision(id, motivo.trim(), await actorOf());
            if (res.success) {
                toast.success("Remisión anulada.");
                await fetchData();
            } else {
                toast.error(res.message || "No se pudo anular.");
            }
        } catch (error) {
            console.error("[remisiones] Anular falló:", error);
            toast.error("Error al anular.");
        } finally {
            setProcesando(null);
        }
    };

    if (!mounted || loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando…
            </div>
        );
    }

    const badge = (estado: string) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estado === 'recibido' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : estado === 'pendiente' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-gray-700/40 text-gray-400 border border-gray-600/40'}`}>
            {estado}
        </span>
    );

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold text-white">Cierre de Caja</h1>
                <p className="text-sm text-gray-400">Remisiones de dinero del cobrador al administrador</p>
            </div>

            {/* Vista cobrador */}
            <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Mi caja de hoy</h2>
                <p className="text-3xl font-bold text-white">{fmtCOP(acumuladoHoy)}</p>
                <p className="text-xs text-gray-500">Suma acumulada de valor_neto_empresa del día (America/Bogota).</p>
                <button type="button" onClick={handleGenerar} disabled={generando}
                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                    {generando && <Loader2 className="w-4 h-4 animate-spin" />}
                    {generando ? "Generando…" : "Generar Cierre de Caja"}
                </button>
            </section>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-3">Mis remisiones</h2>
                <div className="space-y-2">
                    {misRemisiones.map((r) => (
                        <div key={r.id} className="flex items-center justify-between bg-gray-800/50 border border-gray-700/60 rounded-lg px-3 py-2 text-sm">
                            <span className="text-white font-semibold">{fmtCOP(r.monto)}</span>
                            <span className="text-gray-500 text-xs">{toDate(r.fecha_registro)?.toLocaleString('es-CO') || '—'}</span>
                            {badge(r.estado)}
                        </div>
                    ))}
                    {misRemisiones.length === 0 && <p className="text-sm text-gray-500">Sin remisiones.</p>}
                </div>
            </section>

            {/* Vista admin */}
            {isAdmin && (
                <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-3">
                        Panel de aprobación ({pendientes.length} pendientes)
                    </h2>
                    <div className="space-y-2">
                        {pendientes.map((r) => (
                            <div key={r.id} className="flex items-center justify-between gap-3 bg-gray-800/50 border border-gray-700/60 rounded-lg px-3 py-2 text-sm">
                                <div>
                                    <p className="text-white font-semibold">{fmtCOP(r.monto)}</p>
                                    <p className="text-xs text-gray-500 font-mono">{r.email_cobrador} · {toDate(r.fecha_registro)?.toLocaleString('es-CO') || '—'}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => handleAprobar(r.id)} disabled={procesando === r.id}
                                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs">
                                        {procesando === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                        Recibir
                                    </button>
                                    <button type="button" onClick={() => handleAnular(r.id)} disabled={procesando === r.id}
                                        className="flex items-center gap-1 bg-gray-700 hover:bg-red-600/70 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs">
                                        <XCircle className="w-3 h-3" />
                                        Anular
                                    </button>
                                </div>
                            </div>
                        ))}
                        {pendientes.length === 0 && <p className="text-sm text-gray-500">Sin remisiones pendientes.</p>}
                    </div>
                </section>
            )}
        </div>
    );
}
