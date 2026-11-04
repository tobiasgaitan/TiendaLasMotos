"use client";

import Image from "next/image";
import { Camera, ImageIcon, Trash2 } from "lucide-react";

interface FotoConteoPickerProps {
    foto: File | null;
    previewUrl: string | null;
    error: string | null;
    disabled?: boolean;
    onFotoChange: (foto: File) => void;
    onQuitar: () => void;
}

function formatearTamano(bytes: number): string {
    if (bytes < 1024 * 1024) {
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Captura nativa de cámara. No usa getUserMedia ni permisos adicionales.
 * El input exige `capture="environment"` para abrir la cámara trasera.
 */
export default function FotoConteoPicker({
    foto,
    previewUrl,
    error,
    disabled = false,
    onFotoChange,
    onQuitar,
}: FotoConteoPickerProps) {
    return (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 shadow-lg">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                        1. Foto del repuesto
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                        JPG, PNG o WebP. Máximo 5 MB.
                    </p>
                </div>
                {foto ? (
                    <button
                        type="button"
                        onClick={onQuitar}
                        disabled={disabled}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/70 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        Quitar
                    </button>
                ) : null}
            </div>

            <div className="mt-4">
                <label
                    htmlFor="foto-repuesto"
                    className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
                        disabled
                            ? "cursor-not-allowed border-gray-800 bg-gray-950/50 opacity-60"
                            : "border-gray-700 bg-gray-950/60 hover:border-red-500/70 hover:bg-gray-900"
                    }`}
                >
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                        {foto ? (
                            <ImageIcon
                                aria-hidden="true"
                                className="h-7 w-7"
                            />
                        ) : (
                            <Camera aria-hidden="true" className="h-7 w-7" />
                        )}
                    </span>
                    <span className="text-sm font-semibold text-white">
                        {foto ? "Repetir foto" : "Tomar foto"}
                    </span>
                    <span className="max-w-xs text-xs leading-relaxed text-gray-500">
                        {foto
                            ? "Puedes repetir la foto si no quedó nítida."
                            : "Abre la cámara trasera y encuadra la referencia del repuesto."}
                    </span>
                    <input
                        id="foto-repuesto"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        aria-label="Tomar o elegir foto del repuesto"
                        className="sr-only"
                        disabled={disabled}
                        onChange={(event) => {
                            const archivo = event.target.files
                                ? event.target.files[0]
                                : null;
                            event.target.value = "";
                            if (archivo) {
                                onFotoChange(archivo);
                            }
                        }}
                    />
                </label>
            </div>

            {previewUrl ? (
                <div className="relative mt-4 h-56 w-full overflow-hidden rounded-xl border border-gray-800 bg-black">
                    <Image
                        src={previewUrl}
                        alt="Vista previa del repuesto"
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 640px"
                        className="object-contain"
                    />
                </div>
            ) : null}

            {foto ? (
                <p className="mt-3 truncate text-xs text-gray-500">
                    {foto.name} · {formatearTamano(foto.size)}
                </p>
            ) : null}

            {error ? (
                <p
                    role="alert"
                    className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-200"
                >
                    {error}
                </p>
            ) : null}
        </section>
    );
}
