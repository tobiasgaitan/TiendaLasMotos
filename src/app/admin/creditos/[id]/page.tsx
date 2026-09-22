"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, ArrowLeft, Pencil } from "lucide-react";
import { toast } from "sonner";

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

function fmtMoney(v: unknown): string {
    const n = Number(v ?? 0);
    if (Number.isNaN(n)) return "—";
    return `$${n.toLocaleString("es-CO")}`;
}

/**
 * Detalle de crédito — solo lectura (Fase 8).
 * Incluye trazabilidad: registrado_por y timestamps.
 */
export default function CreditoDetallePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<Record<string, unknown> | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const snap = await getDoc(doc(db, "creditos", id));
                if (!snap.exists()) {
                    setData(null);
                } else {
                    setData(snap.data() as Record<string, unknown>);
                }
            } catch (error) {
                console.error("[creditos UI] Error cargando detalle:", error);
                toast.error("Error cargando el crédito");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-amber-500 w-10 h-10" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="p-8 bg-gray-950 min-h-screen text-slate-200">
                <p className="text-gray-400">El crédito no existe.</p>
                <Link href="/admin/creditos" className="text-amber-400 underline">Volver al listado</Link>
            </div>
        );
    }

    const rows: Array<[string, string]> = [
        ["Número", String(data.numero_credito ?? id)],
        ["Cliente ID", String(data.cliente_id ?? "—")],
        ["Moto ID", String(data.moto_id ?? "—")],
        ["Entidad financiera ID", String(data.entidad_financiera_id ?? "—")],
        ["Sede ID", String(data.sede_id ?? "—")],
        ["Valor moto", fmtMoney(data.valor_moto)],
        ["Cuota inicial", fmtMoney(data.cuota_inicial)],
        ["Capital financiado", fmtMoney(data.capital_financiado)],
        ["Tasa mensual %", String(data.tasa_interes_mensual ?? "—")],
        ["Plazo (meses)", String(data.plazo_meses ?? "—")],
        ["Cuota mensual", fmtMoney(data.cuota_mensual)],
        ["Saldo capital", fmtMoney(data.saldo_capital)],
        ["Estado", String(data.estado ?? "—")],
        ["Activo", String(data.activo ?? "—")],
        ["Fecha solicitud", fmtTimestamp(data.fecha_solicitud)],
        ["Fecha aprobación", fmtTimestamp(data.fecha_aprobacion)],
        ["Fecha desembolso", fmtTimestamp(data.fecha_desembolso)],
        ["Registrado por", String(data.registrado_por ?? "—")],
        ["Email registro", String(data.registrado_por_email ?? "—")],
        ["Creado", fmtTimestamp(data.created_at)],
        ["Actualizado", fmtTimestamp(data.updated_at)],
    ];

    return (
        <div className="p-8 space-y-8 bg-gray-950 min-h-screen text-slate-200">
            <div className="flex items-center justify-between border-b border-gray-800 pb-6">
                <div className="flex items-center gap-4">
                    <Link href="/admin/creditos" className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">
                        <ArrowLeft size={18} />
                    </Link>
                    <h1 className="text-3xl font-bold text-white font-mono">
                        {String(data.numero_credito ?? id)}
                    </h1>
                </div>
                <Link
                    href={`/admin/creditos/${id}/editar`}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 font-bold transition-all active:scale-95"
                >
                    <Pencil size={18} /> Editar
                </Link>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden max-w-3xl">
                <table className="w-full text-sm">
                    <tbody>
                        {rows.map(([k, v]) => (
                            <tr key={k} className="border-b border-gray-800/50">
                                <td className="px-4 py-3 text-gray-400 w-1/3">{k}</td>
                                <td className="px-4 py-3 text-white break-all">{v}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
