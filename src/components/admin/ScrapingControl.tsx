"use client";

import { useState } from "react";
import { triggerManualScraping } from "@/app/admin/actions/scraping-action";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";

export default function ScrapingControl() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<null | { success: boolean; message?: string; data?: any }>(null);
    const [showResult, setShowResult] = useState(false);

    const handleSync = async () => {
        setLoading(true);
        setResult(null);
        setShowResult(false);
        try {
            const res = await triggerManualScraping();
            setResult(res);
            setShowResult(true);
            // Hide result automatically after 5 seconds if success
            if (res.success) {
                setTimeout(() => setShowResult(false), 5000);
            }
        } catch (error) {
            setResult({ success: false, message: "Unexpected error occurred." });
            setShowResult(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={handleSync}
                disabled={loading}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold shadow-lg transition-all hover:scale-105 active:scale-95 ${loading
                        ? "bg-blue-800 text-blue-200 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
            >
                <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
                <span>{loading ? "Sincronizando..." : "Sincronizar Catálogo"}</span>
            </button>

            {/* Absolute Result Popover */}
            {showResult && result && (
                <div className="absolute top-full right-0 mt-2 w-80 z-50">
                    <div className={`p-4 rounded-lg shadow-xl border backdrop-blur-md ${result.success
                            ? "bg-green-900/90 border-green-700 text-green-100"
                            : "bg-red-900/90 border-red-700 text-red-100"
                        }`}>
                        <div className="flex items-start gap-3">
                            {result.success ? <CheckCircle className="w-5 h-5 mt-0.5" /> : <AlertCircle className="w-5 h-5 mt-0.5" />}
                            <div className="flex-1">
                                <h4 className="font-bold text-sm mb-1">{result.success ? "Sincronización Exitosa" : "Error de Sincronización"}</h4>
                                <p className="text-xs opacity-90 leading-relaxed">
                                    {result.message ? result.message :
                                        result.data ? `Actualizados: ${result.data.updated}, Errores: ${result.data.errors}` : "Operación completada."}
                                </p>
                                {result.success && result.data && (
                                    <div className="mt-2 text-[10px] bg-black/20 p-2 rounded font-mono">
                                        Total Escaneados: {result.data.scanned}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setShowResult(false)} className="text-current opacity-50 hover:opacity-100">×</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
