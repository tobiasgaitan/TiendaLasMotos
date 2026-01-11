'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { City, FinancialEntity } from '@/types/financial';
import { Plus, Loader2, MapPin, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';

// Reusing modal wrapper concept or inline modal for simplicity as per implementation plan
// We will create an inline modal here to manage Sede + Financial Entities

export default function SedesPage() {
    const [loading, setLoading] = useState(true);
    const [sedes, setSedes] = useState<City[]>([]);
    const [financialEntities, setFinancialEntities] = useState<FinancialEntity[]>([]);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSede, setEditingSede] = useState<City | null>(null);
    const [saving, setSaving] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Partial<City>>({
        name: '',
        department: '',
        documentationFee: 0,
        financialEntitiesIds: []
    });

    // --- DATA LOADING ---
    const fetchData = async () => {
        setLoading(true);
        try {
            const [sedesSnap, finSnap] = await Promise.all([
                getDocs(collection(db, 'config/general/sedes')), // Using specific subcollection logical for config
                getDocs(collection(db, 'financial_config/general/financieras'))
            ]);

            const loadedSedes = sedesSnap.docs.map(d => ({ id: d.id, ...d.data() } as City));
            const loadedFinancials = finSnap.docs.map(d => ({ id: d.id, ...d.data() } as FinancialEntity));

            setSedes(loadedSedes);
            setFinancialEntities(loadedFinancials);
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error("Error cargando sedes");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- HANDLERS ---
    const handleOpenModal = (sede?: City) => {
        if (sede) {
            setEditingSede(sede);
            setFormData({ ...sede });
        } else {
            setEditingSede(null);
            setFormData({
                name: '',
                department: '',
                documentationFee: 0,
                financialEntitiesIds: []
            });
        }
        setIsModalOpen(true);
    };

    const handleToggleFinancial = (id: string) => {
        const current = formData.financialEntitiesIds || [];
        if (current.includes(id)) {
            setFormData({ ...formData, financialEntitiesIds: current.filter(fid => fid !== id) });
        } else {
            setFormData({ ...formData, financialEntitiesIds: [...current, id] });
        }
    };

    const handleSave = async () => {
        if (!formData.name) return toast.error("El nombre es requerido");

        setSaving(true);
        try {
            const dataToSave = {
                ...formData,
                isActive: true // Default active
            };

            if (editingSede) {
                await updateDoc(doc(db, 'config/general/sedes', editingSede.id), dataToSave);
                toast.success("Sede actualizada");
            } else {
                await addDoc(collection(db, 'config/general/sedes'), dataToSave);
                toast.success("Sede creada");
            }
            setIsModalOpen(false);
            setEditingSede(null); // Ensure editing state is cleared
            setFormData({
                name: '',
                department: '',
                documentationFee: 0,
                financialEntitiesIds: []
            });
            fetchData(); // Refresh
        } catch (error) {
            console.error(error);
            toast.error("Error guardando sede");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Eliminar esta sede?")) return;
        try {
            await deleteDoc(doc(db, 'config/general/sedes', id));
            toast.success("Sede eliminada");
            fetchData();
        } catch (error) {
            toast.error("Error eliminando");
        }
    };

    return (
        <div className="p-8 space-y-8 bg-gray-950 min-h-screen text-white">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white">Gestión de Sedes</h1>
                    <p className="text-gray-400">Administra las ciudades y sus financieras activas.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
                >
                    <Plus size={18} /> Nueva Sede
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500 w-8 h-8" /></div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sedes.map(sede => (
                        <div key={sede.id} className="bg-gray-900 border border-gray-800 p-6 rounded-xl shadow-lg relative group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-blue-900/20 rounded-lg text-blue-400">
                                        <MapPin size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-white">{sede.name}</h3>
                                        <p className="text-sm text-gray-500">{sede.department || 'Nacional'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleOpenModal(sede)} className="p-1.5 hover:bg-gray-800 rounded text-blue-400">
                                        <Edit size={16} />
                                    </button>
                                    <button onClick={() => handleDelete(sede.id)} className="p-1.5 hover:bg-gray-800 rounded text-red-400">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="text-sm">
                                    <span className="text-gray-500">Costo Gestión:</span>
                                    <span className="ml-2 font-mono text-gray-300">
                                        ${sede.documentationFee?.toLocaleString()}
                                    </span>
                                </div>

                                <div>
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Financieras Habilitadas</p>
                                    <div className="flex flex-wrap gap-2">
                                        {financialEntities
                                            .filter(f => sede.financialEntitiesIds?.includes(f.id))
                                            .map(f => (
                                                <span key={f.id} className="px-2 py-1 bg-green-900/30 border border-green-800 text-green-300 text-xs rounded-md">
                                                    {f.name}
                                                </span>
                                            ))}
                                        {(!sede.financialEntitiesIds || sede.financialEntitiesIds.length === 0) && (
                                            <span className="text-xs text-gray-600 italic">Todas (Default)</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {sedes.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-500 border border-dashed border-gray-800 rounded-xl">
                            No hay sedes configuradas.
                        </div>
                    )}
                </div>
            )}

            {/* MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-gray-800">
                            <h2 className="text-xl font-bold text-white">
                                {editingSede ? 'Editar Sede' : 'Nueva Sede'}
                            </h2>
                        </div>

                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Nombre Ciudad</label>
                                <input
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ej: Santa Marta"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Departamento</label>
                                <input
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                                    value={formData.department}
                                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                                    placeholder="Ej: Magdalena"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Costo Trámites (Opcional)</label>
                                <input
                                    type="number"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                                    value={formData.documentationFee}
                                    onChange={e => setFormData({ ...formData, documentationFee: Number(e.target.value) })}
                                />
                            </div>

                            <div className="pt-2 border-t border-gray-800">
                                <label className="block text-sm font-bold text-blue-400 mb-3">Financieras Visibles</label>
                                <div className="space-y-2">
                                    {financialEntities.map(entity => (
                                        <label key={entity.id} className="flex items-center gap-3 p-3 bg-gray-950 rounded-lg border border-gray-800 cursor-pointer hover:border-gray-700">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
                                                checked={formData.financialEntitiesIds?.includes(entity.id)}
                                                onChange={() => handleToggleFinancial(entity.id)}
                                            />
                                            <span className="text-gray-300 font-medium">{entity.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-gray-950 border-t border-gray-800 flex justify-end gap-3">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-gray-400 hover:text-white font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2 disabled:opacity-50"
                            >
                                {saving && <Loader2 className="animate-spin w-4 h-4" />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
