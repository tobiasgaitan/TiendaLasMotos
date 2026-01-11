"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import ModalWrapper from "./ModalWrapper";

interface ConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any) => Promise<void>;
    initialData?: any;
}

/**
 * Modal component for editing or creating financial configuration entities.
 * handles form state, validation, and submission to Firestore.
 * 
 * @param isOpen - Visibility state of the modal.
 * @param onClose - Handler to close the modal.
 * @param onSave - Async handler to save the form data.
 * @param initialData - Optional data for editing an existing entity.
 */
export default function ConfigModal({ isOpen, onClose, onSave, initialData }: ConfigModalProps) {
    const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();
    const type = 'financial'; // Forced type

    useEffect(() => {
        if (isOpen) {
            const defaults = initialData || getDefaults();
            reset(defaults);
        }
    }, [initialData, isOpen, reset]);

    const onSubmit = async (data: any) => {
        try {
            await onSave(data);
            onClose();
        } catch (error) {
            console.error("Error saving:", error);
            alert("Error al guardar. Revisa la consola.");
        }
    };

    const getDefaults = () => {
        return {
            name: "",
            interestRate: 0,
            minDownPaymentPercentage: 0,
            financeDocsAndSoat: true, // Unified Default
            lifeInsuranceType: 'percentage',
            lifeInsuranceValue: 0.1126,
            // New Fields
            fngRate: 0,
            unemploymentInsuranceType: 'fixed_monthly',
            unemploymentInsuranceValue: 0,
            manualOverride: false,
            syncedWithUsura: false,
            brillaManagementRate: 0,
            coverageRate: 0,
            minAge: 18,
            maxAge: 75
        };
    };

    const modalTitle = `${initialData ? 'Editar' : 'Nueva'} Entidad Financiera`;

    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose} title={modalTitle}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">

                {/* --- FINANCIAL FIELDS ONLY --- */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Nombre Entidad</label>
                    <input
                        {...register("name", { required: true })}
                        type="text"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Tasa de Interés (% MV)</label>
                        <div className="flex gap-2">
                            <input
                                {...register("interestRate", { required: true, valueAsNumber: true })}
                                type="number"
                                step="0.01"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            {/* [FIX] Synced With Usura Toggle */}
                            <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-2" title="Sincronizar con Tasa de Usura (Superfinanciera)">
                                <input
                                    {...register("syncedWithUsura")}
                                    type="checkbox"
                                    id="syncedWithUsura"
                                    className="w-4 h-4 accent-blue-500"
                                />
                                <label htmlFor="syncedWithUsura" className="text-[10px] text-blue-400 font-bold cursor-pointer">AUTO</label>
                            </div>

                            <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-2" title="Manual Override: Prevent Auto-Update">
                                <input
                                    {...register("manualOverride")}
                                    type="checkbox"
                                    id="override"
                                    className="w-4 h-4 accent-red-500"
                                />
                                <label htmlFor="override" className="text-[10px] text-gray-400 font-bold cursor-pointer">LOCK</label>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">% Cuota Inicial Mínima</label>
                        <input
                            {...register("minDownPaymentPercentage", { required: true, valueAsNumber: true })}
                            type="number"
                            step="1"
                            max="100"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>

                {/* --- SPECIAL MODEL CHARGES (Brilla/Other) --- */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Gestión Crédito Brilla (%)</label>
                        <input
                            {...register("brillaManagementRate", { valueAsNumber: true })}
                            type="number"
                            step="0.01"
                            placeholder="Ej. 5"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Calculado sobre ($P_1$)</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Cobertura de Acceso (%)</label>
                        <input
                            {...register("coverageRate", { valueAsNumber: true })}
                            type="number"
                            step="0.01"
                            placeholder="Ej. 4"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Calculado sobre ($P_2$)</p>
                    </div>
                </div>

                {/* AGE LIMITS */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Edad Mínima</label>
                        <input
                            {...register("minAge", { valueAsNumber: true })}
                            type="number"
                            placeholder="Ej. 18"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Edad Máxima</label>
                        <input
                            {...register("maxAge", { valueAsNumber: true })}
                            type="number"
                            placeholder="Ej. 69"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>

                {/* INSURANCE CONFIG HEADER */}
                <div className="text-xs font-bold text-gray-500 uppercase mt-4 mb-2">Seguros y Cargos Adicionales</div>

                {/* LIFE INSURANCE */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Tipo Seguro Vida</label>
                        <select
                            {...register("lifeInsuranceType")}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="percentage">Porcentaje (% MV)</option>
                            <option value="fixed_per_million">Fijo por Millón ($)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Valor Seguro Vida</label>
                        <input
                            {...register("lifeInsuranceValue", { required: true, valueAsNumber: true })}
                            type="number"
                            step="0.0001"
                            title="Si es %, usa 0.1126. Si es fijo, usa 800."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>

                {/* UNEMPLOYMENT INSURANCE & FNG */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">% FNG / Otros Seguros</label>
                        <input
                            {...register("fngRate", { valueAsNumber: true })}
                            type="number"
                            step="0.01"
                            placeholder="Ej. 10"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Se suma al Capital Base</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Seguro Desempleo (Mensual)</label>
                        <div className="flex gap-2">
                            <select
                                {...register("unemploymentInsuranceType")}
                                className="bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white w-1/2 text-xs"
                            >
                                <option value="fixed_monthly">Valor ($)</option>
                                <option value="percentage_monthly">% Cuota</option>
                            </select>
                            <input
                                {...register("unemploymentInsuranceValue", { valueAsNumber: true })}
                                type="number"
                                step="0.01"
                                placeholder="0"
                                className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white"
                            />
                        </div>
                    </div>
                </div>

                {/* TOGGLES */}
                <div className="space-y-2 pt-2 border-t border-gray-700">
                    <div className="flex items-center gap-2">
                        <input
                            {...register("financeDocsAndSoat")}
                            type="checkbox"
                            id="docReq"
                            className="w-4 h-4 rounded accent-green-500"
                        />
                        <label htmlFor="docReq" className="text-sm text-gray-300">
                            Financiar Matrícula y SOAT
                            <span className="block text-xs text-gray-500">
                                Suma el valor de matrícula de la Matriz al capital base ($P_1$)
                            </span>
                        </label>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-700 mt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 font-bold hover:text-white transition-colors"
                        disabled={isSubmitting}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        style={{ backgroundColor: '#2563eb', color: 'white' }}
                        className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/50 disabled:opacity-50 flex items-center gap-2"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? <Loader2 className="animate-spin h-5 w-5" /> : null}
                        {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </form>
        </ModalWrapper>
    );
}
