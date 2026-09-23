"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, ArrowLeft, Pencil, Receipt } from "lucide-react";
import type { CreditoConId, ClienteCreditoConId } from "@/types/creditos";

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
function fmtDate(v: unknown): string {
    const d = toDate(v);
    return d ? d.toLocaleString('es-CO') : '—';
}
function fmtCOP(n: unknown): string {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
    return (
        <div className="flex justify-between gap-4 py-2 border-b border-gray-800/60 text-sm">
            <span className="text-gray-400">{k}</span>
            <span className="text-white text-right break-all">{v}</span>
        </div>
    );
}

export default function CreditoDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [mounted, setMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [credito, setCredito] = useState<CreditoConId | null>(null);
    const [cliente, setCliente] = useState<ClienteCreditoConId | null>(null);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!mounted) return;
        (async () => {
            setLoading(true);
            try {
                const snap = await getDoc(doc(db, "creditos", id));
                if (!snap.exists()) {
                    setCredito(null);
                    return;
                }
                const c = { id: snap.id, ...snap.data() } as CreditoConId;
                setCredito(c);
                if (c.id_cliente) {
                    const cliSnap = await getDoc(doc(db, "clientes_credito", c.id_cliente));
                    if (cliSnap.exists()) {
                        setCliente({ id: cliSnap.id, ...cliSnap.data() } as ClienteCreditoConId);
                    }
                }
            } catch (error) {
                console.error("[creditos] Error cargando detalle:", error);
            } finally {
                setLoading(false);
            }
        })();
    }, [mounted, id]);

    if (!mounted || loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando…
            </div>
        );
    }

    if (!credito) {
        return <p className="text-gray-400 py-10 text-center">Contrato no encontrado.</p>;
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-center gap-3">
                <Link href="/admin/creditos" className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">
                        Contrato {credito.numero_credito || credito.id.slice(0, 8)}
                    </h1>
                    <p className="text-sm text-gray-400">Detalle de solo lectura</p>
                </div>
                <Link href={`/admin/creditos/${credito.id}/editar`}
                    className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm">
                    <Pencil className="w-4 h-4" /> Editar
                </Link>
                <Link href="/admin/creditos/pagos"
                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm">
                    <Receipt className="w-4 h-4" /> Cobrar
                </Link>
            </div>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-2">Cliente</h2>
                {cliente ? (
                    <>
                        <Row k="Nombres" v={cliente.nombres} />
                        <Row k="Cédula" v={cliente.cedula} />
                        <Row k="Celular" v={cliente.celular} />
                        <Row k="Dirección" v={cliente.direccion} />
                    </>
                ) : (
                    <p className="text-sm text-gray-500">id_cliente: {credito.id_cliente}</p>
                )}
            </section>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-2">Vehículo</h2>
                <Row k="Placa" v={credito.vehiculo?.placa || '—'} />
                <Row k="Marca" v={credito.vehiculo?.marca || '—'} />
                <Row k="Modelo" v={credito.vehiculo?.modelo || '—'} />
                <Row k="Año" v={credito.vehiculo?.anio ?? '—'} />
                <Row k="Color" v={credito.vehiculo?.color || '—'} />
            </section>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-2">Condiciones</h2>
                <Row k="Modalidad" v={credito.condiciones?.modalidad_credito || '—'} />
                <Row k="Valor cuota" v={fmtCOP(credito.condiciones?.valor_cuota)} />
                <Row k="Porcentaje comisión" v={String(credito.condiciones?.porcentaje_comision ?? '—')} />
                <Row k="Excluir domingos" v={credito.condiciones?.excluir_domingos ? 'sí' : 'no'} />
            </section>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-2">Asignaciones</h2>
                <Row k="uid_admin" v={credito.asignaciones?.uid_admin || '—'} />
                <Row k="uid_usuario" v={credito.asignaciones?.uid_usuario || '—'} />
                <Row k="uid_inversor" v={credito.asignaciones?.uid_inversor || '—'} />
            </section>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-2">Trazabilidad</h2>
                <Row k="registrado_por" v={credito.registrado_por || '—'} />
                <Row k="fecha_registro" v={fmtDate(credito.fecha_registro)} />
                <Row k="created_at" v={fmtDate(credito.created_at)} />
                <Row k="updated_at" v={fmtDate(credito.updated_at)} />
            </section>
        </div>
    );
}
