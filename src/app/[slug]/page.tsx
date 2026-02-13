import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import Link from "next/link";

export const dynamic = 'force-dynamic'; // ⚡ BYPASS BUILD PRERENDERING

// Mock Data
const CITIES = ["bogota", "medellin", "cali", "barranquilla", "cartagena", "santa-marta"];
const CATEGORIES = ["urbanas", "deportivas", "scooter", "touring", "enduro"];

interface PageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
    const { slug } = await params;
    const term = slug.toLowerCase();
    const formattedTerm = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");

    if (CITIES.includes(term)) {
        return {
            title: `Motos en ${formattedTerm} | Tienda Las Motos`,
            description: `Encuentra las mejores motos en ${formattedTerm}. Catálogo completo y financiación.`,
        };
    } else if (CATEGORIES.includes(term)) {
        return {
            title: `Motos ${formattedTerm} | Tienda Las Motos`,
            description: `Explora nuestra colección de motos ${formattedTerm}.`,
        };
    }

    return {
        title: formattedTerm,
    };
}

export default async function DynamicPage({ params }: PageProps) {
    const { slug } = await params;
    const term = slug.toLowerCase();
    const formattedTerm = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");

    const isCity = CITIES.includes(term);
    const isCategory = CATEGORIES.includes(term);

    if (!isCity && !isCategory) {
        return notFound();
    }

    return (
        <div className="min-h-screen bg-white dark:bg-gray-900 pb-20">
            <Breadcrumbs />

            <main className="container mx-auto px-4 mt-8">
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-6">
                    {isCity ? <>Motos Disponibles en <span className="text-blue-600">{formattedTerm}</span></> :
                        isCategory ? <>Categoría: <span className="text-blue-600">{formattedTerm}</span></> : formattedTerm}
                </h1>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Placeholder for catalog grid */}
                    <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 col-span-full">
                        <p className="text-gray-600 dark:text-gray-300">
                            {isCity
                                ? `Catálogo filtrado para ${formattedTerm} se mostrará aquí.`
                                : `Listado de motos ${formattedTerm}.`
                            }
                        </p>

                        {isCategory && (
                            <div className="mt-4">
                                <Link
                                    href={`/${slug}/victory-advance`}
                                    className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                                >
                                    Ver Ejemplo: Victory Advance
                                </Link>
                            </div>
                        )}

                        {isCity && (
                            <div className="mt-4">
                                <Link href="/urbanas" className="text-blue-600 hover:underline">Ver Motos Urbanas &rarr;</Link>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
