import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
    title: "Blog | Auteco Las Motos - Guías y Consejos sobre Motos",
    description: "Descubre guías, consejos y novedades sobre financiación de motos, crédito Brilla, y todo lo que necesitas saber para estrenar tu moto en Magdalena y La Guajira.",
    keywords: "blog motos, guías financiación motos, crédito Brilla, consejos motos Colombia",
};

export const revalidate = 3600; // Revalidate every hour

/**
 * Blog Main Page
 * 
 * Displays a grid of blog articles about motorcycle financing,
 * Brilla credit, and other relevant topics for the Caribbean region.
 * 
 * @returns {JSX.Element} The blog main page
 */
export default function BlogPage() {
    // Blog articles data
    const articles = [
        {
            slug: "motos-credito-brilla-gas",
            title: "Motos con el Recibo del Gas: Guía del Cupo Brilla",
            excerpt: "Descubre cómo tu factura de gas natural puede ser la llave para estrenar una moto Victory, TVS, Ceronte o Kawasaki en Santa Marta, Riohacha y Zona Bananera.",
            date: "2026-01-27",
            category: "Financiación",
            readTime: "5 min",
        },
    ];

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Hero Section */}
            <section className="bg-gradient-to-r from-brand-blue to-blue-800 text-white py-16 px-4">
                <div className="container mx-auto max-w-6xl">
                    <h1 className="text-4xl md:text-5xl font-black mb-4 uppercase tracking-tight">
                        Blog <span className="text-brand-yellow">Auteco Las Motos</span>
                    </h1>
                    <p className="text-xl text-blue-100 max-w-3xl leading-relaxed">
                        Guías, consejos y novedades sobre financiación de motos en Magdalena y La Guajira
                    </p>
                </div>
            </section>

            {/* Articles Grid */}
            <section className="py-16 px-4">
                <div className="container mx-auto max-w-6xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {articles.map((article) => (
                            <article
                                key={article.slug}
                                className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow group"
                            >
                                {/* Category Badge */}
                                <div className="bg-brand-blue text-white px-4 py-2 text-sm font-semibold">
                                    {article.category}
                                </div>

                                {/* Content */}
                                <div className="p-6">
                                    <h2 className="text-2xl font-bold text-gray-900 mb-3 group-hover:text-brand-blue transition-colors">
                                        <Link href={`/blog/${article.slug}`}>
                                            {article.title}
                                        </Link>
                                    </h2>

                                    <p className="text-gray-600 mb-4 leading-relaxed">
                                        {article.excerpt}
                                    </p>

                                    {/* Meta Info */}
                                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4" />
                                            <time dateTime={article.date}>
                                                {new Date(article.date).toLocaleDateString('es-CO', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </time>
                                        </div>
                                        <span>{article.readTime} lectura</span>
                                    </div>

                                    {/* Read More Link */}
                                    <Link
                                        href={`/blog/${article.slug}`}
                                        className="inline-flex items-center gap-2 text-brand-blue font-semibold hover:gap-3 transition-all"
                                    >
                                        Leer más
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
