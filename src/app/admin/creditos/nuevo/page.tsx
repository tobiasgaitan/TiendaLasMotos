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
    const { user, loading: authLoading, puedeAccion } = useAuth();
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

    if (!mounted || authLoading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando…
            </div>
        );
    }

    // D4: gate de página — solo roles con creditos:create ven el formulario.
    // (Fail-open transitorio solo durante authLoading, cubierto arriba; el servidor rechaza de todos modos.)
    if (!puedeAccion('creditos', 'create')) {
        return (
            <div className="max-w-3xl">
                <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg text-sm">
                    <strong>Acceso denegado:</strong> no tienes permiso para crear créditos.
                </div>
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
                    <input id="buscar-cedula" name="buscar-cedula" aria-label="Buscar cliente por cédula" value={cedulaSearch} onChange={(e) => setCedulaSearch(e.target.value)}
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
                        <div><label className={labelCls} htmlFor="cliente-cedula">Cédula *</label>
                            <input id="cliente-cedula" name="cliente-cedula" value={newClient.cedula} onChange={(e) => setNewClient({ ...newClient, cedula: e.target.value })} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="cliente-nombres">Nombres *</label>
                            <input id="cliente-nombres" name="cliente-nombres" value={newClient.nombres} onChange={(e) => setNewClient({ ...newClient, nombres: e.target.value })} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="cliente-celular">Celular *</label>
                            <input id="cliente-celular" name="cliente-celular" value={newClient.celular} onChange={(e) => setNewClient({ ...newClient, celular: e.target.value })} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="cliente-direccion">Dirección *</label>
                            <input id="cliente-direccion" name="cliente-direccion" value={newClient.direccion} onChange={(e) => setNewClient({ ...newClient, direccion: e.target.value })} className={inputCls} /></div>
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
                        <div><label className={labelCls} htmlFor="vehiculo-placa">Placa *</label>
                            <input id="vehiculo-placa" name="vehiculo-placa" value={placa} onChange={(e) => setPlaca(e.target.value)} className={inputCls} placeholder="ABC123" /></div>
                        <div><label className={labelCls} htmlFor="vehiculo-marca">Marca</label>
                            <input id="vehiculo-marca" name="vehiculo-marca" value={marca} onChange={(e) => setMarca(e.target.value)} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="vehiculo-modelo">Modelo</label>
                            <input id="vehiculo-modelo" name="vehiculo-modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="vehiculo-anio">Año (Int64)</label>
                            <input id="vehiculo-anio" name="vehiculo-anio" value={anio} onChange={(e) => setAnio(e.target.value)} className={inputCls} inputMode="numeric" placeholder="2024" /></div>
                        <div><label className={labelCls} htmlFor="vehiculo-color">Color</label>
                            <input id="vehiculo-color" name="vehiculo-color" value={color} onChange={(e) => setColor(e.target.value)} className={inputCls} /></div>
                    </div>
                </section>

                {/* 3. CONDICIONES */}
                <section className={sectionCls}>
                    <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">3 · Condiciones</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><label className={labelCls} htmlFor="cond-modalidad">Modalidad</label>
                            <select id="cond-modalidad" name="cond-modalidad" value={modalidad} onChange={(e) => setModalidad(e.target.value as ModalidadCredito)} className={inputCls}>
                                <option value="renting">renting</option>
                                <option value="credito">credito</option>
                                <option value="contado">contado</option>
                            </select></div>
                        <div><label className={labelCls} htmlFor="cond-valor-cuota">Valor cuota (Float ≥ 0) *</label>
                            <input id="cond-valor-cuota" name="cond-valor-cuota" value={valorCuota} onChange={(e) => setValorCuota(e.target.value)} className={inputCls} inputMode="decimal" placeholder="50000" /></div>
                        <div><label className={labelCls} htmlFor="cond-porcentaje-comision">Porcentaje comisión (Float ≥ 0) *</label>
                            <input id="cond-porcentaje-comision" name="cond-porcentaje-comision" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} className={inputCls} inputMode="decimal" placeholder="0.10 = 10%" /></div>
                        <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2 text-sm text-gray-300" htmlFor="cond-excluir-domingos">
                                <input id="cond-excluir-domingos" name="cond-excluir-domingos" type="checkbox" checked={excluirDomingos} onChange={(e) => setExcluirDomingos(e.target.checked)}
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
                        <div><label className={labelCls} htmlFor="asig-admin">Admin *</label>
                            <select id="asig-admin" name="asig-admin" value={emailAdmin} onChange={(e) => setEmailAdmin(e.target.value)} className={inputCls}>
                                <option value="">Seleccionar…</option>
                                {sysUsers.map((u) => <option key={u.email} value={u.email}>{u.label}</option>)}
                            </select></div>
                        <div><label className={labelCls} htmlFor="asig-cobrador">Cobrador *</label>
                            <select id="asig-cobrador" name="asig-cobrador" value={emailUsuario} onChange={(e) => setEmailUsuario(e.target.value)} className={inputCls}>
                                <option value="">Seleccionar…</option>
                                {sysUsers.map((u) => <option key={u.email} value={u.email}>{u.label}</option>)}
                            </select></div>
                        <div><label className={labelCls} htmlFor="asig-inversor">Inversor *</label>
                            <select id="asig-inversor" name="asig-inversor" value={emailInversor} onChange={(e) => setEmailInversor(e.target.value)} className={inputCls}>
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
