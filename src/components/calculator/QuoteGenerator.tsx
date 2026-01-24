"use client";

import { useState, useEffect } from "react";
import { Moto, CreditSimulation } from "@/types";
import { City, SoatRate, FinancialEntity, FinancialMatrix } from "@/types/financial";
import { calculateQuote, QuoteResult } from "@/lib/utils/calculator";
import { addDoc, collection, serverTimestamp, getDocs, limit, orderBy, query, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FINANCIAL_SCENARIOS } from "@/lib/constants";

interface Props {
    moto: Moto;
    cities?: City[]; // Deprecated, keeping signature valid
    soatRates: SoatRate[];
    financialEntities: FinancialEntity[];
}

export default function QuoteGenerator({ moto, soatRates, financialEntities }: Props) {
    const [selectedScenarioId, setSelectedScenarioId] = useState<string>(FINANCIAL_SCENARIOS[0].id);

    // [NEW] Mode Derived from Scenario (or explicit toggle if we wanted, but dropdown works)
    const activeScenario = FINANCIAL_SCENARIOS.find(s => s.id === selectedScenarioId) || FINANCIAL_SCENARIOS[0];
    const isCredit = activeScenario.method === 'credit';

    // [NEW] Customer Data State
    const [userName, setUserName] = useState("");
    const [userPhone, setUserPhone] = useState("");

    const [selectedFinancialId, setSelectedFinancialId] = useState<string>(financialEntities[0]?.id || "");
    const [months, setMonths] = useState<number>(48);
    const [downPayment, setDownPayment] = useState<number>(0);
    const [downPaymentStr, setDownPaymentStr] = useState<string>("");

    // [NEW] Discount for Cash
    const [discount, setDiscount] = useState<number>(0);
    const [discountStr, setDiscountStr] = useState<string>("");

    const [quote, setQuote] = useState<QuoteResult | null>(null);
    const [matrix, setMatrix] = useState<FinancialMatrix | undefined>(undefined);
    const [isExempt, setIsExempt] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

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

    // Default Down Payment (15%) - Reset on moto change
    useEffect(() => {
        if (moto) {
            const def = Math.floor(moto.precio * 0.15);
            setDownPayment(def);
            setDownPaymentStr(def.toLocaleString('es-CO'));

            // Reset Discount
            setDiscount(0);
            setDiscountStr("");

            // Auto-Exempt logic
            const isPatineta = moto.category?.toUpperCase() === 'PATINETA'
                || moto.referencia.toUpperCase().includes('PATINETA')
                || moto.referencia.toUpperCase().includes('ECOMAD')
                || moto.exemptRegistration === true;
            setIsExempt(isPatineta);
        }
    }, [moto.id]);

    useEffect(() => {
        if (!moto) return;
        // if (!matrix) return; // Allow calc without matrix if needed for basic values

        const financialEntity = financialEntities.find(f => f.id === selectedFinancialId);

        const mockCity: City = {
            id: activeScenario.id,
            name: activeScenario.cityName,
            department: 'Magdalena',
            isActive: true,
            documentationFee: 0
        };

        const result = calculateQuote(
            moto,
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
    }, [selectedScenarioId, selectedFinancialId, months, downPayment, moto, soatRates, financialEntities, matrix, activeScenario, isCredit, isExempt]);

    // Validation
    const validateContact = () => {
        if (!userName.trim() || userPhone.length < 7) {
            alert("⚠️ Requerido: Por favor ingresa el Nombre Completo y WhatsApp del cliente.");
            return false;
        }
        return true;
    };

    // PDF Handler (New Shared Logic)
    const handleDownloadPDF = async () => {
        if (!quote) return;
        if (!validateContact()) return;

        setIsSaving(true);
        try {
            const { generateQuotationPDF } = await import('@/lib/pdf/generator');

            await generateQuotationPDF({
                moto: moto,
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
        if (!quote) return;
        if (!validateContact()) return;

        setIsSaving(true);

        try {
            // Saving as Prospect/Lead for consistency
            const cleanPhone = userPhone.replace(/\D/g, '');
            const payload = {
                nombre: userName,
                celular: cleanPhone,
                motoInteres: moto.referencia,
                fecha: serverTimestamp(),
                motivo_inscripcion: isCredit ? 'Simulador Admin (Crédito)' : 'Simulador Admin (Contado)',
                origen: 'ADMIN_QUOTE_GENERATOR',
                estado: 'NUEVO'
            };
            await addDoc(collection(db, "prospectos"), payload);

        } catch (e) { console.error("Error saving lead", e); }
        finally { setIsSaving(false); }

        const phone = "573008603210";
        let text = `Hola, soy *${userName}*, coticé la *${moto.marca} ${moto.referencia}*.\n`;
        text += `*Modalidad:* ${activeScenario.label}\n`;

        if (quote.isCredit) {
            text += `*Cuota Inicial:* $${downPayment.toLocaleString()}\n`;
            text += `*Cuota Mensual:* $${quote.monthlyPayment?.toLocaleString()}\n`;
            text += `*Plazo:* ${months} meses\n`;
        } else {
            // Net Total
            const netTotal = quote.total - discount;
            if (discount > 0) {
                text += `*Precio Lista:* $${quote.vehiclePrice.toLocaleString()}\n`;
                text += `*Descuento:* -$${discount.toLocaleString()}\n`;
            }
            text += `*Total a Pagar:* $${netTotal.toLocaleString()}\n`;
        }

        text += `\nGeneré esta cotización en la web.`;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    };

    if (!quote) return null;

    return (
        <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 max-w-md mx-auto sticky top-4">
            <div className={`p-4 -mx-6 -mt-6 mb-6 text-white text-center rounded-t-3xl transition-colors ${isCredit ? 'bg-brand-blue' : 'bg-green-600'}`}>
                <h3 className="text-xl font-bold uppercase flex items-center justify-center gap-2">
                    {isCredit ? 'Simulador Crédito' : 'Cotizador Contado'}
                </h3>
                <p className="text-white/80 text-xs">Versión Admin V23.1</p>
            </div>

            {/* CONTROLS */}
            <div className="space-y-4 mb-6">

                {/* CONTACT INFO */}
                <div className="grid grid-cols-1 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cliente *</label>
                        <input type="text" placeholder="Nombre Completo" value={userName} onChange={e => setUserName(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">WhatsApp *</label>
                        <input type="tel" placeholder="300 000 0000" value={userPhone} onChange={e => setUserPhone(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-900 mb-1">Lugar de Matrícula / Modalidad</label>
                    <select
                        className="w-full p-2 border rounded-xl bg-gray-50 font-bold text-gray-900"
                        value={selectedScenarioId}
                        onChange={(e) => setSelectedScenarioId(e.target.value)}
                    >
                        {FINANCIAL_SCENARIOS.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                    </select>
                </div>

                {isCredit && (
                    <>
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                            <label className="block text-sm font-bold text-blue-900 mb-1">Entidad Financiera</label>
                            <select
                                className="w-full p-2 border border-blue-200 rounded-xl bg-white font-bold text-gray-900"
                                value={selectedFinancialId}
                                onChange={(e) => setSelectedFinancialId(e.target.value)}
                            >
                                {financialEntities.map(f => (
                                    <option key={f.id} value={f.id}>{f.name} ({f.monthlyRate}%)</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-900 mb-1">Cuota Inicial Sugerida</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2 text-gray-500">$</span>
                                <input
                                    type="text"
                                    className="w-full p-2 pl-6 border border-slate-300 rounded-xl bg-gray-50 font-bold text-gray-900"
                                    value={downPaymentStr}
                                    onChange={(e) => {
                                        const val = Number(e.target.value.replace(/\D/g, ''));
                                        setDownPayment(val);
                                        setDownPaymentStr(val > 0 ? val.toLocaleString('es-CO') : "");
                                    }}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between mb-1">
                                <label className="text-sm font-bold text-gray-900">Plazo</label>
                                <span className="text-sm font-bold text-brand-blue">{months} meses</span>
                            </div>
                            <input
                                type="range" min="12" max="60" step="12"
                                className="w-full accent-brand-blue cursor-pointer h-2 bg-slate-200 rounded-lg"
                                value={months}
                                onChange={(e) => setMonths(Number(e.target.value))}
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>12</span><span>60</span>
                            </div>
                        </div>
                    </>
                )}

                {/* [NEW] Discount Input for Cash */}
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

            {/* SUMMARY */}
            <div className="bg-gray-50 p-4 rounded-xl space-y-2 mb-6 text-sm">
                <div className="flex justify-between">
                    <span className="text-gray-500">Precio Moto ({isExempt ? 'Exento' : 'Normal'})</span>
                    <span className="font-medium">${quote.vehiclePrice.toLocaleString()}</span>
                </div>

                {!isCredit && discount > 0 && (
                    <div className="flex justify-between text-red-600 font-bold">
                        <span>- Descuento</span>
                        <span>-${discount.toLocaleString()}</span>
                    </div>
                )}

                <div className="flex flex-col gap-1">
                    <div className="flex justify-between">
                        <span className="text-gray-500">Trámites ({isCredit ? 'Crédito' : 'Contado'})</span>
                        <span className="font-medium">${((quote.registrationPrice || 0) + (quote.documentationFee || 0)).toLocaleString()}</span>
                    </div>
                    {/* MANUAL EXEMPTION CHECKBOX */}
                    <label className="flex items-center gap-2 text-xs text-brand-blue cursor-pointer self-end bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors">
                        <input
                            type="checkbox"
                            checked={isExempt}
                            onChange={(e) => setIsExempt(e.target.checked)}
                            className="rounded text-brand-blue focus:ring-brand-blue"
                        />
                        <span className="font-bold">Exento de Matrícula</span>
                    </label>
                </div>

                <div className="border-t border-gray-200 pt-3 mt-3">
                    <div className="flex justify-between text-lg font-bold text-gray-900">
                        <span className="uppercase">{isCredit ? 'Cuota Mensual' : 'Total Neto'}</span>
                        <span className={`${isCredit ? 'text-brand-blue' : 'text-green-600'}`}>
                            ${isCredit ? quote.monthlyPayment?.toLocaleString() : (quote.total - discount).toLocaleString()}
                        </span>
                    </div>
                    {isCredit && (
                        <p className="text-xs text-slate-500 italic mt-1 text-right">* Aprox. diaria: ${Math.round((quote.monthlyPayment || 0) / 30).toLocaleString()}</p>
                    )}
                </div>
            </div>

            {/* ACTIONS */}
            <div className="space-y-3">
                <button
                    onClick={handleDownloadPDF}
                    disabled={isSaving}
                    className="w-full bg-gray-900 text-white py-3.5 rounded-xl font-bold hover:bg-black transition-colors flex justify-center gap-2 items-center shadow-lg shadow-gray-200 disabled:opacity-50"
                >
                    <span>📄</span> {isSaving ? 'Generando...' : 'Descargar PDF (Pro)'}
                </button>
                <button
                    onClick={handleWhatsapp}
                    disabled={isSaving}
                    className="w-full bg-[#25D366] text-white py-3.5 rounded-xl font-bold hover:bg-[#20bd5a] transition-colors flex justify-center gap-2 items-center shadow-lg shadow-green-100 disabled:opacity-50"
                >
                    <span>💬</span> Enviar a mi Asesor
                </button>

                <p className="text-[10px] text-center text-slate-400 leading-tight pt-2">
                    * Precios sujetos a cambios. Validez 3 días.
                </p>
            </div>

        </div>
    );
}
