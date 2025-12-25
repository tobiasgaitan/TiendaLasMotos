"use client";

import { useEffect, useState } from "react";
import { Moto, Bono } from "@/lib/../types"; // Adjust import path
import { getCatalogoMotos } from "@/lib/firestore";
// import { updateMotoAction } from "@/app/actions"; // We will implement this
import { useRouter } from "next/navigation";
import Image from "next/image";
import { updateMotoAction } from "../../actions"; // Import the server action

export default function InventoryPage() {
    const [motos, setMotos] = useState<Moto[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Edit Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedMoto, setSelectedMoto] = useState<Moto | null>(null);

    // Form State (could use react-hook-form, but simple state is fine for this)
    const [editForm, setEditForm] = useState<{
        precio: number;
        bonoActive: boolean;
        bonoTitulo: string;
        bonoMonto: number;
        bonoFecha: string;
    }>({
        precio: 0,
        bonoActive: false,
        bonoTitulo: "",
        bonoMonto: 0,
        bonoFecha: "",
    });

    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        fetchMotos();
    }, []);

    const fetchMotos = async () => {
        setLoading(true);
        const data = await getCatalogoMotos();
        setMotos(data);
        setLoading(false);
    };

    const filteredMotos = motos.filter(moto =>
        moto.referencia.toLowerCase().includes(searchTerm.toLowerCase()) ||
        moto.marca.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleEditClick = (moto: Moto) => {
        setSelectedMoto(moto);
        setEditForm({
            precio: moto.precio,
            bonoActive: moto.bono?.activo || false,
            bonoTitulo: moto.bono?.titulo || "",
            bonoMonto: moto.bono?.monto || 0,
            bonoFecha: moto.bono?.fecha_limite ? new Date(moto.bono.fecha_limite).toISOString().split('T')[0] : "",
        });
        setMessage(null);
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!selectedMoto) return;
        setSaving(true);
        setMessage({ text: "Guardando...", type: "success" }); // Optimistic

        try {
            // Construct payload
            const result = await updateMotoAction({
                motoId: selectedMoto.id,
                precio: editForm.precio,
                bono: {
                    activo: editForm.bonoActive,
                    titulo: editForm.bonoTitulo,
                    monto: editForm.bonoMonto,
                    fecha_limite: editForm.bonoFecha ? new Date(editForm.bonoFecha).toISOString() : new Date().toISOString()
                }
            });

            if (result.success) {
                setMessage({ text: "¡Actualizado con éxito!", type: "success" });
                // Update local state to reflect changes immediately
                setMotos(prev => prev.map(m => {
                    if (m.id === selectedMoto.id) {
                        return {
                            ...m,
                            precio: editForm.precio,
                            bono: {
                                ...m.bono,
                                activo: editForm.bonoActive,
                                titulo: editForm.bonoTitulo,
                                monto: editForm.bonoMonto,
                                fecha_limite: editForm.bonoFecha ? new Date(editForm.bonoFecha).toISOString() : (m.bono?.fecha_limite || ""),
                                tipo: m.bono?.tipo || "descuento_directo"
                            }
                        };
                    }
                    return m;
                }));

                // Close after a short delay
                setTimeout(() => setIsModalOpen(false), 1500);
            } else {
                setMessage({ text: result.message || "Error al guardar", type: "error" });
            }
        } catch (error) {
            console.error("Error updating:", error);
            setMessage({ text: "Error inesperado", type: "error" });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-white">Cargando inventario...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-white">Gestión de Inventario</h1>
                <input
                    type="text"
                    placeholder="Buscar moto..."
                    className="p-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-red-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="overflow-x-auto bg-gray-800 rounded-lg shadow">
                <table className="min-w-full text-left text-sm text-gray-400">
                    <thead className="bg-gray-700 text-gray-200 uppercase font-medium">
                        <tr>
                            <th className="px-6 py-4">Foto</th>
                            <th className="px-6 py-4">Modelo</th>
                            <th className="px-6 py-4">Precio Base</th>
                            <th className="px-6 py-4">Bono</th>
                            <th className="px-6 py-4">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {filteredMotos.map((moto) => (
                            <tr key={moto.id} className="hover:bg-gray-750">
                                <td className="px-6 py-4">
                                    {moto.imagen && (
                                        <div className="w-16 h-12 relative overflow-hidden rounded">
                                            <Image
                                                src={moto.imagen}
                                                alt={moto.referencia}
                                                fill
                                                className="object-cover"
                                            />
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 font-semibold text-white">
                                    {moto.referencia}
                                    <div className="text-xs text-gray-500">{moto.marca}</div>
                                </td>
                                <td className="px-6 py-4">
                                    ${moto.precio.toLocaleString()}
                                </td>
                                <td className="px-6 py-4">
                                    {moto.bono?.activo ? (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                            Activo: -${moto.bono.monto.toLocaleString()}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                            Inactivo
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <button
                                        onClick={() => handleEditClick(moto)}
                                        className="text-indigo-400 hover:text-indigo-300 font-medium"
                                    >
                                        Editar
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit Modal */}
            {isModalOpen && selectedMoto && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-700">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">Editar {selectedMoto.referencia}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Price Field */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Precio Base</label>
                                <input
                                    type="number"
                                    value={editForm.precio}
                                    onChange={(e) => setEditForm({ ...editForm, precio: parseFloat(e.target.value) || 0 })}
                                    className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded text-white focus:border-red-500 focus:outline-none"
                                />
                            </div>

                            {/* Bono Section */}
                            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-white">Estado del Bono</span>
                                    <button
                                        onClick={() => setEditForm({ ...editForm, bonoActive: !editForm.bonoActive })}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editForm.bonoActive ? 'bg-green-500' : 'bg-gray-600'}`}
                                    >
                                        <span className={`${editForm.bonoActive ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`} />
                                    </button>
                                </div>

                                {editForm.bonoActive && (
                                    <>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-1">Título del Bono</label>
                                            <input
                                                type="text"
                                                value={editForm.bonoTitulo}
                                                onChange={(e) => setEditForm({ ...editForm, bonoTitulo: e.target.value })}
                                                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-1">Monto de Descuento</label>
                                            <input
                                                type="number"
                                                value={editForm.bonoMonto}
                                                onChange={(e) => setEditForm({ ...editForm, bonoMonto: parseFloat(e.target.value) || 0 })}
                                                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-1">Fecha Límite</label>
                                            <input
                                                type="date"
                                                value={editForm.bonoFecha}
                                                onChange={(e) => setEditForm({ ...editForm, bonoFecha: e.target.value })}
                                                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-800 flex justify-end space-x-3">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 rounded text-gray-300 hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium disabled:opacity-50 flex items-center"
                            >
                                {saving ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Guardando...
                                    </>
                                ) : "Guardar Cambios"}
                            </button>
                        </div>

                        {message && (
                            <div className={`p-3 text-center text-sm font-medium ${message.type === 'success' ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'}`}>
                                {message.text}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
