"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { City } from "@/types/financial";
import { MapPin, Phone, Mail, Facebook, Instagram, Twitter, Globe, ArrowRight } from "lucide-react";

interface GeneralConfig {
    phone: string;
    email: string;
    facebookUrl: string;
    instagramUrl: string;
    twitterUrl: string;
    whatsappUrl?: string; // Optional
}

/**
 * SmartFooter Component
 * 
 * Displays proper company branding, dynamic list of locations (Sedes), logic links, and contact info.
 * Fetches configuration data from Firestore ('config/general/sedes' and 'config/general_info').
 * 
 * @returns {JSX.Element} The responsive footer component.
 */
export default function SmartFooter() {
    const [sedes, setSedes] = useState<City[]>([]);
    const [config, setConfig] = useState<GeneralConfig | null>(null);

    useEffect(() => {
        const fetchFooterData = async () => {
            try {
                // 1. Fetch Sedes Activas
                const sedesRef = collection(db, "config/general/sedes");
                const sedesSnap = await getDocs(query(sedesRef, where("isActive", "==", true)));
                // Fallback to fetching all if 'isActive' index/field missing issues, or just client filter
                // Ideally backend ignores deleted, but checking 'isActive' is good practice if implemented
                // For simplicity assuming standard fetch if index issues arise, but let's try direct
                const loadedSedes = sedesSnap.docs.map(d => ({ id: d.id, ...d.data() } as City));
                setSedes(loadedSedes);

                // 2. Fetch General Config (Contact)
                const configRef = doc(db, "config", "general_info");
                const configSnap = await getDoc(configRef);
                if (configSnap.exists()) {
                    setConfig(configSnap.data() as GeneralConfig);
                }
            } catch (error) {
                console.error("Error loading footer data", error);
            }
        };

        fetchFooterData();
    }, []);

    const email = config?.email || "conexion@tiendalasmotos.com";
    const year = new Date().getFullYear();

    return (
        <footer className="bg-brand-blue text-white pt-16 pb-8 border-t border-blue-900">
            <div className="container mx-auto px-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
                    {/* COL 1: Brand & Intro */}
                    <div className="space-y-4">
                        <div className="text-3xl font-black italic tracking-wider">
                            TIENDA<span className="text-brand-yellow">LASMOTOS</span>
                        </div>
                        <p className="text-blue-200 text-sm leading-relaxed">
                            Tu aliado confianza para cumplir el sueño de tener moto propia.
                            Ofrecemos las mejores marcas y planes de financiación a tu medida.
                        </p>
                    </div>

                    {/* COL 2: Nuestras Sedes (Dynamic) */}
                    <div>
                        <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-brand-yellow">
                            <MapPin className="w-5 h-5" /> NUESTRAS SEDES
                        </h3>
                        <ul className="space-y-3">
                            {sedes.length > 0 ? (
                                sedes.map(sede => (
                                    <li key={sede.id}>
                                        {sede.googleMapsUrl ? (
                                            <a
                                                href={sede.googleMapsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-start gap-2 text-sm text-blue-100 hover:text-white hover:underline transition-all group"
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 group-hover:bg-brand-yellow transition-colors" />
                                                {sede.name}
                                            </a>
                                        ) : (
                                            <span className="flex items-start gap-2 text-sm text-blue-200">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50 mt-1.5" />
                                                {sede.name}
                                            </span>
                                        )}
                                    </li>
                                ))
                            ) : (
                                <li className="text-sm text-blue-300 italic">Cargando ubicaciones...</li>
                            )}
                        </ul>
                    </div>

                    {/* COL 3: Legales */}
                    <div>
                        <h3 className="font-bold text-lg mb-6 text-brand-yellow">LEGALES</h3>
                        <ul className="space-y-3">
                            <li>
                                <Link
                                    href="/politica-de-privacidad"
                                    className="text-sm text-blue-100 hover:text-white hover:underline flex items-center gap-2"
                                >
                                    <ArrowRight className="w-4 h-4" /> Política de Privacidad
                                </Link>
                            </li>
                            <li className="text-xs text-blue-300 mt-4 leading-snug">
                                "Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 y la política de privacidad de la empresa."
                            </li>
                        </ul>
                    </div>

                    {/* COL 4: Contacto (Dynamic) */}
                    <div>
                        <h3 className="font-bold text-lg mb-6 text-brand-yellow">CONTACTO</h3>
                        <div className="space-y-4">
                            {config?.phone && (
                                <div className="flex items-center gap-3 text-blue-100">
                                    <div className="p-2 bg-blue-800 rounded-lg">
                                        <Phone className="w-4 h-4" />
                                    </div>
                                    <span className="text-sm font-medium">{config.phone}</span>
                                </div>
                            )}

                            <div className="flex items-center gap-3 text-blue-100">
                                <div className="p-2 bg-blue-800 rounded-lg">
                                    <Mail className="w-4 h-4" />
                                </div>
                                <a href={`mailto:${email}`} className="text-sm font-medium hover:text-white transition-colors">
                                    {email}
                                </a>
                            </div>

                            {/* Social Media */}
                            <div className="pt-4 flex gap-3">
                                {config?.facebookUrl && (
                                    <a href={config.facebookUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-blue-900/50 hover:bg-blue-600 rounded-lg transition-colors text-white">
                                        <Facebook className="w-5 h-5" />
                                    </a>
                                )}
                                {config?.instagramUrl && (
                                    <a href={config.instagramUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-blue-900/50 hover:bg-pink-600 rounded-lg transition-colors text-white">
                                        <Instagram className="w-5 h-5" />
                                    </a>
                                )}
                                {(config?.twitterUrl) && (
                                    <a href={config.twitterUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-blue-900/50 hover:bg-black rounded-lg transition-colors text-white">
                                        <Globe className="w-5 h-5" />
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Copyright */}
                <div className="border-t border-blue-900/50 pt-8 text-center">
                    <p className="text-xs text-blue-400">
                        &copy; {year} TiendaLasMotos SAS. Todos los derechos reservados. Nit. 900581684
                    </p>
                </div>
            </div>
        </footer>
    );
}
