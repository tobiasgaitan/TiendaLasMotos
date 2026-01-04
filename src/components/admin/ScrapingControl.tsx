"use client";

import { useState } from "react";
import { triggerManualScraping, getSyncList } from "@/app/admin/actions/scraping-action";
import { RefreshCw, CheckCircle, AlertCircle, XCircle, Loader2 } from "lucide-react";

export default function ScrapingControl() {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [logs, setLogs] = useState<{ id: string; ref: string; status: 'success' | 'error' | 'skipped'; msg?: string }[]>([]);
    const [showResult, setShowResult] = useState(false);

    // Concurrency Limit
    const CONCURRENCY_LIMIT = 3;

    const handleSync = async () => {
        setLoading(true);
        setLogs([]);
        setProgress({ current: 0, total: 0 });
        setShowResult(true);

        try {
            // 1. Get List to Sync
            const itemsToSync = await getSyncList();

            if (!itemsToSync || itemsToSync.length === 0) {
                setLogs([{ id: 'init', ref: 'System', status: 'skipped', msg: 'No items with external_url found.' }]);
                setLoading(false);
                return;
            }

            setProgress({ current: 0, total: itemsToSync.length });

            // 2. Process with Concurrency Limit
            let results = [];
            let index = 0;

            const processItem = async (item: any) => {
                let attempts = 0;
                const maxAttempts = 3;
                let lastError = "";

                while (attempts < maxAttempts) {
                    try {
                        attempts++;
                        const res = await triggerManualScraping(item.external_url);

                        if (res.success) {
                            return { id: item.id, ref: item.referencia, status: 'success' as const, msg: attempts > 1 ? `Updated (Retry ${attempts})` : 'Updated' };
                        } else {
                            throw new Error(res.message);
                        }
                    } catch (err: any) {
                        lastError = err.message;
                        if (attempts < maxAttempts) {
                            // Exponential Backoff: 1s, 2s, 4s
                            const waitTime = Math.pow(2, attempts - 1) * 1000;
                            await new Promise(r => setTimeout(r, waitTime));
                        }
                    }
                }

                return { id: item.id, ref: item.referencia, status: 'error' as const, msg: `Failed after 3 attempts: ${lastError}` };
            };

            const pool = new Set();

            for (const item of itemsToSync) {
                const promise = processItem(item).then((res) => {
                    setLogs(prev => [res, ...prev]); // Add to logs (LIFO for visibility)
                    setProgress(prev => ({ ...prev, current: prev.current + 1 }));
                    pool.delete(promise);
                });

                pool.add(promise);

                if (pool.size >= CONCURRENCY_LIMIT) {
                    await Promise.race(pool);
                }
            }

            await Promise.all(pool); // Wait for remaining

        } catch (error: any) {
            setLogs(prev => [{ id: 'fatal', ref: 'System', status: 'error', msg: error.message }, ...prev]);
        } finally {
            setLoading(false);
        }
    };

    const successCount = logs.filter(l => l.status === 'success').length;
    const errorCount = logs.filter(l => l.status === 'error').length;
    const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

    return (
        <div className="relative w-full max-w-md">
            <div className="flex flex-col gap-4">
                <button
                    onClick={handleSync}
                    disabled={loading}
                    className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-bold shadow-lg transition-all ${loading
                        ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                        : "bg-blue-600 hover:scale-105 hover:bg-blue-700 text-white active:scale-95"
                        }`}
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                    <span>{loading ? "Sincronizando..." : "Sincronizar Catálogo"}</span>
                </button>

                {/* Progress Bar */}
                {loading && (
                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 overflow-hidden">
                        <div
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                        ></div>
                        <div className="text-center text-xs mt-1 text-slate-500">
                            {progress.current} / {progress.total}
                        </div>
                    </div>
                )}
            </div>

            {/* Results Log Panel */}
            {showResult && (logs.length > 0 || loading) && (
                <div className="mt-4 p-4 rounded-lg border border-slate-200 bg-white/50 backdrop-blur-sm shadow-xl max-h-60 overflow-y-auto custom-scrollbar">
                    <div className="flex justify-between items-center mb-3 sticky top-0 bg-white/90 p-2 rounded z-10">
                        <h4 className="font-bold text-sm text-slate-800">
                            {loading ? "Procesando..." : "Reporte Final"}
                        </h4>
                        {!loading && (
                            <div className="flex gap-2 text-xs">
                                <span className="text-green-600 font-bold">{successCount} OK</span>
                                <span className="text-red-600 font-bold">{errorCount} Errores</span>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        {logs.map((log, idx) => (
                            <div key={`${log.id}-${idx}`} className="flex items-center justify-between text-xs p-2 rounded bg-white shadow-sm border border-slate-100">
                                <span className="font-medium truncate w-1/3" title={log.ref}>{log.ref}</span>
                                <span className={`flex items-center gap-1 ${log.status === 'success' ? 'text-green-600' :
                                    log.status === 'error' ? 'text-red-500' : 'text-slate-400'
                                    }`}>
                                    {log.status === 'success' && <CheckCircle className="w-3 h-3" />}
                                    {log.status === 'error' && <XCircle className="w-3 h-3" />}
                                    {log.status === 'success' ? 'Actualizado' : log.msg}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
            `}</style>
        </div>
    );
}
