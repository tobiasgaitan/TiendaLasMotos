"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";

interface AuditRow {
    id: string;
    coleccion_afectada?: string;
    documento_id?: string;
    operacion?: string;
    datos_anteriores?: Record<string, unknown> | null;
    datos_nuevos?: Record<string, unknown> | null;
    campos_modificados?: string[];
    registrado_por?: string;
    registrado_por_email?: string;
    created_at?: unknown;
}

const COLECCIONES = ["creditos", "clientes_credito", "pagos_inversores", "pagos_y_multas", "remisiones_dinero"];
const OPERACIONES = ["CREATE", "UPDATE", "SOFT_DELETE"];

const inputCls =
    "bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500 outline-none";

function fmtTimestamp(v: unknown): string {
    if (!v) return "—";
    try {
        const d = (v as { toDate?: () => Date }).toDate
            ? (v as { toDate: () => Date }).toDate()
            : new Date(v as string | number);
        return d.toLocaleString("es-CO");
    } catch {
        return "—";
    }
}

function fmtJson(v: unknown): string {
    try {
        return JSON.stringify(v ?? null, null, 2);
    } catch {
        return "—";
    }
}

/**
 * Visor del ledger historial_auditoria — ESTRICTAMENTE SOLO LECTURA (Fase 8).
 * PROHIBIDO: cualquier botón/formulario de escritura y cualquier import del SDK
 * de escritura en este archivo (verificado por grep en el plan 08-06).
 */
export default function AuditoriaPage() {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<AuditRow[]>([]);
    const [fColeccion, setFColeccion] = useState("");
    const [fOperacion, setFOperacion] = useState("");
    const [fActor, setFActor] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // orderBy created_at desc con límite; si falta índice, fallback en memoria.
            let snap;
            try {
                const q = query(collection(db, "historial_auditoria"), orderBy("created_at", "desc"), limit(100));
                snap = await getDocs(q);
            } catch {
                const fallback = await getDocs(collection(db, "historial_auditoria"));
                const all = fallback.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditRow);
                all.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
                setRows(all.slice(0, 100));
                return;
            }
            setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditRow));
        } catch (error) {
            console.error("[creditos UI] Error cargando auditoría:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filtered = rows.filter(
        (r) =>
            (!fColeccion || r.coleccion_afectada === fColeccion) &&
            (!fOperacion || r.operacion === fOperacion) &&
            (!fActor || (r.registrado_por ?? "").toLowerCase().includes(fActor.toLowerCase()))
    );

    return (
        <div className="p-8 space-y-8 bg-gray-950 min-h-screen text-slate-200">
            <div className="border-b border-gray-800 pb-6">
                <h1 className="text-3xl font-bold text-white">Auditoría del módulo</h1>
                <p className="text-gray-400 mt-2">
                    Ledger inmutable <span className="font-mono text-amber-400">historial_auditoria</span> — solo lectura.
                    Cada escritura del módulo genera una entrada append-only.
                </p>
            </div>

            <div className="flex flex-wrap gap-3">
                <select value={fColeccion} onChange={(e) => setFColeccion(e.target.value)} className={inputCls}>
                    <option value="">Todas las colecciones</option>
                    {COLECCIONES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
                <select value={fOperacion} onChange={(e) => setFOperacion(e.target.value)} className={inputCls}>
                    <option value="">Todas las operaciones</option>
                    {OPERACIONES.map((o) => (
                        <option key={o} value={o}>{o}</option>
                    ))}
                </select>
                <input
                    value={fActor}
                    onChange={(e) => setFActor(e.target.value)}
                    placeholder="Filtrar por actor (uid)…"
                    className={inputCls}
                />
                <button
                    onClick={fetchData}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium"
                >
                    Recargar
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-amber-500 w-10 h-10" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                    Sin entradas. Las operaciones de escritura del módulo aparecerán aquí.
                </div>
            ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-400 border-b border-gray-800">
                                <th className="px-4 py-3">Fecha</th>
                                <th className="px-4 py-3">Colección</th>
                                <th className="px-4 py-3">Documento</th>
                                <th className="px-4 py-3">Operación</th>
                                <th className="px-4 py-3">Actor</th>
                                <th className="px-4 py-3">Campos</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r) => (
                                <>
                                    <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                        <td className="px-4 py-3 whitespace-nowrap">{fmtTimestamp(r.created_at)}</td>
                                        <td className="px-4 py-3 font-mono text-xs">{r.coleccion_afectada ?? "—"}</td>
                                        <td className="px-4 py-3 font-mono text-xs">{r.documento_id ?? "—"}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs border ${
                                                r.operacion === "CREATE"
                                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                                    : r.operacion === "SOFT_DELETE"
                                                      ? "bg-red-500/10 text-red-400 border-red-500/30"
                                                      : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                            }`}>
                                                {r.operacion ?? "—"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs">
                                            {r.registrado_por ?? "—"}
                                            {r.registrado_por_email ? <div className="text-gray-500">{r.registrado_por_email}</div> : null}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-400">
                                            {(r.campos_modificados ?? []).join(", ") || "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                                                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                                                title="Ver detalle"
                                            >
                                                {expanded === r.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                            </button>
                                        </td>
                                    </tr>
                                    {expanded === r.id && (
                                        <tr key={`${r.id}-detail`} className="bg-black/40">
                                            <td colSpan={7} className="px-4 py-3">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-xs text-gray-500 mb-1">ANTES</p>
                                                        <pre className="text-xs text-gray-300 bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto">
                                                            {fmtJson(r.datos_anteriores)}
                                                        </pre>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-gray-500 mb-1">DESPUÉS</p>
                                                        <pre className="text-xs text-gray-300 bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto">
                                                            {fmtJson(r.datos_nuevos)}
                                                        </pre>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
