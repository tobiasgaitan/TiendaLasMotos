"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FinancialEntity } from "@/types/financial";
import { Plus, Loader2 } from "lucide-react";
import ConfigTable from "@/components/admin/ConfigTable";
import ConfigModal from "@/components/admin/ConfigModal";

export default function ConfigPage() {
    const [loading, setLoading] = useState(true);

    // Data States
    const [financialEntities, setFinancialEntities] = useState<FinancialEntity[]>([]);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);

    // Fetch Data
    const fetchData = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
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
    const handleOpenModal = (item?: any) => {
        setEditingItem(item || null);
        setIsModalOpen(true);
    };

    /**
     * Saves a configuration item to Firestore.
     * @param data - The data to save.
     */
    const handleSave = async (data: any) => {
        const collectionName = "financial_config/general/financieras";

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

    const handleDelete = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.")) return;

        const collectionName = "financial_config/general/financieras";

        try {
            await deleteDoc(doc(db, collectionName, id));
            await fetchData(false); // Silent refresh
        } catch (error) {
            console.error("Error deleting:", error);
            alert("Error al eliminar");
        }
    };

    const financialColumns = [
        { header: "Entidad", accessor: (f: FinancialEntity) => f.name },
        { header: "Tasa Mensual", accessor: (f: FinancialEntity) => `${f.interestRate}%` },
        { header: "Cuota Inicial Min.", accessor: (f: FinancialEntity) => `${f.minDownPaymentPercentage}%` },
        { header: "Trámites en Crédito", accessor: (f: FinancialEntity) => f.requiresProceduresInCredit ? "Sí" : "No" },
    ];

    return (
        <div className="p-8 space-y-8 bg-gray-900 min-h-screen">
            <h1 className="text-3xl font-bold text-white">Entidades Financieras</h1>
            <p className="text-gray-400">Gestiona los aliados financieros disponibles para el simulador.</p>

            {loading ? (
                <div className="text-center py-20 text-gray-500 flex justify-center">
                    <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                </div>
            ) : (
                <div className="bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-700">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-semibold text-white">
                            Listado de Financieras
                        </h3>
                        <button
                            onClick={() => handleOpenModal()}
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-md transition-all active:scale-95 font-medium"
                        >
                            <Plus size={18} /> Agregar Financiera
                        </button>
                    </div>

                    <ConfigTable
                        data={financialEntities}
                        columns={financialColumns}
                        onEdit={(item) => handleOpenModal(item)}
                        onDelete={(item) => handleDelete(item.id)}
                    />
                </div>
            )}

            <ConfigModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingItem}
            />
        </div>
    );
}
