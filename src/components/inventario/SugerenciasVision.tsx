"use client";

import { Loader2, RefreshCw, Sparkles, Tag } from "lucide-react";
import type { VisionSugerencia } from "@/types/inventario";

interface SugerenciasVisionProps {
    sugerencias: VisionSugerencia[];
    etiquetas: string[];
    analizando: boolean;
    error: string | null;
    onUsarEtiqueta: (etiqueta: string) => void;
    onReintentar: () => void;
}

export default function SugerenciasVision({
    sugerencias,
    etiquetas,
    analizando,
    error,
    onUsarEtiqueta,
    onReintentar,
}: SugerenciasVisionProps) {
    return (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 shadow-lg">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-300">
                        <Sparkles
                            aria-hidden="true"
                            className="h-4 w-4 text-amber-400"
                        />
                        Sugerencias de Vision
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                        Solo pre-llenan la referencia sugerida. Tú confirmas la
                        referencia final.
                    </p>
                </div>
                {error ? (
                    <button
                        type="button"
                        onClick={onReintentar}
                        disabled={analizando}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCw
                            aria-hidden="true"
                            className="h-4 w-4"
                        />
                        Reintentar
                    </button>
                ) : null}
            </div>

            {analizando ? (
                <div
                    role="status"
                    className="mt-4 flex items-center gap-3 rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-3 text-sm text-amber-100"
                >
                    <Loader2
                        aria-hidden="true"
                        className="h-5 w-5 animate-spin"
                    />
                    Subiendo foto y analizando la imagen…
                </div>
            ) : null}

            {error ? (
                <p
                    role="alert"
                    className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs leading-relaxed text-amber-100"
                >
                    {error}
                </p>
            ) : null}

            {!analizando && !error && sugerencias.length === 0 ? (
                <p className="mt-4 text-xs text-gray-500">
                    Aún no hay sugerencias. Toma una foto nítida para
                    intentarlo.
                </p>
            ) : null}

            {sugerencias.length > 0 ? (
                <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Referencias candidatas
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {sugerencias.map((sugerencia, indice) => (
                            <button
                                key={`${sugerencia.etiqueta}-${indice}`}
                                type="button"
                                disabled={analizando}
                                onClick={() =>
                                    onUsarEtiqueta(sugerencia.etiqueta)
                                }
                                className="inline-flex items-center gap-2 rounded-full border border-amber-700/60 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-400 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Tag aria-hidden="true" className="h-3.5 w-3.5" />
                                <span>{sugerencia.etiqueta}</span>
                                <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] text-amber-200">
                                    {Math.round(sugerencia.score * 100)}%
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {etiquetas.length > 0 ? (
                <div className="mt-4 border-t border-gray-800 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Etiquetas detectadas
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {etiquetas.map((etiqueta, indice) => (
                            <span
                                key={`${etiqueta}-${indice}`}
                                className="rounded-full border border-gray-700 bg-gray-950/70 px-2 py-1 text-[11px] text-gray-300"
                            >
                                {etiqueta}
                            </span>
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    );
}
