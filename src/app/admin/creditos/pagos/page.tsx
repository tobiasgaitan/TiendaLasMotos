"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { createPagoYMulta } from "../financiero-actions";
import type { CreditoConId, ClienteCreditoConId, PagoYMultaConId, TipoTransaccion } from "@/types/creditos";
import { calcularMoraRenting } from "@/lib/actions/creditos-calc";

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500";
const labelCls = "block text-xs font-medium text-gray-400 mb-1";

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

export default function TerminalCobroPage() {
    const { user } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [search, setSearch] = useState('');
    const [searching, setSearching] = useState(false);
    const [resultados, setResultados] = useState<CreditoConId[]>([]);
    const [clientes, setClientes] = useState<Record<string, ClienteCreditoConId>>({});
    const [seleccionado, setSeleccionado] = useState<CreditoConId | null>(null);
    const [pagos, setPagos] = useState<PagoYMultaConId[]>([]);

    const [valor, setValor] = useState('');
    const [tipo, setTipo] = useState<TipoTransaccion>('pago_cuota');
    const [metodo, setMetodo] = useState('');
    const [referencia, setReferencia] = useState('');
    const [motivo, setMotivo] = useState('');
    const [saving, setSaving] = useState(false);
    const [ultimoDesglose, setUltimoDesglose] = useState<{ valor_comision: number; valor_neto_empresa: number } | null>(null);

    useEffect(() => { setMounted(true); }, []);

    const cargarPagos = async (idCredito: string) => {
        const snap = await getDocs(query(collection(db, "pagos_y_multas"), where("id_credito", "==", idCredito)));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PagoYMultaConId));
        list.sort((a, b) => (toDate(b.fecha_registro)?.getTime() ?? 0) - (toDate(a.fecha_registro)?.getTime() ?? 0));
        setPagos(list);
    };

    const handleSearch = async () => {
        const q = search.trim();
        if (!q) {
            toast.error("Ingresa una placa o un documento.");
            return;
        }
        setSearching(true);
        setUltimoDesglose(null);
        try {
            // 1. Búsqueda por vehiculo.placa
            let creds: CreditoConId[] = [];
            const porPlaca = await getDocs(query(
                collection(db, "creditos"),
                where("vehiculo.placa", "==", q.toUpperCase()),
                where("activo", "==", true)
            ));
            creds = porPlaca.docs.map((d) => ({ id: d.id, ...d.data() } as CreditoConId));

            // 2. Búsqueda por documento (cedula → clientes_credito → creditos.id_cliente)
            if (creds.length === 0) {
                const cliSnap = await getDocs(query(collection(db, "clientes_credito"), where("cedula", "==", q)));
                for (const cli of cliSnap.docs) {
                    const cs = await getDocs(query(
                        collection(db, "creditos"),
                        where("id_cliente", "==", cli.id),
                        where("activo", "==", true)
                    ));
                    cs.docs.forEach((d) => creds.push({ id: d.id, ...d.data() } as CreditoConId));
                }
            }
            setResultados(creds);
            if (creds.length === 0) toast.info("Sin resultados para esa búsqueda.");

            // Resolver nombres de clientes para mostrar
            const ids = [...new Set(creds.map((c) => c.id_cliente))];
            const map: Record<string, ClienteCreditoConId> = {};
            await Promise.all(ids.map(async (cid) => {
                try {
                    const { doc, getDoc } = await import("firebase/firestore");
                    const s = await getDoc(doc(db, "clientes_credito", cid));
                    if (s.exists()) map[cid] = { id: s.id, ...s.data() } as ClienteCreditoConId;
                } catch (e) {
                    console.error("[pagos] No se pudo resolver cliente:", cid, e);
                }
            }));
            setClientes(map);
        } catch (error) {
            console.error("[pagos] Búsqueda falló:", error);
            toast.error("Error en la búsqueda.");
        } finally {
            setSearching(false);
        }
    };

    const handleSelect = async (c: CreditoConId) => {
        setSeleccionado(c);
        setUltimoDesglose(null);
        try {
            await cargarPagos(c.id);
        } catch (error) {
            console.error("[pagos] Error cargando pagos:", error);
        }
    };

    const handleCobro = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving || !seleccionado || !user) return;
        const v = Number(valor);
        if (!Number.isFinite(v) || (tipo !== 'nota_credito' && v < 0)) {
            toast.error("Valor inválido (solo la nota crédito admite negativo).");
            return;
        }
        if (tipo === 'multa' && !motivo.trim()) {
            toast.error("La multa exige motivo.");
            return;
        }
        setSaving(true);
        try {
            const res = await createPagoYMulta({
                id_credito: seleccionado.id,
                valor_pagado_cliente: v,
                tipo_transaccion: tipo,
                ...(metodo ? { metodo_pago: metodo } : {}),
                ...(referencia.trim() ? { referencia: referencia.trim() } : {}),
                ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
            }, { uid: user.uid, idToken: await user.getIdToken() });
            if (res.success) {
                toast.success("Cobro registrado.");
                setUltimoDesglose({
                    valor_comision: res.valor_comision ?? 0,
                    valor_neto_empresa: res.valor_neto_empresa ?? 0,
                });
                setValor('');
                setMotivo('');
                setReferencia('');
                await cargarPagos(seleccionado.id);
            } else {
                toast.error(res.message || "No se pudo registrar.");
            }
        } catch (error) {
            console.error("[pagos] Cobro falló:", error);
            toast.error("Error al registrar el cobro.");
        } finally {
            setSaving(false);
        }
    };

    if (!mounted) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando…
            </div>
        );
    }

    const fechaReg = seleccionado ? (toDate(seleccionado.fecha_registro) ?? new Date()) : new Date();
    const totalRecibido = pagos
        .filter((p) => (p as { activo?: boolean }).activo !== false)
        .reduce((s, p) => s + (typeof p.valor_pagado_cliente === 'number' ? p.valor_pagado_cliente : 0), 0);
    const mora = seleccionado?.condiciones
        ? calcularMoraRenting(seleccionado.condiciones, fechaReg, totalRecibido)
        : null;

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold text-white">Terminal de Cobro</h1>
                <p className="text-sm text-gray-400">Búsqueda por placa o documento · desglose automático de comisión</p>
            </div>

            <div className="flex gap-2">
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                    placeholder="Placa (ABC123) o cédula…" className={inputCls} />
                <button type="button" onClick={handleSearch} disabled={searching}
                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm">
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Buscar
                </button>
            </div>

            {resultados.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800/60">
                    {resultados.map((c) => {
                        const cli = clientes[c.id_cliente];
                        const sel = seleccionado?.id === c.id;
                        return (
                            <button key={c.id} type="button" onClick={() => handleSelect(c)}
                                className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-800/50 ${sel ? 'bg-amber-600/10' : ''}`}>
                                <span className="font-semibold text-white">{c.vehiculo?.placa}</span>
                                <span className="text-gray-400 ml-3">{cli ? `${cli.nombres} · ${cli.cedula}` : c.id_cliente.slice(0, 8)}</span>
                                <span className="text-gray-500 ml-3">cuota {c.condiciones ? fmtCOP(c.condiciones.valor_cuota) : '—'}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {seleccionado && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                        <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Registrar cobro</h2>
                        {mora && seleccionado.condiciones?.modalidad_credito === 'renting' && (
                            <div className={`text-xs rounded-lg px-3 py-2 border ${mora.estado === 'en_mora' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>
                                Estado: <strong>{mora.estado}</strong> · exigible {fmtCOP(mora.valor_exigible)} ·
                                recibido {fmtCOP(totalRecibido)}
                                {mora.estado === 'en_mora' && <> · mora {fmtCOP(mora.saldo_mora)}</>}
                            </div>
                        )}
                        <form onSubmit={handleCobro} className="space-y-3">
                            <div><label className={labelCls}>Valor pagado por el cliente *</label>
                                <input value={valor} onChange={(e) => setValor(e.target.value)} className={inputCls} inputMode="decimal" placeholder="50000" /></div>
                            <div><label className={labelCls}>Tipo de transacción</label>
                                <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoTransaccion)} className={inputCls}>
                                    <option value="pago_cuota">pago_cuota</option>
                                    <option value="multa">multa</option>
                                    <option value="nota_credito">nota_credito (ajuste)</option>
                                </select></div>
                            {tipo === 'multa' && (
                                <div><label className={labelCls}>Motivo *</label>
                                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} placeholder="Motivo de la multa" /></div>
                            )}
                            <div><label className={labelCls}>Método de pago</label>
                                <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={inputCls}>
                                    <option value="">—</option>
                                    <option value="efectivo">efectivo</option>
                                    <option value="transferencia">transferencia</option>
                                    <option value="tarjeta">tarjeta</option>
                                    <option value="pse">pse</option>
                                </select></div>
                            <div><label className={labelCls}>Referencia</label>
                                <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={inputCls} /></div>
                            <button type="submit" disabled={saving}
                                className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {saving ? "Registrando…" : "Registrar cobro"}
                            </button>
                        </form>
                        {ultimoDesglose && (
                            <div className="bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                                <p className="text-gray-300">Comisión: <strong className="text-white">{fmtCOP(ultimoDesglose.valor_comision)}</strong></p>
                                <p className="text-gray-300">Neto empresa: <strong className="text-emerald-300">{fmtCOP(ultimoDesglose.valor_neto_empresa)}</strong></p>
                            </div>
                        )}
                    </section>

                    <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-3">
                            Historial del crédito ({pagos.length})
                        </h2>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {pagos.map((p) => (
                                <div key={p.id} className="bg-gray-800/50 border border-gray-700/60 rounded-lg px-3 py-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className={`font-mono px-1.5 py-0.5 rounded ${p.tipo_transaccion === 'multa' ? 'bg-red-500/15 text-red-300' : p.tipo_transaccion === 'nota_credito' ? 'bg-purple-500/15 text-purple-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                                            {p.tipo_transaccion}
                                        </span>
                                        <span className="text-white font-semibold">{fmtCOP(p.valor_pagado_cliente)}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-400 mt-1">
                                        <span>neto {fmtCOP(p.valor_neto_empresa)}</span>
                                        <span>{toDate(p.fecha_registro)?.toLocaleDateString('es-CO') || '—'}</span>
                                    </div>
                                </div>
                            ))}
                            {pagos.length === 0 && <p className="text-sm text-gray-500">Sin movimientos.</p>}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
