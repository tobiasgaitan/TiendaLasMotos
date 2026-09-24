"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { createPagoInversor } from "../financiero-actions";
import type { CreditoConId, PagoYMultaConId, PagoInversorConId } from "@/types/creditos";

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500";
const labelCls = "block text-xs font-medium text-gray-400 mb-1";

type SysUser = { email: string; label: string };

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

type FilaInversor = {
    email: string;
    label: string;
    placas: string[];
    neto: number;
    girado: number;
};

export default function InversoresPage() {
    const { user } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [filas, setFilas] = useState<FilaInversor[]>([]);
    const [creditos, setCreditos] = useState<CreditoConId[]>([]);
    const [giros, setGiros] = useState<PagoInversorConId[]>([]);
    const [sysUsers, setSysUsers] = useState<SysUser[]>([]);

    const [emailInversor, setEmailInversor] = useState('');
    const [idCredito, setIdCredito] = useState('');
    const [monto, setMonto] = useState('');
    const [metodo, setMetodo] = useState('');
    const [referencia, setReferencia] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [usersSnap, credSnap, pagosSnap, girosSnap] = await Promise.all([
                getDocs(collection(db, "sys_admin_users")),
                getDocs(query(collection(db, "creditos"), where("activo", "==", true))),
                getDocs(query(collection(db, "pagos_y_multas"), where("activo", "==", true))),
                getDocs(query(collection(db, "pagos_inversores"), where("activo", "==", true))),
            ]);
            const users = usersSnap.docs.map((d) => {
                const data = d.data() as { email?: string; nombre?: string; role?: string; rol?: string };
                const email = (data.email || d.id).toLowerCase().trim();
                return {
                    email,
                    label: `${data.email || data.nombre || d.id} (${data.role || data.rol || 'sin rol'})`,
                };
            });
            setSysUsers(users);

            const creds = credSnap.docs.map((d) => ({ id: d.id, ...d.data() } as CreditoConId));
            setCreditos(creds);

            const pagos = pagosSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PagoYMultaConId));
            const girosList = girosSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PagoInversorConId));
            girosList.sort((a, b) => (toDate(b.fecha_registro)?.getTime() ?? 0) - (toDate(a.fecha_registro)?.getTime() ?? 0));
            setGiros(girosList);

            // Dashboard por inversor: neto de pagos de créditos asignados (M4)
            const netoPorCredito: Record<string, number> = {};
            pagos.forEach((p) => {
                if (typeof p.valor_neto_empresa === 'number' && Number.isFinite(p.valor_neto_empresa)) {
                    netoPorCredito[p.id_credito] = (netoPorCredito[p.id_credito] ?? 0) + p.valor_neto_empresa;
                }
            });
            const giradoPorInversor: Record<string, number> = {};
            girosList.forEach((g) => {
                if (typeof g.monto === 'number' && Number.isFinite(g.monto)) {
                    giradoPorInversor[g.email_inversor] = (giradoPorInversor[g.email_inversor] ?? 0) + g.monto;
                }
            });
            const porInversor = new Map<string, { placas: string[]; neto: number }>();
            creds.forEach((c) => {
                const inv = c.asignaciones?.email_inversor;
                if (!inv) return;
                const cur = porInversor.get(inv) ?? { placas: [], neto: 0 };
                if (c.vehiculo?.placa) cur.placas.push(c.vehiculo.placa);
                cur.neto += netoPorCredito[c.id] ?? 0;
                porInversor.set(inv, cur);
            });
            const filasCalc: FilaInversor[] = [...porInversor.entries()].map(([email, v]) => ({
                email,
                label: users.find((u) => u.email === email)?.label || email,
                placas: v.placas,
                neto: Math.round(v.neto * 100) / 100,
                girado: Math.round((giradoPorInversor[email] ?? 0) * 100) / 100,
            }));
            setFilas(filasCalc);
        } catch (error) {
            console.error("[inversores] Error cargando:", error);
            toast.error("Error cargando inversores.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (mounted) fetchData(); }, [mounted, fetchData]);

    const creditosDelInversor = emailInversor
        ? creditos.filter((c) => c.asignaciones?.email_inversor === emailInversor)
        : [];

    const handleGiro = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving || !user) return;
        const m = Number(monto);
        if (!emailInversor || !idCredito || !Number.isFinite(m) || m < 0) {
            toast.error("Selecciona inversor y crédito, y un monto ≥ 0.");
            return;
        }
        setSaving(true);
        try {
            const res = await createPagoInversor({
                id_credito: idCredito,
                email_inversor: emailInversor,
                monto: m,
                ...(metodo ? { metodo_pago: metodo } : {}),
                ...(referencia.trim() ? { referencia: referencia.trim() } : {}),
            }, { uid: user.uid, idToken: await user.getIdToken() });
            if (res.success) {
                toast.success("Giro registrado como salida.");
                setMonto('');
                setReferencia('');
                await fetchData();
            } else {
                toast.error(res.message || "No se pudo registrar el giro.");
            }
        } catch (error) {
            console.error("[inversores] Giro falló:", error);
            toast.error("Error al registrar el giro.");
        } finally {
            setSaving(false);
        }
    };

    if (!mounted || loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando…
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl">
            <div>
                <h1 className="text-2xl font-bold text-white">Rendimiento e Inversores</h1>
                <p className="text-sm text-gray-400">Ingresos netos por vehículos asignados · giros como salida</p>
            </div>

            <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase text-gray-400 border-b border-gray-800">
                        <tr>
                            <th className="px-4 py-3">Inversor</th>
                            <th className="px-4 py-3">Vehículos</th>
                            <th className="px-4 py-3">Neto acumulado</th>
                            <th className="px-4 py-3">Girado</th>
                            <th className="px-4 py-3">Pendiente</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map((f) => (
                            <tr key={f.email} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td className="px-4 py-3 text-white text-xs font-mono break-all max-w-64">{f.label}</td>
                                <td className="px-4 py-3 text-gray-300">{f.placas.join(', ') || '—'}</td>
                                <td className="px-4 py-3 text-emerald-300 font-semibold">{fmtCOP(f.neto)}</td>
                                <td className="px-4 py-3 text-gray-300">{fmtCOP(f.girado)}</td>
                                <td className="px-4 py-3 text-amber-300 font-semibold">{fmtCOP(f.neto - f.girado)}</td>
                            </tr>
                        ))}
                        {filas.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">Sin inversores asignados.</td></tr>
                        )}
                    </tbody>
                </table>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Pago / giro al inversor</h2>
                    <form onSubmit={handleGiro} className="space-y-3">
                        <div><label className={labelCls} htmlFor="giro-inversor">Inversor *</label>
                            <select id="giro-inversor" name="giro-inversor" value={emailInversor} onChange={(e) => { setEmailInversor(e.target.value); setIdCredito(''); }} className={inputCls}>
                                <option value="">Seleccionar…</option>
                                {sysUsers.map((u) => <option key={u.email} value={u.email}>{u.label}</option>)}
                            </select></div>
                        <div><label className={labelCls} htmlFor="giro-credito">Crédito *</label>
                            <select id="giro-credito" name="giro-credito" value={idCredito} onChange={(e) => setIdCredito(e.target.value)} className={inputCls} disabled={!emailInversor}>
                                <option value="">Seleccionar…</option>
                                {creditosDelInversor.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.vehiculo?.placa || c.id.slice(0, 8)} {c.numero_credito ? `· ${c.numero_credito}` : ''}
                                    </option>
                                ))}
                            </select></div>
                        <div><label className={labelCls} htmlFor="giro-monto">Monto *</label>
                            <input id="giro-monto" name="giro-monto" value={monto} onChange={(e) => setMonto(e.target.value)} className={inputCls} inputMode="decimal" placeholder="1000000" /></div>
                        <div><label className={labelCls} htmlFor="giro-metodo">Método</label>
                            <select id="giro-metodo" name="giro-metodo" value={metodo} onChange={(e) => setMetodo(e.target.value)} className={inputCls}>
                                <option value="">—</option>
                                <option value="efectivo">efectivo</option>
                                <option value="transferencia">transferencia</option>
                                <option value="cheque">cheque</option>
                                <option value="otro">otro</option>
                            </select></div>
                        <div><label className={labelCls} htmlFor="giro-referencia">Referencia</label>
                            <input id="giro-referencia" name="giro-referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} className={inputCls} /></div>
                        <button type="submit" disabled={saving}
                            className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {saving ? "Registrando…" : "Registrar giro"}
                        </button>
                    </form>
                </section>

                <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-3">
                        Giros registrados ({giros.length})
                    </h2>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {giros.map((g) => (
                            <div key={g.id} className="bg-gray-800/50 border border-gray-700/60 rounded-lg px-3 py-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-gray-400 font-mono break-all max-w-48">{g.email_inversor.slice(0, 30)}…</span>
                                    <span className="text-white font-semibold">{fmtCOP(g.monto)}</span>
                                </div>
                                <div className="text-gray-500 mt-1">
                                    {toDate(g.fecha_registro)?.toLocaleDateString('es-CO') || '—'}
                                    {g.referencia ? ` · ${g.referencia}` : ''}
                                </div>
                            </div>
                        ))}
                        {giros.length === 0 && <p className="text-sm text-gray-500">Sin giros.</p>}
                    </div>
                </section>
            </div>
        </div>
    );
}
