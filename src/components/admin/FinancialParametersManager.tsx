'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FinancialMatrix, MatrixRow } from '@/types/financial';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Default Initial Data based on User Request
 */
const INITIAL_ROWS: MatrixRow[] = [
    {
        id: '0-99',
        label: '0 - 99 cc',
        minCC: 0,
        maxCC: 99,
        soatPrice: 489400,
        registrationCreditGeneral: 660000,
        registrationCreditSantaMarta: 760000,
        registrationCashEnvigado: 530000,
        registrationCashCienaga: 595000,
        registrationCashZonaBananera: 600000,
        registrationCashSantaMarta: 730000
    },
    {
        id: '100-124',
        label: '100 - 124 cc',
        minCC: 100,
        maxCC: 124,
        soatPrice: 678400,
        registrationCreditGeneral: 740000,
        registrationCreditSantaMarta: 840000,
        registrationCashEnvigado: 605000,
        registrationCashCienaga: 680000,
        registrationCashZonaBananera: 680000,
        registrationCashSantaMarta: 820000
    },
    {
        id: '125-200',
        label: '125 - 200 cc',
        minCC: 125,
        maxCC: 200,
        soatPrice: 678400,
        registrationCreditGeneral: 820000,
        registrationCreditSantaMarta: 920000,
        registrationCashEnvigado: 605000,
        registrationCashCienaga: 680000,
        registrationCashZonaBananera: 680000,
        registrationCashSantaMarta: 820000
    },
    {
        id: 'gt-200',
        label: 'Mayor a 200 cc',
        minCC: 201,
        maxCC: 99999,
        soatPrice: 822500,
        registrationCreditGeneral: 1020000,
        registrationCreditSantaMarta: 1120000,
        registrationCashEnvigado: 1040000,
        registrationCashCienaga: 1110000,
        registrationCashZonaBananera: 1100000,
        registrationCashSantaMarta: 1260000
    },
    {
        id: 'electrical',
        label: 'Eléctricas',
        category: 'ELECTRICA',
        soatPrice: 0,
        registrationCreditGeneral: 440000,
        registrationCreditSantaMarta: 540000,
        registrationCashEnvigado: 400000,
        registrationCashCienaga: 470000,
        registrationCashZonaBananera: 470000,
        registrationCashSantaMarta: 605000
    },
    {
        id: 'motocarro',
        label: 'Motocarros',
        category: 'MOTOCARRO Y/O MOTOCARGUERO',
        minCC: 0,
        maxCC: 99999, // Can have displacement but overrides CC cost logic?
        // Actually, for Motocarro, we want to match this row.
        // It has specific registration costs.
        // But for Motocarro > 125cc, we ADD tax.
        soatPrice: 0,
        registrationCreditGeneral: 850000,
        registrationCreditSantaMarta: 950000,
        registrationCashEnvigado: 650000,
        registrationCashCienaga: 720000,
        registrationCashZonaBananera: 720000,
        registrationCashSantaMarta: 870000
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
            const docRef = doc(db, 'config', 'financial_parameters');
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data() as FinancialMatrix;
                if (data.rows && data.rows.length > 0) {
                    setMatrix(data.rows);
                }
            }
        } catch (error) {
            console.error("Error loading financial matrix:", error);
            toast.error("Error cargando parámetros");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const docRef = doc(db, 'config', 'financial_parameters');
            await setDoc(docRef, {
                rows: matrix,
                lastUpdated: new Date().toISOString()
            });
            toast.success("Parámetros actualizados correctamente");
        } catch (error) {
            console.error("Error saving:", error);
            toast.error("Error guardando cambios");
        } finally {
            setSaving(false);
        }
    };

    const updateCell = (index: number, field: keyof MatrixRow, value: number) => {
        const newMatrix = [...matrix];
        // @ts-ignore - Dynamic key assignment
        newMatrix[index][field] = value;
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
                    {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
                    Guardar Cambios
                </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-700 bg-gray-900/50">
                <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs uppercase bg-gray-800 text-gray-400">
                        <tr>
                            <th className="px-4 py-4 rounded-tl-xl sticky left-0 bg-gray-800 z-10">Categoría / Cilindrada</th>
                            <th className="px-4 py-4 text-center border-l border-gray-700">Valor SOAT</th>
                            <th className="px-4 py-4 text-center border-l border-gray-700 bg-blue-900/20 text-blue-200">Crédito (General)</th>
                            <th className="px-4 py-4 text-center border-l border-gray-700 bg-blue-900/20 text-blue-200">Crédito (Sta Marta)</th>
                            <th className="px-4 py-4 text-center border-l border-gray-700">Contado (Envigado)</th>
                            <th className="px-4 py-4 text-center border-l border-gray-700">Contado (Ciénaga)</th>
                            <th className="px-4 py-4 text-center border-l border-gray-700">Contado (Z. Bananera)</th>
                            <th className="px-4 py-4 text-center border-l border-gray-700">Contado (Sta Marta)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.map((row, idx) => (
                            <tr key={row.id} className="border-t border-gray-800 hover:bg-gray-800/30 transition-colors">
                                <td className="px-4 py-3 font-medium text-white sticky left-0 bg-gray-900 z-10 border-r border-gray-700">
                                    {row.label}
                                </td>

                                {/* SOAT */}
                                <td className="p-2 border-r border-gray-700">
                                    <input
                                        type="number"
                                        className="w-full bg-transparent text-center focus:bg-gray-800 rounded outline-none py-1 border border-transparent focus:border-blue-500/50"
                                        value={row.soatPrice}
                                        onChange={(e) => updateCell(idx, 'soatPrice', Number(e.target.value))}
                                    />
                                </td>

                                {/* CREDIT GENERAL */}
                                <td className="p-2 border-r border-gray-700 bg-blue-900/5">
                                    <input
                                        type="number"
                                        className="w-full bg-transparent text-center focus:bg-gray-800 rounded outline-none py-1 border border-transparent focus:border-blue-500/50 font-medium text-blue-100"
                                        value={row.registrationCreditGeneral}
                                        onChange={(e) => updateCell(idx, 'registrationCreditGeneral', Number(e.target.value))}
                                    />
                                </td>

                                {/* CREDIT SANTA MARTA */}
                                <td className="p-2 border-r border-gray-700 bg-blue-900/5">
                                    <input
                                        type="number"
                                        className="w-full bg-transparent text-center focus:bg-gray-800 rounded outline-none py-1 border border-transparent focus:border-blue-500/50 font-medium text-blue-100"
                                        value={row.registrationCreditSantaMarta}
                                        onChange={(e) => updateCell(idx, 'registrationCreditSantaMarta', Number(e.target.value))}
                                    />
                                </td>

                                {/* CASH ENVIGADO */}
                                <td className="p-2 border-r border-gray-700">
                                    <input
                                        type="number"
                                        className="w-full bg-transparent text-center focus:bg-gray-800 rounded outline-none py-1 border border-transparent focus:border-blue-500/50"
                                        value={row.registrationCashEnvigado}
                                        onChange={(e) => updateCell(idx, 'registrationCashEnvigado', Number(e.target.value))}
                                    />
                                </td>

                                {/* CASH CIENAGA */}
                                <td className="p-2 border-r border-gray-700">
                                    <input
                                        type="number"
                                        className="w-full bg-transparent text-center focus:bg-gray-800 rounded outline-none py-1 border border-transparent focus:border-blue-500/50"
                                        value={row.registrationCashCienaga}
                                        onChange={(e) => updateCell(idx, 'registrationCashCienaga', Number(e.target.value))}
                                    />
                                </td>

                                {/* CASH ZONA BANANERA */}
                                <td className="p-2 border-r border-gray-700">
                                    <input
                                        type="number"
                                        className="w-full bg-transparent text-center focus:bg-gray-800 rounded outline-none py-1 border border-transparent focus:border-blue-500/50"
                                        value={row.registrationCashZonaBananera}
                                        onChange={(e) => updateCell(idx, 'registrationCashZonaBananera', Number(e.target.value))}
                                    />
                                </td>

                                {/* CASH SANTA MARTA */}
                                <td className="p-2">
                                    <input
                                        type="number"
                                        className="w-full bg-transparent text-center focus:bg-gray-800 rounded outline-none py-1 border border-transparent focus:border-blue-500/50"
                                        value={row.registrationCashSantaMarta}
                                        onChange={(e) => updateCell(idx, 'registrationCashSantaMarta', Number(e.target.value))}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="p-4 bg-yellow-900/20 border border-yellow-800/50 rounded-lg text-sm text-yellow-200/80">
                <h4 className="font-bold mb-2 flex items-center gap-2">ℹ️ Notas Importantes</h4>
                <ul className="list-disc pl-5 space-y-1">
                    <li>La <strong>Categoría</strong> tiene prioridad sobre el cilindraje (ej: Eléctricas siempre usan la fila de eléctricas).</li>
                    <li>Para <strong>Motocarros &gt; 125cc</strong>, el sistema calculará automáticamente el Impuesto de Timbre además del valor base.</li>
                    <li>Los valores de Crédito aplican automáticamente cuando se selecciona un método de financiación.</li>
                </ul>
            </div>
        </div>
    );
}
