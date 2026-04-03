"use client";

import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MatrixRow, FinancialMatrix } from '@/types/financial';
import { Loader2, Save, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { saveFinancialParams } from '@/app/actions';

const INITIAL_ROWS: MatrixRow[] = [
    {
        id: '0-99',
        label: '0 - 99 cc',
        minCC: 0,
        maxCC: 99,
        registrationCredit: 700000,
        registrationCash: 530000,
    },
    {
        id: '100-124',
        label: '100 - 124 cc',
        minCC: 100,
        maxCC: 124,
        registrationCredit: 780000,
        registrationCash: 605000,
    },
    {
        id: '125-200',
        label: '125 - 200 cc',
        minCC: 125,
        maxCC: 200,
        registrationCredit: 860000,
        registrationCash: 605000,
    },
    {
        id: '200-plus',
        label: 'Mayor a 200 cc',
        minCC: 200,
        maxCC: 3000,
        registrationCredit: 1340000,
        registrationCash: 1040000,
    },
    {
        id: 'electric',
        label: 'Eléctricas',
        category: 'ELÉCTRICA',
        registrationCredit: 440000,
        registrationCash: 400000,
    },
    {
        id: 'motocarro',
        label: 'Motocarros',
        category: 'MOTOCARRO',
        registrationCredit: 1050000,
        registrationCash: 650000,
    }
];

export default function FinancialParametersManager() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [matrix, setMatrix] = useState<MatrixRow[]>(INITIAL_ROWS);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const docRef = doc(db, 'financial_config/general/global_params/global_params');
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data() as FinancialMatrix;
                if (data.rows && data.rows.length > 0) {
                    // Hidratación Defensiva: Aseguramos campos numéricos válidos
                    const sanitizedRows = data.rows.map((row: any) => ({
                        ...row,
                        registrationCredit: Number(row.registrationCredit || 0),
                        registrationCash: Number(row.registrationCash || 0),
                    }));
                    setMatrix(sanitizedRows);
                }
            }
        } catch (error) {
            console.error("Error loading financial matrix:", error);
            toast.error("Error cargando parámetros del servidor");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Aseguramos que estamos enviando el estado actual de la matriz
            const result = await saveFinancialParams({ rows: matrix });
            
            if (result.success) {
                toast.success("Cambios guardados exitosamente");
                // Recargamos para confirmar persistencia real
                await loadData();
            } else {
                toast.error(result.message || "Estructura de matriz rechazada por el servidor");
            }
        } catch (error: any) {
            console.error("Error saving:", error);
            toast.error(error.message || "Error crítico al intentar guardar cambios");
        } finally {
            setSaving(false);
        }
    };

    const updateCell = (index: number, field: keyof MatrixRow, value: number) => {
        // PARCHE DE INMUTABILIDAD REAL - AUDITORIA ESTRICTA
        const newMatrix = [...matrix];
        newMatrix[index] = { ...newMatrix[index], [field]: value };
        setMatrix(newMatrix);
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-500 w-8 h-8" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-white">Gestor de Matrículas y SOAT</h2>
                    <p className="text-gray-400 text-sm">Configura los valores base para cálculos de crédito y contado.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar Cambios
                </button>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-gray-800/50 text-gray-400">
                        <tr>
                            <th className="px-4 py-4 rounded-tl-xl">Categoría / Cilindrada</th>
                            <th className="px-4 py-4 text-center border-l border-gray-700 bg-blue-900/20 text-blue-200">CRÉDITO</th>
                            <th className="px-4 py-4 text-center border-l border-gray-700 bg-emerald-900/10 text-emerald-100">CONTADO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.map((row, idx) => (
                            <tr key={row.id} className="border-t border-gray-800 hover:bg-gray-800/30 transition-colors">
                                <td className="px-4 py-3 font-medium text-white sticky left-0 bg-gray-900 z-10 border-r border-gray-700">
                                    {row.label}
                                </td>

                                {/* REGISTRATION CREDIT */}
                                <td className="p-2 border-r border-gray-700 bg-blue-900/5">
                                    <input
                                        type="number"
                                        className="w-full bg-transparent text-center focus:bg-gray-800 rounded outline-none py-1 border border-transparent focus:border-blue-500/50 font-medium text-blue-100"
                                        value={row.registrationCredit}
                                        onChange={(e) => updateCell(idx, 'registrationCredit', Number(e.target.value))}
                                    />
                                </td>

                                {/* REGISTRATION CASH */}
                                <td className="p-2 border-r border-gray-700 bg-emerald-900/5">
                                    <input
                                        type="number"
                                        className="w-full bg-transparent text-center focus:bg-gray-800 rounded outline-none py-1 border border-transparent focus:border-emerald-500/50 font-medium text-emerald-100"
                                        value={row.registrationCash}
                                        onChange={(e) => updateCell(idx, 'registrationCash', Number(e.target.value))}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-amber-900/10 border border-amber-900/30 rounded-xl p-4">
                <div className="flex gap-3">
                    <Info className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-amber-200">Notas Importantes</p>
                        <ul className="text-xs text-amber-200/70 space-y-1 list-disc pl-4">
                            <li>La <strong>Categoría</strong> tiene prioridad sobre el cilindraje (ej: Eléctricas siempre usan la fila de eléctricas).</li>
                            <li>Para todos los vehículos &gt; 125cc en modalidad Contado, el sistema calcula y suma automáticamente el Impuesto de Timbre (1.5% del valor de la moto por mes calendario faltante del año, más $40.000) al precio final.</li>
                            <li>Los valores de Crédito aplican automáticamente cuando se selecciona un método de financiación.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
