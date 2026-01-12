"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Moto } from "@/types";
import { calculateMaxLoan } from "@/lib/utils/reverseCalculator";
import { Loader2, DollarSign, Wallet, AlertCircle } from "lucide-react";

export default function BudgetToBikePage() {
    const [loading, setLoading] = useState(true);
    const [allMotos, setAllMotos] = useState<Moto[]>([]);

    // -- Inputs --
    // Daily budget in COP. Range example: 10,000 - 50,000
    const [dailyBudget, setDailyBudget] = useState<number>(15000);

    // Initial Down Payment
    const [initialPayment, setInitialPayment] = useState<number>(0);

    // -- Calculated State --
    const [calculation, setCalculation] = useState<any>(null);

    // Fetch Inventory
    useEffect(() => {
        const q = query(collection(db, "inventory"), where("active", "==", true));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const motos = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Moto));
            setAllMotos(motos);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Real-time Calculation
    useEffect(() => {
        // Crediorbe Defaults: 48 months standard for max capacity analysis
        const result = calculateMaxLoan(dailyBudget, initialPayment, 48);
        setCalculation(result);
    }, [dailyBudget, initialPayment]);

    // Filter Logic "Smart Gallery"
    const visibleMotos = useMemo(() => {
        if (!calculation || !allMotos.length) return [];

        // Filter: Price <= Max Bike Price
        // Sort: Price Descending (Show best bikes first)
        return allMotos
            .filter(m => m.precio <= calculation.maxBikePrice)
            .sort((a, b) => b.precio - a.precio);
    }, [allMotos, calculation]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                        Buscador por Presupuesto
                    </h1>
                    <p className="text-slate-400">
                        Define cuánto puedes pagar diario y te decimos qué moto puedes llevar.
                    </p>
                </div>

                {/* Calculator Control Panel */}
                <div className="bg-slate-900 rounded-2xl p-6 md:p-8 shadow-xl border border-slate-800 grid md:grid-cols-2 gap-12 items-center">

                    {/* INPUTS COLUMN */}
                    <div className="space-y-8">
                        {/* Daily Budget Slider */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-lg font-medium text-blue-300 flex items-center gap-2">
                                    <DollarSign className="w-5 h-5" />
                                    Pago Diario
                                </label>
                                <span className="text-2xl font-bold text-white">
                                    {formatCurrency(dailyBudget)}
                                </span>
                            </div>
                            <input
                                type="range"
                                min="10000"
                                max="60000"
                                step="1000"
                                value={dailyBudget}
                                onChange={(e) => setDailyBudget(Number(e.target.value))}
                                className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
                            />
                            <div className="flex justify-between text-xs text-slate-500 font-mono">
                                <span>$10k</span>
                                <span>$60k</span>
                            </div>
                            <p className="text-sm text-slate-400 bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                                Un pago diario de <b>{formatCurrency(dailyBudget)}</b> equivale a una
                                cuota mensual aprox. de <b className="text-emerald-400">{formatCurrency(dailyBudget * 30)}</b>
                            </p>
                        </div>

                        {/* Initial Payment Input */}
                        <div className="space-y-3">
                            <label className="text-lg font-medium text-emerald-300 flex items-center gap-2">
                                <Wallet className="w-5 h-5" />
                                Cuota Inicial Disponible
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                <input
                                    type="number"
                                    value={initialPayment === 0 ? '' : initialPayment}
                                    onChange={(e) => setInitialPayment(Number(e.target.value))}
                                    placeholder="0"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 pl-8 py-4 text-xl font-bold focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all placeholder:text-slate-700"
                                />
                            </div>
                        </div>
                    </div>

                    {/* RESULTS COLUMN (The "Magic" Number) */}
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700/50 relative overflow-hidden text-center space-y-2">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500"></div>

                        <h3 className="text-slate-400 uppercase tracking-wider text-sm font-semibold">Tu Capacidad de Compra</h3>

                        <div className="py-2">
                            <span className="text-5xl md:text-6xl font-black text-white tracking-tight drop-shadow-lg">
                                {calculation ? formatCurrency(calculation.maxBikePrice) : "..."}
                            </span>
                        </div>

                        <div className="text-sm text-slate-500 space-y-1">
                            <p>Préstamo Máximo (Banco): {calculation ? formatCurrency(calculation.maxLoanAmount) : "..."}</p>
                            <p>+ Tu Inicial: {formatCurrency(initialPayment)}</p>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-start gap-2 text-xs text-slate-500 text-left">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                            <p>
                                Cálculos basados en las condiciones de <b>Crediorbe</b> (Tasa 1.87% NMV, FNG 20.66%).
                                Valores aproximados para perfilamiento. Trámites de matrícula no incluidos en financiación.
                            </p>
                        </div>
                    </div>

                </div>

                {/* Smart Gallery */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                        Motos a tu alcance
                        <span className="text-sm font-normal bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full border border-blue-500/30">
                            {visibleMotos.length} Disponibles
                        </span>
                    </h2>

                    {loading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {visibleMotos.map((moto) => (
                                <div key={moto.id} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden hover:border-slate-600 transition-all hover:shadow-2xl hover:-translate-y-1 group">
                                    <div className="aspect-[4/3] bg-slate-950 relative overflow-hidden">
                                        <img
                                            src={moto.imagen || "/placeholder-moto.png"}
                                            alt={moto.referencia}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                        <div className="absolute top-2 right-2 bg-slate-900/80 backdrop-blur px-2 py-1 rounded text-xs font-mono border border-slate-700">
                                            {moto.marca}
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <div>
                                            <h3 className="font-bold text-lg leading-tight group-hover:text-blue-400 transition-colors">
                                                {moto.referencia}
                                            </h3>
                                            <p className="text-slate-400 text-sm">{moto.displacement || 150} cc</p>
                                        </div>

                                        <div className="pt-3 border-t border-slate-800 flex justify-between items-end">
                                            <div className="text-xs text-slate-500">Precio de Lista</div>
                                            <div className="text-xl font-bold text-emerald-400">
                                                {formatCurrency(moto.precio)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {visibleMotos.length === 0 && (
                                <div className="col-span-full py-12 text-center bg-slate-900/50 rounded-2xl border border-dashed border-slate-800">
                                    <p className="text-slate-400 text-lg">No encontramos motos para este presupuesto.</p>
                                    <p className="text-slate-500 text-sm mt-2">Intenta subir un poco tu pago diario o aumentar tu cuota inicial.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
