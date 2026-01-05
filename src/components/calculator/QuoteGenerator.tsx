"use client";

import { useState, useEffect } from "react";
import { Moto } from "@/types";
import { City, SoatRate, FinancialEntity, FinancialMatrix } from "@/types/financial";
import { calculateQuote, QuoteResult } from "@/lib/utils/calculator";
import { addDoc, collection, serverTimestamp, getDocs, limit, orderBy, query, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CreditSimulation } from "@/types";
// import jsPDF from "jspdf"; // Will need to install: npm i jspdf jspdf-autotable
// import autoTable from "jspdf-autotable";

interface Props {
    moto: Moto;
    cities: City[];
    soatRates: SoatRate[];
    financialEntities: FinancialEntity[];
}

export default function QuoteGenerator({ moto, cities, soatRates, financialEntities }: Props) {
    const [selectedCityId, setSelectedCityId] = useState<string>(cities[0]?.id || "");
    const [paymentMethod, setPaymentMethod] = useState<'credit' | 'cash'>('credit');
    const [selectedFinancialId, setSelectedFinancialId] = useState<string>(financialEntities[0]?.id || "");
    const [months, setMonths] = useState<number>(48);
    const [downPayment, setDownPayment] = useState<number>(0);

    const [ticket, setTicket] = useState<number | null>(null);
    const [matrix, setMatrix] = useState<FinancialMatrix | undefined>(undefined);

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

    // Default Down Payment (20%)
    useEffect(() => {
        if (!moto || downPayment > 0) return;

        // Safe access to legacy registration cost or 0
        const city = cities.find(c => c.id === selectedCityId);
        const regCost = city?.registrationCost?.credit || 0; // Fixed: Optional chaining

        const base = moto.precio + regCost;
        setDownPayment(Math.floor(base * 0.20));
    }, [moto.id, selectedCityId, cities, downPayment]); // Added missing deps

    const [quote, setQuote] = useState<QuoteResult | null>(null);

    useEffect(() => {
        if (!selectedCityId || !moto) return;

        const city = cities.find(c => c.id === selectedCityId);
        if (!city) return;

        const financialEntity = financialEntities.find(f => f.id === selectedFinancialId);

        const result = calculateQuote(
            moto,
            city,
            soatRates,
            paymentMethod,
            paymentMethod === 'credit' ? financialEntity : undefined,
            months,
            downPayment,
            matrix // Pass matrix
        );

        setQuote(result);
    }, [selectedCityId, paymentMethod, selectedFinancialId, months, downPayment, moto, cities, soatRates, financialEntities, matrix]);

    if (!quote) return null;

    // -- HANDLERS --

    const saveSimulation = async (): Promise<number> => {
        if (!quote) return 0;

        try {
            // 1. Get next ticket number
            const q = query(collection(db, "credit_simulations"), orderBy("ticketNumber", "desc"), limit(1));
            const querySnapshot = await getDocs(q);
            let nextTicket = 1000;
            if (!querySnapshot.empty) {
                const lastData = querySnapshot.docs[0].data();
                nextTicket = (lastData.ticketNumber || 1000) + 1;
            }

            // 2. Save Simulation
            const simData: Omit<CreditSimulation, 'id'> = {
                ticketNumber: nextTicket,
                createdAt: serverTimestamp() as any,
                motoId: moto.id,
                cityId: selectedCityId,
                financialEntityId: selectedFinancialId,
                snapshot: {
                    motoPrice: quote.vehiclePrice,
                    registrationPrice: quote.registrationPrice,
                    soatPrice: quote.soatPrice,
                    interestRate: quote.interestRate || 0,
                    lifeInsuranceRate: 0.1126, // Should come from config/constants
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
            return 0; // Fallback
        }
    };

    const handleDownloadPDF = async () => {
        if (!quote) return;
        const ticketNum = await saveSimulation();

        // Dynamic import to avoid SSR issues with jspdf
        const jsPDF = (await import('jspdf')).default;
        const autoTable = (await import('jspdf-autotable')).default;

        const doc = new jsPDF();

        // Header
        doc.setFontSize(22);
        doc.setTextColor(0, 56, 147); // Brand Blue
        doc.text("Tienda Las Motos", 14, 20);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Ticket #${ticketNum} | Fecha: ${new Date().toLocaleDateString()}`, 14, 26);

        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text(`Cotización: ${moto.marca} ${moto.referencia}`, 14, 35);

        // Table
        const tableData: any[] = [
            ["Concepto", "Valor"],
            ["Precio Moto", `$ ${quote.vehiclePrice.toLocaleString()}`],
            ["SOAT + Runt", `$ ${quote.soatPrice.toLocaleString()}`],
            ["Matrícula", `$ ${quote.registrationPrice.toLocaleString()}`],
            ["Gestión Documental", `$ ${quote.documentationFee.toLocaleString()}`],
            ["Ajuste Especial", `$ ${quote.specialAdjustment.toLocaleString()}`],
        ];

        if (quote.isCredit) {
            tableData.push(
                ["Garantia Mobiliaria", `$ ${quote.movableGuaranteeCost?.toLocaleString()}`],
                ["Seguro de Vida (Est. Total)", `$ ${((quote.lifeInsuranceValue || 0) * (quote.months || 0)).toLocaleString()}`], // Show total estimated? Or monthly? Usually hidden in quota or shown as "Incluido"
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

        const phone = "573008603210"; // Default commercial number or dynamic
        let text = `Hola, me interesa la *${moto.marca} ${moto.referencia}*.\n`;
        text += `Ticket: *#${ticketNum}*\n\n`;
        text += `*Ciudad:* ${cities.find(c => c.id === selectedCityId)?.name}\n`;
        text += `*Modalidad:* ${paymentMethod === 'credit' ? 'Crédito' : 'Contado'}\n`;
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad de Matrícula</label>
                    <select
                        className="w-full p-2 border rounded-xl bg-gray-50"
                        value={selectedCityId}
                        onChange={(e) => setSelectedCityId(e.target.value)}
                    >
                        {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>

                <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button
                        onClick={() => setPaymentMethod('credit')}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${paymentMethod === 'credit' ? 'bg-white shadow text-brand-blue' : 'text-gray-500'}`}
                    >
                        Crédito
                    </button>
                    <button
                        onClick={() => setPaymentMethod('cash')}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${paymentMethod === 'cash' ? 'bg-white shadow text-green-600' : 'text-gray-500'}`}
                    >
                        Contado
                    </button>
                </div>

                {paymentMethod === 'credit' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Entidad Financiera</label>
                            <select
                                className="w-full p-2 border rounded-xl bg-gray-50"
                                value={selectedFinancialId}
                                onChange={(e) => setSelectedFinancialId(e.target.value)}
                            >
                                {financialEntities.map(f => <option key={f.id} value={f.id}>{f.name} ({f.monthlyRate}%)</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cuota Inicial (Sugerido 20%)</label>
                            <input
                                type="number"
                                className="w-full p-2 border rounded-xl bg-gray-50"
                                value={downPayment}
                                onChange={(e) => setDownPayment(Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Plazo: {months} meses</label>
                            <input
                                type="range" min="12" max="72" step="12"
                                className="w-full accent-brand-blue"
                                value={months}
                                onChange={(e) => setMonths(Number(e.target.value))}
                            />
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
                    <span className="text-gray-500">Matrícula + Trámites</span>
                    <span className="font-medium">${(quote.registrationPrice + quote.documentationFee).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-500">SOAT</span>
                    <span className="font-medium">${quote.soatPrice.toLocaleString()}</span>
                </div>

                <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between text-lg font-bold text-gray-900">
                        <span>Total Proyecto</span>
                        <span>${quote.subtotal.toLocaleString()}</span>
                    </div>
                    {quote.isCredit && (
                        <div className="flex justify-between text-brand-blue font-bold mt-1">
                            <span>Cuota Mensual</span>
                            <span>${quote.monthlyPayment?.toLocaleString()}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ACTIONS */}
            <div className="space-y-3">
                <button
                    onClick={handleDownloadPDF}
                    className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold hover:bg-black transition-colors flex justify-center gap-2"
                >
                    📄 Descargar Cotización PDF
                </button>
                <button
                    onClick={handleWhatsapp}
                    className="w-full bg-green-500 text-white py-3 rounded-xl font-bold hover:bg-green-600 transition-colors flex justify-center gap-2"
                >
                    💬 Enviar a mi Asesor
                </button>
            </div>

        </div>
    );
}
