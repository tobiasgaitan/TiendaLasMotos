"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, where, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Moto } from "@/types";
import { FinancialEntity } from "@/types/financial";
import { calculateMaxLoan } from "@/lib/utils/reverseCalculator";
import { Loader2, DollarSign, Wallet, AlertCircle, ChevronDown } from "lucide-react";

import Link from "next/link";
import Image from "next/image";

export default function BudgetToBikePage() {
    const [loading, setLoading] = useState(true);
    const [allMotos, setAllMotos] = useState<Moto[]>([]);

    // Financial Data
    const [entities, setEntities] = useState<any[]>([]);
    const [selectedEntityId, setSelectedEntityId] = useState<string>("");
    const [selectedEntity, setSelectedEntity] = useState<any>(null);
    const [matrixRows, setMatrixRows] = useState<any[]>([]); // For Registration Costs

    // -- Inputs --
    const [dailyBudget, setDailyBudget] = useState<number>(15000);
    const [initialPayment, setInitialPayment] = useState<number>(0);

    // -- Calculated State --
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

                        // MAPPING LOGIC (Mirrored from firestore.ts)

                        // Image Handling
                        let finalImage = "";
                        if (typeof data["imagenUrl"] === 'string') {
                            finalImage = data["imagenUrl"];
                        } else if (data["imagenUrl"] && typeof data["imagenUrl"] === 'object') {
                            finalImage = data["imagenUrl"].url || "";
                        }

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
                            imagen: finalImage,
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

        // Use Entity Parameters
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
        if (!matrixRows.length) return 800000; // Fallback

        let row;
        const cc = moto.displacement || 150;

        // Find row by CC range
        // Note: Logic simplification, assuming no "Electrical" or "Motocarro" specific overrides for now unless strictly needed
        row = matrixRows.find(r => r.minCC <= cc && r.maxCC >= cc);

        // Use "Crédito General" column (fallback to ~750k if missing)
        return row ? (row.registrationCreditGeneral || 750000) : 750000;
    };

    // 5. Intelligent Filter Logic
    const visibleMotos = useMemo(() => {
        if (!calculation || !allMotos.length) return [];

        return allMotos
            .map(moto => {
                const docsCost = getDocsCost(moto);
                const tenPercent = moto.precio * 0.10;
                const requiredInitial = tenPercent + docsCost;

                // Logic: 
                // BikePrice <= MaxLoan + RequiredInitial? 
                // If user has MORE initial than required, they can obviously buy it.
                // But the "Required Initial" displayed is the RULE (10% + Docs).
                // Actually, the user's PURCHASE POWER = MaxLoan + UserInitial.
                // If BikePrice <= PurchasePower, they can buy it. 
                // WAITING... The user request says:
                // "Filtro de Galería: Una moto aparece si su precio cumple: Precio Moto <= Cupo Préstamo + CI(Sug)"
                // Where CI(Sug) = 10% + Docs.

                // Let's interpret strict User Request:
                // We calculate the Max Loan available (Cupo Préstamo).
                // We calculate the CI required for THIS specific bike (0.10 * Price + Docs).
                // If BikePrice <= MaxLoan + CI, then it's feasible (because the bank covers the rest).

                const isFeasible = moto.precio <= (calculation.maxLoanAmount + requiredInitial);

                return { ...moto, requiredInitial, isFeasible };
            })
            .filter(m => m.isFeasible)
            .sort((a, b) => b.precio - a.precio);
    }, [allMotos, calculation, matrixRows]); // Re-run if matrix or calculation changes

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header & Entity Selector */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="text-center md:text-left space-y-2">
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                            Buscador Inteligente
                        </h1>
                        <p className="text-slate-400 text-sm max-w-md">
                            Encuentra tu moto ideal basada en tu bolsillo y las políticas reales de financiación.
                        </p>
                    </div>

                    {/* Entity Selector (Always Rendered) */}
                    <div className="w-full md:w-72 space-y-1">
                        <label className="text-xs text-slate-500 font-bold ml-1 uppercase tracking-wider">Entidad Financiera</label>
                        <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex items-center relative shadow-lg">
                            <div className="absolute left-3 text-emerald-500 pointer-events-none">
                                <BankIcon />
                            </div>
                            <select
                                value={selectedEntityId}
                                onChange={(e) => handleEntityChange(e.target.value)}
                                className="w-full bg-transparent text-white font-medium py-3 pl-10 pr-4 outline-none appearance-none cursor-pointer hover:bg-slate-800/50 rounded-lg transition-colors"
                            >
                                {entities.length > 0 ? (
                                    entities.map(ent => (
                                        <option key={ent.id} value={ent.id} className="bg-slate-900 text-white">
                                            {ent.name} - {ent.interestRate}% NMV
                                        </option>
                                    ))
                                ) : (
                                    <option className="bg-slate-900 text-slate-400">Cargando financieras...</option>
                                )}
                            </select>
                            <div className="absolute right-3 text-slate-500 pointer-events-none">
                                <ChevronDown className="w-4 h-4" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Calculator Control Panel */}
                <div className="bg-slate-900 rounded-2xl p-6 md:p-8 shadow-xl border border-slate-800 grid md:grid-cols-2 gap-12 items-center">
                    {/* INPUTS */}
                    <div className="space-y-8">
                        {/* Daily Budget */}
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
                            <p className="text-sm text-slate-400 bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                                Un pago diario de <b>{formatCurrency(dailyBudget)}</b>
                            </p>
                        </div>

                        {/* Initial Payment Display (Disabled Input concept? Or just extra info?)
                            Wait, user wants to input Initial Payment? 
                            The user request says: "La cuota inicial sugerida...". 
                            But in previous turn, we had an input.
                            If logic is "Bike <= Loan + SuggestedInitial", then user input is irrelevant for the filter?
                            Actually, usually users HAVE some initial. 
                            If the user has MORE initial than Suggested, they can buy better bikes.
                            However, the REQUEST asks for specific logic:
                            "Filtro: Precio <= Cupo + CI(Formula)".
                            This implies the filter is based on the THEORETICAL capability if they pay the standard initial.
                            I will keep the input just in case, but rely on the Formula for the "Required Initial" display.
                            Actually, let's keep it simple. The filter relies on the BANK LOAN LIMIT.
                            The BANK LOAN LIMIT is fixed by Daily Budget.
                            The REQUIRED INITIAL is variable per bike.
                            So filter is strictly: Is (Price - RequiredInitial) <= MaxLoan?
                            Yes, that's equivalent to Price <= MaxLoan + RequiredInitial.
                        */}
                        <div className="p-4 bg-emerald-900/10 border border-emerald-900/30 rounded-lg">
                            <h4 className="text-emerald-400 font-bold mb-1 flex items-center gap-2">
                                <Wallet className="w-4 h-4" /> Cupo de Crédito Estimado
                            </h4>
                            <p className="text-3xl font-bold text-white">
                                {calculation ? formatCurrency(calculation.maxLoanAmount) : "..."}
                            </p>
                            <p className="text-xs text-slate-400 mt-2">
                                Este es el dinero que {selectedEntity?.name} te prestaría basado en tu pago diario.
                            </p>
                        </div>
                    </div>

                    {/* DYNAMIC METRICS */}
                    <div className="space-y-6 text-center md:text-left">
                        <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
                            <h3 className="text-slate-400 uppercase text-xs font-bold tracking-widest">
                                Condiciones: {selectedEntity?.name || "..."}
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-slate-500 text-xs">Tasa Mensual</p>
                                    <p className="text-xl font-bold text-white">{selectedEntity?.interestRate}%</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs text-right">FNG / Aval</p>
                                    <p className="text-xl font-bold text-white text-right">{selectedEntity?.fngRate}%</p>
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 italic">
                            * La cuota inicial sugerida incluye el 10% del valor de la moto + trámites de matrícula.
                        </p>
                    </div>
                </div>

                {/* Smart Gallery */}
                <div className="space-y-6">
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                        Motos Disponibles
                        <span className="text-sm font-normal bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full border border-blue-500/30">
                            {visibleMotos.length}
                        </span>
                    </h2>

                    {loading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {visibleMotos.map((moto) => (
                                <div key={moto.id} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden hover:border-blue-500/50 transition-all hover:shadow-2xl group flex flex-col">
                                    {/* IMAGE HEADER - STRICT FALLBACK & NEXT IMAGE */}
                                    <div className="aspect-[4/3] bg-white relative overflow-hidden flex items-center justify-center p-4">
                                        {moto.imagen ? (
                                            <div className="relative w-full h-full">
                                                <Image
                                                    src={moto.imagen}
                                                    alt={moto.referencia}
                                                    fill
                                                    className="object-contain group-hover:scale-105 transition-transform duration-500"
                                                    priority={true}
                                                    unoptimized={true}
                                                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                                                />
                                            </div>
                                        ) : null}

                                        {/* Fallback Element - Shown if no image (Next Image doesn't throw onError easily, but we check moto.imagen above) */}
                                        <div className={`absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400 ${moto.imagen ? 'hidden' : ''}`}>
                                            <BikeIcon className="w-16 h-16 opacity-20 text-slate-900" />
                                            <span className="text-xs font-bold uppercase mt-2 text-slate-900/30">{moto.marca}</span>
                                        </div>

                                        <div className="absolute top-2 right-2 bg-slate-900/90 backdrop-blur px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white border border-slate-700">
                                            {moto.marca}
                                        </div>
                                    </div>

                                    {/* CONTENT */}
                                    <div className="p-5 flex-1 flex flex-col space-y-4">
                                        <div>
                                            <h3 className="font-bold text-lg leading-tight text-white group-hover:text-blue-400 transition-colors">
                                                {moto.referencia}
                                            </h3>
                                            <p className="text-slate-400 text-sm mt-1">{moto.displacement || 150} cc</p>
                                        </div>

                                        <div className="pt-4 border-t border-slate-800 space-y-3 mt-auto">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">Precio</span>
                                                <span className="font-bold text-white">{formatCurrency(moto.precio)}</span>
                                            </div>

                                            {/* BADGE: INICIAL ESTIMADA */}
                                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                                                <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-wide mb-1 flex justify-between">
                                                    <span>Inicial Estimada</span>
                                                </p>
                                                <div className="text-xl font-bold text-emerald-300">
                                                    {formatCurrency(moto.requiredInitial)}
                                                </div>
                                                <p className="text-[10px] text-emerald-600/60 mt-1">
                                                    (10% Moto) + Trámite Crédito General
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {visibleMotos.length === 0 && (
                                <div className="col-span-full py-16 text-center bg-slate-900/50 rounded-2xl border border-dashed border-slate-800">
                                    <BikeIcon className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                                    <h3 className="text-xl font-bold text-white">No encontramos motos disponibles</h3>
                                    <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
                                        Con un pago diario de {formatCurrency(dailyBudget)}, el banco te prestaría aprox. <span className="text-blue-400 font-bold">{calculation ? formatCurrency(calculation.maxLoanAmount) : '...'}</span>.
                                        Intenta aumentar tu presupuesto diario.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ICONS
function BankIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 21h18" />
            <path d="M5 21v-7" />
            <path d="M19 21v-7" />
            <path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3H4z" />
            <path d="M12 2v4" />
        </svg>
    )
}

function BikeIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="18.5" cy="17.5" r="3.5" />
            <circle cx="5.5" cy="17.5" r="3.5" />
            <circle cx="15" cy="5" r="1" />
            <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
        </svg>
    )
}


