import Image from 'next/image';
import { Moto } from '@/lib/firestore';

interface MotoCardProps {
    moto: Moto;
}

export default function MotoCard({ moto }: MotoCardProps) {
    const formatPrice = (value: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
        }).format(value);
    };

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
                <div className="absolute top-2 left-2 flex flex-col gap-1">
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
                    <button className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
                        Ver detalles &rarr;
                    </button>
                </div>
            </div>
        </article>
    );
}
