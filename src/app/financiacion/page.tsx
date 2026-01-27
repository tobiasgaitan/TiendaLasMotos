import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
    title: "Guía Definitiva: Cómo Sacar tu Moto a Crédito en Magdalena y La Guajira con Auteco Las Motos",
    description: "Financia tu moto Auteco en Santa Marta, Riohacha y Zona Bananera. Crédito fácil para reportados e independientes con solo el 10% de inicial. Más de 14 aliados financieros.",
    keywords: "financiación motos Magdalena, crédito moto Santa Marta, préstamo moto Riohacha, financiar moto Zona Bananera, crédito moto sin codeudor, primer crédito moto, Cupo Brilla, Addi, ProgreSER, Sistecrédito, Galgo, Crediorbe",
};

export const revalidate = 3600; // Revalidate every hour

/**
 * Financiacion Page - SEO Optimized for Magdalena and La Guajira
 * 
 * Comprehensive financing guide targeting local positioning in Santa Marta,
 * Riohacha, and Zona Bananera. Includes strategic allies, requirements by
 * profile, and FAQ section with structured data for enhanced SEO.
 * 
 * @returns {JSX.Element} The SEO-optimized financing page
 */
export default function FinanciacionPage() {
    // JSON-LD structured data for SEO
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": "Guía Definitiva: Cómo Sacar tu Moto a Crédito en Magdalena y La Guajira",
        "description": "Financia tu moto Auteco en Santa Marta, Riohacha y Zona Bananera. Crédito fácil para reportados e independientes con solo el 10% de inicial.",
        "author": {
            "@type": "Organization",
            "name": "Auteco Las Motos",
            "url": "https://tiendalasmotos.com"
        },
        "mainEntity": {
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": "¿El estudio de crédito tiene algún costo?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "No. En Auteco Las Motos el estudio es totalmente gratuito y no te compromete a nada."
                    }
                },
                {
                    "@type": "Question",
                    "name": "¿Necesito un codeudor o fiador?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "No es estrictamente necesario. En la mayoría de los casos, la aprobación depende únicamente de tu perfil."
                    }
                },
                {
                    "@type": "Question",
                    "name": "¿Puedo sacar la moto si es mi primer crédito?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "Absolutamente. Contamos con líneas especializadas para quienes están iniciando su vida crediticia."
                    }
                },
                {
                    "@type": "Question",
                    "name": "¿Cómo funciona el crédito Brilla (Gas)?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "Si tienes servicio de Gases del Caribe, puedes usar tu cupo disponible para financiar la moto y pagarla en la factura del gas."
                    }
                }
            ]
        }
    };

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
                {/* Main Content Container */}
                <article className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
                    {/* H1 Title */}
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                        Guía Definitiva: Cómo Sacar tu Moto a Crédito en Magdalena y La Guajira con Auteco Las Motos
                    </h1>

                    {/* Introduction */}
                    <div className="prose prose-lg max-w-none mb-12">
                        <p className="text-lg text-gray-700 leading-relaxed">
                            En el Caribe, la moto no es solo transporte; es la herramienta que mueve la economía en Santa Marta, Riohacha y la Zona Bananera. En Auteco Las Motos (tiendalasmotos.com), entendemos que para muchos jóvenes y trabajadores independientes, esta es su primera experiencia financiera. Por eso, hemos simplificado el proceso para que estrenar sea tan fácil como presentar tu cédula.
                        </p>
                    </div>

                    {/* Section: Ecosistema de Financiación */}
                    <section className="mb-12">
                        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                            El Ecosistema de Financiación más Grande de la Región
                        </h2>
                        <p className="text-lg text-gray-700 leading-relaxed">
                            Una de las mayores ventajas de Auteco Las Motos es que no dependemos de un solo banco. Contamos con una red de más de 14 aliados financieros que nos permiten encontrar una solución para cada perfil, incluso si no tienes historial crediticio.
                        </p>
                    </section>

                    {/* Section: Strategic Allies Table */}
                    <section className="mb-12">
                        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
                            Nuestros Aliados Estratégicos
                        </h2>
                        
                        {/* Table Container - Responsive with horizontal scroll on mobile */}
                        <div className="overflow-x-auto shadow-md rounded-lg border border-gray-200">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                                            Aliado Financiero
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                                            Ventaja Principal
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                                            Requisitos Clave
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    <tr className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            Cupo Brilla
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Financiación a través del recibo del gas natural.
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Cédula + 2 recibos del gas pagos.
                                        </td>
                                    </tr>
                                    <tr className="bg-gray-50 hover:bg-gray-100">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            Addi
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Proceso 100% virtual y aprobación en minutos.
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Solo cédula, WhatsApp y correo.
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            ProgreSER
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Financia hasta el 100% de la moto más los documentos.
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Solo con la cédula, sin codeudor.
                                        </td>
                                    </tr>
                                    <tr className="bg-gray-50 hover:bg-gray-100">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            Sistecrédito
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Crédito rápido, seguro y sin cuota de manejo.
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Aprobación en minutos solo con la cédula.
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            Galgo
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Especialistas en perfiles independientes y delivery.
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Proceso digital sin ir a una oficina.
                                        </td>
                                    </tr>
                                    <tr className="bg-gray-50 hover:bg-gray-100">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            Banco de Bogotá
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Respaldo bancario con plazos de hasta 84 meses.
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Tasas competitivas según perfil.
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            Crediorbe
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Políticas flexibles para primer crédito y reportados.
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Cédula y correo electrónico.
                                        </td>
                                    </tr>
                                    <tr className="bg-gray-50 hover:bg-gray-100">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            Soluciones Integrales
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Opciones personalizadas para la región Caribe.
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            Estudio ágil y presencial.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Section: Initial Payment */}
                    <section className="mb-12">
                        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                            ¿Cuánto dinero necesito para empezar?
                        </h2>
                        <p className="text-lg text-gray-700 leading-relaxed">
                            Aunque existen planes que financian el total del vehículo, en Auteco Las Motos recomendamos contar con una cuota inicial de al menos el 10% del valor de la motocicleta. Este aporte no solo facilita la aprobación de tu crédito si no tienes historial, sino que también reduce el valor de tus cuotas mensuales y los intereses totales a pagar.
                        </p>
                    </section>

                    {/* Section: Requirements by Profile */}
                    <section className="mb-12">
                        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
                            Requisitos por Perfil en Magdalena y La Guajira
                        </h2>
                        <div className="space-y-6">
                            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                                    Trabajadores o Pensionados
                                </h3>
                                <p className="text-gray-700 leading-relaxed">
                                    Copia de la cédula al 150%, correo electrónico y estar atento al celular para autorizar el estudio.
                                </p>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                                    Independientes sin Historial
                                </h3>
                                <p className="text-gray-700 leading-relaxed">
                                    Solo con tu cédula y correo electrónico iniciamos el estudio que demora aproximadamente 20 minutos.
                                </p>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                                    Personas Reportadas
                                </h3>
                                <p className="text-gray-700 leading-relaxed">
                                    ¡Sí tenemos crédito para ti! Es fundamental presentar la cédula y contar con el 10% de cuota inicial obligatoria.
                                </p>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                                    Extranjeros
                                </h3>
                                <p className="text-gray-700 leading-relaxed">
                                    Debes presentar tu Permiso por Protección Temporal (PPT) o PEP y pasaporte vigente, junto con tu dirección de residencia en Colombia.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Section: FAQ */}
                    <section className="mb-12">
                        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
                            Preguntas Frecuentes (FAQ) - Lo que todos quieren saber
                        </h2>
                        <div className="space-y-6">
                            <div className="border-b border-gray-200 pb-6">
                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                    ¿El estudio de crédito tiene algún costo?
                                </h3>
                                <p className="text-gray-700 leading-relaxed">
                                    No. En Auteco Las Motos el estudio es totalmente gratuito y no te compromete a nada.
                                </p>
                            </div>

                            <div className="border-b border-gray-200 pb-6">
                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                    ¿Necesito un codeudor o fiador para que me aprueben?
                                </h3>
                                <p className="text-gray-700 leading-relaxed">
                                    No es estrictamente necesario. En la mayoría de los casos, la aprobación depende únicamente de tu perfil y no requerimos de terceros.
                                </p>
                            </div>

                            <div className="border-b border-gray-200 pb-6">
                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                    ¿Puedo sacar la moto si es mi primer crédito?
                                </h3>
                                <p className="text-gray-700 leading-relaxed">
                                    Absolutamente. Contamos con líneas especializadas para quienes están iniciando su vida crediticia. Cumplir con tus cuotas en Auteco te abrirá las puertas de los bancos en el futuro.
                                </p>
                            </div>

                            <div className="pb-6">
                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                    ¿Cómo funciona lo del recibo del gas (Brilla)?
                                </h3>
                                <p className="text-gray-700 leading-relaxed">
                                    Si eres titular o arrendatario en un predio con servicio de Gases del Caribe, puedes usar tu cupo disponible para financiar la moto y pagarla mensualmente en la factura del gas.
                                </p>
                            </div>
                        </div>
                    </section>
                </article>
            </div>
        </>
    );
}
