'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Simulator Error Boundary:', error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-6 text-center">
            <div className="bg-red-900/20 border border-red-500/50 p-8 rounded-2xl max-w-md w-full shadow-2xl">
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4 animate-pulse" />
                <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">
                    Error de Datos detectado
                </h2>
                <p className="text-gray-400 text-sm mb-6">
                    Se detectó una inconsistencia en la carga de parámetros financieros. Por favor, intenta recargar la configuración.
                </p>
                
                <div className="bg-black/50 p-3 rounded-lg mb-6 text-left border border-gray-800">
                    <p className="text-[10px] text-gray-500 font-mono uppercase mb-1">Información Técnica:</p>
                    <code className="text-[11px] text-red-400 font-mono break-all leading-tight">
                        {error.message || 'Error desconocido'}
                    </code>
                </div>

                <button
                    onClick={() => reset()}
                    className="w-full flex items-center justify-center gap-2 bg-brand-yellow hover:bg-yellow-400 text-black font-black py-3 rounded-xl transition-all active:scale-95"
                >
                    <RefreshCcw className="w-4 h-4" />
                    REINTENTAR CARGA
                </button>
                
                <p className="mt-4 text-[10px] text-gray-600">
                    Si el problema persiste, contacta al administrador del sistema.
                </p>
            </div>
        </div>
    );
}
