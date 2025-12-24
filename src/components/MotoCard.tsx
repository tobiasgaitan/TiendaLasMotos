"use client";

import Image from 'next/image';
import { Moto } from '@/types';
import { useLeadModal } from '@/context/LeadModalContext';

interface MotoCardProps {
    moto: Moto;
}

export default function MotoCard({ moto }: MotoCardProps) {
    const { openModal } = useLeadModal();

    const formatPrice = (value: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
        }).format(value);
    };

    // Bonus Logic
    const hasActiveBonus = () => {
        if (!moto.bono || !moto.bono.activo) return false;

        const now = new Date();
        const limit = new Date(moto.bono.fecha_limite);

        return now < limit;
    };

    const showBonus = hasActiveBonus();

    return (
        <article className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg hover:shadow-orange-900/20 hover:border-orange-600/50 transition-all duration-300 group flex flex-col h-full">
            <div className="relative aspect-square w-full bg-gradient-to-br from-slate-800 to-slate-900">
                {moto.imagen ? (
                    <Image
                        src={moto.imagen}
                        alt={moto.referencia}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-600">
                        Sin imagen
                    </div>
                )}

                {/* Badges overlay */}
                <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                    {moto.marca && (
                        <span className="bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md font-medium border-l-2 border-orange-500">
                            {moto.marca}
                        </span>
                    )}
                    {moto.frenosABS && (
                        <span className="bg-orange-600 text-white text-xs px-2 py-1 rounded-md font-bold shadow-md">
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
                <h3 className="text-xl font-bold text-white mb-1 tracking-tight truncate">
                    {moto.referencia}
                </h3>

                <div className="mt-auto pt-4 flex items-center justify-between">
                    <span className="text-lg font-semibold text-orange-400">
                        {formatPrice(moto.precio)}
                    </span>
                    <button
                        onClick={() => openModal(moto)}
                        className="text-sm font-bold text-white bg-orange-600 hover:bg-orange-500 py-2 px-4 rounded-lg transition-colors shadow-lg hover:shadow-orange-500/30"
                    >
                        COTIZAR
                    </button>
                </div>
            </div>
        </article>
    );
}
