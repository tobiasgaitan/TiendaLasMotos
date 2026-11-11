"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
    AlertCircle,
    CheckCircle2,
    Loader2,
    RefreshCw,
    Save,
    Wifi,
    WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import {
    referenciaSchema,
    ubicacionSchema,
} from "@/lib/actions/inventario-schemas";
import {
    esMimeFotoPermitido,
    generarConteoId,
    MAX_FOTO_BYTES,
    type FotoSubida,
    type OpcionesEncolarConteo,
} from "@/lib/offline/outbox-utils";
import type { EntradaBorradorConteo } from "@/lib/offline/outbox";
import { prepararYSubirFoto } from "@/lib/offline/upload-foto";
import {
    conTimeout,
    TIMEOUT_ANALISIS_MS,
} from "@/lib/inventario/timeout";
import { analizarImagenRepuesto } from "@/app/admin/inventory/actions/analizarImagenRepuesto";
import { crearConteoPendiente } from "@/app/admin/inventory/actions/crearConteoPendiente";
import type {
    RepuestoCandidato,
    VisionSugerencia,
    VisionUnidad,
} from "@/types/inventario";
import AccesoDenegado from "@/components/inventario/AccesoDenegado";
import FotoConteoPicker from "@/components/inventario/FotoConteoPicker";
import SelectorReferenciaRepuesto from "@/components/inventario/SelectorReferenciaRepuesto";
import SugerenciasVision from "@/components/inventario/SugerenciasVision";

function esErrorReintentable(mensaje: string): boolean {
    const texto = mensaje.trim().toLowerCase();
    if (!texto) return false;
    if (
        texto.includes("datos del conteo inválidos") ||
        texto.includes("no autorizado") ||
        texto.includes("permiso") ||
        texto.includes("solo un asesor") ||
        texto.includes("no coincide con la sesión") ||
        texto.includes("identificador del conteo ya está en uso") ||
        texto.includes("no pertenece") ||
        texto.includes("no coincide con la url") ||
        texto.includes("foto no es una url") ||
        texto.includes("debe usar https") ||
        texto.includes("referencia seleccionada no existe")
    ) {
        return false;
    }
    return (
        texto.startsWith("error al crear el conteo:") ||
        texto.includes("unavailable") ||
        texto.includes("deadline") ||
        texto.includes("timeout") ||
        texto.includes("network")
    );
}

function mensajeDeError(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return fallback;
}

