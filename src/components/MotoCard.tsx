"use client";

import Image from 'next/image';
import { Moto } from '@/types';
import { useLeadModal } from '@/context/LeadModalContext';

interface MotoCardProps {
    moto: Moto;
}

export default function MotoCard({ moto }: MotoCardProps) {
    const { openModal } = useLeadModal();

    /**
     * Formats price to Colombian Peso (COP) without decimals.
     * Used for consistent display across the card.
     * @param value - Numerical price value
     */
    const formatPrice = (value: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    // Bonus Logic
    /**
     * Time-Based Bonus Calculation:
     * Determines if a bonus is currently active based on the current server/client time vs the bonus deadline.
     * This drives urgency in the UI.
     * @returns boolean - true if bonus is active and not expired
     */
    const hasActiveBonus = () => {
        if (!moto.bono || !moto.bono.activo) return false;

        const now = new Date();
        const limit = new Date(moto.bono.fecha_limite);

        return now < limit;
    };

    const showBonus = hasActiveBonus();

    return (
        <article className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-md hover:shadow-xl hover:shadow-brand-blue/20 hover:border-brand-blue/30 transition-all duration-300 group flex flex-col h-full">
            <div className="relative h-48 mb-4 bg-gray-100 rounded-lg overflow-hidden group-hover:scale-[1.02] transition-transform">
                {/* Imagen Principal */}
                {moto.imagen_url ? (
                    <img
                        src={moto.imagen_url}
                        alt={moto.referencia}
                        className="w-full h-full object-contain mix-blend-multiply"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">
                        <span className="text-xs">Sin Imagen</span>
                    </div>
                )}

                {/* Badge de "Entregas Inmediata" o similar si existiera logic */}
                <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                    {moto.marca && (
                        <span className="bg-brand-blue/90 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md font-medium">
                            {moto.marca}
                        </span>
                    )}
                    {moto.frenosABS && (
                        <span className="bg-brand-red text-white text-xs px-2 py-1 rounded-md font-bold shadow-md">
                            ABS
                        </span>
                    )}
                    {showBonus && moto.bono && (
                        <div className="animate-in fade-in zoom-in duration-300 mt-1">
                            <span className="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-md shadow-lg shadow-green-900/50 flex items-center gap-1 border border-green-500">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                BONO: {formatPrice(moto.bono.monto)}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 flex flex-col flex-grow">
                <h3 className="text-xl font-bold text-slate-900 mb-1 tracking-tight truncate">
                    {moto.referencia}
                </h3>

                <div className="mt-auto pt-4 flex items-center justify-between">
                    <span className="text-lg font-black text-brand-red">
                        {formatPrice(moto.precio)}
                    </span>
                    <button
                        onClick={() => openModal(moto)}
                        className="text-sm font-bold text-slate-900 bg-brand-yellow hover:bg-yellow-400 py-2 px-4 rounded-lg transition-colors shadow-md hover:shadow-lg"
                    >
                        COTIZAR
                    </button>
                </div>
            </div>
        </article>
    );
}
