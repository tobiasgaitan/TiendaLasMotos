"use client";

import { useState, useEffect, useMemo } from "react";
import { Moto, Lead } from "@/types";
import { City, SoatRate, FinancialEntity, FinancialMatrix } from "@/types/financial";
import { calculateQuote, QuoteResult } from "@/lib/utils/calculator";
import { routeFinancialEntities, RoutingProfile } from "@/lib/utils/routing";
import { doc, getDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FINANCIAL_SCENARIOS } from "@/lib/constants";

interface Props {
    motos: Moto[];
    cities?: City[]; // Deprecated
    soatRates: SoatRate[];
    financialEntities: FinancialEntity[];
}

export default function SmartQuotaSlider({ motos, soatRates, financialEntities: allFinancialEntities }: Props) {
    // Default to first moto if available
    const [selectedMotoId, setSelectedMotoId] = useState<string>(motos?.[0]?.id || "");

    // [NEW] Mode State
    const [saleMode, setSaleMode] = useState<'credit' | 'cash'>('credit');

    // Filter Scenarios based on Mode
    const availableScenarios = useMemo(() => {
        return FINANCIAL_SCENARIOS.filter(s => s.method === saleMode);
    }, [saleMode]);

    // Auto-select first scenario when mode changes
    const [selectedScenarioId, setSelectedScenarioId] = useState<string>(availableScenarios[0]?.id || FINANCIAL_SCENARIOS[0].id);

    // Sync Scenario Selection with Mode Change
    useEffect(() => {
        // If current selected scenario is not in available list, switch it
        const current = FINANCIAL_SCENARIOS.find(s => s.id === selectedScenarioId);
        if (current && current.method !== saleMode) {
            setSelectedScenarioId(availableScenarios[0]?.id || selectedScenarioId);
        }
    }, [saleMode, availableScenarios, selectedScenarioId]);

    // User Contact State
    const [userName, setUserName] = useState("");
    const [userPhone, setUserPhone] = useState("");

    // Profiling State (Only for Credit)
    const [userProfile, setUserProfile] = useState<RoutingProfile>({
        age: 25, // Default eligible age
        income: "1-2 SMMLV",
        activity: "Empleado",
        reported: false
    });

    // Routing Logic (Only relevant for Credit)
    const routingResult = useMemo(() => {
        return routeFinancialEntities(userProfile, allFinancialEntities);
    }, [userProfile, allFinancialEntities]);

    const availableEntities = routingResult.suitableEntities;

    // Financial Entity Selection
    const [selectedFinancialId, setSelectedFinancialId] = useState<string>("");

    useEffect(() => {
        if (saleMode === 'credit') {
            if (availableEntities && availableEntities.length > 0) {
                if (!availableEntities.find(e => e.id === selectedFinancialId)) {
                    setSelectedFinancialId(availableEntities[0].id);
                }
            } else {
                setSelectedFinancialId("");
            }
        }
    }, [availableEntities, selectedFinancialId, saleMode]);

    const [months, setMonths] = useState<number>(48);
    const [downPayment, setDownPayment] = useState<number>(0);
    const [downPaymentStr, setDownPaymentStr] = useState<string>("");

    // [NEW] Cash Mode Discount
    const [discount, setDiscount] = useState<number>(0);
    const [discountStr, setDiscountStr] = useState<string>("");

    const [quote, setQuote] = useState<QuoteResult | null>(null);
    const [matrix, setMatrix] = useState<FinancialMatrix | undefined>(undefined);
    const [isSaving, setIsSaving] = useState(false);
    const [isExempt, setIsExempt] = useState(false); // [NEW] Manual Exemption

    // Search State
    const [filterText, setFilterText] = useState("");

    // Filtered Motos Logic
    const filteredMotos = motos.filter(m =>
        m.referencia.toLowerCase().includes(filterText.toLowerCase()) ||
        m.marca.toLowerCase().includes(filterText.toLowerCase())
    );

    // Ensure selectedMotoId is valid
    useEffect(() => {
        if (filteredMotos.length > 0 && !filteredMotos.find(m => m.id === selectedMotoId)) {
            setSelectedMotoId(filteredMotos[0].id);
        }
    }, [filterText, filteredMotos]);

    const selectedMoto = motos.find(m => m.id === selectedMotoId);

    const activeScenario = FINANCIAL_SCENARIOS.find(s => s.id === selectedScenarioId) || FINANCIAL_SCENARIOS[0];
    const isCredit = saleMode === 'credit';

    // Initial Matrix Fetch
    useEffect(() => {
        const fetchMatrix = async () => {
            try {
                const docRef = doc(db, 'config', 'financial_parameters');
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setMatrix(snap.data() as FinancialMatrix);
                }
            } catch (e) {
                console.error("Error fetching matrix", e);
            }
        };
        fetchMatrix();
    }, []);

    // Update Default Down Payment (15%) when moto changes
    useEffect(() => {
        if (!selectedMoto) return;
        const def = Math.floor(selectedMoto.precio * 0.15);
        setDownPayment(def);
        setDownPaymentStr(def.toLocaleString('es-CO'));

        // Reset Discount
        setDiscount(0);
        setDiscountStr("");

        // Auto-Exempt Logc
        const isPatineta = selectedMoto.category?.toUpperCase() === 'PATINETA'
            || selectedMoto.referencia.toUpperCase().includes('PATINETA')
            || selectedMoto.referencia.toUpperCase().includes('ECOMAD')
            || selectedMoto.exemptRegistration === true;

        setIsExempt(isPatineta);

    }, [selectedMotoId]); // removed selectedMoto to prevent loop if obj changes ref

    // Calculate Quote
    useEffect(() => {
        if (!selectedMoto) return;

        const financialEntity = availableEntities.find(f => f.id === selectedFinancialId);

        // Allow calculation even if no entity for Credit (returns null or partial?)
        // calculateQuote handles undefined entity gracefully for 'cash' but for 'credit' it might be needed.

        const mockCity: City = {
            id: activeScenario.id,
            name: activeScenario.cityName,
            department: 'Magdalena',
            isActive: true,
            documentationFee: 0
        };

        const result = calculateQuote(
            selectedMoto,
            mockCity,
            soatRates,
            activeScenario.method,
            isCredit ? financialEntity : undefined,
            months,
            downPayment,
            matrix,
            isExempt
        );

        setQuote(result);
    }, [selectedScenarioId, selectedFinancialId, months, downPayment, selectedMoto, soatRates, availableEntities, matrix, activeScenario, isCredit, isExempt, saleMode]);

    // Validation
    const validateContact = () => {
        if (!userName.trim() || userPhone.length < 7) {
            alert("⚠️ Requerido: Por favor ingresa el Nombre Completo y WhatsApp del cliente.");
            return false;
        }
        return true;
    };

    // PDF Generation
    const handlePDF = async () => {
        if (!quote || !selectedMoto) return;
        if (!validateContact()) return;

        setIsSaving(true);
        try {
            // Dynamic Import to avoid SSR issues
            const { generateQuotationPDF } = await import('@/lib/pdf/generator');

            await generateQuotationPDF({
                moto: selectedMoto,
                quoteResult: quote,
                customerName: userName,
                customerPhone: userPhone,
                isCredit: isCredit,
                months: months,
                downPayment: downPayment,
                discount: discount
            });
        } catch (e) {
            console.error(e);
            alert("Error generando PDF");
        } finally {
            setIsSaving(false);
        }
    };

    // WhatsApp Handler
    const handleWhatsapp = async () => {
        if (!quote || !selectedMoto) return;
        if (!validateContact()) return;

        setIsSaving(true);
        const cleanPhone = userPhone.replace(/\D/g, '');

        try {
            const payload: Lead = {
                nombre: userName,
                celular: cleanPhone,
                motoInteres: selectedMoto.referencia,
                fecha: serverTimestamp(),
                motivo_inscripcion: isCredit ? 'Solicitud de Crédito' : 'Pago de Contado',
                origen: 'WEB_COTIZADOR_PRO',
                estado: 'NUEVO',
                edad: userProfile.age,
                ingresos_mensuales: userProfile.income,
                actividad_economica: userProfile.activity,
                reportado_datacredito: userProfile.reported,
                eligibility_status: isCredit ? (routingResult.status === 'Eligible' ? 'APTO' : 'RECHAZADO_AUTO') : 'N/A'
            } as any;

            await addDoc(collection(db, "prospectos"), payload);
        } catch (e) {
            console.error("Error saving lead", e);
        } finally {
            setIsSaving(false);
        }

        const phone = "573008603210";
        let text = `Hola, soy *${userName}*, me interesa la *${selectedMoto.marca} ${selectedMoto.referencia}*.\n`;
        text += `*Modalidad:* ${activeScenario.label}\n`;

        if (isCredit) {
            text += `*Entidad:* ${quote.financialEntity || 'N/A'}\n`;
            text += `*Cuota Inicial:* $${downPayment.toLocaleString()}\n`;
            text += `*Cuota Mensual:* $${quote.monthlyPayment?.toLocaleString()}\n`;
            text += `*Plazo:* ${months} meses\n`;
        } else {
            // Net Total with Discount
            const netTotal = quote.total - discount;
            if (discount > 0) {
                text += `*Precio Lista:* $${quote.vehiclePrice.toLocaleString()}\n`;
                text += `*Descuento:* -$${discount.toLocaleString()}\n`;
            }
            text += `*Total a Pagar:* $${netTotal.toLocaleString()}\n`;
        }

        text += `\nGeneré esta cotización PRO en la web.`;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    };

    if (!selectedMoto) return null;

    return (
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
            {/* HERDER */}
            <div className={`p-6 text-white text-center relative transition-colors duration-500 ${isCredit ? 'bg-brand-blue' : 'bg-green-600'}`}>
                <h3 className="text-2xl font-bold uppercase tracking-wide flex items-center justify-center gap-2">
                    {isCredit ? 'Simulador de Crédito' : 'Cotizador de Contado'}
                </h3>
                <p className="text-white/80 text-sm">Versión Profesional V23.1</p>
                {quote?.matchIdentifier && (
                    <div className="absolute top-2 right-2 bg-black/30 px-2 py-1 rounded text-[10px] font-mono opacity-70 hover:opacity-100">
                        {quote.matchIdentifier}
                    </div>
                )}
            </div>

            <div className="p-6 space-y-6">

                {/* --- TOGGLE MODE --- */}
                <div className="bg-slate-100 p-1 rounded-xl flex relative">
                    <button
                        onClick={() => setSaleMode('credit')}
                        className={`flex-1 py-3 rounded-lg text-sm font-bold uppercase transition-all z-10 ${isCredit ? 'bg-white shadow-md text-brand-blue' : 'text-slate-600 hover:text-slate-900 bg-transparent'}`}
                    >
                        Financiación
                    </button>
                    <button
                        onClick={() => setSaleMode('cash')}
                        className={`flex-1 py-3 rounded-lg text-sm font-bold uppercase transition-all z-10 ${!isCredit ? 'bg-white shadow-md text-green-700' : 'text-slate-600 hover:text-slate-900 bg-transparent'}`}
                    >
                        De Contado
                    </button>
                </div>

                {/* --- MOTO & SEARCH --- */}
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Vehículo</label>
                    <input
                        type="text"
                        placeholder="Buscar moto..."
                        className="w-full p-3 mb-2 border border-slate-300 rounded-xl bg-slate-50 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                    />
                    <select
                        className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue outline-none"
                        value={selectedMotoId}
                        onChange={(e) => setSelectedMotoId(e.target.value)}
                    >
                        {filteredMotos.map(m => (
                            <option key={m.id} value={m.id}>{m.referencia}</option>
                        ))}
                    </select>
                </div>

                {/* --- CONTACT INFO (REQUIRED) --- */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cliente *</label>
                        <input type="text" placeholder="Nombre Completo" value={userName} onChange={e => setUserName(e.target.value)}
                            className="w-full p-3 border border-slate-300 rounded-xl text-sm font-bold" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">WhatsApp *</label>
                        <input type="tel" placeholder="300 000 0000" value={userPhone} onChange={e => setUserPhone(e.target.value)}
                            className="w-full p-3 border border-slate-300 rounded-xl text-sm font-bold" />
                    </div>
                </div>

                {/* --- PROFILING (CREDIT ONLY) --- */}
                {isCredit && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="bg-brand-yellow text-slate-900 rounded-full w-5 h-5 flex items-center justify-center font-bold text-xs">P</div>
                            <h4 className="text-xs font-bold text-slate-900 uppercase">Perfilamiento</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Edad</label>
                                <input type="number" value={userProfile.age} onChange={(e) => setUserProfile({ ...userProfile, age: Number(e.target.value) })}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Actividad</label>
                                <select value={userProfile.activity} onChange={(e) => setUserProfile({ ...userProfile, activity: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold">
                                    <option>Empleado</option>
                                    <option>Independiente</option>
                                    <option>Pensionado</option>
                                </select>
                            </div>
                        </div>
                        {routingResult.status === 'Rejected' && (
                            <div className="mt-2 text-xs text-red-600 font-bold bg-red-50 p-2 rounded">
                                {routingResult.reason}
                            </div>
                        )}
                    </div>
                )}

                {/* --- SCENARIO & PARAMS --- */}
                <div>
                    <label className="block text-xs font-bold text-slate-900 uppercase mb-1">Ubicación / Trámite</label>
                    <select
                        className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 text-sm font-bold text-slate-900 mb-3"
                        value={selectedScenarioId}
                        onChange={(e) => setSelectedScenarioId(e.target.value)}
                    >
                        {availableScenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>

                    {/* CREDIT PARAMS */}
                    {isCredit && (
                        <div className="space-y-3 animate-in fade-in">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Entidad Bancaria</label>
                                <select
                                    className="w-full p-3 border border-slate-300 rounded-xl font-bold text-brand-blue"
                                    value={selectedFinancialId}
                                    onChange={(e) => setSelectedFinancialId(e.target.value)}
                                    disabled={availableEntities.length === 0}
                                >
                                    {availableEntities.length > 0 ? (
                                        availableEntities.map(f => (
                                            <option key={f.id} value={f.id}>{f.name} ({f.interestRate}% NMV)</option>
                                        ))
                                    ) : <option>Sin cupo automático</option>}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Inicial ($)</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg font-bold"
                                        value={downPaymentStr}
                                        onChange={(e) => {
                                            const val = Number(e.target.value.replace(/\D/g, ''));
                                            setDownPayment(val);
                                            setDownPaymentStr(val > 0 ? val.toLocaleString('es-CO') : "");
                                        }}
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Plazo: {months}m</label>
                                    <input type="range" min="12" max="60" step="12" className="w-full h-2 bg-slate-200 accent-brand-blue rounded-lg"
                                        value={months} onChange={(e) => setMonths(Number(e.target.value))} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* CASH PARAMS */}
                    {!isCredit && (
                        <div className="animate-in fade-in">
                            <label className="block text-xs font-bold text-red-500 uppercase mb-1">Descuento Especial ($)</label>
                            <input
                                type="text"
                                className="w-full p-3 border border-red-200 bg-red-50 rounded-xl font-black text-red-600"
                                value={discountStr}
                                onChange={(e) => {
                                    const val = Number(e.target.value.replace(/\D/g, ''));
                                    setDiscount(val);
                                    setDiscountStr(val > 0 ? val.toLocaleString('es-CO') : "");
                                }}
                                placeholder="0"
                            />
                        </div>
                    )}
                </div>

                {/* --- RESULTS SUMMARY --- */}
                {quote && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Precio Lista</span>
                            <span className="font-bold">${quote.vehiclePrice.toLocaleString()}</span>
                        </div>

                        {/* Discount Row */}
                        {!isCredit && discount > 0 && (
                            <div className="flex justify-between text-red-600">
                                <span>- Descuento</span>
                                <span className="font-bold">-${discount.toLocaleString()}</span>
                            </div>
                        )}

                        <div className="flex justify-between">
                            <span className="text-slate-500">Trámites ({isCredit ? 'Crédito' : 'Contado'})</span>
                            <span className="font-bold">${((quote.registrationPrice || 0) + (quote.documentationFee || 0)).toLocaleString()}</span>
                        </div>

                        <div className="pt-2 border-t border-slate-200 flex justify-between items-center mt-2">
                            <span className="font-black text-slate-800 uppercase">{isCredit ? 'CUOTA MENSUAL' : 'TOTAL NETO'}</span>
                            <span className={`text-2xl font-black ${isCredit ? 'text-brand-blue' : 'text-green-600'}`}>
                                ${isCredit ? quote.monthlyPayment?.toLocaleString() : (quote.total - discount).toLocaleString()}
                            </span>
                        </div>
                        {isCredit && (
                            <div className="text-center text-xs text-slate-500">
                                Diaria Aprox: <span className="font-bold text-slate-700">${Math.round((quote.monthlyPayment || 0) / 30).toLocaleString()}</span>
                            </div>
                        )}

                        {/* EXEMPT CHECKBOX */}
                        <div className="flex justify-end pt-2">
                            <label className="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" checked={isExempt} onChange={e => setIsExempt(e.target.checked)} className="text-brand-blue rounded" />
                                <span className="text-[10px] uppercase font-bold text-brand-blue">Exento Matrícula</span>
                            </label>
                        </div>
                    </div>
                )}

                {/* --- ACTIONS --- */}
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={handlePDF}
                        disabled={isSaving}
                        className="col-span-1 bg-gray-800 hover:bg-gray-900 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                    >
                        <span>📄 PDF</span>
                    </button>
                    <button
                        onClick={handleWhatsapp}
                        disabled={isSaving}
                        className="col-span-1 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                    >
                        <span>WhatsApp</span>
                    </button>
                </div>

                <p className="text-[10px] text-center text-slate-400 leading-tight">
                    * Precios sujetos a cambios. Validez 3 días.
                </p>

            </div>
        </div>
    );
}
