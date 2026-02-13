import { getCatalogoMotos } from "@/lib/firestore";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { City, SoatRate, FinancialEntity } from "@/types/financial";
import SmartQuotaSlider from "@/components/SmartQuotaSlider";
import type { Metadata } from "next";

export const dynamic = 'force-dynamic'; // ⚡ BYPASS BUILD PRERENDERING

export const metadata: Metadata = {
    title: "Calcula Tu Cuota | Tienda Las Motos",
    description: "Calcula la cuota mensual de tu moto ideal. Simulador de financiación con múltiples entidades financieras. Obtén tu presupuesto personalizado al instante.",
    keywords: "calculadora cuota moto, financiación motos Colombia, simulador crédito moto, presupuesto moto",
};

// ... rest of file (revalidate is ignored when force-dynamic is on, but keeping it doesn't hurt)
export const revalidate = 3600;

/**
 * Presupuesto Page (Public)
 * ...
 */
export default async function PresupuestoPage() {
    // Fetch all necessary data for the calculator
    const motos = await getCatalogoMotos();

    const citiesSnap = await getDocs(query(collection(db, "financial_config/general/cities")));
    const cities = citiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as City));

    const soatSnap = await getDocs(query(collection(db, "financial_config/general/tarifas_soat")));
    const soatRates = soatSnap.docs.map(d => ({ id: d.id, ...d.data() } as SoatRate));

    const finSnap = await getDocs(query(collection(db, "financial_config/general/financieras")));
    const financialEntities = finSnap.docs.map(d => ({ id: d.id, ...d.data() } as FinancialEntity));

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
            {/* Hero Section */}
            <section className="bg-brand-blue text-white py-16 px-4">
                <div className="container mx-auto max-w-4xl text-center">
                    <h1 className="text-4xl md:text-5xl font-black mb-4 uppercase tracking-tight">
                        Calcula <span className="text-brand-yellow">Tu Cuota</span>
                    </h1>
                    <p className="text-lg md:text-xl text-blue-100 max-w-2xl mx-auto leading-relaxed">
                        Descubre cuánto pagarías mensualmente por la moto de tus sueños.
                        Simulador en tiempo real con múltiples opciones de financiación.
                    </p>
                </div>
            </section>

            {/* Calculator Section */}
            <section className="py-12 px-4">
                <div className="container mx-auto max-w-4xl">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8">
                        <SmartQuotaSlider
                            motos={motos}
                            cities={cities}
                            soatRates={soatRates}
                            financialEntities={financialEntities}
                        />
                    </div>
                </div>
            </section>

            {/* Trust Signals / Benefits Section */}
            <section className="py-16 px-4 bg-white">
                <div className="container mx-auto max-w-6xl">
                    <h2 className="text-3xl font-bold text-center text-brand-blue mb-12">
                        ¿Por Qué Financiar Con Nosotros?
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="text-center p-6">
                            <div className="w-16 h-16 bg-brand-yellow/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-3xl">🚀</span>
                            </div>
                            <h3 className="font-bold text-lg mb-2 text-slate-900">Aprobación Rápida</h3>
                            <p className="text-slate-600 text-sm">
                                Proceso ágil y sin complicaciones. Respuesta en minutos.
                            </p>
                        </div>
                        <div className="text-center p-6">
                            <div className="w-16 h-16 bg-brand-yellow/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-3xl">💰</span>
                            </div>
                            <h3 className="font-bold text-lg mb-2 text-slate-900">Mejores Tasas</h3>
                            <p className="text-slate-600 text-sm">
                                Trabajamos con las principales entidades financieras del país.
                            </p>
                        </div>
                        <div className="text-center p-6">
                            <div className="w-16 h-16 bg-brand-yellow/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-3xl">🤝</span>
                            </div>
                            <h3 className="font-bold text-lg mb-2 text-slate-900">Asesoría Personalizada</h3>
                            <p className="text-slate-600 text-sm">
                                Te acompañamos en cada paso del proceso de financiación.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
