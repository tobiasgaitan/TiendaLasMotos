"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { createPagoYMulta, updatePagoYMulta, softDeletePagoYMulta } from "../actions";
import { Plus, Loader2, Pencil, Ban, X, Save } from "lucide-react";
import { toast } from "sonner";

interface RegistroRow {
    id: string;
    credito_id?: string;
    tipo?: string;
    monto?: number;
    fecha?: unknown;
    metodo_pago?: string;
    motivo?: string;
    referencia?: string;
    estado?: string;
}

const inputCls =
    "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors placeholder:text-gray-600";

const emptyForm = { credito_id: "", tipo: "PAGO", monto: "", fecha: "", metodo_pago: "", motivo: "", referencia: "", estado: "PENDIENTE" };

function fmtFecha(v: unknown): string {
    if (!v) return "—";
    try {
        const d = (v as { toDate?: () => Date }).toDate
            ? (v as { toDate: () => Date }).toDate()
            : new Date(v as string | number);
        return d.toLocaleDateString("es-CO");
    } catch {
        return "—";
    }
}

/**
 * Pagos y multas (Fase 8). `motivo` obligatorio si tipo === 'MULTA' (el servidor
 * re-valida; el cliente solo asiste). C4 + Server Actions.
 */
export default function PagosMultasPage() {
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<RegistroRow[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<RegistroRow | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [bajaId, setBajaId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const q = query(collection(db, "pagos_y_multas"), where("activo", "==", true));
            const snap = await getDocs(q);
            setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RegistroRow));
        } catch (error) {
            console.error("[creditos UI] Error cargando pagos/multas:", error);
            toast.error("Error cargando registros");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading) fetchData();
    }, [authLoading, fetchData]);

    const openModal = (item?: RegistroRow) => {
        if (item) {
            setEditing(item);
            setForm({
                credito_id: item.credito_id ?? "",
                tipo: item.tipo ?? "PAGO",
                monto: String(item.monto ?? ""),
                fecha: "",
                metodo_pago: item.metodo_pago ?? "",
                motivo: item.motivo ?? "",
                referencia: item.referencia ?? "",
                estado: item.estado ?? "PENDIENTE",
            });
        } else {
            setEditing(null);
            setForm(emptyForm);
        }
        setIsModalOpen(true);
    };

    const setF = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    const tipoEfectivo = editing ? editing.tipo ?? "PAGO" : form.tipo;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;
        if (!user) {
            toast.error("Sin sesión");
            return;
        }
        // Asistencia cliente: motivo visible/obligatorio en MULTA (el servidor decide).
        if (tipoEfectivo === "MULTA" && form.motivo.trim().length === 0) {
            toast.error("La multa exige motivo.");
            return;
        }
        setSaving(true);
        try {
            const idToken = await user.getIdToken();
            const actor = { uid: user.uid, idToken };
            let res;
            if (editing) {
                const payload: Record<string, unknown> = {
                    monto: form.monto,
                    metodo_pago: form.metodo_pago || undefined,
                    motivo: form.motivo.trim() || undefined,
                    referencia: form.referencia.trim() || undefined,
                    estado: form.estado,
                };
                if (form.fecha) payload.fecha = form.fecha;
                res = await updatePagoYMulta(editing.id, payload, actor);
            } else {
                res = await createPagoYMulta(
                    {
                        credito_id: form.credito_id.trim(),
                        tipo: form.tipo,
                        monto: form.monto,
                        fecha: form.fecha,
                        metodo_pago: form.metodo_pago || undefined,
                        motivo: form.motivo.trim() || undefined,
                        referencia: form.referencia.trim() || undefined,
                    },
                    actor
                );
            }
            if (res.success) {
                toast.success(res.message ?? "Guardado.");
                setIsModalOpen(false);
                await fetchData();
            } else {
                console.error("[creditos UI] Guardado falló:", res);
                const firstError = res.errors ? Object.values(res.errors).flat()[0] : undefined;
                toast.error(firstError ?? res.message ?? "Error al guardar.");
            }
        } catch (error) {
            console.error("[creditos UI] Excepción guardando:", error);
            toast.error("Error al guardar.");
        } finally {
            setSaving(false);
        }
    };

    const handleBaja = async (id: string) => {
        if (!user) {
            toast.error("Sin sesión");
            return;
        }
        if (!confirm("¿Dar de baja (lógica) este registro?")) return;
        const motivo = window.prompt("Motivo de la baja (obligatorio):", "");
        if (!motivo || motivo.trim().length === 0) {
            toast.error("La baja exige un motivo.");
            return;
        }
        setBajaId(id);
        try {
            const idToken = await user.getIdToken();
            const res = await softDeletePagoYMulta(id, motivo.trim(), { uid: user.uid, idToken });
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
                    <h1 className="text-3xl font-bold text-white">Pagos y multas</h1>
                    <p className="text-gray-400 mt-2">Recaudo de clientes y sanciones por mora.</p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="flex items-center gap-2 bg-amber-600 text-white px-6 py-2.5 rounded-lg hover:bg-amber-700 font-bold transition-all active:scale-95"
                >
                    <Plus size={18} /> Nuevo registro
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-amber-500 w-10 h-10" />
                </div>
            ) : rows.length === 0 ? (
                <div className="text-center py-20 text-gray-500">No hay registros.</div>
            ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-400 border-b border-gray-800">
                                <th className="px-4 py-3">Tipo</th>
                                <th className="px-4 py-3">Crédito</th>
                                <th className="px-4 py-3 text-right">Monto</th>
                                <th className="px-4 py-3">Fecha</th>
                                <th className="px-4 py-3">Motivo</th>
                                <th className="px-4 py-3">Estado</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs border ${r.tipo === "MULTA" ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}`}>
                                            {r.tipo ?? "—"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs">{r.credito_id ?? "—"}</td>
                                    <td className="px-4 py-3 text-right">${Number(r.monto ?? 0).toLocaleString("es-CO")}</td>
                                    <td className="px-4 py-3">{fmtFecha(r.fecha)}</td>
                                    <td className="px-4 py-3 text-gray-300">{r.motivo ?? "—"}</td>
                                    <td className="px-4 py-3">{r.estado ?? "—"}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => openModal(r)} className="p-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400" title="Editar">
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleBaja(r.id)}
                                                disabled={bajaId === r.id}
                                                className="p-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Baja lógica"
                                            >
                                                {bajaId === r.id ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center p-6 border-b border-gray-800">
                            <h2 className="text-xl font-bold text-white">
                                {editing ? `Editar (${editing.tipo ?? ""})` : "Nuevo registro"}
                            </h2>
                            <button onClick={() => !saving && setIsModalOpen(false)} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {!editing && (
                                <>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">Crédito ID *</label>
                                        <input value={form.credito_id} onChange={setF("credito_id")} required className={inputCls} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">Tipo *</label>
                                        <select value={form.tipo} onChange={setF("tipo")} className={inputCls}>
                                            <option value="PAGO">PAGO</option>
                                            <option value="MULTA">MULTA</option>
                                        </select>
                                    </div>
                                </>
                            )}
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Monto *</label>
                                <input type="number" min="0" value={form.monto} onChange={setF("monto")} required className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Fecha {editing ? "" : "*"}</label>
                                <input type="date" value={form.fecha} onChange={setF("fecha")} required={!editing} className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Método</label>
                                <select value={form.metodo_pago} onChange={setF("metodo_pago")} className={inputCls}>
                                    <option value="">—</option>
                                    <option value="EFECTIVO">EFECTIVO</option>
                                    <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                                    <option value="TARJETA">TARJETA</option>
                                    <option value="PSE">PSE</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">
                                    Motivo {tipoEfectivo === "MULTA" ? "*" : ""}
                                </label>
                                <input value={form.motivo} onChange={setF("motivo")} required={tipoEfectivo === "MULTA"} className={inputCls} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm text-gray-400 mb-2">Referencia</label>
                                <input value={form.referencia} onChange={setF("referencia")} className={inputCls} />
                            </div>
                            {editing && (
                                <div className="md:col-span-2">
                                    <label className="block text-sm text-gray-400 mb-2">Estado</label>
                                    <select value={form.estado} onChange={setF("estado")} className={inputCls}>
                                        <option value="PENDIENTE">PENDIENTE</option>
                                        <option value="APLICADO">APLICADO</option>
                                        <option value="ANULADO">ANULADO</option>
                                    </select>
                                </div>
                            )}
                            <div className="md:col-span-2">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex items-center gap-2 bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    {saving ? "Guardando…" : "Guardar"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
