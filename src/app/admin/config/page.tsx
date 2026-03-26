"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FinancialEntity } from "@/types/financial";
import { Plus, Loader2, ShieldAlert, Terminal, Info } from "lucide-react";
import ConfigTable from "@/components/admin/ConfigTable";
import ConfigModal from "@/components/admin/ConfigModal";
import ModalWrapper from "@/components/admin/ModalWrapper";

export default function ConfigPage() {
    const [loading, setLoading] = useState(true);

    // Data States
    const [financialEntities, setFinancialEntities] = useState<FinancialEntity[]>([]);

    // Dev Mode & Safety
    const [showDevTools, setShowDevTools] = useState(false);
    const [isSaneamientoModalOpen, setIsSaneamientoModalOpen] = useState(false);
    const [saneamientoKeyword, setSaneamientoKeyword] = useState("");
    const [isProcessingSaneamiento, setIsProcessingSaneamiento] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);

    // Persist Dev Mode
    useEffect(() => {
        const saved = localStorage.getItem("admin_dev_mode") === "true";
        setShowDevTools(saved);
    }, []);

    const toggleDevMode = () => {
        const newVal = !showDevTools;
        setShowDevTools(newVal);
        localStorage.setItem("admin_dev_mode", String(newVal));
    };

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
            await fetchData(false);
        } catch (error) {
            console.error("Error saving data:", error);
            throw error;
        }
    };

    /**
     * Seeds Crediorbe Defaults matching requirements V10.0
     */
    const handleSeedCrediorbe = async () => {
        if (!confirm("¿Desea instalar la configuración por defecto de Crediorbe?\n\nAdvertencia: Sobreescribe tasas FNG (20.66%) y Seguro (0.1126%).")) return;

        const data = {
            name: "Crediorbe",
            interestRate: 2.3, // Placeholder
            syncedWithUsura: true,
            manualOverride: false,

            // Requirements V10.0
            fngRate: 20.66,
            lifeInsuranceType: 'percentage',
            lifeInsuranceValue: 0.1126,
            financeDocsAndSoat: false,

            minDownPaymentPercentage: 10,
            minAge: 18,
            maxAge: 75,
            active: true
        };

        await handleSave(data);
        alert("Crediorbe instalada correctamente.");
    };

    /**
     * Execution of Saneamiento with validation check
     */
    const handleRunSaneamiento = async () => {
        if (saneamientoKeyword !== "EJECUTAR") return;
        
        setIsProcessingSaneamiento(true);
        try {
            const { normalizeInventory } = await import('@/app/actions/inventory-normalization');
            const res = await normalizeInventory();
            if (res.success) {
                alert(`✅ Saneamiento Completado.\nItems Procesados: ${res.processed}\nItems Actualizados: ${res.updated}`);
                setIsSaneamientoModalOpen(false);
                setSaneamientoKeyword("");
            } else {
                alert("❌ Error: " + res.error);
            }
        } catch (e) {
            alert("Error invocando action: " + e);
        } finally {
            setIsProcessingSaneamiento(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.")) return;

        const collectionName = "financial_config/general/financieras";

        try {
            await deleteDoc(doc(db, collectionName, id));
            await fetchData(false);
        } catch (error) {
            console.error("Error deleting:", error);
            alert("Error al eliminar");
        }
    };

    const financialColumns = [
        { header: "Entidad", accessor: (f: FinancialEntity) => f.name },
        { header: "Tasa Mensual", accessor: (f: FinancialEntity) => `${f.interestRate}%` },
        { header: "Cuota Inicial Min.", accessor: (f: FinancialEntity) => `${f.minDownPaymentPercentage}%` },
        {
            header: "Trámites en Crédito",
            accessor: (f: FinancialEntity) => {
                const val = f.financeDocsAndSoat ?? f.requiresProceduresInCredit ?? false;
                return val ? "Sí" : "No";
            }
        },
    ];

    return (
        <div className="p-8 space-y-8 bg-gray-900 min-h-screen">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-white">Entidades Financieras</h1>
                    <p className="text-gray-400">Gestiona los aliados financieros disponibles para el simulador.</p>
                </div>
                
                {/* Developer Mode Toggle */}
                <button
                    onClick={toggleDevMode}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        showDevTools 
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/50" 
                        : "bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-400"
                    }`}
                >
                    <Terminal size={14} />
                    {showDevTools ? "Modo Desarrollador: ON" : "Modo Desarrollador: OFF"}
                </button>
            </div>

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
                        <div className="flex gap-4">
                            <button
                                onClick={() => handleOpenModal()}
                                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-md transition-all active:scale-95 font-medium"
                            >
                                <Plus size={18} /> Agregar Financiera
                            </button>
                        </div>
                    </div>

                    {/* Developer Tools Section (Hidden by default) */}
                    {showDevTools && (
                        <div className="mb-6 p-4 bg-gray-900/50 rounded-xl border border-amber-500/20 flex flex-col md:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-2">
                            <div className="flex items-center gap-3 text-amber-400">
                                <ShieldAlert size={20} />
                                <span className="text-sm font-medium">Herramientas de Ejecución Masiva habilitadas</span>
                            </div>
                            <div className="flex flex-wrap justify-end gap-3">
                                <button
                                    onClick={handleSeedCrediorbe}
                                    title="Sobreescribe tasas FNG (20.66%) y Seguro (0.1126%) a valores estándar V10.0."
                                    className="text-xs text-blue-400 hover:text-blue-300 underline flex items-center gap-1 group"
                                >
                                    <Info size={12} className="opacity-50 group-hover:opacity-100" />
                                    Instalar Defaults Crediorbe (V10.0)
                                </button>

                                <button
                                    onClick={() => setIsSaneamientoModalOpen(true)}
                                    title="Normaliza marcas/cilindrajes a MAYÚSCULAS y Números en el inventario. NO TIENE ROLLBACK."
                                    className="text-xs text-emerald-400 hover:text-emerald-300 underline font-bold border border-emerald-500/30 p-2 rounded-lg hover:bg-emerald-500/10 transition-all flex items-center gap-1 group"
                                >
                                    <Terminal size={12} className="opacity-50 group-hover:opacity-100" />
                                    ⚡ EJECUTAR SANEAMIENTO (V23.0)
                                </button>
                            </div>
                        </div>
                    )}

                    <ConfigTable
                        data={financialEntities}
                        columns={financialColumns}
                        onEdit={(item) => handleOpenModal(item)}
                        onDelete={(item) => handleDelete(item.id)}
                    />
                </div>
            )}

            {/* Saneamiento Validation Modal */}
            <ModalWrapper
                isOpen={isSaneamientoModalOpen}
                onClose={() => !isProcessingSaneamiento && setIsSaneamientoModalOpen(false)}
                title={
                    <div className="flex items-center gap-2 text-emerald-500">
                        <ShieldAlert /> Saneamiento Maestro V23.0
                    </div>
                }
                maxWidth="500px"
            >
                <div className="p-6 space-y-4">
                    <p className="text-gray-300 text-sm">
                        Esta acción normalizará marcas, referencias y cilindrajes en **todo el inventario**.
                    </p>
                    
                    <div className="bg-red-900/20 border border-red-500/30 p-3 rounded-lg">
                        <p className="text-red-400 text-xs font-bold flex items-center gap-2">
                            <ShieldAlert size={14} /> ADVERTENCIA: NO TIENE ROLLBACK AUTOMÁTICO.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-gray-400 uppercase font-bold">
                            Para confirmar, escriba <span className="text-white italic">EJECUTAR</span>
                        </label>
                        <input
                            type="text"
                            value={saneamientoKeyword}
                            onChange={(e) => setSaneamientoKeyword(e.target.value.toUpperCase())}
                            placeholder="Escribe aquí..."
                            disabled={isProcessingSaneamiento}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 outline-none transition-all"
                        />
                    </div>

                    <button
                        onClick={handleRunSaneamiento}
                        disabled={saneamientoKeyword !== "EJECUTAR" || isProcessingSaneamiento}
                        className={`w-full py-3 rounded-xl font-bold transition-all flex justify-center items-center gap-2 ${
                            saneamientoKeyword === "EJECUTAR" && !isProcessingSaneamiento
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/20"
                            : "bg-gray-700 text-gray-500 cursor-not-allowed"
                        }`}
                    >
                        {isProcessingSaneamiento ? (
                            <>
                                <Loader2 className="animate-spin" size={18} /> Procesando...
                            </>
                        ) : (
                            "Iniciar Saneamiento"
                        )}
                    </button>
                </div>
            </ModalWrapper>

            <ConfigModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingItem}
            />
        </div>
    );
}
