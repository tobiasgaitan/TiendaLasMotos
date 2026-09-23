"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import type { HistorialAuditoriaConId, OperacionAuditoria } from "@/types/creditos";

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500";
const labelCls = "block text-xs font-medium text-gray-400 mb-1";

const COLECCIONES = ['creditos', 'clientes_credito', 'pagos_y_multas', 'pagos_inversores', 'remisiones_dinero'];
const OPERACIONES: OperacionAuditoria[] = ['CREATE', 'UPDATE', 'SOFT_DELETE'];

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

// NOTA: esta vista es estrictamente read-only. PROHIBIDO addDoc/updateDoc/deleteDoc/setDoc.

export default function AuditoriaPage() {
    const [mounted, setMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [eventos, setEventos] = useState<HistorialAuditoriaConId[]>([]);

    const [fColeccion, setFColeccion] = useState('');
    const [fOperacion, setFOperacion] = useState('');
    const [fActor, setFActor] = useState('');
    const [fDesde, setFDesde] = useState('');
    const [fHasta, setFHasta] = useState('');
    const [expandido, setExpandido] = useState<string | null>(null);

    useEffect(() => { setMounted(true); }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            let list: HistorialAuditoriaConId[];
            try {
                // Intento con índice (orderBy + limit)
                const snap = await getDocs(query(
                    collection(db, "historial_auditoria"),
                    orderBy("created_at", "desc"),
                    limit(100)
                ));
                list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as HistorialAuditoriaConId));
            } catch {
                // Fallback: orden en memoria si falta el índice
                console.warn("[auditoria] orderBy no disponible; usando orden en memoria.");
                const snap = await getDocs(collection(db, "historial_auditoria"));
                list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as HistorialAuditoriaConId));
                list.sort((a, b) => (toDate(b.created_at)?.getTime() ?? 0) - (toDate(a.created_at)?.getTime() ?? 0));
                list = list.slice(0, 100);
            }
            setEventos(list);
        } catch (error) {
            console.error("[auditoria] Error cargando ledger:", error);
            toast.error("Error cargando la auditoría.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (mounted) fetchData(); }, [mounted, fetchData]);

    const filtrados = eventos.filter((e) => {
        if (fColeccion && e.coleccion_afectada !== fColeccion) return false;
        if (fOperacion && e.operacion !== fOperacion) return false;
        if (fActor && !e.registrado_por.toLowerCase().includes(fActor.trim().toLowerCase())) return false;
        const t = toDate(e.created_at)?.getTime();
        if (fDesde && (t === undefined || t === null || t < new Date(fDesde).getTime())) return false;
        if (fHasta && (t === undefined || t === null || t > new Date(fHasta + 'T23:59:59').getTime())) return false;
        return true;
    });

    const badgeOp = (op: string) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-medium ${op === 'CREATE' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : op === 'UPDATE' ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>
            {op}
        </span>
    );

    if (!mounted || loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando…
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl">
            <div>
                <h1 className="text-2xl font-bold text-white">Auditoría</h1>
                <p className="text-sm text-gray-400">Ledger inmutable — solo lectura ({filtrados.length} eventos)</p>
            </div>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div><label className={labelCls}>Colección</label>
                        <select value={fColeccion} onChange={(e) => setFColeccion(e.target.value)} className={inputCls}>
                            <option value="">Todas</option>
                            {COLECCIONES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select></div>
                    <div><label className={labelCls}>Operación</label>
                        <select value={fOperacion} onChange={(e) => setFOperacion(e.target.value)} className={inputCls}>
                            <option value="">Todas</option>
                            {OPERACIONES.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select></div>
                    <div><label className={labelCls}>Actor (uid)</label>
                        <input value={fActor} onChange={(e) => setFActor(e.target.value)} className={inputCls} placeholder="uid…" /></div>
                    <div><label className={labelCls}>Desde</label>
                        <input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>Hasta</label>
                        <input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} className={inputCls} /></div>
                </div>
            </section>

            <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase text-gray-400 border-b border-gray-800">
                        <tr>
                            <th className="px-4 py-3">Fecha</th>
                            <th className="px-4 py-3">Colección</th>
                            <th className="px-4 py-3">Documento</th>
                            <th className="px-4 py-3">Op</th>
                            <th className="px-4 py-3">Actor</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtrados.map((e) => {
                            const open = expandido === e.id;
                            return (
                                <>
                                    <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                        <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                                            {toDate(e.created_at)?.toLocaleString('es-CO') || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{e.coleccion_afectada}</td>
                                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{e.documento_id.slice(0, 12)}…</td>
                                        <td className="px-4 py-3">{badgeOp(e.operacion)}</td>
                                        <td className="px-4 py-3 text-gray-400 font-mono text-xs max-w-48 break-all">
                                            {e.registrado_por}
                                            {e.registrado_por_email && <span className="block text-gray-500">{e.registrado_por_email}</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button type="button" onClick={() => setExpandido(open ? null : e.id)}
                                                className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700">
                                                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            </button>
                                        </td>
                                    </tr>
                                    {open && (
                                        <tr key={`${e.id}-d`} className="border-b border-gray-800/50 bg-gray-950/60">
                                            <td colSpan={6} className="px-4 py-3">
                                                <p className="text-xs text-gray-400 mb-2">
                                                    Campos modificados: <span className="font-mono text-amber-300">{e.campos_modificados?.join(', ') || '—'}</span>
                                                </p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <p className="text-xs text-gray-500 mb-1">Anterior</p>
                                                        <pre className="text-[11px] text-gray-400 bg-gray-900 border border-gray-800 rounded-lg p-2 overflow-x-auto max-h-48 overflow-y-auto">
                                                            {JSON.stringify(e.datos_anteriores, null, 2) || 'null'}
                                                        </pre>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-gray-500 mb-1">Nuevo</p>
                                                        <pre className="text-[11px] text-gray-300 bg-gray-900 border border-gray-800 rounded-lg p-2 overflow-x-auto max-h-48 overflow-y-auto">
                                                            {JSON.stringify(e.datos_nuevos, null, 2) || 'null'}
                                                        </pre>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            );
                        })}
                        {filtrados.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Sin eventos.</td></tr>
                            )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
