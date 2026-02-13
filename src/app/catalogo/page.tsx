import { getCatalogoMotos } from "@/lib/firestore";
import MotoCard from "@/components/MotoCard";
import type { Metadata } from "next";

export const dynamic = 'force-dynamic'; // ⚡ BYPASS BUILD PRERENDERING

export const metadata: Metadata = {
    title: "Catálogo de Motos | Tienda Las Motos",
    description: "Explora nuestro catálogo completo de motocicletas. Encuentra la moto perfecta para ti con las mejores marcas y modelos del mercado.",
    keywords: "motos Colombia, catálogo motos, comprar moto, motos nuevas, motocicletas",
};

export const revalidate = 3600;

/**
 * Catalogo Page
 * ...
 */
export default async function CatalogoPage() {
    const motos = await getCatalogoMotos();

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Hero Section */}
            <section className="bg-brand-blue text-white py-16 px-4">
                <div className="container mx-auto text-center">
                    <h1 className="text-4xl md:text-5xl font-black mb-4 uppercase tracking-tight">
                        Nuestro <span className="text-brand-yellow">Catálogo</span>
                    </h1>
                    <p className="text-lg md:text-xl text-blue-100 max-w-2xl mx-auto leading-relaxed">
                        Descubre la mejor selección de motocicletas. Calidad, potencia y estilo en cada modelo.
                    </p>
                    <div className="mt-6 text-sm text-blue-200">
                        <span className="font-semibold">{motos.length}</span> {motos.length === 1 ? 'moto disponible' : 'motos disponibles'}
                    </div>
                </div>
            </section>

            {/* Catalog Grid */}
            <section className="py-16 px-4">
                <div className="container mx-auto">
                    {motos.length === 0 ? (
                        <div className="text-center py-20">
                            <div className="text-6xl mb-4">🏍️</div>
                            <h2 className="text-2xl font-bold text-slate-700 mb-2">
                                Catálogo en Actualización
                            </h2>
                            <p className="text-slate-500">
                                Estamos preparando nuevos modelos para ti. Vuelve pronto.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                            {motos.map((moto) => (
                                <MotoCard key={moto.id} moto={moto} />
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-16 px-4 bg-gradient-to-r from-brand-blue to-blue-800 text-white">
                <div className="container mx-auto text-center max-w-3xl">
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">
                        ¿Encontraste Tu Moto Ideal?
                    </h2>
                    <p className="text-lg text-blue-100 mb-8">
                        Calcula tu cuota mensual y descubre las opciones de financiación disponibles.
                    </p>
                    <a
                        href="/presupuesto"
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-slate-900 font-bold py-4 px-8 rounded-full transition-all hover:scale-105 shadow-[0_0_30px_rgba(251,146,60,0.5)]"
                    >
                        🧮 CALCULA TU CUOTA AHORA
                    </a>
                </div>
            </section>
        </div>
    );
}
