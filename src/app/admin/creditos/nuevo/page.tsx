"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, Search, UserPlus, ArrowLeft } from "lucide-react";
import { createCredito, createClienteCredito } from "../actions";
import type { ClienteCreditoConId, ModalidadCredito } from "@/types/creditos";

type SysUser = { email: string; label: string };

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500";
const labelCls = "block text-xs font-medium text-gray-400 mb-1";
const sectionCls = "bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4";

// Validación number Int64/Float (Módulo 1)
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

export default function NuevoCreditoPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [saving, setSaving] = useState(false); // Burst Mitigation
    const [sysUsers, setSysUsers] = useState<SysUser[]>([]);

    // Cliente: selección existente o alta inline
    const [cedulaSearch, setCedulaSearch] = useState('');
    const [searching, setSearching] = useState(false);
    const [cliente, setCliente] = useState<ClienteCreditoConId | null>(null);
    const [showNewClient, setShowNewClient] = useState(false);
    const [newClient, setNewClient] = useState({ cedula: '', nombres: '', celular: '', direccion: '' });

    // Vehículo
    const [placa, setPlaca] = useState('');
    const [marca, setMarca] = useState('');
    const [modelo, setModelo] = useState('');
    const [anio, setAnio] = useState('');
    const [color, setColor] = useState('');
    // Condiciones
    const [porcentaje, setPorcentaje] = useState('');
    const [valorCuota, setValorCuota] = useState('');
    const [excluirDomingos, setExcluirDomingos] = useState(true);
    const [modalidad, setModalidad] = useState<ModalidadCredito>('renting');
    // Asignaciones (emails canónicos — Ruta A')
    const [emailAdmin, setEmailAdmin] = useState('');
    const [emailUsuario, setEmailUsuario] = useState('');
    const [emailInversor, setEmailInversor] = useState('');

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!mounted) return;
        (async () => {
            try {
                const snap = await getDocs(collection(db, "sys_admin_users"));
                setSysUsers(snap.docs.map((d) => {
                    const data = d.data() as { email?: string; nombre?: string; role?: string; rol?: string };
                    const email = (data.email || d.id).toLowerCase().trim();
                    return {
                        email,
                        label: `${data.email || data.nombre || d.id} (${data.role || data.rol || 'sin rol'})`,
                    };
                }));
            } catch (error) {
                console.error("[creditos] Error cargando sys_admin_users:", error);
                toast.error("No se pudieron cargar los usuarios del sistema.");
            }
        })();
    }, [mounted]);

    const handleSearchClient = async () => {
        const ced = cedulaSearch.trim();
        if (!ced) {
            toast.error("Ingresa una cédula para buscar.");
            return;
        }
        setSearching(true);
        try {
            const snap = await getDocs(query(collection(db, "clientes_credito"), where("cedula", "==", ced)));
            if (snap.empty) {
                setCliente(null);
                setNewClient((p) => ({ ...p, cedula: ced }));
                setShowNewClient(true);
                toast.info("Cliente no encontrado. Complétalo para darlo de alta.");
            } else {
                const found = { id: snap.docs[0].id, ...snap.docs[0].data() } as ClienteCreditoConId;
                setCliente(found);
                setShowNewClient(false);
                toast.success(`Cliente seleccionado: ${found.nombres}`);
            }
        } catch (error) {
            console.error("[creditos] Búsqueda de cliente falló:", error);
            toast.error("Error buscando el cliente.");
        } finally {
            setSearching(false);
        }
    };

    const handleCreateClient = async () => {
        if (!user) {
            toast.error("Sesión inválida.");
            return;
        }
        // Faraday Cage: trim + whitelist
        const payload = {
            cedula: newClient.cedula.trim(),
            nombres: newClient.nombres.trim(),
            celular: newClient.celular.trim(),
            direccion: newClient.direccion.trim(),
        };
        if (!payload.cedula || !payload.nombres || !payload.celular || !payload.direccion) {
            toast.error("Completa cédula, nombres, celular y dirección.");
            return;
        }
        setSaving(true);
        try {
            const res = await createClienteCredito(payload, {
                uid: user.uid, idToken: await user.getIdToken(),
            });
            if (!res.success || !res.id) {
                toast.error(res.message || "No se pudo crear el cliente.");
                return;
            }
            setCliente({ id: res.id, ...payload, fecha_registro: new Date() } as unknown as ClienteCreditoConId);
            setShowNewClient(false);
            toast.success("Cliente creado y seleccionado.");
        } catch (error) {
            console.error("[creditos] Alta de cliente falló:", error);
            toast.error("Error al crear el cliente.");
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return; // Burst Mitigation
        if (!user) {
            toast.error("Sesión inválida.");
            return;
        }
        if (!cliente) {
            toast.error("Selecciona o crea el cliente primero.");
            return;
        }
        const pct = parseMoney(porcentaje);
        const cuota = parseMoney(valorCuota);
        if (pct === null) {
            toast.error("porcentaje_comision debe ser un número ≥ 0.");
            return;
        }
        if (cuota === null) {
            toast.error("valor_cuota debe ser un número ≥ 0.");
            return;
        }
        if (!placa.trim()) {
            toast.error("La placa del vehículo es obligatoria.");
            return;
        }
        if (!emailAdmin || !emailUsuario || !emailInversor) {
            toast.error("Selecciona admin, cobrador e inversor.");
            return;
        }
        const anioNum = parseIntField(anio);
        if (anio.trim() !== '' && anioNum === undefined) {
            toast.error("El año debe ser un entero ≥ 0 (Int64).");
            return;
        }
        setSaving(true);
        try {
            const res = await createCredito({
                id_cliente: cliente.id,
                vehiculo: {
                    placa: placa.trim().toUpperCase(),
                    ...(marca.trim() ? { marca: marca.trim() } : {}),
                    ...(modelo.trim() ? { modelo: modelo.trim() } : {}),
                    ...(anioNum !== undefined ? { anio: anioNum } : {}),
                    ...(color.trim() ? { color: color.trim() } : {}),
                },
                condiciones: {
                    porcentaje_comision: pct,
                    valor_cuota: cuota,
                    excluir_domingos: excluirDomingos,
                    modalidad_credito: modalidad,
                },
                asignaciones: {
                    email_admin: emailAdmin,
                    email_usuario: emailUsuario,
                    email_inversor: emailInversor,
                },
            }, { uid: user.uid, idToken: await user.getIdToken() });
            if (res.success) {
                toast.success(res.numero_credito ? `Contrato ${res.numero_credito} creado.` : "Contrato creado.");
                router.push("/admin/creditos");
            } else {
                toast.error(res.message || "No se pudo crear el contrato.");
            }
        } catch (error) {
            console.error("[creditos] Alta de contrato falló:", error);
            toast.error("Error al crear el contrato.");
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

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-center gap-3">
                <Link href="/admin/creditos" className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-white">Nuevo contrato</h1>
                    <p className="text-sm text-gray-400">Alta de cliente o selección existente + mapas del crédito</p>
                </div>
            </div>

            {/* 1. CLIENTE */}
            <section className={sectionCls}>
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">1 · Cliente</h2>
                <div className="flex gap-2">
                    <input value={cedulaSearch} onChange={(e) => setCedulaSearch(e.target.value)}
                        placeholder="Buscar por cédula…" className={inputCls} />
                    <button type="button" onClick={handleSearchClient} disabled={searching}
                        className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm">
                        {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Buscar
                    </button>
                </div>
                {cliente && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 text-sm text-emerald-300">
                        Seleccionado: <strong>{cliente.nombres}</strong> · {cliente.cedula} · {cliente.celular}
                        <button type="button" onClick={() => setCliente(null)}
                            className="ml-3 underline text-xs">cambiar</button>
                    </div>
                )}
                {showNewClient && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-gray-800">
                        <div><label className={labelCls}>Cédula *</label>
                            <input value={newClient.cedula} onChange={(e) => setNewClient({ ...newClient, cedula: e.target.value })} className={inputCls} /></div>
                        <div><label className={labelCls}>Nombres *</label>
                            <input value={newClient.nombres} onChange={(e) => setNewClient({ ...newClient, nombres: e.target.value })} className={inputCls} /></div>
                        <div><label className={labelCls}>Celular *</label>
                            <input value={newClient.celular} onChange={(e) => setNewClient({ ...newClient, celular: e.target.value })} className={inputCls} /></div>
                        <div><label className={labelCls}>Dirección *</label>
                            <input value={newClient.direccion} onChange={(e) => setNewClient({ ...newClient, direccion: e.target.value })} className={inputCls} /></div>
                        <div className="md:col-span-2">
                            <button type="button" onClick={handleCreateClient} disabled={saving}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                Crear cliente
                            </button>
                        </div>
                    </div>
                )}
            </section>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* 2. VEHÍCULO */}
                <section className={sectionCls}>
                    <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">2 · Vehículo</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div><label className={labelCls}>Placa *</label>
                            <input value={placa} onChange={(e) => setPlaca(e.target.value)} className={inputCls} placeholder="ABC123" /></div>
                        <div><label className={labelCls}>Marca</label>
                            <input value={marca} onChange={(e) => setMarca(e.target.value)} className={inputCls} /></div>
                        <div><label className={labelCls}>Modelo</label>
                            <input value={modelo} onChange={(e) => setModelo(e.target.value)} className={inputCls} /></div>
                        <div><label className={labelCls}>Año (Int64)</label>
                            <input value={anio} onChange={(e) => setAnio(e.target.value)} className={inputCls} inputMode="numeric" placeholder="2024" /></div>
                        <div><label className={labelCls}>Color</label>
                            <input value={color} onChange={(e) => setColor(e.target.value)} className={inputCls} /></div>
                    </div>
                </section>

                {/* 3. CONDICIONES */}
                <section className={sectionCls}>
                    <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">3 · Condiciones</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><label className={labelCls}>Modalidad</label>
                            <select value={modalidad} onChange={(e) => setModalidad(e.target.value as ModalidadCredito)} className={inputCls}>
                                <option value="renting">renting</option>
                                <option value="credito">credito</option>
                                <option value="contado">contado</option>
                            </select></div>
                        <div><label className={labelCls}>Valor cuota (Float ≥ 0) *</label>
                            <input value={valorCuota} onChange={(e) => setValorCuota(e.target.value)} className={inputCls} inputMode="decimal" placeholder="50000" /></div>
                        <div><label className={labelCls}>Porcentaje comisión (Float ≥ 0) *</label>
                            <input value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} className={inputCls} inputMode="decimal" placeholder="0.10 = 10%" /></div>
                        <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2 text-sm text-gray-300">
                                <input type="checkbox" checked={excluirDomingos} onChange={(e) => setExcluirDomingos(e.target.checked)}
                                    className="w-4 h-4 accent-amber-500" />
                                Excluir domingos (renting)
                            </label>
                        </div>
                    </div>
                </section>

                {/* 4. ASIGNACIONES */}
                <section className={sectionCls}>
                    <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">4 · Asignaciones (sys_admin_users)</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div><label className={labelCls}>Admin *</label>
                            <select value={emailAdmin} onChange={(e) => setEmailAdmin(e.target.value)} className={inputCls}>
                                <option value="">Seleccionar…</option>
                                {sysUsers.map((u) => <option key={u.email} value={u.email}>{u.label}</option>)}
                            </select></div>
                        <div><label className={labelCls}>Cobrador *</label>
                            <select value={emailUsuario} onChange={(e) => setEmailUsuario(e.target.value)} className={inputCls}>
                                <option value="">Seleccionar…</option>
                                {sysUsers.map((u) => <option key={u.email} value={u.email}>{u.label}</option>)}
                            </select></div>
                        <div><label className={labelCls}>Inversor *</label>
                            <select value={emailInversor} onChange={(e) => setEmailInversor(e.target.value)} className={inputCls}>
                                <option value="">Seleccionar…</option>
                                {sysUsers.map((u) => <option key={u.email} value={u.email}>{u.label}</option>)}
                            </select></div>
                    </div>
                </section>

                <button type="submit" disabled={saving}
                    className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-3 rounded-lg text-sm font-semibold">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {saving ? "Guardando…" : "Crear contrato"}
                </button>
            </form>
        </div>
    );
}
