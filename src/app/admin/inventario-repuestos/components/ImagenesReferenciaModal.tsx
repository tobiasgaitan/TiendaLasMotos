'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import Image from 'next/image';
import { AlertCircle, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ModalWrapper from '@/components/admin/ModalWrapper';
import { useAuth } from '@/context/AuthContext';
import { storage } from '@/lib/firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { extraerStoragePath } from '@/lib/actions/inventario-schemas';
import { MAX_IMAGENES_REFERENCIA } from '@/lib/actions/inventario-repuestos-schemas';

const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;

const EXTENSION_POR_MIME: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

interface ArchivoSeleccionado {
    id: string;
    file: File;
    previewUrl: string;
}

interface ImagenesReferenciaModalProps {
    isOpen: boolean;
    documentoId: string;
    referencia: string;
    imagenes: string[];
    onClose: () => void;
    onAplicar: (imagenes: string[]) => void;
}

function mensajeDeError(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return fallback;
}

function nuevoId(): string {
    try {
        if (
            typeof crypto !== 'undefined' &&
            typeof crypto.randomUUID === 'function'
        ) {
            return crypto.randomUUID();
        }
    } catch {
        // Fallback para navegadores sin randomUUID.
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ImagenesReferenciaModal({
    isOpen,
    documentoId,
    referencia,
    imagenes,
    onClose,
    onAplicar,
}: ImagenesReferenciaModalProps) {
    const { user } = useAuth();
    const [imagenesLocales, setImagenesLocales] = useState<string[]>(imagenes);
    const [seleccion, setSeleccion] = useState<ArchivoSeleccionado[]>([]);
    const [subiendo, setSubiendo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const previewsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!isOpen) return;
        setImagenesLocales(imagenes);
        setSeleccion([]);
        setSubiendo(false);
        setError(null);
    }, [isOpen, documentoId]);

    useEffect(() => {
        const previews = previewsRef.current;
        return () => {
            for (const preview of previews) {
                URL.revokeObjectURL(preview);
            }
            previews.clear();
        };
    }, []);

    function liberarPreview(previewUrl: string): void {
        URL.revokeObjectURL(previewUrl);
        previewsRef.current.delete(previewUrl);
    }

    function limpiarSeleccion(): void {
        for (const archivo of seleccion) {
            liberarPreview(archivo.previewUrl);
        }
        setSeleccion([]);
    }

    function cerrar(): void {
        if (subiendo) return;
        limpiarSeleccion();
        onClose();
    }

    function quitarImagen(url: string): void {
        if (subiendo) return;
        const siguientes = imagenesLocales.filter((item) => item !== url);
        setImagenesLocales(siguientes);
        onAplicar(siguientes);
    }

    function quitarSeleccion(id: string): void {
        if (subiendo) return;
        setSeleccion((actuales) => {
            const objetivo = actuales.find((item) => item.id === id);
            if (objetivo) liberarPreview(objetivo.previewUrl);
            return actuales.filter((item) => item.id !== id);
        });
    }

    function handleSeleccion(event: ChangeEvent<HTMLInputElement>): void {
        const archivos = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (archivos.length === 0) return;

        const disponibles =
            MAX_IMAGENES_REFERENCIA - imagenesLocales.length - seleccion.length;
        if (disponibles <= 0) {
            setError(
                `Ya tienes ${MAX_IMAGENES_REFERENCIA} imágenes. Quita una antes de agregar otra.`
            );
            return;
        }
        if (archivos.length > disponibles) {
            setError(
                `Solo puedes agregar ${disponibles} imagen(es) más (máximo ${MAX_IMAGENES_REFERENCIA}).`
            );
            return;
        }

        const nuevos: ArchivoSeleccionado[] = [];
        for (const archivo of archivos) {
            const extension = EXTENSION_POR_MIME[archivo.type];
            if (!extension) {
                setError(
                    'Formato no permitido. Usa una imagen JPG, PNG o WebP.'
                );
                nuevos.forEach((item) => liberarPreview(item.previewUrl));
                return;
            }
            if (archivo.size <= 0) {
                setError('La imagen está vacía. Intenta seleccionarla de nuevo.');
                nuevos.forEach((item) => liberarPreview(item.previewUrl));
                return;
            }
            if (archivo.size > MAX_BYTES_IMAGEN) {
                setError('Cada imagen debe pesar máximo 5 MB.');
                nuevos.forEach((item) => liberarPreview(item.previewUrl));
                return;
            }

            const previewUrl = URL.createObjectURL(archivo);
            previewsRef.current.add(previewUrl);
            nuevos.push({
                id: nuevoId(),
                file: archivo,
                previewUrl,
            });
        }

        setError(null);
        setSeleccion((actuales) => [...actuales, ...nuevos]);
    }

    function aplicar(next: string[]): void {
        setImagenesLocales(next);
        onAplicar(next);
    }

    async function subirSeleccion(): Promise<void> {
        if (subiendo || seleccion.length === 0) return;

        const email = user?.email?.trim().toLowerCase() ?? '';
        if (!email) {
            setError('Sesión inválida. Vuelve a iniciar sesión.');
            return;
        }

        setSubiendo(true);
        setError(null);
        const nuevas: string[] = [];
        let completadas = 0;

        try {
            const idDocumento = documentoId.replace(/\//g, '_');
            for (const archivo of seleccion) {
                const extension = EXTENSION_POR_MIME[archivo.file.type];
                const storagePath = `inventario_repuestos/${email}/ref-${idDocumento}-${nuevoId()}.${extension}`;
                const storageRef = ref(storage, storagePath);

                await uploadBytes(storageRef, archivo.file, {
                    contentType: archivo.file.type,
                });
                const url = await getDownloadURL(storageRef);
                const pathEnUrl = extraerStoragePath(url);
                if (!pathEnUrl || pathEnUrl !== storagePath) {
                    throw new Error(
                        'La URL de la imagen no coincide con la ruta subida.'
                    );
                }

                nuevas.push(url);
                completadas += 1;
            }

            aplicar([...imagenesLocales, ...nuevas].slice(0, MAX_IMAGENES_REFERENCIA));
            for (const archivo of seleccion) {
                liberarPreview(archivo.previewUrl);
            }
            setSeleccion([]);
            toast.success(
                nuevas.length === 1
                    ? 'Imagen de referencia agregada.'
                    : 'Imágenes de referencia agregadas.'
            );
        } catch (errorSubida) {
            if (nuevas.length > 0) {
                aplicar(
                    [...imagenesLocales, ...nuevas].slice(
                        0,
                        MAX_IMAGENES_REFERENCIA
                    )
                );
                const procesadas = seleccion.slice(0, completadas);
                for (const archivo of procesadas) {
                    liberarPreview(archivo.previewUrl);
                }
                setSeleccion((actuales) => actuales.slice(completadas));
            }
            const mensaje = mensajeDeError(
                errorSubida,
                'No se pudieron subir las imágenes. Inténtalo de nuevo.'
            );
            setError(mensaje);
            toast.error(mensaje);
        } finally {
            setSubiendo(false);
        }
    }

    const total = imagenesLocales.length + seleccion.length;

    return (
        <ModalWrapper
            isOpen={isOpen}
            onClose={cerrar}
            title={`Imágenes de referencia — ${referencia}`}
            maxWidth="720px"
        >
            <div className="space-y-4 p-6">
                <p className="text-xs leading-relaxed text-gray-400">
                    Hasta {MAX_IMAGENES_REFERENCIA} imágenes JPG, PNG o WebP de
                    máximo 5 MB. Se guardan como URLs de Firebase Storage y se
                    aplican al guardar la ficha.
                </p>

                <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>
                        {total} de {MAX_IMAGENES_REFERENCIA} imágenes
                    </span>
                    {subiendo ? (
                        <span className="inline-flex items-center gap-1.5 text-sky-300">
                            <Loader2
                                aria-hidden="true"
                                className="h-3.5 w-3.5 animate-spin"
                            />
                            Subiendo…
                        </span>
                    ) : null}
                </div>

                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Imágenes actuales
                    </p>
                    {imagenesLocales.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-500">
                            Esta ficha aún no tiene imágenes de referencia.
                        </p>
                    ) : (
                        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {imagenesLocales.map((url, indice) => (
                                <li
                                    key={`${url}-${indice}`}
                                    className="overflow-hidden rounded-lg border border-gray-700 bg-gray-950/60"
                                >
                                    <div className="relative h-24 w-full bg-gray-900">
                                        <Image
                                            src={url}
                                            alt={`Imagen de referencia ${indice + 1} de ${referencia}`}
                                            fill
                                            unoptimized
                                            className="object-cover"
                                            sizes="(max-width: 640px) 50vw, 200px"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => quitarImagen(url)}
                                        disabled={subiendo}
                                        aria-label={`Quitar imagen de referencia ${indice + 1}`}
                                        className="inline-flex w-full items-center justify-center gap-1 border-t border-gray-800 px-2 py-1.5 text-[11px] font-semibold text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <Trash2
                                            aria-hidden="true"
                                            className="h-3.5 w-3.5"
                                        />
                                        Quitar
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {seleccion.length > 0 ? (
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Listas para subir
                        </p>
                        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {seleccion.map((archivo, indice) => (
                                <li
                                    key={archivo.id}
                                    className="overflow-hidden rounded-lg border border-sky-800/70 bg-sky-950/20"
                                >
                                    <div className="relative h-24 w-full bg-gray-900">
                                        <Image
                                            src={archivo.previewUrl}
                                            alt={`Vista previa ${indice + 1}`}
                                            fill
                                            unoptimized
                                            className="object-cover"
                                            sizes="(max-width: 640px) 50vw, 200px"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            quitarSeleccion(archivo.id)
                                        }
                                        disabled={subiendo}
                                        aria-label={`Quitar vista previa ${indice + 1}`}
                                        className="inline-flex w-full items-center justify-center gap-1 border-t border-sky-900/70 px-2 py-1.5 text-[11px] font-semibold text-amber-200 hover:bg-sky-950/50 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <Trash2
                                            aria-hidden="true"
                                            className="h-3.5 w-3.5"
                                        />
                                        Quitar
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                <label
                    htmlFor="imagenes-referencia-input"
                    className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
                        subiendo ||
                        total >= MAX_IMAGENES_REFERENCIA
                            ? 'cursor-not-allowed border-gray-800 bg-gray-950/40 opacity-60'
                            : 'border-gray-700 bg-gray-950/60 hover:border-red-500/70'
                    }`}
                >
                    <ImagePlus
                        aria-hidden="true"
                        className="h-6 w-6 text-red-400"
                    />
                    <span className="text-sm font-semibold text-white">
                        Seleccionar imágenes
                    </span>
                    <span className="text-[11px] text-gray-500">
                        Puedes elegir varias a la vez
                    </span>
                    <input
                        id="imagenes-referencia-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={handleSeleccion}
                        disabled={
                            subiendo || total >= MAX_IMAGENES_REFERENCIA
                        }
                        className="sr-only"
                    />
                </label>

                {error ? (
                    <p
                        role="alert"
                        className="flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs leading-relaxed text-red-100"
                    >
                        <AlertCircle
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        {error}
                    </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2 border-t border-gray-800 pt-4">
                    <button
                        type="button"
                        onClick={cerrar}
                        disabled={subiendo}
                        className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Cerrar
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            void subirSeleccion();
                        }}
                        disabled={subiendo || seleccion.length === 0}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {subiendo ? (
                            <Loader2
                                aria-hidden="true"
                                className="h-4 w-4 animate-spin"
                            />
                        ) : (
                            <ImagePlus
                                aria-hidden="true"
                                className="h-4 w-4"
                            />
                        )}
                        {subiendo
                            ? 'Subiendo…'
                            : `Subir y añadir (${seleccion.length})`}
                    </button>
                </div>
            </div>
        </ModalWrapper>
    );
}
