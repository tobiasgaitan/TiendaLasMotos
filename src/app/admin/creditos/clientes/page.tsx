"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { createClienteCredito, updateClienteCredito, softDeleteClienteCredito } from "../actions";
import { Plus, Loader2, Pencil, Ban, X, Save } from "lucide-react";
import { toast } from "sonner";

interface ClienteRow {
    id: string;
    cedula?: string;
    nombres?: string;
    celular?: string;
    direccion?: string;
    fecha_registro?: unknown;
    tipo_documento?: string;
}

const inputCls =
    "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors placeholder:text-gray-600";

const emptyForm = {
    cedula: "",
    nombres: "",
    celular: "",
    direccion: "",
    fecha_registro: "",
    tipo_documento: "",
    apellidos: "",
    email: "",
    ciudad: "",
};

/**
 * Tolerancia de lectura para celular legacy (C4): normaliza 10 dígitos a 57…
 * para visualización. Si no es normalizable, error explícito en la fila —
 * prohibido null-masking silencioso.
 */
function displayCelular(raw: unknown): { text: string; legacyError: boolean } {
    const digits = String(raw ?? "").replace(/\D/g, "");
    if (digits.length === 10) return { text: "57" + digits, legacyError: false };
    if (digits.length === 12 && digits.startsWith("57")) return { text: digits, legacyError: false };
    if (digits.length === 0) return { text: "—", legacyError: false };
    return { text: String(raw ?? ""), legacyError: true };
}

/**
 * Alta/edición de clientes_credito (Fase 8, NAMING LOCK físico).
 * C4: Burst Mitigation + Faraday Cage + tolerancia celular legacy.
 * Escrituras SOLO vía Server Actions.
 */
