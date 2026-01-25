import { getCatalogoMotos } from "@/lib/firestore";
import MotoCard from "@/components/MotoCard";
import Image from "next/image";
import StickyBar from "@/components/StickyBar";
import SmartQuotaSlider from "@/components/SmartQuotaSlider";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { City, SoatRate, FinancialEntity } from "@/types/financial";

export const revalidate = 3600; // Revalidate every hour

export default async function Home() {
    const motos = await getCatalogoMotos();

    // Fetch Config Data for Calculator
    const citiesSnap = await getDocs(query(collection(db, "financial_config/general/cities")));
    const cities = citiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as City));

    const soatSnap = await getDocs(query(collection(db, "financial_config/general/tarifas_soat")));
    const soatRates = soatSnap.docs.map(d => ({ id: d.id, ...d.data() } as SoatRate));

    const finSnap = await getDocs(query(collection(db, "financial_config/general/financieras")));
    const financialEntities = finSnap.docs.map(d => ({ id: d.id, ...d.data() } as FinancialEntity));

    return (
        <div className="min-h-screen flex flex-col font-sans">
            <main className="flex-grow">
                {/* HERO SECTION */}
                <section className="relative h-screen w-full flex items-center justify-center overflow-hidden">
                    {/* Background Image - Placeholder or Gradient if no image */}
                    <div className="absolute inset-0 bg-slate-100">
                        {/* Light gradient for vitrina feel */}
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-50 via-slate-100 to-slate-200 opacity-80 z-0"></div>
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-t from-slate-100 via-transparent to-transparent z-10"></div>

                    <div className="relative z-20 container mx-auto px-4 text-center md:text-left">
                        <h1 className="text-5xl md:text-7xl font-black text-slate-900 mb-6 uppercase leading-tight tracking-tight drop-shadow-sm">
                            Domina <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-red to-brand-blue">
                                El Asfalto
                            </span>
                        </h1>
                        <p className="text-lg md:text-2xl text-slate-700 max-w-2xl mb-8 leading-relaxed font-medium">
                            Descubre la mejor selección de máquinas de alto rendimiento.
                            Potencia, diseño y libertad en cada kilómetro.
                        </p>
                        <div className="flex flex-col md:flex-row gap-4">
                            <a href="/catalogo" className="bg-brand-yellow hover:bg-yellow-400 text-slate-900 font-bold py-4 px-8 rounded-full transition-all hover:scale-105 shadow-[0_0_20px_rgba(252,209,22,0.5)]">
                                VER CATÁLOGO
                            </a>
                            <a href="/presupuesto" className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-slate-900 font-bold py-4 px-8 rounded-full transition-all hover:scale-105 shadow-[0_0_20px_rgba(251,146,60,0.4)]">
                                CALCULA TU CUOTA
                            </a>
                        </div>
                    </div>
                </section>

                {/* CALCULATOR SECTION */}
                <section className="py-16 bg-white relative z-30 -mt-10 px-4">
                    <div className="container mx-auto max-w-4xl">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl md:text-4xl font-bold text-brand-blue mb-2">
                                Simulador de Cuotas
                            </h2>
                            <p className="text-slate-600">
                                Calcula tu cuota mensual en tiempo real
                            </p>
                        </div>
                        <SmartQuotaSlider
                            motos={motos}
                            cities={cities}
                            soatRates={soatRates}
                            financialEntities={financialEntities}
                        />
                    </div>
                </section>

                {/* FEATURED CATALOG - Show limited motos */}
                <section id="catalogo" className="py-20 bg-slate-50">
                    <div className="container mx-auto px-4">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-4xl font-bold text-brand-blue mb-4 uppercase tracking-wide">
                                Motos Destacadas
                            </h2>
                            <div className="h-1 w-24 bg-brand-red mx-auto"></div>
                        </div>

                        {motos.length === 0 ? (
                            <div className="text-center py-20 text-slate-500">
                                <p className="text-xl">Cargando inventario o inventario vacío...</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                    {motos.slice(0, 8).map((moto) => (
                                        <MotoCard key={moto.id} moto={moto} />
                                    ))}
                                </div>

                                {/* Link to full catalog */}
                                {motos.length > 8 && (
                                    <div className="text-center mt-12">
                                        <a
                                            href="/catalogo"
                                            className="inline-flex items-center gap-2 bg-brand-blue hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full transition-all hover:scale-105 shadow-lg"
                                        >
                                            Ver Catálogo Completo ({motos.length} motos)
                                        </a>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </section>
            </main>

            {/* STICKY ACTION BAR (Mobile Only) */}
            <StickyBar />
        </div>
    );
}
