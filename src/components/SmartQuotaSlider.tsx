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
    const [selectedScenarioId, setSelectedScenarioId] = useState<string>(FINANCIAL_SCENARIOS[0].id);

    // User Contact State
    const [userName, setUserName] = useState("");
    const [userPhone, setUserPhone] = useState("");

    // Profiling State
    const [userProfile, setUserProfile] = useState<RoutingProfile>({
        age: 25, // Default eligible age
        income: "1-2 SMMLV",
        activity: "Empleado",
        reported: false
    });

    // Routing Logic
    // Memoize input for routing to prevent unstable object references if allFinancialEntities changes reference
    const routingResult = useMemo(() => {
        return routeFinancialEntities(userProfile, allFinancialEntities);
    }, [userProfile, allFinancialEntities]);

    const availableEntities = routingResult.suitableEntities;

    // Use availableEntities for selection. If none, fall back to empty or handle error.
    // If previously selected entity is now filtered out, reset to first available.
    const [selectedFinancialId, setSelectedFinancialId] = useState<string>("");

    useEffect(() => {
        if (availableEntities && availableEntities.length > 0) {
            // retain selection if still available
            if (!availableEntities.find(e => e.id === selectedFinancialId)) {
                setSelectedFinancialId(availableEntities[0].id);
            }
        } else {
            setSelectedFinancialId("");
        }
    }, [availableEntities, selectedFinancialId]);


    const [months, setMonths] = useState<number>(48);
    const [downPayment, setDownPayment] = useState<number>(0);
    const [downPaymentStr, setDownPaymentStr] = useState<string>("");
    const [quote, setQuote] = useState<QuoteResult | null>(null);
    const [matrix, setMatrix] = useState<FinancialMatrix | undefined>(undefined);
    const [isSaving, setIsSaving] = useState(false);

    // Search State
    const [filterText, setFilterText] = useState("");

    // Filtered Motos Logic
    const filteredMotos = motos.filter(m =>
        m.referencia.toLowerCase().includes(filterText.toLowerCase()) ||
        m.marca.toLowerCase().includes(filterText.toLowerCase())
    );

    // Ensure selectedMotoId is valid in filtered list, or default to first filtered
    useEffect(() => {
        if (filteredMotos.length > 0 && !filteredMotos.find(m => m.id === selectedMotoId)) {
            setSelectedMotoId(filteredMotos[0].id);
        }
    }, [filterText, filteredMotos]);

    const selectedMoto = motos.find(m => m.id === selectedMotoId);

    const activeScenario = FINANCIAL_SCENARIOS.find(s => s.id === selectedScenarioId) || FINANCIAL_SCENARIOS[0];
    const isCredit = activeScenario.method === 'credit';

    // Initial Data Fetch (Matrix)
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

    // Update Default Down Payment (10%) when moto changes
    useEffect(() => {
        if (!selectedMoto) return;
        // Always reset to 10% when moto changes
        const def = Math.floor(selectedMoto.precio * 0.10);
        setDownPayment(def);
        setDownPaymentStr(def.toLocaleString('es-CO'));
    }, [selectedMotoId]);

    // Calculate Quote
    useEffect(() => {
        if (!selectedMoto) return;

        // Use the selected entity from AVAILABLE ones
        const financialEntity = availableEntities.find(f => f.id === selectedFinancialId);

        const mockCity: City = {
            id: activeScenario.id,
            name: activeScenario.cityName,
            department: 'Magdalena',
            isActive: true,
            documentationFee: 0
        };

        // If no entity available for credit, we can't calculate credit quote perfectly, 
        // but let's allow it to return null or basic cash quote.
        // If isCredit and no entity, we should probably warn.

        const result = calculateQuote(
            selectedMoto,
            mockCity,
            soatRates,
            activeScenario.method,
            isCredit ? financialEntity : undefined,
            months,
            downPayment,
            matrix
        );

        setQuote(result);
    }, [selectedScenarioId, selectedFinancialId, months, downPayment, selectedMoto, soatRates, availableEntities, matrix, activeScenario, isCredit]);

    // HANDLERS

    /**
     * Handles the "Solicitar" action.
     * 1. Validates User Contact Info (Name/Phone).
     * 2. Saves the Lead & Profiling Data to Firestore 'prospectos'.
     * 3. Redirects to WhatsApp with a pre-filled message containing the quote details.
     */
    const handleWhatsapp = async () => {
        if (!quote || !selectedMoto) return;

        // Validation
        if (!userName.trim() || userPhone.length < 7) {
            alert("Por favor ingresa tu nombre y un celular válido para contactarte.");
            return;
        }

        setIsSaving(true);
        const cleanPhone = userPhone.replace(/\D/g, '');

        // 1. Save Lead to Firestore
        try {
            const payload: Lead = {
                nombre: userName,
                celular: cleanPhone,
                motoInteres: selectedMoto.referencia,
                fecha: serverTimestamp(),
                motivo_inscripcion: isCredit ? 'Solicitud de Crédito' : 'Pago de Contado',
                origen: 'WEB_COTIZADOR',
                estado: 'NUEVO',

                // Profiling Data
                edad: userProfile.age,
                ingresos_mensuales: userProfile.income,
                actividad_economica: userProfile.activity,
                reportado_datacredito: userProfile.reported,
                eligibility_status: routingResult.status === 'Eligible' ? 'APTO' : 'RECHAZADO_AUTO'
            } as any; // Type casting for new fields if interface isn't fully updated in all contexts

            await addDoc(collection(db, "prospectos"), payload);

        } catch (e) {
            console.error("Error saving lead", e);
            // We continue to WhatsApp even if save fails, but maybe alert user?
        } finally {
            setIsSaving(false);
        }

        // 2. Open WhatsApp
        const phone = "573008603210";
        let text = `Hola, soy *${userName}*, me interesa la *${selectedMoto.marca} ${selectedMoto.referencia}*.\n`; // fallback
        text += `*Edad:* ${userProfile.age} años\n`;
        text += `*Perfil:* ${userProfile.activity}\n`;
        text += `*Modalidad:* ${activeScenario.label}\n`;
        text += `*Precio Proyecto:* $${quote.subtotal.toLocaleString()}\n`;

        if (quote.isCredit) {
            text += `*Entidad:* ${quote.financialEntity || 'N/A'}\n`;
            text += `*Cuota Inicial:* $${downPayment.toLocaleString()}\n`;
            text += `*Cuota Mensual:* $${quote.monthlyPayment?.toLocaleString()}\n`;
            text += `*Plazo:* ${months} meses\n`;
            text += `*Seguro Vida:* $${quote.lifeInsuranceValue.toLocaleString()} (Incluido)\n`;
        } else {
            text += `*Total a Pagar:* $${quote.total.toLocaleString()}\n`;
        }

        text += `\nGeneré esta simulación en la web (${routingResult.status}). Quiero asesoría.`;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');

    };

    if (!selectedMoto) return null;

    return (
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-brand-blue p-6 text-white text-center">
                <h3 className="text-2xl font-bold uppercase tracking-wide">Simula tu Crédito</h3>
                <p className="text-blue-100 text-sm opacity-80">Elige tu moto y plan de pago ideal</p>
            </div>

            <div className="p-6 space-y-6">

                {/* --- PROFILING SECTION --- */}
                {isCredit && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="bg-brand-yellow text-slate-900 rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">1</div>
                            <h4 className="text-sm font-bold text-slate-900 uppercase">Tu Perfil</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Edad</label>
                                <input
                                    type="number"
                                    value={userProfile.age}
                                    onChange={(e) => setUserProfile({ ...userProfile, age: Number(e.target.value) })}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Actividad</label>
                                <select
                                    value={userProfile.activity}
                                    onChange={(e) => setUserProfile({ ...userProfile, activity: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900"
                                >
                                    <option>Empleado</option>
                                    <option>Independiente</option>
                                    <option>Pensionado</option>
                                </select>
                            </div>
                        </div>

                        {/* Age Warning */}
                        {routingResult.status === 'Rejected' && (
                            <div className="bg-red-50 text-red-600 text-xs p-2 rounded border border-red-100 font-medium">
                                {routingResult.reason || "Tu perfil no aplica para financiación automática. Contáctanos para estudio manual."}
                            </div>
                        )}
                    </div>
                )}


                {/* MOTO SELECTOR */}
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="bg-brand-yellow text-slate-900 rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">{isCredit ? '2' : '1'}</div>
                        <label className="text-xs font-bold text-slate-500 uppercase">La Moto</label>
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar moto..."
                        className="w-full p-3 mb-2 border border-slate-300 rounded-xl bg-slate-50 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                    />
                    <select
                        className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none transition-all"
                        value={selectedMotoId}
                        onChange={(e) => setSelectedMotoId(e.target.value)}
                    >
                        {filteredMotos.map(m => (
                            <option key={m.id} value={m.id}>{m.referencia}</option>
                        ))}
                    </select>
                </div>

                {/* SCENARIO SELECTOR */}
                <div>
                    <label className="block text-xs font-bold text-slate-900 uppercase mb-1">Modalidad / Ciudad</label>
                    <select
                        className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 text-sm font-bold text-slate-900"
                        value={selectedScenarioId}
                        onChange={(e) => setSelectedScenarioId(e.target.value)}
                    >
                        {FINANCIAL_SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                </div>

                {/* CREDIT DETAILS */}
                {isCredit && (
                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                        {/* Entity Selector (Filtered) */}
                        <div>
                            <label className="block text-xs font-bold text-slate-900 uppercase mb-1">Entidad Financiera (Sugerida)</label>
                            <select
                                className="w-full p-3 border border-slate-300 rounded-xl bg-white font-bold text-brand-blue"
                                value={selectedFinancialId}
                                onChange={(e) => setSelectedFinancialId(e.target.value)}
                                disabled={availableEntities.length === 0}
                            >
                                {availableEntities.length > 0 ? (
                                    availableEntities.map(f => (
                                        <option key={f.id} value={f.id}>{f.name} ({f.interestRate}% NMV)</option>
                                    ))
                                ) : (
                                    <option>No hay entidades disponibles</option>
                                )}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-900 uppercase mb-1">Cuota Inicial Sugerida</label>
                            <input
                                type="text"
                                className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 font-bold text-slate-900"
                                value={downPaymentStr}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    const num = Number(val);
                                    setDownPayment(num);
                                    setDownPaymentStr(num > 0 ? num.toLocaleString('es-CO') : "");
                                }}
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <div className="flex justify-between mb-1">
                                <label className="text-xs font-bold text-slate-900 uppercase">Plazo</label>
                                <span className="text-sm font-bold text-brand-blue">{months} Meses</span>
                            </div>
                            <input
                                type="range" min="12" max="60" step="12"
                                className="w-full accent-brand-blue h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                value={months}
                                onChange={(e) => setMonths(Number(e.target.value))}
                            />
                            <div className="flex justify-between text-xs text-slate-400 mt-1">
                                <span>12m</span>
                                <span>60m</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* RESULTS */}
                {quote && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500">Valor Moto</span>
                            <span className="font-bold text-slate-700">${quote.vehiclePrice.toLocaleString()}</span>
                        </div>
                        {quote.isCredit && quote.fngCost > 0 && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 text-xs">+ Fondo Garantías (FNG - Financiado)</span>
                                <span className="font-bold text-slate-700 text-xs">${quote.fngCost.toLocaleString()}</span>
                            </div>
                        )}
                        {quote.isCredit && ((quote.registrationPrice > 0) || (quote.vGestion && quote.vGestion > 0)) && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 text-xs">+ Documentos y Gestión</span>
                                <span className="font-bold text-slate-700 text-xs">${((quote.registrationPrice || 0) + (quote.vGestion || 0)).toLocaleString()}</span>
                            </div>
                        )}
                        {quote.isCredit && quote.vCobertura && quote.vCobertura > 0 && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 text-xs">+ Otros Cargos (Cobertura)</span>
                                <span className="font-bold text-slate-700 text-xs">${quote.vCobertura.toLocaleString()}</span>
                            </div>
                        )}
                        {/* BREAKDOWN */}
                        {quote.isCredit && (
                            <>

                                <div className="flex justify-between items-center text-xs text-slate-400">
                                    <span>Seguro Vida (Mensual)</span>
                                    <span>${quote.lifeInsuranceValue.toLocaleString()}</span>
                                </div>
                                {quote.unemploymentInsuranceCost > 0 && (
                                    <div className="flex justify-between items-center text-xs text-slate-400">
                                        <span>Seguro Desempleo (Mensual)</span>
                                        <span>${quote.unemploymentInsuranceCost.toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center text-xs text-slate-400">
                                    <span>Cuota Base Crédito</span>
                                    <span>${((quote.monthlyPayment || 0) - quote.lifeInsuranceValue - quote.unemploymentInsuranceCost - (quote.coverageMonthlyComponent || 0)).toLocaleString()}</span>
                                </div>
                            </>
                        )}


                        {quote.isCredit && (
                            <>
                                <div className="flex justify-between items-center pt-2 border-t border-slate-200 mt-2">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-900">CUOTA MES 1-12</span>
                                        {quote.coverageMonthlyComponent && quote.coverageMonthlyComponent > 0 && (
                                            <span className="text-[10px] text-slate-500 font-normal">Mes 13+: ${((quote.monthlyPayment || 0) - quote.coverageMonthlyComponent).toLocaleString()}</span>
                                        )}
                                    </div>
                                    <span className="text-2xl font-extrabold text-slate-900">${quote.monthlyPayment?.toLocaleString()}</span>
                                </div>
                            </>
                        )}
                        {!quote.isCredit && (
                            <div className="flex justify-between items-center pt-2 border-t border-slate-200 mt-2">
                                <span className="text-sm font-bold text-brand-blue">Total a Pagar</span>
                                <span className="text-2xl font-black text-brand-red">${quote.total.toLocaleString()}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* CONTACT INFO */}
                <div className="space-y-3 pt-2">
                    <p className="text-xs font-bold text-slate-500 uppercase">Tus Datos de Contacto</p>
                    <input
                        type="text"
                        placeholder="Tu Nombre Completo"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        className="w-full p-3 border border-slate-300 rounded-xl bg-white text-sm focus:ring-2 focus:ring-brand-blue outline-none"
                    />
                    <input
                        type="tel"
                        placeholder="Tu Celular (WhatsApp)"
                        value={userPhone}
                        onChange={(e) => setUserPhone(e.target.value)}
                        className="w-full p-3 border border-slate-300 rounded-xl bg-white text-sm focus:ring-2 focus:ring-brand-blue outline-none"
                    />
                </div>

                <button
                    onClick={handleWhatsapp}
                    disabled={(isCredit && availableEntities.length === 0) || isSaving}
                    className="w-full bg-brand-yellow hover:bg-yellow-400 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed font-black py-4 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 active:translate-y-0 flex items-center justify-center gap-2"
                >
                    {isSaving ? 'Guardando...' : (
                        <>
                            <span>SOLICITAR ESTUDIO GRATIS</span>
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
                        </>
                    )}
                </button>
                <p className="text-[10px] text-center text-slate-400 px-4 leading-tight">
                    La información presentada es un cálculo aproximado (cumple con las condiciones de la Ley 546 de 1999) basado en la información suministrada y no constituye compromiso de otorgamiento de crédito. Para el cual se deberá realizar el estudio de la solicitud de crédito acorde con las políticas de la entidad.
                </p>
            </div>
        </div>
    );
}
