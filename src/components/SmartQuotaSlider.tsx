"use client";

import { useState, useEffect } from "react";
import { Moto } from "@/types";
import { City, SoatRate, FinancialEntity, FinancialMatrix } from "@/types/financial";
import { calculateQuote, QuoteResult } from "@/lib/utils/calculator";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Props {
    motos: Moto[];
    cities: City[];
    soatRates: SoatRate[];
    financialEntities: FinancialEntity[];
}

export default function SmartQuotaSlider({ motos, cities, soatRates, financialEntities }: Props) {
    // Default to first moto if available
    const [selectedMotoId, setSelectedMotoId] = useState<string>(motos[0]?.id || "");
    const [selectedCityId, setSelectedCityId] = useState<string>(cities[0]?.id || "");
    const [paymentMethod, setPaymentMethod] = useState<'credit' | 'cash'>('credit');
    const [selectedFinancialId, setSelectedFinancialId] = useState<string>(financialEntities[0]?.id || "");
    const [months, setMonths] = useState<number>(48);
    const [downPayment, setDownPayment] = useState<number>(0);
    const [quote, setQuote] = useState<QuoteResult | null>(null);
    const [matrix, setMatrix] = useState<FinancialMatrix | undefined>(undefined);

    const selectedMoto = motos.find(m => m.id === selectedMotoId);

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

    // Update Default Down Payment (20%) when moto changes
    useEffect(() => {
        if (!selectedMoto || downPayment > 0) return;
        const cityCost = cities.find(c => c.id === selectedCityId)?.registrationCost?.credit || 0;
        const base = selectedMoto.precio + cityCost;
        setDownPayment(Math.floor(base * 0.20));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMotoId, selectedCityId, cities, downPayment]); // Run once per moto/city change if downpayment is 0

    // Calculate Quote
    useEffect(() => {
        if (!selectedCityId || !selectedMoto) return;

        const city = cities.find(c => c.id === selectedCityId);
        if (!city) return;

        const financialEntity = financialEntities.find(f => f.id === selectedFinancialId);

        const result = calculateQuote(
            selectedMoto,
            city,
            soatRates,
            paymentMethod,
            paymentMethod === 'credit' ? financialEntity : undefined,
            months,
            downPayment,
            matrix // Pass matrix
        );

        setQuote(result);
    }, [selectedCityId, paymentMethod, selectedFinancialId, months, downPayment, selectedMoto, cities, soatRates, financialEntities, matrix]);

    // HANDLERS
    const handleWhatsapp = () => {
        if (!quote || !selectedMoto) return;
        const phone = "573008603210";
        let text = `Hola, me interesa la *${selectedMoto.marca} ${selectedMoto.referencia}*.\n`;
        text += `*Ciudad:* ${cities.find(c => c.id === selectedCityId)?.name}\n`;
        text += `*Modalidad:* ${paymentMethod === 'credit' ? 'Crédito' : 'Contado'}\n`;
        text += `*Precio Proyecto:* $${quote.subtotal.toLocaleString()}\n`;

        if (quote.isCredit) {
            text += `*Cuota Inicial:* $${downPayment.toLocaleString()}\n`;
            text += `*Cuota Mensual:* $${quote.monthlyPayment?.toLocaleString()}\n`;
            text += `*Plazo:* ${months} meses\n`;
        } else {
            text += `*Total a Pagar:* $${quote.total.toLocaleString()}\n`;
        }

        text += `\nGeneré esta simulación en la web. Quiero asesoría.`;
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
                {/* MOTO SELECTOR */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Elige tu Máquina</label>
                    <select
                        className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none transition-all"
                        value={selectedMotoId}
                        onChange={(e) => {
                            setSelectedMotoId(e.target.value);
                            setDownPayment(0); // Reset down payment suggestion
                        }}
                    >
                        {motos.map(m => (
                            <option key={m.id} value={m.id}>{m.referencia} - ${m.precio.toLocaleString()}</option>
                        ))}
                    </select>
                </div>

                {/* CITY & PAYMENT MODE */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ciudad</label>
                        <select
                            className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 text-sm"
                            value={selectedCityId}
                            onChange={(e) => setSelectedCityId(e.target.value)}
                        >
                            {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setPaymentMethod('credit')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${paymentMethod === 'credit' ? 'bg-white shadow text-brand-blue' : 'text-slate-400'}`}
                        >
                            Crédito
                        </button>
                        <button
                            onClick={() => setPaymentMethod('cash')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${paymentMethod === 'cash' ? 'bg-white shadow text-green-600' : 'text-slate-400'}`}
                        >
                            Contado
                        </button>
                    </div>
                </div>

                {/* CREDIT DETAILS */}
                {paymentMethod === 'credit' && (
                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cuota Inicial</label>
                            <input
                                type="number"
                                className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 font-medium"
                                value={downPayment}
                                onChange={(e) => setDownPayment(Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <div className="flex justify-between mb-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Plazo</label>
                                <span className="text-sm font-bold text-brand-blue">{months} Meses</span>
                            </div>
                            <input
                                type="range" min="12" max="72" step="12"
                                className="w-full accent-brand-blue h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                value={months}
                                onChange={(e) => setMonths(Number(e.target.value))}
                            />
                            <div className="flex justify-between text-xs text-slate-400 mt-1">
                                <span>12m</span>
                                <span>72m</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* RESULTS */}
                {quote && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-slate-500">Valor Moto</span>
                            <span className="font-bold text-slate-700">${quote.vehiclePrice.toLocaleString()}</span>
                        </div>
                        {quote.isCredit && (
                            <div className="flex justify-between items-center pt-2 border-t border-slate-200 mt-2">
                                <span className="text-sm font-bold text-brand-blue">Cuota Aprox.</span>
                                <span className="text-2xl font-black text-brand-red">${quote.monthlyPayment?.toLocaleString()}</span>
                            </div>
                        )}
                        {!quote.isCredit && (
                            <div className="flex justify-between items-center pt-2 border-t border-slate-200 mt-2">
                                <span className="text-sm font-bold text-brand-blue">Total a Pagar</span>
                                <span className="text-2xl font-black text-brand-red">${quote.total.toLocaleString()}</span>
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={handleWhatsapp}
                    className="w-full bg-brand-yellow hover:bg-yellow-400 text-slate-900 font-black py-4 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 active:translate-y-0 flex items-center justify-center gap-2"
                >
                    <span>SOLICITAR ESTUDIO GRATIS</span>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
                </button>
            </div>
        </div>
    );
}
