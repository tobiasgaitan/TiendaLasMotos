"use client";

import React, { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

interface Product {
    id: string;
    referencia: string;
    precio: number;
    imagenUrl: string | { url: string };
    fichatecnica: Record<string, string>;
    garantia: string | null;
}

interface FlipCardProps {
    product: Product;
}

export default function FlipCard({ product }: FlipCardProps) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [activeTab, setActiveTab] = useState<"specs" | "warranty">("specs");

    const toggleFlip = () => setIsFlipped(!isFlipped);

    const imageUrl = typeof product.imagenUrl === "string" ? product.imagenUrl : product.imagenUrl?.url || "/placeholder.png";

    return (
        <div className="relative group w-full h-[500px] perspective-1000 cursor-pointer" onClick={(e) => {
            // Prevent flip if clicking on tabs inside the back
            if ((e.target as HTMLElement).closest('.stop-propagation')) return;
            toggleFlip();
        }}>
            <motion.div
                className="w-full h-full relative preserve-3d transition-all duration-700"
                initial={false}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                style={{ transformStyle: "preserve-3d" }}
            >
                {/* FRONT */}
                <div className="absolute inset-0 backface-hidden bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden flex flex-col">
                    <div className="relative h-64 w-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
                        <Image
                            src={imageUrl}
                            alt={product.referencia}
                            width={400}
                            height={300}
                            className="object-contain max-h-full transition-transform duration-500 group-hover:scale-110"
                        />
                        <div className="absolute top-4 right-4 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wide">
                            Ver Detalles
                        </div>
                    </div>

                    <div className="p-6 flex-1 flex flex-col justify-between">
                        <div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{product.referencia}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Modelo Urbano 2025</p>
                        </div>
                        <div className="mt-4">
                            <p className="text-xs text-gray-500 uppercase font-semibold">Precio de venta</p>
                            <p className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">
                                {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(product.precio)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* BACK */}
                <div
                    className="absolute inset-0 backface-hidden bg-white dark:bg-slate-900 rounded-xl shadow-xl overflow-hidden flex flex-col"
                    style={{ transform: "rotateY(180deg)" }}
                >
                    <div className="flex border-b border-gray-200 dark:border-gray-700 stop-propagation">
                        <button
                            onClick={(e) => { e.stopPropagation(); setActiveTab("specs"); }}
                            className={`flex-1 py-4 text-sm font-semibold uppercase tracking-wider transition-colors ${activeTab === "specs"
                                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                }`}
                        >
                            Ficha Técnica
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setActiveTab("warranty"); }}
                            className={`flex-1 py-4 text-sm font-semibold uppercase tracking-wider transition-colors ${activeTab === "warranty"
                                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                }`}
                        >
                            Garantía
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 scroll-smooth stop-propagation">
                        {activeTab === "specs" ? (
                            <div className="space-y-4">
                                {Object.entries(product.fichatecnica || {}).length > 0 ? (
                                    Object.entries(product.fichatecnica).map(([key, value]) => (
                                        <div key={key} className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0">
                                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{key}</span>
                                            <span className="text-sm font-bold text-gray-900 dark:text-white text-right sm:pl-4">{value}</span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-gray-500 text-center italic mt-10">Información técnica no disponible.</p>
                                )}
                            </div>
                        ) : (
                            <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                                {product.garantia ? (
                                    <div dangerouslySetInnerHTML={{ __html: product.garantia.replace(/\n/g, '<br/>') }} />
                                ) : (
                                    <p className="text-gray-500 text-center italic mt-10">Información de garantía no disponible.</p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleFlip(); }}
                            className="w-full py-2 text-center text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors"
                        >
                            &larr; Volver
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