export default function ConteoAsesorForm() {
    const { user } = useAuth();
    const {
        online,
        pendientes,
        sincronizando,
        ultimoError,
        encolarConteo,
        refrescarPendientes,
    } = useOfflineQueue();

    const [conteoId, setConteoId] = useState<string>(() =>
        generarConteoId()
    );
    const [foto, setFoto] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [fotoSubida, setFotoSubida] = useState<FotoSubida | null>(null);
    const [sugerencias, setSugerencias] = useState<VisionSugerencia[]>([]);
    const [etiquetas, setEtiquetas] = useState<string[]>([]);
    const [unidades, setUnidades] = useState<VisionUnidad[]>([]);
    const [referenciaSugerida, setReferenciaSugerida] = useState("");
    const [referenciaConfirmada, setReferenciaConfirmada] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [cantidadContada, setCantidadContada] = useState("");
    const [ubicacion, setUbicacion] = useState("");
    const [anotaciones, setAnotaciones] = useState("");
    const [analizando, setAnalizando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fotoError, setFotoError] = useState<string | null>(null);
    const [visionError, setVisionError] = useState<string | null>(null);
    const [puedeReintentar, setPuedeReintentar] = useState(false);

    const analisisSeqRef = useRef(0);

    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    const asesorEmail = user && typeof user.email === "string"
        ? user.email.trim().toLowerCase()
        : "";

    if (!user || !asesorEmail) {
        return (
            <AccesoDenegado mensaje="Sesión inválida. Vuelve a iniciar sesión." />
        );
    }

    // La guarda anterior estrecha el tipo para los callbacks asíncronos.
    const usuario = user;

    function limpiarFormulario(): void {
        analisisSeqRef.current += 1;
        setFoto(null);
        setPreviewUrl(null);
        setFotoSubida(null);
        setSugerencias([]);
        setEtiquetas([]);
        setUnidades([]);
        setReferenciaSugerida("");
        setReferenciaConfirmada("");
        setDescripcion("");
        setCantidadContada("");
        setUbicacion("");
        setAnotaciones("");
        setError(null);
        setFotoError(null);
        setVisionError(null);
        setPuedeReintentar(false);
        setAnalizando(false);

        try {
            setConteoId(generarConteoId());
        } catch (errorNuevoId) {
            console.error(
                "[inventario-ui] No se pudo regenerar el conteo_id:",
                errorNuevoId
            );
            setError(
                "No se pudo generar un nuevo identificador. Recarga la página."
            );
        }
    }

    async function analizarFoto(
        fotoParaAnalizar: File,
        idConteo: string
    ): Promise<void> {
        const secuencia = analisisSeqRef.current + 1;
        analisisSeqRef.current = secuencia;
        setAnalizando(true);
        setVisionError(null);

        const ejecutarAnalisis = async (): Promise<void> => {
            const subida = await prepararYSubirFoto(
                fotoParaAnalizar,
                asesorEmail,
                idConteo
            );
            if (analisisSeqRef.current !== secuencia) {
                return;
            }
            setFotoSubida(subida);

            const idToken = await usuario.getIdToken();
            if (analisisSeqRef.current !== secuencia) {
                return;
            }
            const resultado = await analizarImagenRepuesto(
                { foto_url: subida.foto_url },
                { uid: usuario.uid, idToken }
            );
            if (analisisSeqRef.current !== secuencia) {
                return;
            }

            if (resultado.success) {
                setSugerencias(resultado.sugerencias);
                setEtiquetas(resultado.etiquetas.slice(0, 10));
                setUnidades(resultado.unidades);
                setReferenciaSugerida("");
            } else {
                setSugerencias([]);
                setEtiquetas([]);
                setUnidades([]);
                setVisionError(resultado.message);
            }
        };

        try {
            await conTimeout(
                ejecutarAnalisis(),
                TIMEOUT_ANALISIS_MS,
                "El análisis tardó demasiado. Puedes guardar el conteo o reintentar."
            );
        } catch (errorAnalisis) {
            console.error(
                "[inventario-ui] No se pudo analizar la foto:",
                errorAnalisis
            );
            if (analisisSeqRef.current === secuencia) {
                if (
                    typeof errorAnalisis === 'object' &&
                    errorAnalisis !== null &&
                    'name' in errorAnalisis &&
                    errorAnalisis.name === 'TimeoutError'
                ) {
                    analisisSeqRef.current += 1;
                    setAnalizando(false);
                }
                setSugerencias([]);
                setEtiquetas([]);
                setUnidades([]);
                setVisionError(
                    mensajeDeError(
                        errorAnalisis,
                        "No se pudo subir o analizar la foto. Puedes guardar sin conexión."
                    )
                );
            }
        } finally {
            if (analisisSeqRef.current === secuencia) {
                setAnalizando(false);
            }
        }
    }

    function handleFotoChange(archivo: File): void {
        const mime = archivo.type.trim().toLowerCase();
        if (!esMimeFotoPermitido(mime)) {
            setFotoError(
                "Formato no permitido. Usa una foto JPG, PNG o WebP."
            );
            return;
        }
        if (archivo.size <= 0) {
            setFotoError("La foto está vacía. Intenta tomarla de nuevo.");
            return;
        }
        if (archivo.size > MAX_FOTO_BYTES) {
            setFotoError("La foto supera el máximo de 5 MB.");
            return;
        }

        let nuevoId: string;
        try {
            nuevoId = generarConteoId();
        } catch (errorNuevoId) {
            console.error(
                "[inventario-ui] No se pudo generar conteo_id para la foto:",
                errorNuevoId
            );
            setFotoError(
                "No se pudo generar el identificador del conteo. Recarga la página."
            );
            return;
        }

        analisisSeqRef.current += 1;
        setAnalizando(false);
        setFoto(archivo);
        setFotoSubida(null);
        setSugerencias([]);
        setEtiquetas([]);
        setUnidades([]);
        setReferenciaSugerida("");
        setReferenciaConfirmada("");
        setVisionError(null);
        setError(null);
        setPuedeReintentar(false);
        setFotoError(null);
        setConteoId(nuevoId);

        try {
            const objectUrl = URL.createObjectURL(archivo);
            setPreviewUrl(objectUrl);
        } catch (errorPreview) {
            console.error(
                "[inventario-ui] No se pudo crear la vista previa:",
                errorPreview
            );
            setPreviewUrl(null);
            setFotoError("No se pudo mostrar la vista previa de la foto.");
        }

        if (online) {
            void analizarFoto(archivo, nuevoId);
        } else {
            setVisionError(
                "Sin conexión: la foto y el conteo se guardarán localmente con el mismo conteo_id."
            );
        }
    }

    function handleQuitarFoto(): void {
        analisisSeqRef.current += 1;
        setAnalizando(false);
        setFoto(null);
        setPreviewUrl(null);
        setFotoSubida(null);
        setSugerencias([]);
        setEtiquetas([]);
        setUnidades([]);
        setReferenciaSugerida("");
        setReferenciaConfirmada("");
        setVisionError(null);
        setFotoError(null);
        setError(null);
        setPuedeReintentar(false);
    }

    function construirEntrada(): EntradaBorradorConteo | null {
        if (!foto) {
            setError("Toma una foto del repuesto antes de guardar.");
            return null;
        }

        if (!referenciaConfirmada.trim()) {
            setError(
                "Selecciona una referencia existente del catálogo antes de guardar."
            );
            return null;
        }

        const referencia = referenciaSchema.safeParse(referenciaConfirmada);
        if (!referencia.success) {
            setError("La referencia seleccionada no es válida.");
            return null;
        }

        const ubicacionValidada = ubicacionSchema.safeParse(ubicacion);
        if (!ubicacionValidada.success) {
            setError("La ubicación debe tener el formato A-01-05.");
            return null;
        }

        if (!cantidadContada.trim()) {
            setError("Ingresa la cantidad contada.");
            return null;
        }
        const cantidad = Number(cantidadContada);
        if (
            !Number.isInteger(cantidad) ||
            cantidad < 0 ||
            cantidad > 1_000_000
        ) {
            setError("La cantidad debe ser un número entero entre 0 y 1.000.000.");
            return null;
        }

        const descripcionLimpia = descripcion.trim();
        if (descripcionLimpia.length < 2 || descripcionLimpia.length > 200) {
            setError("La descripción debe tener entre 2 y 200 caracteres.");
            return null;
        }

        const anotacionesLimpias = anotaciones.trim();
        if (anotacionesLimpias.length > 500) {
            setError("Las anotaciones no pueden superar 500 caracteres.");
            return null;
        }

        const sugerida = referenciaSugerida.trim().slice(0, 64);

        return {
            referencia_sugerida: sugerida,
            referencia_confirmada: referencia.data,
            descripcion: descripcionLimpia,
            cantidad_contada: cantidad,
            ubicacion: ubicacionValidada.data,
            anotaciones: anotacionesLimpias,
            etiquetas_vision: etiquetas.slice(0, 10),
        };
    }

    async function guardarEnCola(
        entrada: EntradaBorradorConteo,
        fotoParaGuardar: File,
        idConteo: string,
        subida: FotoSubida | null
    ): Promise<void> {
        const opciones: OpcionesEncolarConteo = { conteoId: idConteo };
        if (subida) {
            opciones.fotoSubida = subida;
        }

        await encolarConteo(
            entrada,
            fotoParaGuardar,
            asesorEmail,
            opciones
        );
        toast.success(
            "Conteo guardado en el dispositivo. Se enviará cuando haya conexión."
        );
        limpiarFormulario();
        await refrescarPendientes();
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setPuedeReintentar(false);

        const entrada = construirEntrada();
        if (!entrada) return;

        setGuardando(true);
        let subidaActual: FotoSubida | null = fotoSubida;

        try {
            if (!online) {
                await guardarEnCola(
                    entrada,
                    foto as File,
                    conteoId,
                    subidaActual
                );
                return;
            }

            if (!subidaActual) {
                subidaActual = await prepararYSubirFoto(
                    foto as File,
                    asesorEmail,
                    conteoId
                );
                setFotoSubida(subidaActual);
            }

            const idToken = await usuario.getIdToken();
            const resultado = await crearConteoPendiente(
                {
                    ...entrada,
                    conteo_id: conteoId,
                    foto_url: subidaActual.foto_url,
                    storage_path: subidaActual.storage_path,
                    nombre_archivo: subidaActual.nombre_archivo,
                    mime_type: subidaActual.mime_type,
                    tamano_bytes: subidaActual.tamano_bytes,
                },
                { uid: usuario.uid, idToken }
            );

            if (resultado.success) {
                toast.success("Conteo enviado a revisión.");
                limpiarFormulario();
                await refrescarPendientes();
                return;
            }

            const mensaje = resultado.message
                ? resultado.message
                : "No se pudo guardar el conteo.";
            setError(mensaje);
            setPuedeReintentar(esErrorReintentable(mensaje));
            toast.error(mensaje);
        } catch (errorEnvio) {
            console.error(
                "[inventario-ui] Envío online falló; se guardará en outbox:",
                errorEnvio
            );
            try {
                await guardarEnCola(
                    entrada,
                    foto as File,
                    conteoId,
                    subidaActual
                );
            } catch (errorCola) {
                console.error(
                    "[inventario-ui] No se pudo guardar el conteo en outbox:",
                    errorCola
                );
                setError(
                    mensajeDeError(
                        errorCola,
                        "No se pudo guardar el conteo localmente. Intenta de nuevo."
                    )
                );
                toast.error("No se pudo guardar el conteo.");
            }
        } finally {
            setGuardando(false);
        }
    }

    async function handleReintentar(): Promise<void> {
        setError(null);
        setPuedeReintentar(false);
        const entrada = construirEntrada();
        if (!entrada) return;

        setGuardando(true);
        try {
            await guardarEnCola(
                entrada,
                foto as File,
                conteoId,
                fotoSubida
            );
        } catch (errorCola) {
            console.error(
                "[inventario-ui] Reintento de guardado local falló:",
                errorCola
            );
            setError(
                mensajeDeError(
                    errorCola,
                    "No se pudo guardar el conteo localmente."
                )
            );
            toast.error("No se pudo guardar el conteo localmente.");
        } finally {
            setGuardando(false);
        }
    }

    const enviarDeshabilitado =
        guardando || analizando || !foto || !referenciaConfirmada;

    return (
        <div className="mx-auto w-full max-w-2xl space-y-5 pb-24">
            <header className="space-y-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
                        Inventario de repuestos
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
                        Conteo del asesor
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-gray-400">
                        Fotografía el repuesto, confirma la referencia y envía
                        el conteo a revisión.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${
                            online
                                ? "border-emerald-900/70 bg-emerald-950/30 text-emerald-300"
                                : "border-amber-900/70 bg-amber-950/30 text-amber-200"
                        }`}
                    >
                        {online ? (
                            <Wifi aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : (
                            <WifiOff
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                            />
                        )}
                        {online ? "En línea" : "Sin conexión"}
                    </span>

                    {pendientes > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-900/70 px-2.5 py-1 font-semibold text-gray-300">
                            <RefreshCw
                                aria-hidden="true"
                                className={`h-3.5 w-3.5 ${
                                    sincronizando ? "animate-spin" : ""
                                }`}
                            />
                            {pendientes} pendiente
                            {pendientes === 1 ? "" : "s"}
                        </span>
                    ) : null}

                    {fotoSubida ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-900/60 bg-emerald-950/20 px-2.5 py-1 font-semibold text-emerald-300">
                            <CheckCircle2
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                            />
                            Foto lista
                        </span>
                    ) : null}
                </div>

                {ultimoError ? (
                    <p className="rounded-xl border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-100">
                        {ultimoError}
                    </p>
                ) : null}
            </header>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <FotoConteoPicker
                    foto={foto}
                    previewUrl={previewUrl}
                    error={fotoError}
                    disabled={guardando}
                    onFotoChange={handleFotoChange}
                    onQuitar={handleQuitarFoto}
                />

                <SugerenciasVision
                    sugerencias={sugerencias}
                    etiquetas={etiquetas}
                    unidades={unidades}
                    analizando={analizando}
                    error={visionError}
                    onUsarCantidad={(cantidad) =>
                        setCantidadContada(String(cantidad))
                    }
                    onReintentar={() => {
                        if (foto) {
                            void analizarFoto(foto, conteoId);
                        }
                    }}
                />

                <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 shadow-lg">
                    <div>
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                            2. Datos del conteo
                        </h2>
                        <p className="mt-1 text-xs text-gray-500">
                            La referencia se elige de las existencias del
                            catálogo maestro. No se acepta referencia libre.
                        </p>
                    </div>

                    <SelectorReferenciaRepuesto
                        etiquetas={etiquetas}
                        referenciaSeleccionada={referenciaConfirmada}
                        online={online}
                        disabled={guardando}
                        onSugerencia={(referencia) =>
                            setReferenciaSugerida(referencia.slice(0, 64))
                        }
                        onSeleccion={(candidato: RepuestoCandidato | null) => {
                            setReferenciaConfirmada(
                                candidato ? candidato.referencia : ""
                            );
                            if (
                                candidato &&
                                candidato.descripcion.trim() &&
                                !descripcion.trim()
                            ) {
                                setDescripcion(
                                    candidato.descripcion.slice(0, 200)
                                );
                            }
                        }}
                    />

                    <div>
                        <label
                            htmlFor="descripcion"
                            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                        >
                            Descripción <span aria-hidden="true">*</span>
                        </label>
                        <input
                            id="descripcion"
                            type="text"
                            required
                            value={descripcion}
                            maxLength={200}
                            onChange={(event) =>
                                setDescripcion(event.target.value)
                            }
                            className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950/80 px-3 py-3 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                            placeholder="Ej. Filtro de aceite"
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label
                                htmlFor="cantidad-contada"
                                className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                            >
                                Cantidad contada{" "}
                                <span aria-hidden="true">*</span>
                            </label>
                            <input
                                id="cantidad-contada"
                                type="number"
                                required
                                min={0}
                                max={1_000_000}
                                step={1}
                                inputMode="numeric"
                                value={cantidadContada}
                                onChange={(event) =>
                                    setCantidadContada(event.target.value)
                                }
                                className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950/80 px-3 py-3 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                                placeholder="0"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="ubicacion"
                                className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                            >
                                Ubicación <span aria-hidden="true">*</span>
                            </label>
                            <input
                                id="ubicacion"
                                type="text"
                                required
                                value={ubicacion}
                                maxLength={8}
                                autoCapitalize="characters"
                                spellCheck={false}
                                onChange={(event) =>
                                    setUbicacion(event.target.value)
                                }
                                onBlur={() =>
                                    setUbicacion((actual) =>
                                        actual.trim().toUpperCase()
                                    )
                                }
                                className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950/80 px-3 py-3 font-mono text-sm uppercase text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                                placeholder="A-01-05"
                            />
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="anotaciones"
                            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                        >
                            Anotaciones
                        </label>
                        <textarea
                            id="anotaciones"
                            value={anotaciones}
                            maxLength={500}
                            rows={3}
                            onChange={(event) =>
                                setAnotaciones(event.target.value)
                            }
                            className="mt-2 w-full resize-y rounded-xl border border-gray-700 bg-gray-950/80 px-3 py-3 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                            placeholder="Observaciones para el administrador (opcional)"
                        />
                        <p className="mt-1 text-right text-[11px] text-gray-600">
                            {anotaciones.length}/500
                        </p>
                    </div>
                </section>

                {error ? (
                    <div
                        role="alert"
                        className="rounded-2xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-100"
                    >
                        <div className="flex items-start gap-3">
                            <AlertCircle
                                aria-hidden="true"
                                className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
                            />
                            <div className="space-y-3">
                                <p className="leading-relaxed">{error}</p>
                                {puedeReintentar ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void handleReintentar();
                                        }}
                                        disabled={guardando}
                                        className="inline-flex items-center gap-2 rounded-lg border border-amber-700/70 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <Save
                                            aria-hidden="true"
                                            className="h-4 w-4"
                                        />
                                        Guardar para reintentar
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                        type="submit"
                        disabled={enviarDeshabilitado}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {guardando ? (
                            <Loader2
                                aria-hidden="true"
                                className="h-5 w-5 animate-spin"
                            />
                        ) : (
                            <Save aria-hidden="true" className="h-5 w-5" />
                        )}
                        {guardando
                            ? "Guardando…"
                            : analizando
                              ? "Analizando foto…"
                              : online
                                ? "Guardar conteo"
                                : "Guardar sin conexión"}
                    </button>

                    <button
                        type="button"
                        onClick={limpiarFormulario}
                        disabled={guardando}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-700 px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Limpiar
                    </button>
                </div>

                <p className="text-center text-xs leading-relaxed text-gray-500">
                    El identificador del conteo se mantiene desde la foto hasta
                    la sincronización. Si cambias la foto, se genera uno nuevo.
                </p>
            </form>
        </div>
    );
}
