'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Moto } from '@/types';
import { City, SoatRate, FinancialEntity, FinancialMatrix } from '@/types/financial';
import { calculateQuote, QuoteResult } from '@/lib/utils/calculator';
import { Loader2 } from 'lucide-react';
import { getCatalogoMotos } from '@/lib/firestore';

/**
 * Simulador de Crédito - Interfaz Administrativa
 * Permite validar el comportamiento de las financieras, cascadas de Brilla y tasas del SFC.
 * 
 * Requisitos:
 * - Selección de Ciudad (Matriz Regional).
 * - Selección de Moto (Inventario).
 * - Modificación manual de Precios.
 * - Desglose Matemático paso a paso.
 */
export default function SimulatorPage() {
    const [loading, setLoading] = useState(true);

    // --- CITY DEFINITIONS (Derived from Financial Matrix Logic) ---
    // [FIX] User requested strict filter: Only 'Crédito (Sta Marta)' and 'Crédito (General)' for Simulator.
    const OFFICIAL_CITIES: City[] = [
        { id: 'santa-marta', name: 'Santa Marta (Crédito)', department: 'Magdalena', documentationFee: 0 },
        { id: 'general', name: 'Otras Ciudades / General (Crédito)', department: 'Nacional', documentationFee: 0 },
    ];

    // --- DATA FETCHED FROM FIRESTORE ---
    const [cities, setCities] = useState<City[]>(OFFICIAL_CITIES);
    const [soatRates, setSoatRates] = useState<SoatRate[]>([]);
    const [financialEntities, setFinancialEntities] = useState<FinancialEntity[]>([]);
    const [motos, setMotos] = useState<Moto[]>([]);
    const [matrix, setMatrix] = useState<FinancialMatrix | undefined>(undefined);

    // --- USER INPUTS ---
    const [selectedCityId, setSelectedCityId] = useState<string>(OFFICIAL_CITIES[0].id);
    const [selectedEntityId, setSelectedEntityId] = useState<string>('');
    const [selectedMotoId, setSelectedMotoId] = useState<string>('');

    // Manual Overrides
    const [price, setPrice] = useState<number>(0);
    const [downPayment, setDownPayment] = useState<number>(0);
    const [months, setMonths] = useState<number>(48);

    // --- COMPUTED STATE ---
    const [quote, setQuote] = useState<QuoteResult | null>(null);

    // Initial Data Fetch
    useEffect(() => {
        const loadData = async () => {
            try {
                // REMOVED: Legacy cities collection fetch
                const [soatSnap, finSnap, matrixSnap] = await Promise.all([
                    getDocs(collection(db, 'financial_config/general/tarifas_soat')),
                    getDocs(collection(db, 'financial_config/general/financieras')),
                    getDocs(collection(db, 'config'))
                ]);

                // Basic Mapping
                const sList = soatSnap.docs.map(d => ({ id: d.id, ...d.data() } as SoatRate));
                const fList = finSnap.docs.map(d => ({ id: d.id, ...d.data() } as FinancialEntity));

                // Matrix Fetch Logic
                const matrixDoc = matrixSnap.docs.find(d => d.id === 'financial_parameters');
                const mData = matrixDoc ? (matrixDoc.data() as FinancialMatrix) : undefined;

                // Motos Fetch
                const mList = await getCatalogoMotos();

                setCities(OFFICIAL_CITIES); // Use constant
                setSoatRates(sList);
                setFinancialEntities(fList);
                setMotos(mList);
                setMatrix(mData);

                // Defaults
                if (fList.length > 0) setSelectedEntityId(fList[0].id);
                if (mList.length > 0) {
                    setSelectedMotoId(mList[0].id);
                    setPrice(mList[0].precio);
                    setDownPayment(Math.floor(mList[0].precio * 0.15)); // Default 15%
                }

                setLoading(false);
            } catch (error) {
                console.error("Error loading simulator data", error);
                setLoading(false);
            }
        };
        loadData();
    }, []);

    // Update Price when Moto Changes
    useEffect(() => {
        const m = motos.find(mt => mt.id === selectedMotoId);
        if (m) {
            setPrice(m.precio);
            // Optional: Reset Down Payment percentage? Keeping it manual is better for testing unless changed.
            setDownPayment(Math.floor(m.precio * 0.15));
        }
    }, [selectedMotoId, motos]);

    // --- CALCULATION ENGINE ---
    useEffect(() => {
        const moto = motos.find(m => m.id === selectedMotoId);
        const city = cities.find(c => c.id === selectedCityId);
        const entity = financialEntities.find(e => e.id === selectedEntityId);

        if (!moto || !city || !entity) return;

        // Create a temporary "Moto" object with the MANUALLY overridden price
        // but keeping the original displacement/category from the selected inventory item
        // to ensure Matrix lookups work correctly.
        const simulationMoto: Moto = {
            ...moto,
            precio: price
        };

        const res = calculateQuote(
            simulationMoto,
            city,
            soatRates,
            'credit',
            entity,
            months,
            downPayment,
            matrix
        );

        setQuote(res);

    }, [selectedMotoId, selectedCityId, selectedEntityId, price, downPayment, months, motos, cities, financialEntities, soatRates, matrix]);


    // --- HELPERS ---
    const formatCurrency = (val: number) => `$${Math.round(val).toLocaleString('es-CO')}`;

    if (loading) return (
        <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
            <Loader2 className="animate-spin mr-2" /> Cargando Simulador...
        </div>
    );

    return (
        <div className="p-6 bg-gray-900 min-h-screen text-white space-y-6">
            <header className="flex items-center justify-between border-b border-gray-800 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        Simulador de Crédito
                        <span className="text-xs bg-brand-yellow text-black px-2 py-0.5 rounded font-black tracking-wide">BETA</span>
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">Validador de lógica financiera y cascadas de cobro (Brilla / SFC).</p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* --- LEFT COLUMN: INPUTS --- */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-sm">
                        <h3 className="text-lg font-bold text-brand-blue mb-4 uppercase text-sm tracking-wider">Configuración</h3>

                        {/* 1. MOTO SELECTOR */}
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Motocicleta Base</label>
                            <select
                                className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg p-2.5 focus:ring-brand-blue focus:border-brand-blue"
                                value={selectedMotoId}
                                onChange={(e) => setSelectedMotoId(e.target.value)}
                            >
                                {motos.map(m => (
                                    <option key={m.id} value={m.id}>{m.referencia}</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-gray-500 mt-1">Define cilindraje y categoría para SOAT/Matrícula.</p>
                        </div>

                        {/* 2. CITY SELECTOR */}
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ciudad de Matrícula</label>
                            <select
                                className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg p-2.5 focus:ring-brand-blue focus:border-brand-blue"
                                value={selectedCityId}
                                onChange={(e) => setSelectedCityId(e.target.value)}
                            >
                                {cities.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* 3. ENTITY SELECTOR */}
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Entidad Financiera</label>
                            <select
                                className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg p-2.5 focus:ring-brand-blue focus:border-brand-blue"
                                value={selectedEntityId}
                                onChange={(e) => setSelectedEntityId(e.target.value)}
                            >
                                {financialEntities.map(e => (
                                    <option key={e.id} value={e.id}>{e.name} ({e.interestRate}%)</option>
                                ))}
                            </select>
                        </div>

                        <hr className="border-gray-700 my-6" />

                        {/* 4. PRICE INPUT */}
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-brand-yellow uppercase mb-1">Precio Vehículo (Editable)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                                <input
                                    type="number"
                                    className="w-full bg-gray-900 border border-gray-500 text-white text-sm rounded-lg pl-7 p-2.5 font-bold focus:ring-brand-yellow focus:border-brand-yellow"
                                    value={price}
                                    onChange={(e) => setPrice(Number(e.target.value))}
                                />
                            </div>
                        </div>

                        {/* 5. DOWN PAYMENT */}
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Cuota Inicial</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                                <input
                                    type="number"
                                    className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg pl-7 p-2.5 focus:ring-brand-blue focus:border-brand-blue"
                                    value={downPayment}
                                    onChange={(e) => setDownPayment(Number(e.target.value))}
                                />
                            </div>
                        </div>

                        {/* 6. TERM */}
                        <div className="mb-2">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Plazo (Meses)</label>
                            <div className="grid grid-cols-4 gap-2">
                                {[12, 24, 36, 48, 60, 72].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setMonths(m)}
                                        className={`text-sm py-2 rounded-lg font-bold border ${months === m ? 'bg-brand-blue border-brand-blue text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>

                {/* --- RIGHT COLUMN: RESULTS --- */}
                <div className="lg:col-span-8 space-y-6">
                    {quote && (
                        <>
                            {/* BLOCK A: WATERFALL & CAPITAL */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* CARD 1: BASE DATA */}
                                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                                    <h4 className="text-gray-400 text-xs font-bold uppercase mb-4">Estructura de Costos</h4>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-300">Precio Moto</span>
                                            <span className="text-white font-mono">{formatCurrency(quote.vehiclePrice)}</span>
                                        </div>
                                        <div className="flex justify-between text-red-400">
                                            <span>(-) Cuota Inicial</span>
                                            <span className="font-mono">{formatCurrency(quote.downPayment)}</span>
                                        </div>
                                        <div className="flex justify-between text-blue-300">
                                            <span>(+) Trámites y Matrícula</span>
                                            <span className="font-mono">{formatCurrency(quote.registrationPrice)}</span>
                                        </div>
                                        {/* Traceability Label (User Requested) */}
                                        <div className="flex justify-end -mt-2 mb-1">
                                            <span className="text-[10px] text-gray-500 font-mono bg-gray-900/50 px-1 rounded border border-gray-700">
                                                Fila: {quote.matchIdentifier || 'N/A'} (CC: {motos.find(m => m.id === selectedMotoId)?.displacement})
                                            </span>
                                        </div>
                                        {quote.isCredit && quote.fngCost > 0 && (
                                            <div className="flex justify-between text-yellow-300">
                                                <span>(+) FNG / Garantías</span>
                                                <span className="font-mono">{formatCurrency(quote.fngCost)}</span>
                                            </div>
                                        )}
                                        <div className="border-t border-gray-700 pt-2 flex justify-between font-bold text-white text-base">
                                            <span>Capital Base ($P_1$)</span>
                                            <span>{formatCurrency(quote.loanAmount - (quote.vGestion || 0) - (quote.vCobertura || 0))}</span>
                                            {/* Note warning: quote.loanAmount IS P_final. We must reverse logic to show strict P1 if calculator doesn't return it explicit. 
                                                Actually, let's recalculate basic P1 for display or infer it.
                                                From calculator.ts: pFinal = p1_base + vGestion + vCobertura. 
                                                So p1_base = loanAmount - vGestion - vCobertura. 
                                            */}
                                        </div>
                                    </div>
                                </div>

                                {/* CARD 2: FINANCIAL WATERFALL */}
                                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 bg-gray-700 px-3 py-1 rounded-bl-xl text-xs font-bold text-gray-300 border-b border-l border-gray-600">
                                        Motor de Cálculo Oficial
                                    </div>
                                    <h4 className="text-brand-yellow text-xs font-bold uppercase mb-4">Desglose Financiero (Cascada)</h4>

                                    <div className="space-y-4 relative">
                                        {/* Line connecting dots */}
                                        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-700"></div>

                                        {/* STEP 1: P1 */}
                                        <div className="relative pl-6">
                                            <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-blue-600 border-2 border-gray-800 z-10"></div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-300">Capital Base ($P_1$)</span>
                                                <span className="text-white font-mono font-bold">
                                                    {formatCurrency(quote.loanAmount - (quote.vGestion || 0) - (quote.vCobertura || 0))}
                                                </span>
                                            </div>
                                        </div>

                                        {/* STEP 2: V_GESTION */}
                                        <div className="relative pl-6">
                                            <div className="absolute left-1 top-2 w-2 h-2 rounded-full bg-gray-600 z-10"></div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-400"> (+) Gestión Administrativa</span>
                                                <span className="text-yellow-400 font-mono">{formatCurrency(quote.vGestion || 0)}</span>
                                            </div>
                                            <p className="text-[10px] text-gray-500">
                                                {(quote.vGestion && quote.vGestion > 0) ? `Aplicado sobre $P_1$` : 'No aplica'}
                                            </p>
                                        </div>

                                        {/* STEP 3: P2 */}
                                        <div className="relative pl-6">
                                            <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-gray-700 border-2 border-gray-800 z-10"></div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-300">Capital Intermedio ($P_2$)</span>
                                                <span className="text-gray-300 font-mono">
                                                    {formatCurrency(quote.loanAmount - (quote.vCobertura || 0))}
                                                </span>
                                            </div>
                                        </div>

                                        {/* STEP 4: V_COBERTURA */}
                                        <div className="relative pl-6">
                                            <div className="absolute left-1 top-2 w-2 h-2 rounded-full bg-gray-600 z-10"></div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-400"> (+) Cobertura / Aval</span>
                                                <span className="text-yellow-400 font-mono">{formatCurrency(quote.vCobertura || 0)}</span>
                                            </div>
                                            <p className="text-[10px] text-gray-500">
                                                {(quote.vCobertura && quote.vCobertura > 0) ? `Aplicado sobre $P_2$` : 'No aplica'}
                                            </p>
                                        </div>

                                        {/* STEP 5: P_FINAL */}
                                        <div className="relative pl-6 pt-2">
                                            <div className="absolute left-0 top-3 w-4 h-4 rounded-full bg-green-500 border-2 border-gray-800 z-10 animate-pulse"></div>
                                            <div className="flex justify-between text-base font-bold bg-gray-900/50 p-2 rounded -ml-2 -mr-2 border border-gray-700/50">
                                                <span className="text-green-400">Capital Final ($P_{'{final}'}$)</span>
                                                <span className="text-white font-mono">{formatCurrency(quote.loanAmount)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* BLOCK B: PROJECTION */}
                            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                                <div className="bg-gray-700/50 px-6 py-3 border-b border-gray-700 flex justify-between items-center">
                                    <h4 className="text-white text-sm font-bold uppercase">Proyección de Pagos</h4>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded border border-gray-600">
                                            Tasa: <span className="text-white font-bold">{quote.interestRate}% NMV</span>
                                        </span>
                                        {/* Badge for SFC vs Manual could be logic-based, but currently config is simple. 
                                            Assuming if interestRate is default, it's Manual/Config. If updated by Bot, we might check a flag.
                                            For now, just showing the rate is enough. 
                                        */}
                                    </div>
                                </div>
                                <div className="p-6">
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="text-gray-500 border-b border-gray-700">
                                                <th className="pb-3 font-medium">Concepto</th>
                                                <th className="pb-3 font-medium text-right text-white">Año 1 (Mes 1-12)</th>
                                                <th className="pb-3 font-medium text-right text-gray-400">Año 2+ (Mes 13+)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700/50">
                                            <tr className="group hover:bg-gray-700/30 transition-colors">
                                                <td className="py-3 text-gray-300">Amortización + Interés</td>
                                                <td className="py-3 text-right font-mono">
                                                    {formatCurrency((quote.monthlyPayment || 0) - quote.lifeInsuranceValue - quote.unemploymentInsuranceCost - (quote.coverageMonthlyComponent || 0))}
                                                </td>
                                                <td className="py-3 text-right font-mono text-gray-400">
                                                    {formatCurrency((quote.monthlyPayment || 0) - quote.lifeInsuranceValue - quote.unemploymentInsuranceCost - (quote.coverageMonthlyComponent || 0))}
                                                </td>
                                            </tr>
                                            <tr className="group hover:bg-gray-700/30 transition-colors">
                                                <td className="py-3 text-gray-300">Seguros (Vida + Desempleo)</td>
                                                <td className="py-3 text-right font-mono text-red-300">
                                                    {formatCurrency(quote.lifeInsuranceValue + quote.unemploymentInsuranceCost)}
                                                </td>
                                                <td className="py-3 text-right font-mono text-red-300/70">
                                                    {formatCurrency(quote.lifeInsuranceValue + quote.unemploymentInsuranceCost)}
                                                </td>
                                            </tr>
                                            <tr className="group hover:bg-gray-700/30 transition-colors bg-blue-900/10">
                                                <td className="py-3 text-blue-300 font-medium">
                                                    Cuota Cobertura (Diferido 12m)
                                                </td>
                                                <td className="py-3 text-right font-mono text-blue-400 font-bold">
                                                    {formatCurrency(quote.coverageMonthlyComponent || 0)}
                                                </td>
                                                <td className="py-3 text-right font-mono text-gray-600">
                                                    $0
                                                </td>
                                            </tr>
                                            <tr className="bg-gray-900/50 border-t border-gray-600">
                                                <td className="py-4 text-white font-bold text-lg">CUOTA MENSUAL TOTAL</td>
                                                <td className="py-4 text-right font-mono text-xl font-bold text-brand-yellow">
                                                    {formatCurrency(quote.monthlyPayment || 0)}
                                                </td>
                                                <td className="py-4 text-right font-mono text-lg font-bold text-gray-300">
                                                    {formatCurrency((quote.monthlyPayment || 0) - (quote.coverageMonthlyComponent || 0))}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {!quote && !loading && (
                        <div className="flex flex-col items-center justify-center p-10 bg-gray-800 rounded-xl border border-gray-700 border-dashed text-gray-500">
                            <span className="text-4xl mb-2">🤔</span>
                            <p>Selecciona una moto y entidad para iniciar la simulación.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
