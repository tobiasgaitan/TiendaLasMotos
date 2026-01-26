"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Moto } from "@/types";
import { FinancialEntity } from "@/types/financial";
import { calculateMaxLoan } from "@/lib/utils/reverseCalculator";
import { Loader2, DollarSign, Wallet, TrendingUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

/**
 * Public Budget Finder Page
 * 
 * Allows customers to input their daily budget and see which motorcycles they can afford.
 * Uses the same calculation logic as the admin "Buscador Inteligente" but with public design.
 * 
 * @returns {JSX.Element} The budget finder page
 */
export default function BuscadorPublicoPage() {
    const [loading, setLoading] = useState(true);
    const [allMotos, setAllMotos] = useState<Moto[]>([]);

    // Financial Data
    const [entities, setEntities] = useState<any[]>([]);
    const [selectedEntityId, setSelectedEntityId] = useState<string>("");
    const [selectedEntity, setSelectedEntity] = useState<any>(null);
    const [matrixRows, setMatrixRows] = useState<any[]>([]);

    // User Inputs
    const [dailyBudget, setDailyBudget] = useState<number>(15000);
    const [initialPayment] = useState<number>(0);

    // Calculated State
    const [calculation, setCalculation] = useState<any>(null);

    // 1. Initial Data Fetch
    useEffect(() => {
        const loadData = async () => {
            try {
                // A. Inventory
                const q = query(collection(db, "pagina", "catalogo", "items"));
                const unsubscribe = onSnapshot(q, (snapshot) => {
                    const motos: Moto[] = snapshot.docs.map(doc => {
                        const data = doc.data();

                        // Image Handling (Standardized)
                        const finalImage = data["imagen_url"] || data["imagenUrl"] || "";

                        // Reference
                        const finalReferencia = data["referencia"] || data["model"] || "Sin referencia";

                        // Brand
                        const finalMarca = data["Marca-de-la-moto"] || data["marca"] || "Genérico";

                        // Displacement
                        let finalDisplacement = 0;
                        const rawDisplacement = data["cilindraje"] || data["cc"] || data["displacement"];
                        if (rawDisplacement) {
                            let clean = String(rawDisplacement).toLowerCase();
                            clean = clean.replace(/cc|cm3|cm|c\.c\.|l/g, '');
                            clean = clean.replace(/,/g, '.');
                            clean = clean.replace(/[^0-9.]/g, '');
                            finalDisplacement = parseFloat(clean) || 0;
                        }

                        return {
                            id: doc.id,
                            ...data,
                            referencia: finalReferencia,
                            marca: finalMarca,
                            imagen_url: finalImage,
                            displacement: finalDisplacement,
                            precio: Number(data["precio"]) || 0,
                        } as Moto;
                    });
                    setAllMotos(motos);
                });

                // B. Financial Entities
                const entSnap = await getDocs(collection(db, "financial_config/general/financieras"));
                const entList = entSnap.docs.map(d => ({ id: d.id, ...d.data() } as FinancialEntity));
                setEntities(entList);

                // Select Crediorbe by default or first available
                const defaultEnt = entList.find(e => e.name.toLowerCase().includes('crediorbe')) || entList[0];
                if (defaultEnt) {
                    setSelectedEntityId(defaultEnt.id);
                    setSelectedEntity(defaultEnt);
                }

                // C. Financial Parameters (Registration Costs)
                const matrixDoc = await getDoc(doc(db, 'config', 'financial_parameters'));
                if (matrixDoc.exists()) {
                    setMatrixRows(matrixDoc.data().rows || []);
                }

                setLoading(false);
                return () => unsubscribe();
            } catch (error) {
                console.error("Error initializing:", error);
                setLoading(false);
            }
        };

        loadData();
    }, []);

    // 2. Handle Entity Change
    const handleEntityChange = (id: string) => {
        const ent = entities.find(e => e.id === id);
        if (ent) {
            setSelectedEntityId(id);
            setSelectedEntity(ent);
        }
    };

    // 3. Real-time Calculation (Budget -> Max Loan)
    useEffect(() => {
        if (!selectedEntity) return;

        const result = calculateMaxLoan(
            dailyBudget,
            initialPayment,
            48,
            selectedEntity.interestRate || 2.3,
            selectedEntity.fngRate || 0,
            selectedEntity.lifeInsuranceValue || 0.1126
        );
        setCalculation(result);
    }, [dailyBudget, initialPayment, selectedEntity]);

    // 4. Helper: Get Registration Cost
    const getDocsCost = (moto: Moto): number => {
        if (!matrixRows.length) return 800000;

        let row;
        const cc = moto.displacement || 150;

        row = matrixRows.find(r => r.minCC <= cc && r.maxCC >= cc);

        return row ? (row.registrationCreditGeneral || 750000) : 750000;
    };

    // 5. Intelligent Filter Logic
    const visibleMotos = useMemo(() => {
        if (!calculation || !allMotos.length) return [];

        const entityPct = selectedEntity?.minDownPaymentPercentage ?? 10;

        return allMotos
            .map(moto => {
                const docsCost = getDocsCost(moto);
                const initialFromPrice = moto.precio * (entityPct / 100);
                const requiredInitial = initialFromPrice + docsCost;
                const isFeasible = moto.precio <= (calculation.maxLoanAmount + requiredInitial);

                return { ...moto, requiredInitial, isFeasible, entityPct };
            })
            .filter(m => m.isFeasible)
            .sort((a, b) => b.precio - a.precio);
    }, [allMotos, calculation, matrixRows, selectedEntity]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
            {/* Header */}
            <div className="bg-gradient-to-r from-brand-blue to-blue-700 text-white py-12 md:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-3xl mx-auto text-center space-y-4">
                        <h1 className="text-4xl md:text-5xl font-black">
                            Buscador por Presupuesto
                        </h1>
                        <p className="text-lg md:text-xl text-blue-100">
                            Dime cuánto puedes pagar diario, y te diré qué motos te alcanzan
                        </p>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-8 md:py-12">
                <div className="max-w-6xl mx-auto space-y-8">
                    {/* Calculator Panel */}
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8">
                        <div className="grid md:grid-cols-2 gap-8 items-center">
                            {/* Left: Inputs */}
                            <div className="space-y-6">
                                {/* Daily Budget Slider */}
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-lg font-bold text-slate-700 flex items-center gap-2">
                                            <DollarSign className="w-5 h-5 text-brand-yellow" />
                                            Pago Diario
                                        </label>
                                        <span className="text-3xl font-black text-brand-blue">
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
                                        className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-blue"
                                    />
                                    <p className="text-sm text-slate-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                        Con un pago diario de <b className="text-brand-blue">{formatCurrency(dailyBudget)}</b>, puedes financiar aproximadamente:
                                    </p>
                                </div>

                                {/* Credit Capacity Display */}
                                <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Wallet className="w-5 h-5 text-green-600" />
                                        <h4 className="text-green-800 font-bold">Cupo de Crédito Estimado</h4>
                                    </div>
                                    <p className="text-4xl font-black text-green-700">
                                        {calculation ? formatCurrency(calculation.maxLoanAmount) : "..."}
                                    </p>
                                    <p className="text-xs text-green-700 mt-2">
                                        Este es el dinero que {selectedEntity?.name || "la entidad"} te prestaría
                                    </p>
                                </div>
                            </div>

                            {/* Right: Entity Info */}
                            <div className="space-y-6">
                                {/* Entity Selector */}
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-600 uppercase tracking-wide">
                                        Entidad Financiera
                                    </label>
                                    <select
                                        value={selectedEntityId}
                                        onChange={(e) => handleEntityChange(e.target.value)}
                                        className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-800 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                                    >
                                        {entities.length > 0 ? (
                                            entities.map(ent => (
                                                <option key={ent.id} value={ent.id}>
                                                    {ent.name} - {ent.interestRate}% NMV
                                                </option>
                                            ))
                                        ) : (
                                            <option>Cargando financieras...</option>
                                        )}
                                    </select>
                                </div>

                                {/* Entity Details */}
                                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                                    <h3 className="text-slate-600 uppercase text-xs font-bold tracking-widest mb-4">
                                        Condiciones: {selectedEntity?.name || "..."}
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-slate-500 text-xs mb-1">Tasa Mensual</p>
                                            <p className="text-2xl font-bold text-brand-blue">{selectedEntity?.interestRate}%</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-slate-500 text-xs mb-1">FNG / Aval</p>
                                            <p className="text-2xl font-bold text-brand-blue">{selectedEntity?.fngRate}%</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-4 italic">
                                        {selectedEntity?.minDownPaymentPercentage === 0
                                            ? "¡Esta entidad permite financiar el 100% de la moto!"
                                            : `Requiere ${selectedEntity?.minDownPaymentPercentage ?? 10}% de inicial.`}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Results Section */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                                <TrendingUp className="w-8 h-8 text-brand-yellow" />
                                Motos Disponibles
                            </h2>
                            <span className="text-lg font-bold bg-brand-blue text-white px-4 py-2 rounded-full">
                                {visibleMotos.length} {visibleMotos.length === 1 ? 'moto' : 'motos'}
                            </span>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-20">
                                <Loader2 className="w-10 h-10 animate-spin text-brand-blue" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {visibleMotos.map((moto: any) => (
                                    <Link
                                        key={moto.id}
                                        href={`/presupuesto?moto=${moto.id}`}
                                        className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden hover:border-brand-blue hover:shadow-2xl transition-all group flex flex-col"
                                    >
                                        {/* Image */}
                                        <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden flex items-center justify-center p-4">
                                            {moto.imagen_url ? (
                                                <div className="relative w-full h-full">
                                                    <Image
                                                        src={moto.imagen_url}
                                                        alt={moto.referencia}
                                                        fill
                                                        className="object-contain group-hover:scale-105 transition-transform duration-500"
                                                        priority={false}
                                                        unoptimized={true}
                                                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center text-slate-300">
                                                    <span className="text-4xl">🏍️</span>
                                                    <span className="text-xs font-bold uppercase mt-2">{moto.marca}</span>
                                                </div>
                                            )}
                                            <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-slate-700 border border-slate-200">
                                                {moto.marca}
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="p-5 flex-1 flex flex-col space-y-4">
                                            <div>
                                                <h3 className="font-bold text-lg leading-tight text-slate-800 group-hover:text-brand-blue transition-colors">
                                                    {moto.referencia}
                                                </h3>
                                                <p className="text-slate-500 text-sm mt-1">{moto.displacement || 150} cc</p>
                                            </div>

                                            <div className="pt-4 border-t border-slate-200 space-y-3 mt-auto">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500">Precio</span>
                                                    <span className="font-bold text-slate-800">{formatCurrency(moto.precio)}</span>
                                                </div>

                                                {/* Initial Payment Badge */}
                                                {moto.entityPct === 0 ? (
                                                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-3 text-white">
                                                        <p className="text-[10px] uppercase font-black tracking-wide mb-1">
                                                            ¡OFERTA BRUTAL!
                                                        </p>
                                                        <div className="text-xl font-black">
                                                            {formatCurrency(moto.requiredInitial)}
                                                        </div>
                                                        <p className="text-[10px] mt-1 font-bold opacity-90">
                                                            ¡INICIAL $0! (Solo Trámites)
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3">
                                                        <p className="text-[10px] text-green-700 uppercase font-bold tracking-wide mb-1">
                                                            Inicial Estimada
                                                        </p>
                                                        <div className="text-xl font-bold text-green-700">
                                                            {formatCurrency(moto.requiredInitial)}
                                                        </div>
                                                        <p className="text-[10px] text-green-600 mt-1">
                                                            ({moto.entityPct}% Moto) + Trámites
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Link>
                                ))}

                                {visibleMotos.length === 0 && (
                                    <div className="col-span-full py-16 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                        <span className="text-6xl mb-4 block">🏍️</span>
                                        <h3 className="text-2xl font-bold text-slate-700 mb-2">No encontramos motos disponibles</h3>
                                        <p className="text-slate-500 text-sm max-w-md mx-auto">
                                            Con un pago diario de <span className="font-bold text-brand-blue">{formatCurrency(dailyBudget)}</span>,
                                            el banco te prestaría aprox. <span className="font-bold text-green-600">{calculation ? formatCurrency(calculation.maxLoanAmount) : '...'}</span>.
                                            <br />
                                            Intenta aumentar tu presupuesto diario.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
