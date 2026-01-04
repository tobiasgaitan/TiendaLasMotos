"use client";

import { useState, useEffect } from "react";
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
    const getDefaults = (t: ConfigType) => {
        if (t === 'city') return { name: "", department: "", registrationCost: { credit: 0 }, documentationFee: 0 };
        if (t === 'soat') return { year: new Date().getFullYear(), vehicleType: "moto", category: "", price: 0 };
        if (t === 'financial') return { name: "", interestRate: 0, minDownPaymentPercentage: 0, requiresProceduresInCredit: true };
        return {};
    };

    const [formData, setFormData] = useState<any>(() => initialData || getDefaults(type));
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setFormData(initialData || getDefaults(type));
        }
    }, [initialData, type, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error("Error saving:", error);
            alert("Error al guardar. Revisa la consola.");
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field: string, value: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleNestedChange = (parent: string, field: string, value: any) => {
        setFormData((prev: any) => ({
            ...prev,
            [parent]: { ...prev[parent], [field]: value }
        }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-6 border-b">
                    <h3 className="text-xl font-bold text-gray-800">
                        {initialData ? 'Editar' : 'Nuevo'} {type === 'city' ? 'Ciudad' : type === 'soat' ? 'Tarifa SOAT' : 'Financiera'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">

                    {/* --- CITY FIELDS --- */}
                    {type === 'city' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Ciudad</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.name || ''}
                                    onChange={(e) => handleChange('name', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Matrícula (Crédito)</label>
                                <input
                                    required
                                    type="number"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.registrationCost?.credit?.toString() ?? ''}
                                    onChange={(e) => handleNestedChange('registrationCost', 'credit', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Gastos de Documentación</label>
                                <input
                                    required
                                    type="number"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.documentationFee?.toString() ?? ''}
                                    onChange={(e) => handleChange('documentationFee', e.target.value)}
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
                                    required
                                    type="text"
                                    placeholder="Ej: Menos de 100 c.c."
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.category || ''}
                                    onChange={(e) => handleChange('category', e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio</label>
                                    <input
                                        required
                                        type="number"
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.price?.toString() ?? ''}
                                        onChange={(e) => handleChange('price', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
                                    <input
                                        required
                                        type="number"
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.year?.toString() ?? ''}
                                        onChange={(e) => handleChange('year', e.target.value)}
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
                                    required
                                    type="text"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.name || ''}
                                    onChange={(e) => handleChange('name', e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tasa de Interés (%)</label>
                                    <input
                                        required
                                        type="number"
                                        step="0.01"
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.interestRate?.toString() ?? ''}
                                        onChange={(e) => handleChange('interestRate', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">% Cuota Inicial Mínima</label>
                                    <input
                                        required
                                        type="number"
                                        step="1"
                                        max="100"
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.minDownPaymentPercentage?.toString() ?? ''}
                                        onChange={(e) => handleChange('minDownPaymentPercentage', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="procReq"
                                    className="w-4 h-4 text-blue-600 rounded"
                                    checked={formData.requiresProceduresInCredit || false}
                                    onChange={(e) => handleChange('requiresProceduresInCredit', e.target.checked)}
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
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center gap-2"
                            disabled={loading}
                        >
                            {loading ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
