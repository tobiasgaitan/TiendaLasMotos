"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { City, SoatRate, FinancialEntity } from "@/types/financial";
import { Plus, Trash2, Save, Edit2 } from "lucide-react";

export default function ConfigPage() {
    const [activeTab, setActiveTab] = useState<'cities' | 'soat' | 'financial'>('cities');
    const [loading, setLoading] = useState(true);

    // Data States
    const [cities, setCities] = useState<City[]>([]);
    const [soatRates, setSoatRates] = useState<SoatRate[]>([]);
    const [financialEntities, setFinancialEntities] = useState<FinancialEntity[]>([]);

    // Fetch Data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const citiesSnapshot = await getDocs(collection(db, "financial_config/general/cities"));
                setCities(citiesSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as City)));

                const soatSnapshot = await getDocs(collection(db, "financial_config/general/tarifas_soat"));
                setSoatRates(soatSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as SoatRate)));

                const financialSnapshot = await getDocs(collection(db, "financial_config/general/financieras"));
                setFinancialEntities(financialSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as FinancialEntity)));
            } catch (error) {
                console.error("Error fetching config:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // -- CRUD Handlers (Simplified for brevity, would separate in real world) --

    const handleAddCity = async () => {
        const newCity: Omit<City, 'id'> = {
            name: "Nueva Ciudad",
            department: "Departamento",
            registrationCost: { credit: 0, cash: 0 },
            documentationFee: 0
        };
        const ref = await addDoc(collection(db, "financial_config/general/cities"), newCity);
        setCities([...cities, { ...newCity, id: ref.id }]);
    };

    const handleUpdateCity = async (id: string, data: Partial<City>) => {
        await updateDoc(doc(db, "financial_config/general/cities", id), data);
        setCities(cities.map(c => c.id === id ? { ...c, ...data } : c));
    };

    const handleDeleteCity = async (id: string) => {
        if (!confirm("Eliminar ciudad?")) return;
        await deleteDoc(doc(db, "financial_config/general/cities", id));
        setCities(cities.filter(c => c.id !== id));
    };

    // ... Similar handlers for SOAT and Financial would go here ...
    // For the MVP of this task, I'll implement the UI structure and City editing fully.

    return (
        <div className="p-8 space-y-8 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold text-gray-800">Cofiguración Financiera Global</h1>

            {/* Tabs */}
            <div className="flex space-x-1 bg-white p-1 rounded-xl shadow-sm w-fit">
                {['cities', 'soat', 'financial'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-gray-500 hover:bg-gray-100'
                            }`}
                    >
                        {tab === 'cities' ? 'Ciudades & Trámites' : tab === 'soat' ? 'Tarifas SOAT' : 'Financieras'}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="text-center py-20">Cargando configuración...</div>
            ) : (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">

                    {/* CITIES EDITOR */}
                    {activeTab === 'cities' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-semibold">Gestión de Ciudades</h3>
                                <button onClick={handleAddCity} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                                    <Plus size={18} /> Nueva Ciudad
                                </button>
                            </div>

                            <div className="grid gap-4">
                                {cities.map((city) => (
                                    <div key={city.id} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-xl bg-gray-50 items-end">
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Nombre</label>
                                            <input
                                                value={city.name}
                                                onChange={(e) => handleUpdateCity(city.id, { name: e.target.value })}
                                                className="w-full px-3 py-2 border rounded-md"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Matrícula (Crédito)</label>
                                            <input
                                                type="number"
                                                value={city.registrationCost?.credit || 0}
                                                onChange={(e) => handleUpdateCity(city.id, { registrationCost: { ...city.registrationCost, credit: Number(e.target.value) } })}
                                                className="w-full px-3 py-2 border rounded-md"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Matrícula (Contado)</label>
                                            <input
                                                type="number"
                                                value={city.registrationCost?.cash || 0}
                                                onChange={(e) => handleUpdateCity(city.id, { registrationCost: { ...city.registrationCost, cash: Number(e.target.value) } })}
                                                className="w-full px-3 py-2 border rounded-md"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <label className="text-xs text-gray-500 block mb-1">Gestión Doc.</label>
                                                <input
                                                    type="number"
                                                    value={city.documentationFee || 0}
                                                    onChange={(e) => handleUpdateCity(city.id, { documentationFee: Number(e.target.value) })}
                                                    className="w-full px-3 py-2 border rounded-md"
                                                />
                                            </div>
                                            <button onClick={() => handleDeleteCity(city.id)} className="text-red-500 p-2 hover:bg-red-50 rounded-md">
                                                <Trash2 size={20} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Placeholders for other tabs (implementation would follow same pattern) */}
                    {activeTab === 'soat' && <div className="text-gray-500 text-center py-10">Módulo de SOAT en construcción (Sigue el mismo patrón CRUD)</div>}
                    {activeTab === 'financial' && <div className="text-gray-500 text-center py-10">Módulo Financiero en construcción (Sigue el mismo patrón CRUD)</div>}

                </div>
            )}
        </div>
    );
}
