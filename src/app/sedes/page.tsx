import type { Metadata } from "next";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { City } from "@/types/financial";
import { MapPin, Phone, ExternalLink } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Nuestras Sedes | Tienda Las Motos",
    description: "Encuentra la sede de Tienda Las Motos más cercana a ti. Visítanos en nuestras ubicaciones en Colombia.",
    keywords: "sedes Tienda Las Motos, ubicaciones motos Colombia, puntos de venta motos",
};

export const revalidate = 3600; // Revalidate every hour

/**
 * Sedes Page (Public)
 * 
 * Displays all active locations/sedes of Tienda Las Motos.
 * Shows location details with Google Maps integration.
 * 
 * @returns {Promise<JSX.Element>} The sedes page
 */
export default async function SedesPage() {
    // Fetch active sedes from Firestore
    const sedesRef = collection(db, "config/general/sedes");
    const sedesSnap = await getDocs(query(sedesRef, where("isActive", "==", true)));
    const sedes = sedesSnap.docs.map(d => ({ id: d.id, ...d.data() } as City));

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Hero Section */}
            <section className="bg-gradient-to-r from-brand-blue to-blue-800 text-white py-20 px-4">
                <div className="container mx-auto max-w-4xl text-center">
                    <div className="flex items-center justify-center gap-3 mb-6">
                        <MapPin className="w-12 h-12 text-brand-yellow" />
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black mb-6 uppercase tracking-tight">
                        Nuestras <span className="text-brand-yellow">Sedes</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-blue-100 max-w-3xl mx-auto leading-relaxed">
                        Visítanos en cualquiera de nuestras ubicaciones. Estamos cerca de ti para ayudarte a cumplir tu sueño.
                    </p>
                    <div className="mt-6 text-lg text-blue-200">
                        <span className="font-semibold">{sedes.length}</span> {sedes.length === 1 ? 'sede disponible' : 'sedes disponibles'}
                    </div>
                </div>
            </section>

            {/* Sedes Grid */}
            <section className="py-16 px-4">
                <div className="container mx-auto max-w-6xl">
                    {sedes.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl shadow-lg">
                            <MapPin className="w-20 h-20 text-slate-300 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-slate-700 mb-2">
                                Sedes en Actualización
                            </h2>
                            <p className="text-slate-500">
                                Estamos expandiendo nuestras ubicaciones. Vuelve pronto para más información.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {sedes.map((sede) => (
                                <div
                                    key={sede.id}
                                    className="bg-white rounded-xl shadow-lg hover:shadow-2xl transition-shadow overflow-hidden border border-slate-200"
                                >
                                    {/* Sede Header */}
                                    <div className="bg-gradient-to-r from-brand-blue to-blue-700 text-white p-6">
                                        <div className="flex items-start gap-3">
                                            <MapPin className="w-6 h-6 text-brand-yellow flex-shrink-0 mt-1" />
                                            <div>
                                                <h3 className="font-bold text-xl mb-1">
                                                    {sede.name}
                                                </h3>
                                                {sede.id && (
                                                    <p className="text-blue-200 text-sm">
                                                        Código: {sede.id.toUpperCase()}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sede Body */}
                                    <div className="p-6 space-y-4">
                                        {/* Google Maps Link */}
                                        {sede.googleMapsUrl ? (
                                            <a
                                                href={sede.googleMapsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 text-brand-blue hover:text-blue-700 font-medium transition-colors group"
                                            >
                                                <ExternalLink className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                                <span>Ver en Google Maps</span>
                                            </a>
                                        ) : (
                                            <p className="text-slate-400 text-sm italic">
                                                Ubicación en actualización
                                            </p>
                                        )}

                                        {/* Additional Info Placeholder */}
                                        <div className="pt-4 border-t border-slate-200">
                                            <p className="text-sm text-slate-600">
                                                Horarios de atención y contacto disponibles próximamente.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Contact CTA Section */}
            <section className="py-16 px-4 bg-white">
                <div className="container mx-auto max-w-4xl text-center">
                    <h2 className="text-3xl md:text-4xl font-bold text-brand-blue mb-4">
                        ¿Necesitas Más Información?
                    </h2>
                    <p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
                        Contáctanos por WhatsApp o visita cualquiera de nuestras sedes. Nuestro equipo está listo para ayudarte.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link
                            href="/presupuesto"
                            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-slate-900 font-bold py-3 px-6 rounded-full transition-all hover:scale-105 shadow-lg"
                        >
                            🧮 CALCULA TU CUOTA
                        </Link>
                        <Link
                            href="/catalogo"
                            className="inline-flex items-center justify-center gap-2 bg-brand-blue hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full transition-all hover:scale-105 shadow-lg"
                        >
                            🏍️ VER CATÁLOGO
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
