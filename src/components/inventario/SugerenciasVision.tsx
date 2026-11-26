'use client';

import {
    AlertTriangle,
    Hash,
    Loader2,
    RefreshCw,
    Sparkles,
    Tag,
} from 'lucide-react';
import type {
    VisionConteoData,
    VisionSugerencia,
    VisionUnidad,
} from '@/types/inventario';

interface SugerenciasVisionProps {
    sugerencias: VisionSugerencia[];
    etiquetas: string[];
    unidades: VisionUnidad[];
    analizando: boolean;
    error: string | null;
    conteoMultimodal: VisionConteoData | null;
    analizandoMultimodal: boolean;
    errorMultimodal: string | null;
    onUsarCantidad: (cantidad: number) => void;
    onReintentar: () => void;
    onUsarCantidadMultimodal: (cantidad: number) => void;
    onReintentarMultimodal: () => void;
}

export default function SugerenciasVision({
    sugerencias,
    etiquetas,
    unidades,
    analizando,
    error,
    conteoMultimodal,
    analizandoMultimodal,
    errorMultimodal,
    onUsarCantidad,
    onReintentar,
    onUsarCantidadMultimodal,
    onReintentarMultimodal,
}: SugerenciasVisionProps) {
    const cantidadMultimodal =
        conteoMultimodal === null
            ? null
            : conteoMultimodal.cantidad_sugerida_multimodal;
    const confidenceMultimodal =
        conteoMultimodal === null ? null : conteoMultimodal.confidence_multimodal;
    const puedeUsarMultimodal =
        conteoMultimodal !== null &&
        conteoMultimodal.puede_contar &&
        cantidadMultimodal !== null &&
        !analizandoMultimodal;

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
                        Las unidades son una estimación para ayudarte a contar.
                        La referencia se elige del catálogo existente.
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

            {!analizando &&
            !error &&
            sugerencias.length === 0 &&
            unidades.length === 0 ? (
                <p className="mt-4 text-xs text-gray-500">
                    Aún no hay detecciones. Toma una foto nítida o selecciona
                    una referencia del catálogo manualmente.
                </p>
            ) : null}

            {unidades.length > 0 ? (
                <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Unidades detectadas (estimación)
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {unidades.map((unidad, indice) => (
                            <button
                                key={`${unidad.etiqueta}-${indice}`}
                                type="button"
                                onClick={() => onUsarCantidad(unidad.cantidad)}
                                disabled={analizando}
                                className="inline-flex items-center gap-2 rounded-full border border-emerald-700/60 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                title="Usar esta cantidad detectada"
                            >
                                <Hash
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                />
                                <span>
                                    {unidad.cantidad} × {unidad.etiqueta}
                                </span>
                                <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] text-emerald-200">
                                    {Math.round(unidad.score * 100)}%
                                </span>
                            </button>
                        ))}
                    </div>
                    <p className="text-[11px] leading-relaxed text-gray-600">
                        La cantidad detectada no se guarda automáticamente:
                        debes confirmarla en el campo Cantidad contada.
                    </p>
                </div>
            ) : null}

            {sugerencias.length > 0 ? (
                <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Etiquetas detectadas
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {sugerencias.map((sugerencia, indice) => (
                            <span
                                key={`${sugerencia.etiqueta}-${indice}`}
                                className="inline-flex items-center gap-2 rounded-full border border-amber-700/60 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100"
                            >
                                <Tag aria-hidden="true" className="h-3.5 w-3.5" />
                                <span>{sugerencia.etiqueta}</span>
                                <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] text-amber-200">
                                    {Math.round(sugerencia.score * 100)}%
                                </span>
                            </span>
                        ))}
                    </div>
                </div>
            ) : null}

            {etiquetas.length > 0 ? (
                <div className="mt-4 border-t border-gray-800 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Etiquetas para el matching
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

            <div className="mt-4 border-t border-gray-800 pt-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-300">
                            <Sparkles
                                aria-hidden="true"
                                className="h-4 w-4 text-sky-400"
                            />
                            Conteo multimodal (IA)
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">
                            Sugerencia automática de unidades. No reemplaza tu
                            conteo.
                        </p>
                    </div>
                    {errorMultimodal ? (
                        <button
                            type="button"
                            onClick={onReintentarMultimodal}
                            disabled={analizandoMultimodal}
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

                {analizandoMultimodal ? (
                    <div
                        role="status"
                        className="mt-3 flex items-center gap-3 rounded-xl border border-sky-900/50 bg-sky-950/20 px-3 py-3 text-sm text-sky-100"
                    >
                        <Loader2
                            aria-hidden="true"
                            className="h-5 w-5 animate-spin"
                        />
                        Analizando unidades con IA…
                    </div>
                ) : null}

                {errorMultimodal ? (
                    <p
                        role="alert"
                        className="mt-3 rounded-xl border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs leading-relaxed text-amber-100"
                    >
                        {errorMultimodal}
                    </p>
                ) : null}

                {conteoMultimodal !== null && !analizandoMultimodal ? (
                    <div
                        aria-live="polite"
                        className="mt-3 space-y-3 rounded-xl border border-sky-900/40 bg-sky-950/10 p-3"
                    >
                        {conteoMultimodal.saturada ? (
                            <p
                                role="alert"
                                className="flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs leading-relaxed text-red-100"
                            >
                                <AlertTriangle
                                    aria-hidden="true"
                                    className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
                                />
                                La imagen está saturada o sobreexpuesta. El
                                autocompletado está deshabilitado; cuenta
                                manualmente.
                            </p>
                        ) : !conteoMultimodal.puede_contar ? (
                            <p
                                role="alert"
                                className="flex items-start gap-2 rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs leading-relaxed text-amber-100"
                            >
                                <AlertTriangle
                                    aria-hidden="true"
                                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                                />
                                El modelo no pudo contar con confianza
                                suficiente. El autocompletado está
                                deshabilitado; cuenta manualmente.
                            </p>
                        ) : null}

                        {cantidadMultimodal !== null ? (
                            <div>
                                <p className="text-2xl font-bold text-white">
                                    {cantidadMultimodal} unidades{' '}
                                    <span className="text-sm font-medium text-gray-400">
                                        (estimación)
                                    </span>
                                </p>
                                {confidenceMultimodal !== null ? (
                                    <p className="mt-1 text-xs font-semibold text-sky-200">
                                        Confianza del modelo:{' '}
                                        {Math.round(
                                            confidenceMultimodal * 100
                                        )}
                                        %
                                    </p>
                                ) : null}
                            </div>
                        ) : null}

                        {conteoMultimodal.justificacion_multimodal ? (
                            <p className="text-xs leading-relaxed text-gray-300">
                                {conteoMultimodal.justificacion_multimodal}
                            </p>
                        ) : null}

                        <button
                            type="button"
                            onClick={() => {
                                if (cantidadMultimodal !== null) {
                                    onUsarCantidadMultimodal(
                                        cantidadMultimodal
                                    );
                                }
                            }}
                            disabled={!puedeUsarMultimodal}
                            className="inline-flex items-center gap-2 rounded-lg border border-sky-700/70 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Hash aria-hidden="true" className="h-4 w-4" />
                            Usar cantidad sugerida
                        </button>
                        <p className="text-[11px] leading-relaxed text-gray-500">
                            Es una estimación. Verifica y ajusta el valor antes
                            de guardar.
                        </p>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
