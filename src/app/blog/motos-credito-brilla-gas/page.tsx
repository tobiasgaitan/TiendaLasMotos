import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
    title: "Motos con el Recibo del Gas: Guía del Cupo Brilla en Santa Marta, Riohacha y Zona Bananera | Blog Auteco Las Motos",
    description: "Descubre cómo financiar tu moto Victory, TVS, Ceronte o Kawasaki con el Cupo Brilla usando tu recibo de gas. Megacupo hasta $28 millones en Magdalena y La Guajira.",
    keywords: "Cupo Brilla motos, crédito gas natural, motos Gases del Caribe, financiación Brilla Santa Marta, Brilla Riohacha, Ceronte Tricargo, Victory motos, TVS motos",
};

export const revalidate = 3600; // Revalidate every hour

/**
 * Blog Article: Motos con el Recibo del Gas (Cupo Brilla)
 * 
 * Comprehensive guide about financing motorcycles using Brilla gas credit
 * in Magdalena and La Guajira regions.
 * 
 * @returns {JSX.Element} The blog article page
 */
export default function MotosCreditorBrillaGasPage() {
    // JSON-LD structured data for SEO
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "FinancialProduct",
        "name": "Crédito Motos Cupo Brilla - Auteco Las Motos",
        "description": "Financiación no bancaria para motos Victory, TVS, Kawasaki y Ceronte con el recibo de gas en Santa Marta, Riohacha y Magdalena.",
        "provider": {
            "@type": "Organization",
            "name": "Brilla Gases del Caribe / Gases de La Guajira"
        },
        "areaServed": ["Magdalena", "La Guajira", "Santa Marta", "Riohacha", "Zona Bananera"],
        "offers": {
            "@type": "Offer",
            "priceCurrency": "COP",
            "description": "Megacupo hasta $28.000.000 con el 10% de cuota inicial."
        }
    };

    // Sedes data
    const sedes = [
        {
            ciudad: "Santa Marta - 11 de Noviembre",
            direccion: "Calle 30 # 79-85 Troncal del Caribe"
        },
        {
            ciudad: "Santa Marta - Rompoy de la Piragua",
            direccion: "Sector 1 Manzana I Casa 4 Local 4"
        },
        {
            ciudad: "Santa Marta - Gaira",
            direccion: "Carrera 4 # 20-45"
        },
        {
            ciudad: "Riohacha",
            direccion: "Calle 15 # 11A-12 Esquina (Diagonal a la Terminal)"
        },
        {
            ciudad: "Zona Bananera",
            direccion: "Calle 5 # 2-135 (Corregimiento de Orihueca)"
        }
    ];

    return (
        <>
            {/* JSON-LD Structured Data */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(structuredData)
                }}
            />

            <div className="min-h-screen bg-white">
                {/* Back to Blog Link */}
                <div className="bg-slate-50 border-b border-slate-200">
                    <div className="container mx-auto max-w-4xl px-4 py-4">
                        <Link
                            href="/blog"
                            className="inline-flex items-center gap-2 text-brand-blue hover:text-blue-800 font-semibold transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Volver al Blog
                        </Link>
                    </div>
                </div>

                {/* Article Content */}
                <article className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
                    {/* Category Badge */}
                    <div className="mb-6">
                        <span className="inline-block bg-brand-blue text-white px-4 py-2 rounded-full text-sm font-semibold">
                            Financiación
                        </span>
                    </div>

                    {/* Article Header */}
                    <header className="mb-12">
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                            Motos con el Recibo del Gas: Guía del Cupo Brilla en Santa Marta, Riohacha y Zona Bananera
                        </h1>

                        {/* Meta Info */}
                        <div className="flex items-center gap-4 text-gray-600 text-sm">
                            <time dateTime="2026-01-27">27 de enero de 2026</time>
                            <span>•</span>
                            <span>5 min de lectura</span>
                        </div>
                    </header>

                    {/* Article Body - Using Tailwind Typography */}
                    <div className="prose prose-lg max-w-none">
                        {/* Introduction */}
                        <p className="text-lg text-gray-700 leading-relaxed mb-8">
                            ¿Sabías que tu factura de gas natural es la llave para estrenar una moto de marcas líderes como Victory, TVS, Ceronte, Kawasaki, Starker o Benelli? En Auteco Las Motos (tiendalasmotos.com), somos el aliado oficial de Brilla en Magdalena y La Guajira. Si pagas puntualmente tu servicio público, ya tienes un crédito pre-aprobado esperándote en nuestras sedes.
                        </p>

                        {/* Visual Marker 1: Infographic Placeholder */}
                        <div className="my-10 p-8 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg text-center">
                            <p className="text-gray-600 font-semibold text-lg">
                                📊 ESPACIO PARA INFOGRAFÍA: Dónde encontrar tu número de contrato
                            </p>
                        </div>

                        {/* Section: Sedes Oficiales */}
                        <section className="my-12">
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
                                Nuestras Sedes Oficiales Brilla
                            </h2>

                            <div className="space-y-4">
                                {sedes.map((sede, index) => (
                                    <div
                                        key={index}
                                        className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-brand-blue transition-colors"
                                    >
                                        <MapPin className="w-6 h-6 text-brand-blue flex-shrink-0 mt-1" />
                                        <div>
                                            <h3 className="font-bold text-gray-900 mb-1">
                                                {sede.ciudad}
                                            </h3>
                                            <p className="text-gray-700">
                                                {sede.direccion}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Section: El Megacupo Brilla */}
                        <section className="my-12">
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
                                El Megacupo Brilla: Hasta $28 Millones para Tu Moto
                            </h2>

                            <p className="text-lg text-gray-700 leading-relaxed">
                                A diferencia del cupo ordinario, el Megacupo Brilla te permite financiar hasta $28.000.000 de pesos para adquirir motocicletas o motocarros. Esta es la opción favorita en el Caribe porque no requiere historial crediticio bancario ni certificaciones laborales complejas, siendo ideal para independientes y trabajadores del sector informal.
                            </p>
                        </section>

                        {/* Section: Portafolio Ampliado */}
                        <section className="my-12">
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
                                Portafolio Ampliado: Desde Tricargos hasta Alta Gama
                            </h2>

                            <p className="text-lg text-gray-700 leading-relaxed mb-6">
                                Gracias al amplio margen del Megacupo, en Auteco Las Motos puedes elegir entre:
                            </p>

                            <div className="space-y-6 ml-4">
                                <div className="border-l-4 border-brand-blue pl-6">
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                                        Ceronte (Tricargos 200 y 300)
                                    </h3>
                                    <p className="text-gray-700 leading-relaxed">
                                        La marca que revoluciona el trabajo en la Zona Bananera. El Tricargo 300 carga hasta 1 tonelada y es refrigerado por líquido para aguantar el clima costero.
                                    </p>
                                </div>

                                <div className="border-l-4 border-brand-blue pl-6">
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                                        TVS Raider 125 y Sport 100
                                    </h3>
                                    <p className="text-gray-700 leading-relaxed">
                                        Potencia y ahorro extremo de combustible.
                                    </p>
                                </div>

                                <div className="border-l-4 border-brand-blue pl-6">
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                                        Victory MRX 125/150
                                    </h3>
                                    <p className="text-gray-700 leading-relaxed">
                                        La multipropósito perfecta para los terrenos mixtos de Magdalena y La Guajira.
                                    </p>
                                </div>

                                <div className="border-l-4 border-brand-blue pl-6">
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                                        Alta Gama y Eléctricas
                                    </h3>
                                    <p className="text-gray-700 leading-relaxed">
                                        Estilo y potencia con Benelli y Kawasaki, o movilidad sostenible con Starker.
                                    </p>
                                </div>
                            </div>
                        </section>

                        {/* Visual Marker 2: Video Placeholder */}
                        <div className="my-10 p-8 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg text-center">
                            <p className="text-gray-600 font-semibold text-lg">
                                🎥 ESPACIO PARA VIDEO TESTIMONIAL: De la Finca al Asfalto
                            </p>
                        </div>

                        {/* Section: Requisitos */}
                        <section className="my-12">
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
                                Requisitos para Usar tu Recibo del Gas
                            </h2>

                            <p className="text-lg text-gray-700 leading-relaxed mb-6">
                                Para tramitar tu crédito en tiendalasmotos.com o en tienda física, solo necesitas:
                            </p>

                            <div className="space-y-4">
                                <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                                        📋 Cédula original
                                    </h3>
                                    <p className="text-gray-700 leading-relaxed">
                                        Propietarios o arrendatarios mayores de edad.
                                    </p>
                                </div>

                                <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                                        📄 Facturas de gas
                                    </h3>
                                    <p className="text-gray-700 leading-relaxed">
                                        Las dos últimas facturas originales de Gases del Caribe (Magdalena) o Gases de La Guajira (Riohacha), ambas deben estar pagas.
                                    </p>
                                </div>

                                <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                                        💰 Cuota Inicial
                                    </h3>
                                    <p className="text-gray-700 leading-relaxed">
                                        En Auteco Las Motos recomendamos un 10% de cuota inicial para mejorar las condiciones de tu crédito y reducir el valor de tus cuotas mensuales.
                                    </p>
                                </div>
                            </div>
                        </section>

                        {/* Call to Action */}
                        <div className="mt-12 p-8 bg-gradient-to-r from-brand-blue to-blue-800 rounded-xl text-white text-center">
                            <h3 className="text-2xl font-bold mb-4">
                                ¿Listo para Estrenar tu Moto con el Cupo Brilla?
                            </h3>
                            <p className="text-lg text-blue-100 mb-6">
                                Visita cualquiera de nuestras sedes o contáctanos para más información
                            </p>
                            <Link
                                href="/sedes"
                                className="inline-block bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-slate-900 font-bold py-3 px-8 rounded-full transition-all hover:scale-105 shadow-lg"
                            >
                                Ver Todas las Sedes
                            </Link>
                        </div>
                    </div>
                </article>
            </div>
        </>
    );
}
