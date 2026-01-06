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
            requiresProceduresInCredit: true,
            lifeInsuranceType: 'percentage',
            lifeInsuranceValue: 0.1126,
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
                        <input
                            {...register("interestRate", { required: true, valueAsNumber: true })}
                            type="number"
                            step="0.01"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
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

                {/* INSURANCE CONFIG */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Tipo Seguro Vida</label>
                        <select
                            {...register("lifeInsuranceType")}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="percentage">Porcentaje (%)</option>
                            <option value="fixed_per_million">Fijo por Millón ($)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Valor Seguro</label>
                        <input
                            {...register("lifeInsuranceValue", { required: true, valueAsNumber: true })}
                            type="number"
                            step="0.0001"
                            title="Si es %, usa 0.1126. Si es fijo, usa 800."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Ej: 0.1126 para % | 800 para Fijo</p>
                    </div>
                </div>

                {/* TOGGLES */}
                <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-2">
                        <input
                            {...register("requiresProceduresInCredit")}
                            type="checkbox"
                            id="procReq"
                            className="w-4 h-4 rounded accent-green-500"
                        />
                        <label htmlFor="procReq" className="text-sm text-gray-300">Sumar costo de trámites al crédito</label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            {...register("feesIncludesMatricula")}
                            type="checkbox"
                            id="feesInc"
                            className="w-4 h-4 rounded accent-green-500"
                        />
                        <label htmlFor="feesInc" className="text-sm text-gray-300">Incluye Matrícula en Monto Financiado (Flag)</label>
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
