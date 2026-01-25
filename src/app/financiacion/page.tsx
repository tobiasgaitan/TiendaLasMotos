import type { Metadata } from "next";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FinancialEntity } from "@/types/financial";
import { Calculator, TrendingUp, Shield, Clock } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Financiación de Motos | Tienda Las Motos",
    description: "Opciones de financiación flexibles para tu moto. Trabaja con las mejores entidades financieras de Colombia. Aprobación rápida y tasas competitivas.",
    keywords: "financiación motos, crédito moto Colombia, préstamo moto, cuotas moto",
};

export const revalidate = 3600; // Revalidate every hour

/**
 * Financiacion Page
 * 
 * Displays financing information and options for motorcycle purchases.
 * Shows partner financial entities and benefits of financing with Tienda Las Motos.
 * 
 * @returns {Promise<JSX.Element>} The financing page
 */
export default async function FinanciacionPage() {
    // Fetch financial entities to display partners
    const finSnap = await getDocs(query(collection(db, "financial_config/general/financieras")));
    const financialEntities = finSnap.docs.map(d => ({ id: d.id, ...d.data() } as FinancialEntity));

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Hero Section */}
            <section className="bg-gradient-to-r from-brand-blue to-blue-800 text-white py-20 px-4">
                <div className="container mx-auto max-w-4xl text-center">
                    <h1 className="text-4xl md:text-6xl font-black mb-6 uppercase tracking-tight">
                        Financiación <span className="text-brand-yellow">A Tu Medida</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-blue-100 max-w-3xl mx-auto leading-relaxed mb-8">
                        Cumple tu sueño de tener moto propia con nuestras opciones de financiación flexibles.
                        Trabajamos con las mejores entidades del país.
                    </p>
                    <Link
                        href="/presupuesto"
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-slate-900 font-bold py-4 px-8 rounded-full transition-all hover:scale-105 shadow-[0_0_30px_rgba(251,146,60,0.5)]"
                    >
                        <Calculator className="w-5 h-5" />
                        CALCULA TU CUOTA
                    </Link>
                </div>
            </section>

            {/* Benefits Section */}
            <section className="py-16 px-4">
                <div className="container mx-auto max-w-6xl">
                    <h2 className="text-3xl md:text-4xl font-bold text-center text-brand-blue mb-12">
                        Ventajas de Financiar Con Nosotros
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
                            <div className="w-14 h-14 bg-brand-yellow/10 rounded-full flex items-center justify-center mb-4">
                                <Clock className="w-7 h-7 text-brand-blue" />
                            </div>
                            <h3 className="font-bold text-xl mb-3 text-slate-900">Aprobación Rápida</h3>
                            <p className="text-slate-600 leading-relaxed">
                                Proceso ágil y sin complicaciones. Obtén respuesta en minutos y llévate tu moto el mismo día.
                            </p>
                        </div>

                        <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
                            <div className="w-14 h-14 bg-brand-yellow/10 rounded-full flex items-center justify-center mb-4">
                                <TrendingUp className="w-7 h-7 text-brand-blue" />
                            </div>
                            <h3 className="font-bold text-xl mb-3 text-slate-900">Tasas Competitivas</h3>
                            <p className="text-slate-600 leading-relaxed">
                                Trabajamos con múltiples entidades financieras para ofrecerte las mejores tasas del mercado.
                            </p>
                        </div>

                        <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
                            <div className="w-14 h-14 bg-brand-yellow/10 rounded-full flex items-center justify-center mb-4">
                                <Shield className="w-7 h-7 text-brand-blue" />
                            </div>
                            <h3 className="font-bold text-xl mb-3 text-slate-900">Seguridad Total</h3>
                            <p className="text-slate-600 leading-relaxed">
                                Proceso transparente y seguro. Todas nuestras alianzas están reguladas y certificadas.
                            </p>
                        </div>

                        <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
                            <div className="w-14 h-14 bg-brand-yellow/10 rounded-full flex items-center justify-center mb-4">
                                <span className="text-3xl">🤝</span>
                            </div>
                            <h3 className="font-bold text-xl mb-3 text-slate-900">Asesoría Experta</h3>
                            <p className="text-slate-600 leading-relaxed">
                                Te acompañamos en cada paso. Nuestro equipo te ayuda a elegir la mejor opción para ti.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Financial Partners Section */}
            {financialEntities.length > 0 && (
                <section className="py-16 px-4 bg-white">
                    <div className="container mx-auto max-w-6xl">
                        <h2 className="text-3xl md:text-4xl font-bold text-center text-brand-blue mb-4">
                            Nuestros Aliados Financieros
                        </h2>
                        <p className="text-center text-slate-600 mb-12 max-w-2xl mx-auto">
                            Trabajamos con las entidades financieras más confiables de Colombia para ofrecerte múltiples opciones.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {financialEntities.map((entity) => (
                                <div
                                    key={entity.id}
                                    className="bg-slate-50 rounded-lg p-6 flex items-center justify-center border border-slate-200 hover:border-brand-blue hover:shadow-md transition-all"
                                >
                                    <span className="font-bold text-lg text-slate-700">
                                        {entity.name}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* How It Works Section */}
            <section className="py-16 px-4 bg-slate-100">
                <div className="container mx-auto max-w-4xl">
                    <h2 className="text-3xl md:text-4xl font-bold text-center text-brand-blue mb-12">
                        ¿Cómo Funciona?
                    </h2>
                    <div className="space-y-6">
                        <div className="flex gap-4 items-start">
                            <div className="flex-shrink-0 w-10 h-10 bg-brand-yellow rounded-full flex items-center justify-center font-bold text-slate-900">
                                1
                            </div>
                            <div>
                                <h3 className="font-bold text-xl mb-2 text-slate-900">Elige Tu Moto</h3>
                                <p className="text-slate-600">
                                    Explora nuestro catálogo y selecciona el modelo que más te guste.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-4 items-start">
                            <div className="flex-shrink-0 w-10 h-10 bg-brand-yellow rounded-full flex items-center justify-center font-bold text-slate-900">
                                2
                            </div>
                            <div>
                                <h3 className="font-bold text-xl mb-2 text-slate-900">Calcula Tu Cuota</h3>
                                <p className="text-slate-600">
                                    Usa nuestro simulador para ver cuánto pagarías mensualmente con diferentes opciones.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-4 items-start">
                            <div className="flex-shrink-0 w-10 h-10 bg-brand-yellow rounded-full flex items-center justify-center font-bold text-slate-900">
                                3
                            </div>
                            <div>
                                <h3 className="font-bold text-xl mb-2 text-slate-900">Solicita Tu Crédito</h3>
                                <p className="text-slate-600">
                                    Contacta con nosotros y te ayudamos a completar el proceso de aprobación.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-4 items-start">
                            <div className="flex-shrink-0 w-10 h-10 bg-brand-yellow rounded-full flex items-center justify-center font-bold text-slate-900">
                                4
                            </div>
                            <div>
                                <h3 className="font-bold text-xl mb-2 text-slate-900">¡Disfruta Tu Moto!</h3>
                                <p className="text-slate-600">
                                    Una vez aprobado, llévate tu moto y empieza a disfrutar de la libertad sobre dos ruedas.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="py-16 px-4 bg-gradient-to-r from-brand-blue to-blue-800 text-white">
                <div className="container mx-auto text-center max-w-3xl">
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">
                        ¿Listo Para Empezar?
                    </h2>
                    <p className="text-lg text-blue-100 mb-8">
                        Calcula tu cuota en segundos y descubre lo fácil que es tener tu moto propia.
                    </p>
                    <Link
                        href="/presupuesto"
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-slate-900 font-bold py-4 px-8 rounded-full transition-all hover:scale-105 shadow-[0_0_30px_rgba(251,146,60,0.5)]"
                    >
                        <Calculator className="w-5 h-5" />
                        CALCULA TU CUOTA AHORA
                    </Link>
                </div>
            </section>
        </div>
    );
}
