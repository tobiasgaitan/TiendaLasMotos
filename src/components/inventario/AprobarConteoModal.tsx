'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ModalWrapper from '@/components/admin/ModalWrapper';
import { useAuth } from '@/context/AuthContext';
import { aprobarConteo } from '@/app/admin/inventory/actions/aprobarConteo';
import {
    datosMaestroSchema,
    type AprobarConteoInput,
    type DatosMaestroInput,
} from '@/lib/actions/inventario-schemas';
import {
    construirDatosMaestro,
    parseAplicaA,
} from '@/lib/inventario/ui-helpers';
import { db } from '@/lib/firebase';
import type { PendienteDTO } from '@/types/inventario';

interface AprobarConteoModalProps {
    pendiente: PendienteDTO;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => Promise<void>;
    accionEnCurso: boolean;
    onAccionEnCursoChange: (enCurso: boolean) => void;
}

function mensajeDeRespuesta(
    message: string | undefined,
    fallback: string
): string {
    if (typeof message === 'string' && message.trim()) {
        return message;
    }
    return fallback;
}

function mensajeDeError(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return fallback;
}

export default function AprobarConteoModal({
    pendiente,
    isOpen,
    onClose,
    onSuccess,
    accionEnCurso,
    onAccionEnCursoChange,
}: AprobarConteoModalProps) {
    const { user } = useAuth();

    const [esReferenciaNueva, setEsReferenciaNueva] = useState<
        boolean | null
    >(null);
    const [verificando, setVerificando] = useState(true);
    const [checkError, setCheckError] = useState<string | null>(null);
    const [actualizarDatos, setActualizarDatos] = useState(false);

    const [fabricante, setFabricante] = useState('');
    const [aplicaA, setAplicaA] = useState('');
    const [categoria, setCategoria] = useState('');
    const [precio, setPrecio] = useState('');
    const [stockMinimo, setStockMinimo] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        let cancelado = false;

        setEsReferenciaNueva(null);
        setVerificando(true);
        setCheckError(null);
        setActualizarDatos(false);
        setFabricante('');
        setAplicaA('');
        setCategoria('');
        setPrecio('');
        setStockMinimo('');
        setError(null);

        const referencia = pendiente.referencia_confirmada
            .trim()
            .toUpperCase();

        if (!referencia) {
            console.error(
                '[inventario-ui] El conteo no tiene referencia confirmada:',
                pendiente.id
            );
            setVerificando(false);
            setActualizarDatos(true);
            setCheckError(
                'La referencia confirmada está vacía. Si la referencia es nueva, completa los datos maestros.'
            );
            return () => {
                cancelado = true;
            };
        }

        const verificarReferencia = async () => {
            try {
                const snap = await getDoc(
                    doc(db, 'inventario_repuestos', referencia)
                );
                if (cancelado) return;

                const existe = snap.exists();
                setEsReferenciaNueva(!existe);
                setActualizarDatos(!existe);
            } catch (errorLectura) {
                console.error(
                    '[inventario-ui] No se pudo verificar la referencia:',
                    errorLectura
                );
                if (cancelado) return;

                setEsReferenciaNueva(null);
                setActualizarDatos(true);
                setCheckError(
                    'No se pudo verificar si la referencia existe. Si la referencia es nueva, completa los datos maestros.'
                );
            } finally {
                if (!cancelado) {
                    setVerificando(false);
                }
            }
        };

        void verificarReferencia();

        return () => {
            cancelado = true;
        };
    }, [isOpen, pendiente.id, pendiente.referencia_confirmada]);

    const camposObligatorios = esReferenciaNueva === true;
    const mostrarCampos =
        esReferenciaNueva === true ||
        (esReferenciaNueva === false && actualizarDatos) ||
        (esReferenciaNueva === null && checkError !== null);

    function hayDatosMaestros(): boolean {
        return Boolean(
            fabricante.trim() ||
                aplicaA.trim() ||
                categoria.trim() ||
                precio.trim() ||
                stockMinimo.trim()
        );
    }

    function validarCamposObligatorios(): string | null {
        const aplica = parseAplicaA(aplicaA);
        const precioNumero = Number(precio);
        const stockNumero = Number(stockMinimo);

        if (!fabricante.trim() || fabricante.trim().length > 100) {
            return 'El fabricante es obligatorio y debe tener entre 1 y 100 caracteres.';
        }
        if (
            aplica.length < 1 ||
            aplica.length > 50 ||
            aplica.some((item) => item.length > 100)
        ) {
            return 'Aplica a debe tener entre 1 y 50 elementos de máximo 100 caracteres.';
        }
        if (!categoria.trim() || categoria.trim().length > 100) {
            return 'La categoría es obligatoria y debe tener entre 1 y 100 caracteres.';
        }
        if (
            !precio.trim() ||
            !Number.isFinite(precioNumero) ||
            precioNumero < 0
        ) {
            return 'El precio debe ser un número mayor o igual a 0.';
        }
        if (
            !stockMinimo.trim() ||
            !Number.isInteger(stockNumero) ||
            stockNumero < 0
        ) {
            return 'El stock mínimo debe ser un entero mayor o igual a 0.';
        }

        return null;
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);

        if (verificando) {
            setError('Espera a que termine la verificación de la referencia.');
            return;
        }

        const usuario = user;
        if (!usuario) {
            setError('Sesión inválida. Vuelve a iniciar sesión.');
            return;
        }

        if (!pendiente.id.trim()) {
            setError('El conteo no tiene un identificador válido.');
            return;
        }

        const debeEnviarDatos =
            camposObligatorios ||
            actualizarDatos ||
            (esReferenciaNueva === null && checkError !== null);

        let datosMaestro: DatosMaestroInput | undefined;

        if (debeEnviarDatos) {
            if (camposObligatorios) {
                const errorCampos = validarCamposObligatorios();
                if (errorCampos) {
                    setError(errorCampos);
                    return;
                }
            }

            const datosConstruidos = construirDatosMaestro({
                fabricante,
                aplicaA,
                categoria,
                precio,
                stockMinimo,
            });

            if (!datosConstruidos) {
                if (camposObligatorios || hayDatosMaestros()) {
                    setError('Revisa los datos maestros e intenta de nuevo.');
                    return;
                }
            } else {
                const validacion = datosMaestroSchema.safeParse(
                    datosConstruidos
                );
                if (!validacion.success) {
                    const primerError = validacion.error.issues[0];
                    const detalle = primerError
                        ? ` ${primerError.message}`
                        : '';
                    setError(
                        `Revisa los datos maestros.${detalle}`.trim()
                    );
                    return;
                }
                datosMaestro = validacion.data;
            }
        }

        const entrada: AprobarConteoInput = {
            conteo_id: pendiente.id,
        };
        if (datosMaestro) {
            entrada.datos_maestro = datosMaestro;
        }

        onAccionEnCursoChange(true);

        try {
            const idToken = await usuario.getIdToken();
            const resultado = await aprobarConteo(entrada, {
                uid: usuario.uid,
                idToken,
            });

            if (resultado.success) {
                toast.success('Conteo aprobado.');
                await onSuccess();
                return;
            }

            const mensaje = mensajeDeRespuesta(
                resultado.message,
                'No se pudo aprobar el conteo.'
            );
            setError(mensaje);
            toast.error(mensaje);
        } catch (errorEnvio) {
            console.error(
                '[inventario-ui] aprobarConteo falló:',
                errorEnvio
            );
            const mensaje = mensajeDeError(
                errorEnvio,
                'No se pudo aprobar el conteo.'
            );
            setError(mensaje);
            toast.error(mensaje);
        } finally {
            onAccionEnCursoChange(false);
        }
    }

    return (
        <ModalWrapper
            isOpen={isOpen}
            onClose={onClose}
            title="Aprobar conteo"
            maxWidth="640px"
        >
            <form
                onSubmit={handleSubmit}
                className="space-y-4 p-6"
                noValidate
            >
                <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-3">
                    <p className="font-mono text-sm font-semibold text-white">
                        {pendiente.referencia_confirmada || '—'}
                    </p>
                    <p className="mt-1 text-sm text-gray-300">
                        {pendiente.descripcion || 'Sin descripción'}
                    </p>
                    <p className="mt-2 text-xs text-gray-500">
                        Cantidad: {pendiente.cantidad_contada} · Ubicación:{' '}
                        {pendiente.ubicacion || '—'}
                    </p>
                </div>

                {verificando ? (
                    <div
                        role="status"
                        className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950/60 px-3 py-3 text-sm text-gray-300"
                    >
                        <Loader2
                            aria-hidden="true"
                            className="h-4 w-4 animate-spin text-red-400"
                        />
                        Verificando si la referencia existe…
                    </div>
                ) : null}

                {!verificando && esReferenciaNueva === true ? (
                    <p className="rounded-xl border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
                        Referencia nueva: completa los datos maestros.
                    </p>
                ) : null}

                {!verificando && esReferenciaNueva === false ? (
                    <div className="space-y-3">
                        <p className="rounded-xl border border-blue-900/60 bg-blue-950/20 px-3 py-2 text-sm text-blue-100">
                            Referencia existente: el stock se sobrescribirá
                            con el conteo.
                        </p>
                        <label className="flex items-center gap-2 text-sm text-gray-300">
                            <input
                                type="checkbox"
                                checked={actualizarDatos}
                                disabled={accionEnCurso}
                                onChange={(event) =>
                                    setActualizarDatos(event.target.checked)
                                }
                                className="h-4 w-4 rounded border-gray-600 bg-gray-950 text-red-500 focus:ring-red-500"
                            />
                            Actualizar datos maestros
                        </label>
                    </div>
                ) : null}

                {!verificando && esReferenciaNueva === null && checkError ? (
                    <p className="rounded-xl border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
                        {checkError}
                    </p>
                ) : null}

                {mostrarCampos ? (
                    <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-950/50 p-3">
                        <div>
                            <label
                                htmlFor="aprobacion-fabricante"
                                className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                            >
                                Fabricante{' '}
                                {camposObligatorios ? (
                                    <span aria-hidden="true">*</span>
                                ) : null}
                            </label>
                            <input
                                id="aprobacion-fabricante"
                                type="text"
                                required={camposObligatorios}
                                maxLength={100}
                                value={fabricante}
                                disabled={accionEnCurso}
                                onChange={(event) =>
                                    setFabricante(event.target.value)
                                }
                                className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                                placeholder="Ej. Bosch"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="aprobacion-aplica-a"
                                className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                            >
                                Aplica a{' '}
                                {camposObligatorios ? (
                                    <span aria-hidden="true">*</span>
                                ) : null}
                            </label>
                            <input
                                id="aprobacion-aplica-a"
                                type="text"
                                required={camposObligatorios}
                                maxLength={5000}
                                value={aplicaA}
                                disabled={accionEnCurso}
                                onChange={(event) =>
                                    setAplicaA(event.target.value)
                                }
                                className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                                placeholder="motor, frenos, embrague"
                            />
                            <p className="mt-1 text-[11px] text-gray-500">
                                Separa los elementos con comas.
                            </p>
                        </div>

                        <div>
                            <label
                                htmlFor="aprobacion-categoria"
                                className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                            >
                                Categoría{' '}
                                {camposObligatorios ? (
                                    <span aria-hidden="true">*</span>
                                ) : null}
                            </label>
                            <input
                                id="aprobacion-categoria"
                                type="text"
                                required={camposObligatorios}
                                maxLength={100}
                                value={categoria}
                                disabled={accionEnCurso}
                                onChange={(event) =>
                                    setCategoria(event.target.value)
                                }
                                className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                                placeholder="Ej. Filtros"
                            />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label
                                    htmlFor="aprobacion-precio"
                                    className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                                >
                                    Precio{' '}
                                    {camposObligatorios ? (
                                        <span aria-hidden="true">*</span>
                                    ) : null}
                                </label>
                                <input
                                    id="aprobacion-precio"
                                    type="number"
                                    required={camposObligatorios}
                                    min={0}
                                    step={0.01}
                                    inputMode="decimal"
                                    value={precio}
                                    disabled={accionEnCurso}
                                    onChange={(event) =>
                                        setPrecio(event.target.value)
                                    }
                                    className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                                    placeholder="0.00"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="aprobacion-stock-minimo"
                                    className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                                >
                                    Stock mínimo{' '}
                                    {camposObligatorios ? (
                                        <span aria-hidden="true">*</span>
                                    ) : null}
                                </label>
                                <input
                                    id="aprobacion-stock-minimo"
                                    type="number"
                                    required={camposObligatorios}
                                    min={0}
                                    step={1}
                                    inputMode="numeric"
                                    value={stockMinimo}
                                    disabled={accionEnCurso}
                                    onChange={(event) =>
                                        setStockMinimo(event.target.value)
                                    }
                                    className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                                    placeholder="0"
                                />
                            </div>
                        </div>
                    </div>
                ) : null}

                {error ? (
                    <div
                        role="alert"
                        className="flex items-start gap-2 rounded-xl border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-100"
                    >
                        <AlertCircle
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <p className="leading-relaxed">{error}</p>
                    </div>
                ) : null}

                <div className="flex flex-col-reverse gap-2 border-t border-gray-800 pt-4 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={accionEnCurso}
                        aria-label="Cancelar aprobación"
                        className="inline-flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={verificando || accionEnCurso}
                        aria-label="Aprobar conteo"
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {accionEnCurso ? (
                            <Loader2
                                aria-hidden="true"
                                className="h-4 w-4 animate-spin"
                            />
                        ) : null}
                        Aprobar
                    </button>
                </div>
            </form>
        </ModalWrapper>
    );
}
