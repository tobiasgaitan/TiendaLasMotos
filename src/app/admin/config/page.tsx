"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { City, SoatRate, FinancialEntity } from "@/types/financial";
import { Plus } from "lucide-react";
import ConfigTable from "@/components/admin/ConfigTable";
import ConfigModal from "@/components/admin/ConfigModal";

export default function ConfigPage() {
    const [activeTab, setActiveTab] = useState<'cities' | 'soat' | 'financial'>('cities');
    const [loading, setLoading] = useState(true);

    // Data States
    const [cities, setCities] = useState<City[]>([]);
    const [soatRates, setSoatRates] = useState<SoatRate[]>([]);
    const [financialEntities, setFinancialEntities] = useState<FinancialEntity[]>([]);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalType, setModalType] = useState<'city' | 'soat' | 'financial'>('city');
    const [editingItem, setEditingItem] = useState<any>(null);

    // Fetch Data
    /**
     * Fetches configuration data from Firestore.
     * @param showLoading - If true, triggers the page-level loading state. Defaults to true.
     */
    const fetchData = async (showLoading = true) => {
        if (showLoading) setLoading(true);
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
            if (showLoading) setLoading(false);
        }
    };

    /**
     * Initial data load.
     */
    useEffect(() => {
        fetchData(true);
    }, []);

    // Handlers
    const handleOpenModal = (type: 'city' | 'soat' | 'financial', item?: any) => {
        setModalType(type);
        setEditingItem(item || null);
        setIsModalOpen(true);
    };

    /**
     * Saves a configuration item to Firestore.
     * @param data - The data to save.
     */
    const handleSave = async (data: any) => {
        let collectionName = "";
        if (modalType === 'city') collectionName = "financial_config/general/cities";
        if (modalType === 'soat') collectionName = "financial_config/general/tarifas_soat";
        if (modalType === 'financial') collectionName = "financial_config/general/financieras";

        try {
            if (editingItem) {
                await updateDoc(doc(db, collectionName, editingItem.id), data);
            } else {
                await addDoc(collection(db, collectionName), data);
            }
            // Await the fetch to ensure data is updated before concluding action
            // Pass false to avoid unmounting the table (silent refresh)
            await fetchData(false);
        } catch (error) {
            console.error("Error saving data:", error);
            throw error; // Let modal handle error state
        }
    };

    const handleDelete = async (type: 'city' | 'soat' | 'financial', id: string) => {
        if (!confirm("¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.")) return;

        let collectionName = "";
        if (type === 'city') collectionName = "financial_config/general/cities";
        if (type === 'soat') collectionName = "financial_config/general/tarifas_soat";
        if (type === 'financial') collectionName = "financial_config/general/financieras";

        try {
            await deleteDoc(doc(db, collectionName, id));
            await fetchData(false); // Silent refresh
        } catch (error) {
            console.error("Error deleting:", error);
            alert("Error al eliminar");
        }
    };

    // Columns Definitions
    const cityColumns = [
        { header: "Nombre", accessor: (c: City) => c.name },
        { header: "Matrícula (Crédito)", accessor: (c: City) => `$${(c.registrationCost?.credit || 0).toLocaleString()}` },
        { header: "Gastos Doc.", accessor: (c: City) => `$${(c.documentationFee || 0).toLocaleString()}` },
    ];

    const soatColumns = [
        { header: "Categoría", accessor: (s: SoatRate) => s.category },
        { header: "Año", accessor: (s: SoatRate) => s.year },
        { header: "Precio", accessor: (s: SoatRate) => `$${(s.price || 0).toLocaleString()}` },
    ];

    const financialColumns = [
        { header: "Entidad", accessor: (f: FinancialEntity) => f.name },
        { header: "Tasa Mensual", accessor: (f: FinancialEntity) => `${f.interestRate}%` },
        { header: "Cuota Inicial Min.", accessor: (f: FinancialEntity) => `${f.minDownPaymentPercentage}%` },
        { header: "Trámites en Crédito", accessor: (f: FinancialEntity) => f.requiresProceduresInCredit ? "Sí" : "No" },
    ];

    return (
        <div className="p-8 space-y-8 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold text-gray-800">Parámetros financieras</h1>

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
                <div className="text-center py-20 text-gray-500">Cargando configuración...</div>
            ) : (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-semibold">
                            {activeTab === 'cities' ? 'Gestión de Ciudades' : activeTab === 'soat' ? 'Tarifas SOAT' : 'Entidades Financieras'}
                        </h3>
                        <button
                            onClick={() => handleOpenModal(activeTab === 'cities' ? 'city' : activeTab)}
                            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 shadow-md shadow-green-200 transition-all active:scale-95"
                        >
                            <Plus size={18} /> Agregar Nuevo
                        </button>
                    </div>

                    {activeTab === 'cities' && (
                        <ConfigTable
                            data={cities}
                            columns={cityColumns}
                            onEdit={(item) => handleOpenModal('city', item)}
                            onDelete={(item) => handleDelete('city', item.id)}
                        />
                    )}

                    {activeTab === 'soat' && (
                        <ConfigTable
                            data={soatRates}
                            columns={soatColumns}
                            onEdit={(item) => handleOpenModal('soat', item)}
                            onDelete={(item) => handleDelete('soat', item.id)}
                        />
                    )}

                    {activeTab === 'financial' && (
                        <ConfigTable
                            data={financialEntities}
                            columns={financialColumns}
                            onEdit={(item) => handleOpenModal('financial', item)}
                            onDelete={(item) => handleDelete('financial', item.id)}
                        />
                    )}
                </div>
            )}

            <ConfigModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingItem}
                type={modalType}
            />
        </div>
    );
}
