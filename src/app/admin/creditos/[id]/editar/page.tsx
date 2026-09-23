"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { updateCredito } from "../../actions";
import type { CreditoConId, ModalidadCredito } from "@/types/creditos";

type SysUser = { uid: string; label: string };

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500";
const labelCls = "block text-xs font-medium text-gray-400 mb-1";
const sectionCls = "bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4";

function parseMoney(v: string): number | null {
    if (v.trim() === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
}
function parseIntField(v: string): number | undefined {
    if (v.trim() === '') return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) return undefined;
    return n;
}

export default function EditarCreditoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user } = useAuth();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [sysUsers, setSysUsers] = useState<SysUser[]>([]);

    const [placa, setPlaca] = useState('');
    const [marca, setMarca] = useState('');
    const [modelo, setModelo] = useState('');
    const [anio, setAnio] = useState('');
    const [color, setColor] = useState('');
    const [porcentaje, setPorcentaje] = useState('');
    const [valorCuota, setValorCuota] = useState('');
    const [excluirDomingos, setExcluirDomingos] = useState(true);
    const [modalidad, setModalidad] = useState<ModalidadCredito>('renting');
    const [uidAdmin, setUidAdmin] = useState('');
    const [uidUsuario, setUidUsuario] = useState('');
    const [uidInversor, setUidInversor] = useState('');

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!mounted) return;
        (async () => {
            setLoading(true);
            try {
                const [snap, usersSnap] = await Promise.all([
                    getDoc(doc(db, "creditos", id)),
                    getDocs(collection(db, "sys_admin_users")),
                ]);
                if (!snap.exists()) {
                    toast.error("Contrato no encontrado.");
                    router.push("/admin/creditos");
                    return;
                }
                const c = { id: snap.id, ...snap.data() } as CreditoConId;
                setPlaca(c.vehiculo?.placa || '');
                setMarca(c.vehiculo?.marca || '');
                setModelo(c.vehiculo?.modelo || '');
                setAnio(c.vehiculo?.anio !== undefined ? String(c.vehiculo.anio) : '');
                setColor(c.vehiculo?.color || '');
                setPorcentaje(c.condiciones ? String(c.condiciones.porcentaje_comision) : '');
                setValorCuota(c.condiciones ? String(c.condiciones.valor_cuota) : '');
                setExcluirDomingos(c.condiciones?.excluir_domingos ?? true);
                setModalidad(c.condiciones?.modalidad_credito || 'renting');
                setUidAdmin(c.asignaciones?.uid_admin || '');
                setUidUsuario(c.asignaciones?.uid_usuario || '');
                setUidInversor(c.asignaciones?.uid_inversor || '');
                setSysUsers(usersSnap.docs.map((d) => {
                    const data = d.data() as { uid?: string; email?: string; nombre?: string; role?: string; rol?: string };
                    return {
                        uid: data.uid || d.id,
                        label: `${data.email || data.nombre || d.id} (${data.role || data.rol || 'sin rol'})`,
                    };
                }));
            } catch (error) {
                console.error("[creditos] Error cargando contrato:", error);
                toast.error("Error cargando el contrato.");
            } finally {
                setLoading(false);
            }
        })();
    }, [mounted, id, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;
        if (!user) {
            toast.error("Sesión inválida.");
            return;
        }
        const pct = parseMoney(porcentaje);
        const cuota = parseMoney(valorCuota);
        if (pct === null || cuota === null) {
            toast.error("porcentaje_comision y valor_cuota deben ser números ≥ 0.");
            return;
        }
        if (!placa.trim()) {
            toast.error("La placa es obligatoria.");
            return;
        }
        const anioNum = parseIntField(anio);
        if (anio.trim() !== '' && anioNum === undefined) {
            toast.error("El año debe ser un entero ≥ 0 (Int64).");
            return;
        }
        setSaving(true);
        try {
            // numero_credito y fecha_registro NUNCA se exponen como editables.
            const res = await updateCredito(id, {
                vehiculo: {
                    placa: placa.trim().toUpperCase(),
                    marca: marca.trim() || undefined,
                    modelo: modelo.trim() || undefined,
                    anio: anioNum,
                    color: color.trim() || undefined,
                },
                condiciones: {
                    porcentaje_comision: pct,
                    valor_cuota: cuota,
                    excluir_domingos: excluirDomingos,
                    modalidad_credito: modalidad,
                },
                asignaciones: {
                    uid_admin: uidAdmin,
                    uid_usuario: uidUsuario,
                    uid_inversor: uidInversor,
                },
            }, { uid: user.uid, idToken: await user.getIdToken() });
            if (res.success) {
                toast.success("Contrato actualizado.");
                router.push(`/admin/creditos/${id}`);
            } else {
                toast.error(res.message || "No se pudo actualizar.");
            }
        } catch (error) {
            console.error("[creditos] Edición falló:", error);
            toast.error("Error al actualizar.");
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
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-center gap-3">
                <Link href={`/admin/creditos/${id}`} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-white">Editar contrato</h1>
                    <p className="text-sm text-gray-400">numero_credito y fecha_registro son inmutables</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <section className={sectionCls}>
                    <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Vehículo</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div><label className={labelCls}>Placa *</label>
                            <input value={placa} onChange={(e) => setPlaca(e.target.value)} className={inputCls} /></div>
                        <div><label className={labelCls}>Marca</label>
                            <input value={marca} onChange={(e) => setMarca(e.target.value)} className={inputCls} /></div>
                        <div><label className={labelCls}>Modelo</label>
                            <input value={modelo} onChange={(e) => setModelo(e.target.value)} className={inputCls} /></div>
                        <div><label className={labelCls}>Año (Int64)</label>
                            <input value={anio} onChange={(e) => setAnio(e.target.value)} className={inputCls} inputMode="numeric" /></div>
                        <div><label className={labelCls}>Color</label>
                            <input value={color} onChange={(e) => setColor(e.target.value)} className={inputCls} /></div>
                    </div>
                </section>

                <section className={sectionCls}>
                    <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Condiciones</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><label className={labelCls}>Modalidad</label>
                            <select value={modalidad} onChange={(e) => setModalidad(e.target.value as ModalidadCredito)} className={inputCls}>
                                <option value="renting">renting</option>
                                <option value="credito">credito</option>
                                <option value="contado">contado</option>
                            </select></div>
                        <div><label className={labelCls}>Valor cuota (Float ≥ 0) *</label>
                            <input value={valorCuota} onChange={(e) => setValorCuota(e.target.value)} className={inputCls} inputMode="decimal" /></div>
                        <div><label className={labelCls}>Porcentaje comisión (Float ≥ 0) *</label>
                            <input value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} className={inputCls} inputMode="decimal" /></div>
                        <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2 text-sm text-gray-300">
                                <input type="checkbox" checked={excluirDomingos} onChange={(e) => setExcluirDomingos(e.target.checked)}
                                    className="w-4 h-4 accent-amber-500" />
                                Excluir domingos (renting)
                            </label>
                        </div>
                    </div>
                </section>

                <section className={sectionCls}>
                    <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Asignaciones</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div><label className={labelCls}>Admin *</label>
                            <select value={uidAdmin} onChange={(e) => setUidAdmin(e.target.value)} className={inputCls}>
                                <option value="">Seleccionar…</option>
                                {sysUsers.map((u) => <option key={u.uid} value={u.uid}>{u.label}</option>)}
                            </select></div>
                        <div><label className={labelCls}>Cobrador *</label>
                            <select value={uidUsuario} onChange={(e) => setUidUsuario(e.target.value)} className={inputCls}>
                                <option value="">Seleccionar…</option>
                                {sysUsers.map((u) => <option key={u.uid} value={u.uid}>{u.label}</option>)}
                            </select></div>
                        <div><label className={labelCls}>Inversor *</label>
                            <select value={uidInversor} onChange={(e) => setUidInversor(e.target.value)} className={inputCls}>
                                <option value="">Seleccionar…</option>
                                {sysUsers.map((u) => <option key={u.uid} value={u.uid}>{u.label}</option>)}
                            </select></div>
                    </div>
                </section>

                <button type="submit" disabled={saving}
                    className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-3 rounded-lg text-sm font-semibold">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {saving ? "Guardando…" : "Guardar cambios"}
                </button>
            </form>
        </div>
    );
}
