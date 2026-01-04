"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import ModalWrapper from "./ModalWrapper";

type ConfigType = 'city' | 'soat' | 'financial';

interface ConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any) => Promise<void>;
    initialData?: any;
    type: ConfigType;
}

export default function ConfigModal({ isOpen, onClose, onSave, initialData, type }: ConfigModalProps) {
    const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

    useEffect(() => {
        if (isOpen) {
            const defaults = initialData || getDefaults(type);
            reset(defaults);
        }
    }, [initialData, type, isOpen, reset]);

    const onSubmit = async (data: any) => {
        try {
            await onSave(data);
            onClose();
        } catch (error) {
            console.error("Error saving:", error);
            alert("Error al guardar. Revisa la consola.");
        }
    };

    const getDefaults = (t: ConfigType) => {
        if (t === 'city') return { name: "", department: "", registrationCost: { credit: 0 }, documentationFee: 0 };
        if (t === 'soat') return { year: new Date().getFullYear(), vehicleType: "moto", category: "", price: 0 };
        if (t === 'financial') return { name: "", interestRate: 0, minDownPaymentPercentage: 0, requiresProceduresInCredit: true };
        return {};
    };

    const modalTitle = `${initialData ? 'Editar' : 'Nuevo'} ${type === 'city' ? 'Ciudad' : type === 'soat' ? 'Tarifa SOAT' : 'Financiera'}`;

    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose} title={modalTitle}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

                {/* --- CITY FIELDS --- */}
                {type === 'city' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Nombre Ciudad</label>
                            <input
                                {...register("name", { required: true })}
                                type="text"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Matrícula (Crédito)</label>
                            <input
                                {...register("registrationCost.credit", { required: true, valueAsNumber: true })}
                                type="number"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Gastos de Documentación</label>
                            <input
                                {...register("documentationFee", { required: true, valueAsNumber: true })}
                                type="number"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </>
                )}

                {/* --- SOAT FIELDS --- */}
                {type === 'soat' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Categoría (Cilindraje)</label>
                            <input
                                {...register("category", { required: true })}
                                type="text"
                                placeholder="Ej: Menos de 100 c.c."
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Precio</label>
                                <input
                                    {...register("price", { required: true, valueAsNumber: true })}
                                    type="number"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Año</label>
                                <input
                                    {...register("year", { required: true, valueAsNumber: true })}
                                    type="number"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>
                    </>
                )}

                {/* --- FINANCIAL FIELDS --- */}
                {type === 'financial' && (
                    <>
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
                                <label className="block text-sm font-medium text-gray-300 mb-1">Tasa de Interés (%)</label>
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
                        <div className="flex items-center gap-2 pt-2">
                            <input
                                {...register("requiresProceduresInCredit")}
                                type="checkbox"
                                id="procReq"
                                className="w-4 h-4 rounded accent-green-500"
                            />
                            <label htmlFor="procReq" className="text-sm text-gray-300">Incluye Trámites en Crédito</label>
                        </div>
                    </>
                )}
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
