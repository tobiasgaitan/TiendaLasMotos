"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, Save, Globe, Phone, Mail, Facebook, Instagram, Twitter } from "lucide-react";
import { toast } from "sonner";

interface GeneralConfig {
    phone: string;
    email: string;
    facebookUrl: string;
    instagramUrl: string;
    twitterUrl: string; // Optional/TikTok
    whatsappUrl?: string;
}

/**
 * GeneralConfigPage (Admin)
 * 
 * Allows the administrator to configure global contact information and social media links.
 * Data is stored in 'config/general_info' and consumed by the SmartFooter.
 */
export default function GeneralConfigPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Default values
    const [formData, setFormData] = useState<GeneralConfig>({
        phone: "",
        email: "conexion@tiendalasmotos.com",
        facebookUrl: "",
        instagramUrl: "",
        twitterUrl: "",
        whatsappUrl: ""
    });

    // Fetch Data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const docRef = doc(db, "config", "general_info");
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setFormData(docSnap.data() as GeneralConfig);
                }
            } catch (error) {
                console.error("Error fetching general config:", error);
                toast.error("Error cargando configuración");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // Handlers
    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, "config", "general_info"), formData);
            toast.success("Información actualizada correctamente");
        } catch (error) {
            console.error("Error saving general config:", error);
            toast.error("Error guardando información");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-8 space-y-8 bg-gray-950 min-h-screen text-slate-200">
            <div className="flex justify-between items-center border-b border-gray-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">Información General</h1>
                    <p className="text-gray-400 mt-2">Configura los datos de contacto y redes sociales visibles en el Footer.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-900/20 font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
                    Guardar Cambios
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-blue-500 w-10 h-10" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Sección de Contacto */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <span className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                                <Phone size={20} />
                            </span>
                            Datos de Contacto
                        </h2>

                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Teléfono Principal</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                                    <input
                                        type="text"
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors placeholder:text-gray-600"
                                        placeholder="+57 300 123 4567"
                                        value={formData.phone || ''}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Correo Electrónico Visible</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                                    <input
                                        type="email"
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors placeholder:text-gray-600"
                                        placeholder="conexion@tiendalasmotos.com"
                                        value={formData.email || ''}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">WhatsApp Link (Completo)</label>
                                <div className="relative">
                                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                                    <input
                                        type="url"
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors placeholder:text-gray-600"
                                        placeholder="https://wa.me/57300..."
                                        value={formData.whatsappUrl || ''}
                                        onChange={(e) => setFormData({ ...formData, whatsappUrl: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sección Redes Sociales */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <span className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                                <Globe size={20} />
                            </span>
                            Redes Sociales
                        </h2>

                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Facebook URL</label>
                                <div className="relative">
                                    <Facebook className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                                    <input
                                        type="url"
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors placeholder:text-gray-600"
                                        placeholder="https://facebook.com/tiendalasmotos"
                                        value={formData.facebookUrl || ''}
                                        onChange={(e) => setFormData({ ...formData, facebookUrl: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Instagram URL</label>
                                <div className="relative">
                                    <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                                    <input
                                        type="url"
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors placeholder:text-gray-600"
                                        placeholder="https://instagram.com/tiendalasmotos"
                                        value={formData.instagramUrl || ''}
                                        onChange={(e) => setFormData({ ...formData, instagramUrl: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Twitter / X / TikTok URL</label>
                                <div className="relative">
                                    <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                                    <input
                                        type="url"
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors placeholder:text-gray-600"
                                        placeholder="https://users..."
                                        value={formData.twitterUrl || ''}
                                        onChange={(e) => setFormData({ ...formData, twitterUrl: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
