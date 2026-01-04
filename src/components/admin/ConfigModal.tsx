"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { X } from "lucide-react";
import { City, SoatRate, FinancialEntity } from "@/types/financial";

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

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            style={{ zIndex: 99999 }}
        >
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-6 border-b">
                    <h3 className="text-xl font-bold text-gray-800">
                        {initialData ? 'Editar' : 'Nuevo'} {type === 'city' ? 'Ciudad' : type === 'soat' ? 'Tarifa SOAT' : 'Financiera'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">

                    {/* --- CITY FIELDS --- */}
                    {type === 'city' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Ciudad</label>
                                <input
                                    {...register("name", { required: true })}
                                    type="text"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Matrícula (Crédito)</label>
                                <input
                                    {...register("registrationCost.credit", { required: true, valueAsNumber: true })}
                                    type="number"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Gastos de Documentación</label>
                                <input
                                    {...register("documentationFee", { required: true, valueAsNumber: true })}
                                    type="number"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black bg-white"
                                />
                            </div>
                        </>
                    )}

                    {/* --- SOAT FIELDS --- */}
                    {type === 'soat' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría (Cilindraje)</label>
                                <input
                                    {...register("category", { required: true })}
                                    type="text"
                                    placeholder="Ej: Menos de 100 c.c."
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black bg-white"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio</label>
                                    <input
                                        {...register("price", { required: true, valueAsNumber: true })}
                                        type="number"
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
                                    <input
                                        {...register("year", { required: true, valueAsNumber: true })}
                                        type="number"
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black bg-white"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* --- FINANCIAL FIELDS --- */}
                    {type === 'financial' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Entidad</label>
                                <input
                                    {...register("name", { required: true })}
                                    type="text"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black bg-white"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tasa de Interés (%)</label>
                                    <input
                                        {...register("interestRate", { required: true, valueAsNumber: true })}
                                        type="number"
                                        step="0.01"
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">% Cuota Inicial Mínima</label>
                                    <input
                                        {...register("minDownPaymentPercentage", { required: true, valueAsNumber: true })}
                                        type="number"
                                        step="1"
                                        max="100"
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black bg-white"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                                <input
                                    {...register("requiresProceduresInCredit")}
                                    type="checkbox"
                                    id="procReq"
                                    className="w-4 h-4 text-blue-600 rounded"
                                />
                                <label htmlFor="procReq" className="text-sm text-gray-700">Incluye Trámites en Crédito</label>
                            </div>
                        </>
                    )}
                    <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg transition-colors"
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center gap-2"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