export default function ClientesPage() {
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [clientes, setClientes] = useState<ClienteRow[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<ClienteRow | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [bajaId, setBajaId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const q = query(collection(db, "clientes_credito"), where("activo", "==", true));
            const snap = await getDocs(q);
            setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClienteRow));
        } catch (error) {
            console.error("[creditos UI] Error cargando clientes:", error);
            toast.error("Error cargando clientes");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading) fetchData();
    }, [authLoading, fetchData]);

    const openModal = (item?: ClienteRow) => {
        if (item) {
            setEditing(item);
            setForm({
                cedula: item.cedula ?? "",
                nombres: item.nombres ?? "",
                celular: String(item.celular ?? ""),
                direccion: item.direccion ?? "",
                fecha_registro: "",
                tipo_documento: item.tipo_documento ?? "",
                apellidos: "",
                email: "",
                ciudad: "",
            });
        } else {
            setEditing(null);
            setForm(emptyForm);
        }
        setIsModalOpen(true);
    };

    const setF = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return; // Burst Mitigation
        if (!user) {
            toast.error("Sin sesión");
            return;
        }
        setSaving(true); // lock transicional
        try {
            // Faraday Cage: trim + whitelist estricta (fecha_registro NUNCA en edición).
            const payload: Record<string, unknown> = {
                cedula: form.cedula.trim(),
                nombres: form.nombres.trim(),
                celular: form.celular.trim(),
                direccion: form.direccion.trim(),
                tipo_documento: form.tipo_documento || undefined,
                apellidos: form.apellidos.trim() || undefined,
                email: form.email.trim() || undefined,
                ciudad: form.ciudad.trim() || undefined,
            };
            if (!editing) {
                payload.fecha_registro = form.fecha_registro || undefined;
            }
            const idToken = await user.getIdToken();
            const actor = { uid: user.uid, idToken };
            const res = editing
                ? await updateClienteCredito(editing.id, payload, actor)
                : await createClienteCredito(payload, actor);
            if (res.success) {
                toast.success(res.message ?? "Guardado.");
                setIsModalOpen(false);
                await fetchData();
            } else {
                console.error("[creditos UI] Guardado de cliente falló:", res);
                const firstError = res.errors ? Object.values(res.errors).flat()[0] : undefined;
                toast.error(firstError ?? res.message ?? "Error al guardar.");
            }
        } catch (error) {
            console.error("[creditos UI] Excepción guardando cliente:", error);
            toast.error("Error al guardar.");
        } finally {
            setSaving(false);
        }
    };

    const handleBaja = async (id: string, cedula: string) => {
        if (!user) {
            toast.error("Sin sesión");
            return;
        }
        if (!confirm(`¿Dar de baja (lógica) al cliente ${cedula}?`)) return;
        const motivo = window.prompt("Motivo de la baja (obligatorio):", "");
        if (!motivo || motivo.trim().length === 0) {
            toast.error("La baja exige un motivo.");
            return;
        }
        setBajaId(id);
        try {
            const idToken = await user.getIdToken();
            const res = await softDeleteClienteCredito(id, motivo.trim(), { uid: user.uid, idToken });
            if (res.success) {
                toast.success(res.message ?? "Baja registrada.");
                await fetchData();
            } else {
                toast.error(res.message ?? "Error en la baja.");
            }
        } catch (error) {
            console.error("[creditos UI] Error en baja de cliente:", error);
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
                    <h1 className="text-3xl font-bold text-white">Clientes de crédito</h1>
                    <p className="text-gray-400 mt-2">Claves canónicas: cedula, nombres, celular, direccion, fecha_registro.</p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="flex items-center gap-2 bg-amber-600 text-white px-6 py-2.5 rounded-lg hover:bg-amber-700 font-bold transition-all active:scale-95"
                >
                    <Plus size={18} /> Nuevo cliente
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-amber-500 w-10 h-10" />
                </div>
            ) : clientes.length === 0 ? (
                <div className="text-center py-20 text-gray-500">No hay clientes activos.</div>
            ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-400 border-b border-gray-800">
                                <th className="px-4 py-3">Cédula</th>
                                <th className="px-4 py-3">Nombres</th>
                                <th className="px-4 py-3">Celular</th>
                                <th className="px-4 py-3">Dirección</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {clientes.map((c) => {
                                const cel = displayCelular(c.celular);
                                return (
                                    <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                        <td className="px-4 py-3 font-mono text-amber-400">{c.cedula ?? "—"}</td>
                                        <td className="px-4 py-3">{c.nombres ?? "—"}</td>
                                        <td className="px-4 py-3 font-mono">
                                            {cel.legacyError ? (
                                                <span className="text-red-400 text-xs border border-red-500/40 rounded px-2 py-1">
                                                    Valor legacy no normalizable: {cel.text}
                                                </span>
                                            ) : (
                                                cel.text
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-300">{c.direccion ?? "—"}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => openModal(c)}
                                                    className="p-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400"
                                                    title="Editar"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleBaja(c.id, c.cedula ?? c.id)}
                                                    disabled={bajaId === c.id}
                                                    className="p-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Baja lógica"
                                                >
                                                    {bajaId === c.id ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center p-6 border-b border-gray-800">
                            <h2 className="text-xl font-bold text-white">
                                {editing ? `Editar ${editing.cedula ?? ""}` : "Nuevo cliente"}
                            </h2>
                            <button
                                onClick={() => !saving && setIsModalOpen(false)}
                                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Cédula *</label>
                                <input value={form.cedula} onChange={setF("cedula")} required className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Tipo documento</label>
                                <select value={form.tipo_documento} onChange={setF("tipo_documento")} className={inputCls}>
                                    <option value="">—</option>
                                    <option value="CC">CC</option>
                                    <option value="CE">CE</option>
                                    <option value="NIT">NIT</option>
                                    <option value="PPT">PPT</option>
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm text-gray-400 mb-2">Nombres *</label>
                                <input value={form.nombres} onChange={setF("nombres")} required className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Apellidos</label>
                                <input value={form.apellidos} onChange={setF("apellidos")} className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Celular * (10 dígitos o 57…)</label>
                                <input value={form.celular} onChange={setF("celular")} required className={inputCls} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm text-gray-400 mb-2">Dirección *</label>
                                <input value={form.direccion} onChange={setF("direccion")} required className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Email</label>
                                <input type="email" value={form.email} onChange={setF("email")} className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Ciudad</label>
                                <input value={form.ciudad} onChange={setF("ciudad")} className={inputCls} />
                            </div>
                            {!editing && (
                                <div className="md:col-span-2">
                                    <label className="block text-sm text-gray-400 mb-2">Fecha de registro (vacío = hoy)</label>
                                    <input type="date" value={form.fecha_registro} onChange={setF("fecha_registro")} className={inputCls} />
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
