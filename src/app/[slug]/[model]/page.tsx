import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import FlipCard from "@/components/FlipCard";
import JsonLd from "@/components/JsonLd";
import QuoteGenerator from "@/components/calculator/QuoteGenerator"; // Import Simulator
import { db } from "@/lib/firebase";
import { collection, query, getDocs } from "firebase/firestore";
import { SoatRate, FinancialEntity, Moto } from "@/types";

interface Product {
    id: string;
    referencia: string;
    modelo: string;
    precio: number;
    imagenUrl: string | { url: string };
    fichatecnica: Record<string, string>;
    garantia: string | null;
    descripcion: string;
}

// Mock Product Data Fetching (Replace with Firebase logic later)
async function getProduct(slug: string): Promise<Product | null> {
    // Simulate DB delay
    await new Promise(resolve => setTimeout(resolve, 100));

    if (slug === "victory-advance") {
        return {
            id: "1",
            referencia: "Victory Advance R",
            modelo: "2025",
            precio: 5990000,
            imagenUrl: "https://dismerca.com/wp-content/uploads/2021/04/NEGRA.jpg", // Example URL
            fichatecnica: {
                "Cilindraje": "124 cc",
                "Potencia": "10.2 HP @ 8000 rpm",
                "Torque": "9.2 Nm @ 6000 rpm",
                "Peso": "110 kg",
                "Arranque": "Eléctrico y Pedal"
            },
            garantia: "Garantía de 20.000 KM o 24 meses, lo que ocurra primero. Revisiones preventivas obligatorias en centros autorizados.",
            descripcion: "La moto ideal para el trabajo y la ciudad. Económica, resistente y con el respaldo de Auteco."
        };
    }
    return null;
}

interface PageProps {
    params: Promise<{
        slug: string; // Was categoria
        model: string; // Was modelo
    }>;
}

export async function generateMetadata({ params }: PageProps) {
    const { model } = await params;
    const product = await getProduct(model);

    if (!product) return { title: "Moto no encontrada" };

    return {
        title: `${product.referencia} | Precio y Ficha Técnica`,
        description: `Compra la ${product.referencia} modelo ${product.modelo}. Precio: $${product.precio}. Financiación disponible.`,
    };
}

export default async function ProductPage({ params }: PageProps) {
    const { model, slug } = await params;
    const product = await getProduct(model);

    if (!product) {
        return notFound();
    }

    // Fetch Calculator Dependencies
    const soatSnap = await getDocs(query(collection(db, "financial_config/general/tarifas_soat")));
    const soatRates = soatSnap.docs.map(d => ({ id: d.id, ...d.data() } as SoatRate));

    const finSnap = await getDocs(query(collection(db, "financial_config/general/financieras")));
    const financialEntities = finSnap.docs.map(d => ({ id: d.id, ...d.data() } as FinancialEntity));

    // Map Product to Moto (Calculator Expectation)
    const motoForQuote: Moto = {
        id: product.id,
        referencia: product.referencia,
        precio: product.precio,
        marca: "Victory", // Mock or from product
        imagen: typeof product.imagenUrl === 'string' ? product.imagenUrl : product.imagenUrl.url,
        frenosABS: false,
        categories: ["URBANA Y/O TRABAJO"], // Default category
        displacement: 124, // Matches mock 124cc
    };

    // SEO Schema
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.referencia,
        "image": typeof product.imagenUrl === 'string' ? product.imagenUrl : product.imagenUrl?.url,
        "description": product.descripcion,
        "brand": {
            "@type": "Brand",
            "name": "Victory" // Hardcoded for example
        },
        "offers": {
            "@type": "Offer",
            "url": `https://tiendalasmotos.com/${slug}/${model}`,
            "priceCurrency": "COP",
            "price": product.precio,
            "availability": "https://schema.org/InStock",
            "itemCondition": "https://schema.org/NewCondition"
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-20">
            <Breadcrumbs />

            <JsonLd data={jsonLd} />

            <main className="container mx-auto px-4 mt-8">
                <div className="flex flex-col lg:flex-row items-center justify-center gap-12">

                    {/* Flip Card Section */}
                    <div className="w-full max-w-md">
                        <FlipCard product={product} />
                        <p className="text-center text-sm text-gray-500 mt-4 animate-pulse">
                            👆 Haz clic en la tarjeta para ver Ficha Técnica y Garantía
                        </p>
                    </div>

                    {/* Call to Action Section */}
                    <div className="w-full max-w-lg space-y-6">
                        <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800">
                            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2">
                                {product.referencia}
                            </h1>
                            <div className="flex items-center space-x-2 mb-6">
                                <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded dark:bg-blue-200 dark:text-blue-900">
                                    Modelo {product.modelo}
                                </span>
                                <span className="text-green-600 font-medium text-sm">Disponible en tienda</span>
                            </div>

                            <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
                                {product.descripcion}
                            </p>

                            <div className="space-y-4">
                                <div className="space-y-4">
                                    <QuoteGenerator
                                        moto={motoForQuote}
                                        soatRates={soatRates}
                                        financialEntities={financialEntities}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
