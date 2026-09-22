"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { createCredito } from "../actions";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface ClienteOption {
    id: string;
    cedula?: string;
    nombres?: string;
}

const inputCls =
    "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors placeholder:text-gray-600";

/**
 * Alta de crédito (Fase 8). C4: Burst Mitigation + Faraday Cage.
 * Escritura SOLO vía Server Action `createCredito`.
 */
export default function NuevoCreditoPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [clientes, setClientes] = useState<ClienteOption[]>([]);

    const [form, setForm] = useState({
        cliente_id: "",
        moto_id: "",
        entidad_financiera_id: "",
        sede_id: "",
        valor_moto: "",
        cuota_inicial: "",
        capital_financiado: "",
        tasa_interes_mensual: "",
        plazo_meses: "",
        cuota_mensual: "",
    });

    useEffect(() => {
        const load = async () => {
            try {
                const q = query(collection(db, "clientes_credito"), where("activo", "==", true));
                const snap = await getDocs(q);
                setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClienteOption));
            } catch (error) {
                console.error("[creditos UI] Error cargando clientes:", error);
            }
        };
        load();
    }, []);

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return; // Burst Mitigation
        if (!user) {
            toast.error("Sin sesión");
            return;
        }
        setSaving(true); // lock transicional
        try {
            // Faraday Cage: trim + whitelist estricta de claves del contrato.
            const payload = {
                cliente_id: form.cliente_id.trim(),
                moto_id: form.moto_id.trim(),
                entidad_financiera_id: form.entidad_financiera_id.trim() || undefined,
                sede_id: form.sede_id.trim() || undefined,
                valor_moto: form.valor_moto,
                cuota_inicial: form.cuota_inicial,
                capital_financiado: form.capital_financiado,
                tasa_interes_mensual: form.tasa_interes_mensual,
                plazo_meses: form.plazo_meses,
                cuota_mensual: form.cuota_mensual,
            };
            const idToken = await user.getIdToken();
            const res = await createCredito(payload, { uid: user.uid, idToken });
            if (res.success) {
                toast.success(res.message ?? "Crédito creado.");
                router.push("/admin/creditos");
            } else {
                console.error("[creditos UI] createCredito falló:", res);
                const firstError = res.errors ? Object.values(res.errors).flat()[0] : undefined;
                toast.error(firstError ?? res.message ?? "Error al crear.");
            }
        } catch (error) {
            console.error("[creditos UI] Excepción en alta:", error);
            toast.error("Error al crear el crédito.");
        } finally {
            setSaving(false);
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
            <div className="flex items-center gap-4 border-b border-gray-800 pb-6">
                <Link href="/admin/creditos" className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">
                    <ArrowLeft size={18} />
                </Link>
                <div>
                    <h1 className="text-3xl font-bold text-white">Nuevo crédito</h1>
                    <p className="text-gray-400 mt-1">El número CRE-YYYY-XXXX se asigna automáticamente.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-400 mb-2">Cliente *</label>
                    <select value={form.cliente_id} onChange={set("cliente_id")} required className={inputCls}>
                        <option value="">Selecciona un cliente…</option>
                        {clientes.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.cedula ?? c.id} — {c.nombres ?? ""}
                            </option>
                        ))}
                    </select>
                    {clientes.length === 0 && (
                        <p className="text-xs text-amber-400 mt-2">
                            No hay clientes activos. Créalo primero en{" "}
                            <Link href="/admin/creditos/clientes" className="underline">Clientes</Link>.
                        </p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Moto ID *</label>
                    <input value={form.moto_id} onChange={set("moto_id")} required placeholder="ID del catálogo" className={inputCls} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Entidad financiera ID</label>
                    <input value={form.entidad_financiera_id} onChange={set("entidad_financiera_id")} placeholder="Opcional" className={inputCls} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Sede ID</label>
                    <input value={form.sede_id} onChange={set("sede_id")} placeholder="Opcional" className={inputCls} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Valor moto *</label>
                    <input type="number" min="0" value={form.valor_moto} onChange={set("valor_moto")} required className={inputCls} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Cuota inicial *</label>
                    <input type="number" min="0" value={form.cuota_inicial} onChange={set("cuota_inicial")} required className={inputCls} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Capital financiado *</label>
                    <input type="number" min="0" value={form.capital_financiado} onChange={set("capital_financiado")} required className={inputCls} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Tasa mensual % *</label>
                    <input type="number" min="0" step="0.01" value={form.tasa_interes_mensual} onChange={set("tasa_interes_mensual")} required className={inputCls} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Plazo (meses) *</label>
                    <input type="number" min="1" step="1" value={form.plazo_meses} onChange={set("plazo_meses")} required className={inputCls} />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-400 mb-2">Cuota mensual *</label>
                    <input type="number" min="0" value={form.cuota_mensual} onChange={set("cuota_mensual")} required className={inputCls} />
                </div>

                <div className="md:col-span-2">
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2 bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        {saving ? "Guardando…" : "Crear crédito"}
                    </button>
                </div>
            </form>
        </div>
    );
}
