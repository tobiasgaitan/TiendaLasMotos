"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Phone, MapPin } from "lucide-react";
import Link from "next/link";

interface GeneralConfig {
    phone: string;
    email: string;
    facebookUrl: string;
    instagramUrl: string;
    twitterUrl: string;
    whatsappUrl?: string;
}

/**
 * TopBar Component
 * 
 * Corporate-style top bar displaying dynamic contact information.
 * Fetches phone number from Firestore 'config/general_info' and generates WhatsApp link.
 * 
 * Features:
 * - Dynamic WhatsApp integration with phone number from Firebase
 * - Link to locations page (/sedes)
 * - Dark blue corporate styling
 * - Fully responsive design
 * 
 * @returns {JSX.Element} The top bar component
 */
export default function TopBar() {
    const [phone, setPhone] = useState<string>("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        /**
         * Fetches general configuration from Firestore.
         * Specifically retrieves the phone number for WhatsApp integration.
         */
        const fetchConfig = async () => {
            try {
                const configRef = doc(db, "config", "general_info");
                const configSnap = await getDoc(configRef);
                
                if (configSnap.exists()) {
                    const data = configSnap.data() as GeneralConfig;
                    setPhone(data.phone || "");
                }
            } catch (error) {
                console.error("Error fetching TopBar config:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchConfig();
    }, []);

    /**
     * Generates WhatsApp Web/App URL from phone number.
     * Removes all non-numeric characters for proper URL formatting.
     * 
     * @param phoneNumber - Raw phone number string (may contain spaces, +, -, etc.)
     * @returns Formatted WhatsApp URL
     */
    const getWhatsAppUrl = (phoneNumber: string): string => {
        // Remove all non-numeric characters
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        return `https://wa.me/${cleanPhone}`;
    };

    return (
        <div className="bg-[#001f3f] text-white text-xs py-2 px-4 border-b border-blue-900/30">
            <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
                {/* Left: WhatsApp Contact */}
                <div className="flex items-center gap-2">
                    {loading ? (
                        <span className="text-blue-200 animate-pulse">Cargando...</span>
                    ) : phone ? (
                        <a
                            href={getWhatsAppUrl(phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 hover:text-brand-yellow transition-colors group"
                        >
                            <Phone className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                            <span className="font-medium">
                                Escríbenos a WhatsApp: <span className="text-blue-100">{phone}</span>
                            </span>
                        </a>
                    ) : (
                        <span className="text-blue-300 italic">Contacto no disponible</span>
                    )}
                </div>

                {/* Right: Locations Link */}
                <Link
                    href="/sedes"
                    className="flex items-center gap-1.5 hover:text-brand-yellow transition-colors group"
                >
                    <MapPin className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                    <span className="font-medium">📍 Nuestras Sedes</span>
                </Link>
            </div>
        </div>
    );
}
