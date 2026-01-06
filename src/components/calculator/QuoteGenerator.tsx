"use client";

import { useState, useEffect } from "react";
import { Moto } from "@/types";
import { City, SoatRate, FinancialEntity, FinancialMatrix } from "@/types/financial";
import { calculateQuote, QuoteResult } from "@/lib/utils/calculator";
import { addDoc, collection, serverTimestamp, getDocs, limit, orderBy, query, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CreditSimulation } from "@/types";

interface Props {
    moto: Moto;
    cities?: City[]; // Deprecated, keeping signature valid for now
    soatRates: SoatRate[];
    financialEntities: FinancialEntity[];
}

import { FINANCIAL_SCENARIOS } from "@/lib/constants";

export default function QuoteGenerator({ moto, soatRates, financialEntities }: Props) {
    const [selectedScenarioId, setSelectedScenarioId] = useState<string>(FINANCIAL_SCENARIOS[0].id);
    const [selectedFinancialId, setSelectedFinancialId] = useState<string>(financialEntities[0]?.id || "");
    const [months, setMonths] = useState<number>(48);
    const [downPayment, setDownPayment] = useState<number>(0);
    const [downPaymentStr, setDownPaymentStr] = useState<string>(""); // Masked state
    const [filterText, setFilterText] = useState(""); // Search State
    const [ticket, setTicket] = useState<number | null>(null);
    const [matrix, setMatrix] = useState<FinancialMatrix | undefined>(undefined);

    // Derived States
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

    // Default Down Payment (10%) - Reset on moto change
    useEffect(() => {
        if (moto) {
            const def = Math.floor(moto.precio * 0.10);
            setDownPayment(def);
            setDownPaymentStr(def.toLocaleString('es-CO'));
        }
    }, [moto.id]);

    // Filtered Motos (Search Logic)
    // If 'moto' prop is provided single, this might be redundant if this component is used for list too?
    // Wait, QuoteGenerator takes a SINGLE 'moto' prop currently?
    // Checking props... YES: export default function QuoteGenerator({ moto, ... }: Props)
    // If it takes a single moto, then "Searchable Select" implies we want to SELECT from a list?
    // The previous code didn't have a moto selector. It was fixed to 'moto'.
    // BUT the user request says: "Optimización del Selector de Máquina... Buscador Integrado".
    // This implies `QuoteGenerator` *SHOULD* allow selecting DIFFERENT motos, or `SmartQuotaSlider` (which has a list) is the target.
    // However, I put `QuoteGenerator` on the Product Page where the moto is fixed?
    // User request: "intervención inmediata en el componente del simulador (QuoteGenerator.tsx y SmartQuotaSlider.tsx)".
    // `SmartQuotaSlider` DOES have a list `motos: Moto[]`. `QuoteGenerator` currently has `moto: Moto`.
    // I should probably apply this search logic to `SmartQuotaSlider`. `QuoteGenerator` might NOT need a selector if it's for a specific moto?
    // OR, should `QuoteGenerator` also learn to select?
    // "Elige tu máquina" is in SmartQuotaSlider (Lines 119-134 of SmartQuotaSlider).
    // QuoteGenerator (Lines 20) receives `moto`. It does NOT have a selector.
    // Verify file content I viewed earlier...
    // SmartQuotaSlider DOES have the selector.
    // QuoteGenerator DOES NOT.
    // I will apply the search logic to `SmartQuotaSlider` in the next step. 
    // For `QuoteGenerator`, I will apply Contrast, Scenarios, and Slider fixes ONLY.

    // Changing Slider Max to 60
    // Changing Text Colors
    const [quote, setQuote] = useState<QuoteResult | null>(null);


    useEffect(() => {
        if (!moto) return;

        const financialEntity = financialEntities.find(f => f.id === selectedFinancialId);

        // Construct a Mock City object for the calculator logic
        // The calculator needs { name: string, ... } to trigger "includes('Santa Marta')" etc.
        const mockCity: City = {
            id: activeScenario.id,
            name: activeScenario.cityName,
            department: 'Magdalena', // Placeholder
            isActive: true,
            documentationFee: 0 // Default for mock
        };

        console.log("Triggering Calculation with:", {
            moto: moto.referencia,
            price: moto.precio,
            scenario: activeScenario.id,
            financialEntity: financialEntity?.name || "None (Using Fallback)",
            months,
            downPayment
        });

        const result = calculateQuote(
            moto,
            mockCity,
            soatRates,
            activeScenario.method,
            isCredit ? financialEntity : undefined,
            months,
            downPayment,
            matrix
        );

        setQuote(result);
    }, [selectedScenarioId, selectedFinancialId, months, downPayment, moto, soatRates, financialEntities, matrix, activeScenario, isCredit]);

    if (!quote) return null;

    // -- HANDLERS (Same as before, updated to use activeScenario) --

    const saveSimulation = async (): Promise<number> => {
        if (!quote) return 0;

        try {
            const q = query(collection(db, "credit_simulations"), orderBy("ticketNumber", "desc"), limit(1));
            const querySnapshot = await getDocs(q);
            let nextTicket = 1000;
            if (!querySnapshot.empty) {
                const lastData = querySnapshot.docs[0].data();
                nextTicket = (lastData.ticketNumber || 1000) + 1;
            }

            const simData: Omit<CreditSimulation, 'id'> = {
                ticketNumber: nextTicket,
                createdAt: serverTimestamp() as any,
                motoId: moto.id,
                cityId: activeScenario.id, // Saving Scenario ID as CityId
                financialEntityId: selectedFinancialId,
                snapshot: {
                    motoPrice: quote.vehiclePrice,
                    registrationPrice: quote.registrationPrice,
                    soatPrice: quote.soatPrice,
                    interestRate: quote.interestRate || 0,
                    lifeInsuranceRate: 0.1126,
                    movableGuaranteePrice: 120000,
                    specialAdjustment: quote.specialAdjustment
                },
                results: {
                    totalValue: quote.total,
                    downPayment: quote.downPayment,
                    loanAmount: quote.loanAmount,
                    monthlyPayment: quote.monthlyPayment || 0,
                    months: quote.months || 0
                }
            };

            await addDoc(collection(db, "credit_simulations"), simData);
            setTicket(nextTicket);
            return nextTicket;
        } catch (e) {
            console.error("Error saving simulation:", e);
            return 0;
        }
    };

    const handleDownloadPDF = async () => {
        if (!quote) return;
        const ticketNum = await saveSimulation();
        const jsPDF = (await import('jspdf')).default;
        const autoTable = (await import('jspdf-autotable')).default;

        const doc = new jsPDF();
        doc.setFontSize(22);
        doc.setTextColor(0, 56, 147);
        doc.text("Tienda Las Motos", 14, 20);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Ticket #${ticketNum} | Fecha: ${new Date().toLocaleDateString()}`, 14, 26);

        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text(`Cotización: ${moto.marca} ${moto.referencia}`, 14, 35);

        const tableData: any[] = [
            ["Concepto", "Valor"],
            ["Precio Moto", `$ ${quote.vehiclePrice.toLocaleString()}`],
            ["Matrícula + SOAT + Trámites", `$ ${quote.registrationPrice.toLocaleString()}`],
            ["Matrícula", `$ ${quote.registrationPrice.toLocaleString()}`],
            ["Gestión Documental", `$ ${quote.documentationFee.toLocaleString()}`],
            ["Ajuste Especial", `$ ${quote.specialAdjustment.toLocaleString()}`],
        ];

        if (quote.isCredit) {
            tableData.push(
                ["Garantia Mobiliaria", `$ ${quote.movableGuaranteeCost?.toLocaleString()}`],
                ["Seguro de Vida (Est. Total)", `$ ${((quote.lifeInsuranceValue || 0) * (quote.months || 0)).toLocaleString()}`],
            );
        }

        tableData.push(
            [{ content: "VALOR TOTAL PROYECTO", styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }, `$ ${quote.subtotal.toLocaleString()}`]
        );

        if (quote.isCredit) {
            tableData.push(
                ["", ""],
                [{ content: "PLAN DE FINANCIACIÓN", styles: { fontStyle: 'bold', textColor: [0, 56, 147] } }, ""],
                ["Cuota Inicial", `$ ${quote.downPayment.toLocaleString()}`],
                ["Monto a Financiar", `$ ${quote.loanAmount.toLocaleString()}`],
                ["Tasa Mensual", `${quote.interestRate}%`],
                [{ content: "CUOTA MENSUAL ESTIMADA", styles: { fontStyle: 'bold', fillColor: [252, 209, 22] } }, `$ ${quote.monthlyPayment?.toLocaleString()}`],
                ["Plazo", `${quote.months} meses`]
            );
        } else {
            tableData.push(
                [{ content: "TOTAL A PAGAR (Contado)", styles: { fontStyle: 'bold', fillColor: [252, 209, 22] } }, `$ ${quote.subtotal.toLocaleString()}`]
            );
        }

        autoTable(doc, {
            startY: 40,
            head: [['Concepto', 'Valor']],
            body: tableData.slice(1),
            theme: 'grid',
            styles: { fontSize: 11 },
            headStyles: { fillColor: [0, 56, 147] }
        });

        doc.save(`Cotizacion_${moto.referencia}_${ticketNum}.pdf`);
    };

    const handleWhatsapp = async () => {
        if (!quote) return;
        const ticketNum = await saveSimulation();

        const phone = "573008603210";
        let text = `Hola, me interesa la *${moto.marca} ${moto.referencia}*.\n`;
        text += `Ticket: *#${ticketNum}*\n\n`;
        text += `*Modalidad:* ${activeScenario.label}\n`;
        text += `*Precio Proyecto:* $${quote.subtotal.toLocaleString()}\n`;

        if (quote.isCredit) {
            const daily = Math.round((quote.monthlyPayment || 0) / 30);
            text += `*Cuota Inicial:* $${downPayment.toLocaleString()}\n`;
            text += `*Cuota Mensual:* $${quote.monthlyPayment?.toLocaleString()}\n`;
            text += `*Cuota Diaria Aprox:* $${daily.toLocaleString()}\n`;
            text += `*Plazo:* ${months} meses\n`;
        } else {
            text += `*Total a Pagar:* $${quote.total.toLocaleString()}\n`;
        }

        text += `\nGeneré esta cotización en la página web. Quiero asesoría.`;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    };

    return (
        <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 max-w-md mx-auto sticky top-4">
            <h3 className="text-xl font-bold mb-4 text-brand-blue">Simulador de Crédito</h3>

            {/* CONTROLS */}
            <div className="space-y-4 mb-6">
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
                                    className="w-full p-2 pl-6 border rounded-xl bg-gray-50 font-bold text-gray-900"
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
                        </div>

                        <div>
                            <div className="flex justify-between mb-1">
                                <label className="text-sm font-bold text-gray-900">Plazo</label>
                                <span className="text-sm font-bold text-brand-blue">{months} meses</span>
                            </div>
                            <input
                                type="range" min="12" max="60" step="12"
                                className="w-full accent-brand-blue cursor-pointer"
                                value={months}
                                onChange={(e) => setMonths(Number(e.target.value))}
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>12</span>
                                <span>24</span>
                                <span>36</span>
                                <span>48</span>
                                <span>12</span>
                                <span>24</span>
                                <span>36</span>
                                <span>48</span>
                                <span>60</span>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* SUMMARY */}
            <div className="bg-gray-50 p-4 rounded-xl space-y-2 mb-6 text-sm">
                <div className="flex justify-between">
                    <span className="text-gray-500">Precio Moto</span>
                    <span className="font-medium">${quote.vehiclePrice.toLocaleString()}</span>
                </div>

                <div className="flex justify-between">
                    <span className="text-gray-500">Valor Trámites (Incluye SOAT)</span>
                    <span className="font-medium">${(quote.registrationPrice + quote.documentationFee).toLocaleString()}</span>
                </div>

                <div className="border-t border-gray-200 pt-3 mt-3">
                    <div className="flex justify-between text-lg font-bold text-gray-900">
                        <span>Total Proyecto</span>
                        <span>${quote.subtotal.toLocaleString()}</span>
                    </div>
                    {quote.isCredit && (
                        <>
                            <div className="flex justify-between text-brand-blue font-black mt-2 bg-blue-50 p-2 rounded-lg">
                                <span className="text-slate-900 font-bold">CUOTA MENSUAL APROX.</span>
                                <span className="text-slate-900 font-extrabold text-xl">${quote.monthlyPayment?.toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-slate-500 italic mt-1 text-right">* Valor aproximado sujeto a estudio de crédito</p>
                        </>
                    )}
                </div>
            </div>

            {/* ACTIONS */}
            <div className="space-y-3">
                <button
                    onClick={handleDownloadPDF}
                    className="w-full bg-gray-900 text-white py-3.5 rounded-xl font-bold hover:bg-black transition-colors flex justify-center gap-2 items-center shadow-lg shadow-gray-200"
                >
                    <span>📄</span> Descargar Cotización PDF
                </button>
                <button
                    onClick={handleWhatsapp}
                    className="w-full bg-[#25D366] text-white py-3.5 rounded-xl font-bold hover:bg-[#20bd5a] transition-colors flex justify-center gap-2 items-center shadow-lg shadow-green-100"
                >
                    <span>💬</span> Enviar a mi Asesor
                </button>

                <p className="text-[10px] text-center text-slate-400 leading-tight pt-2">
                    La información presentada es un cálculo aproximado (cumple con las condiciones de la Ley 546 de 1999) basado en la información suministrada y no constituye compromiso de otorgamiento de crédito.
                </p>
            </div>

        </div>
    );
}
