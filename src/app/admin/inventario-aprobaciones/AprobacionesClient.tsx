'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import {
    AlertCircle,
    CheckCircle2,
    ImageOff,
    Loader2,
    RefreshCw,
    XCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { listarPendientes } from '@/app/admin/inventory/actions/listarPendientes';
import { formatearFecha } from '@/lib/inventario/ui-helpers';
import type { PendienteDTO } from '@/types/inventario';
import AprobarConteoModal from '@/components/inventario/AprobarConteoModal';
import RechazarConteoModal from '@/components/inventario/RechazarConteoModal';

interface MiniaturaConteoProps {
    fotoUrl: string;
    referencia: string;
}

function MiniaturaConteo({ fotoUrl, referencia }: MiniaturaConteoProps) {
    const [fallo, setFallo] = useState(false);
    const etiqueta = referencia.trim() ? referencia.trim() : 'sin referencia';

    if (!fotoUrl.trim() || fallo) {
        return (
            <div
                role="img"
                aria-label={`Sin miniatura para el repuesto ${etiqueta}`}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-950 text-gray-500"
            >
                <ImageOff aria-hidden="true" className="h-5 w-5" />
            </div>
        );
    }

    return (
        <div
            role="img"
            aria-label={`Miniatura del repuesto ${etiqueta}`}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-700 bg-gray-950"
        >
            <Image
                src={fotoUrl}
                alt=""
                fill
                unoptimized
                sizes="64px"
                className="object-cover"
                onError={() => setFallo(true)}
            />
        </div>
    );
}

interface BotonesAccionProps {
    pendiente: PendienteDTO;
    deshabilitados: boolean;
    onAprobar: (pendiente: PendienteDTO) => void;
    onRechazar: (pendiente: PendienteDTO) => void;
    anchoCompleto?: boolean;
}

function BotonesAccion({
    pendiente,
    deshabilitados,
    onAprobar,
    onRechazar,
    anchoCompleto = false,
}: BotonesAccionProps) {
    const referencia = pendiente.referencia_confirmada.trim()
        ? pendiente.referencia_confirmada.trim()
        : 'sin referencia';
    const claseAncho = anchoCompleto ? 'w-full' : '';

    return (
        <div className="flex flex-col gap-2 sm:flex-row">
            <button
                type="button"
                onClick={() => onAprobar(pendiente)}
                disabled={deshabilitados}
                aria-label={`Aprobar conteo ${referencia}`}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 ${claseAncho}`}
            >
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                Aprobar
            </button>
            <button
                type="button"
                onClick={() => onRechazar(pendiente)}
                disabled={deshabilitados}
                aria-label={`Rechazar conteo ${referencia}`}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50 ${claseAncho}`}
            >
                <XCircle aria-hidden="true" className="h-4 w-4" />
                Rechazar
            </button>
        </div>
    );
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

export default function AprobacionesClient() {
    const { user } = useAuth();
    const usuario = user;

    const [pendientes, setPendientes] = useState<PendienteDTO[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [accionEnCurso, setAccionEnCurso] = useState(false);
    const [conteoAprobando, setConteoAprobando] =
        useState<PendienteDTO | null>(null);
    const [conteoRechazando, setConteoRechazando] =
        useState<PendienteDTO | null>(null);

    const cargarPendientes = useCallback(async () => {
        if (!usuario) {
            setError('Sesión inválida. Vuelve a iniciar sesión.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const idToken = await usuario.getIdToken();
            const resultado = await listarPendientes(
                { estado: 'pendiente_revision' },
                { uid: usuario.uid, idToken }
            );

            if (!resultado.success) {
                setError(
                    mensajeDeRespuesta(
                        resultado.message,
                        'No se pudieron cargar los conteos pendientes.'
                    )
                );
                return;
            }

            setPendientes(resultado.pendientes);
        } catch (errorCarga) {
            console.error(
                '[inventario-ui] No se pudieron cargar los pendientes:',
                errorCarga
            );
            setError(
                mensajeDeError(
                    errorCarga,
                    'No se pudieron cargar los conteos pendientes.'
                )
            );
        } finally {
            setLoading(false);
        }
    }, [usuario]);

    useEffect(() => {
        void cargarPendientes();
    }, [cargarPendientes]);

    const accionesDeshabilitadas = accionEnCurso || loading;

    function cerrarAprobacion(): void {
        if (accionEnCurso) return;
        setConteoAprobando(null);
    }

    function cerrarRechazo(): void {
        if (accionEnCurso) return;
        setConteoRechazando(null);
    }

    return (
        <div className="mx-auto w-full max-w-6xl space-y-5 pb-12">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
                        Inventario de repuestos
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
                        Aprobaciones de repuestos
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-gray-400">
                        Revisa los conteos enviados por los asesores. Al
                        aprobar, el stock se sobrescribe con la cantidad
                        contada.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        void cargarPendientes();
                    }}
                    disabled={loading || accionEnCurso}
                    aria-label="Actualizar lista de conteos pendientes"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <RefreshCw
                        aria-hidden="true"
                        className={`h-4 w-4 ${
                            loading ? 'animate-spin' : ''
                        }`}
                    />
                    Actualizar
                </button>
            </header>

            {error ? (
                <div
                    role="alert"
                    className="rounded-2xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-100"
                >
                    <div className="flex items-start gap-3">
                        <AlertCircle
                            aria-hidden="true"
                            className="mt-0.5 h-5 w-5 shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-3">
                            <p className="leading-relaxed">{error}</p>
                            <button
                                type="button"
                                onClick={() => {
                                    void cargarPendientes();
                                }}
                                disabled={loading || accionEnCurso}
                                aria-label="Reintentar carga de conteos pendientes"
                                className="inline-flex items-center gap-2 rounded-lg border border-red-700 bg-red-900/40 px-3 py-2 text-xs font-semibold text-red-100 transition-colors hover:bg-red-900/70 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <RefreshCw
                                    aria-hidden="true"
                                    className={`h-3.5 w-3.5 ${
                                        loading ? 'animate-spin' : ''
                                    }`}
                                />
                                Reintentar
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {loading && pendientes.length === 0 ? (
                <div
                    role="status"
                    className="flex items-center justify-center gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-10 text-sm text-gray-300"
                >
                    <Loader2
                        aria-hidden="true"
                        className="h-5 w-5 animate-spin text-red-400"
                    />
                    Cargando conteos pendientes…
                </div>
            ) : null}

            {!loading && !error && pendientes.length === 0 ? (
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-10 text-center">
                    <p className="text-sm font-semibold text-gray-200">
                        No hay conteos pendientes.
                    </p>
                    <p className="mt-2 text-xs text-gray-500">
                        Cuando un asesor envíe un conteo, aparecerá aquí para
                        revisión.
                    </p>
                </div>
            ) : null}

            {pendientes.length > 0 ? (
                <>
                    <div className="hidden overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900/60 shadow-lg md:block">
                        <table className="w-full min-w-[1100px] text-left text-sm">
                            <thead className="border-b border-gray-800 text-xs uppercase tracking-wide text-gray-400">
                                <tr>
                                    <th scope="col" className="px-4 py-3">
                                        Foto
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Referencia
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Descripción
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-4 py-3 text-center"
                                    >
                                        Cantidad
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Ubicación
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Asesor
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Fecha
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {pendientes.map((pendiente) => (
                                    <tr
                                        key={pendiente.id}
                                        className="align-top"
                                    >
                                        <td className="px-4 py-4">
                                            <MiniaturaConteo
                                                fotoUrl={pendiente.foto_url}
                                                referencia={
                                                    pendiente.referencia_confirmada
                                                }
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <p className="font-mono text-sm font-semibold text-white">
                                                {pendiente.referencia_confirmada ||
                                                    '—'}
                                            </p>
                                            {pendiente.referencia_sugerida ? (
                                                <p className="mt-1 text-xs text-gray-500">
                                                    Sugerida:{' '}
                                                    {
                                                        pendiente.referencia_sugerida
                                                    }
                                                </p>
                                            ) : null}
                                        </td>
                                        <td className="max-w-[220px] px-4 py-4 text-gray-300">
                                            <p className="break-words">
                                                {pendiente.descripcion ||
                                                    'Sin descripción'}
                                            </p>
                                        </td>
                                        <td className="px-4 py-4 text-center font-semibold text-white">
                                            {pendiente.cantidad_contada}
                                        </td>
                                        <td className="px-4 py-4 font-mono text-xs text-gray-300">
                                            {pendiente.ubicacion || '—'}
                                        </td>
                                        <td className="max-w-[180px] break-all px-4 py-4 text-xs text-gray-400">
                                            {pendiente.asesor_email || '—'}
                                        </td>
                                        <td className="px-4 py-4 text-xs text-gray-400">
                                            {formatearFecha(
                                                pendiente.creado_en
                                            )}
                                        </td>
                                        <td className="px-4 py-4">
                                            <BotonesAccion
                                                pendiente={pendiente}
                                                deshabilitados={
                                                    accionesDeshabilitadas
                                                }
                                                onAprobar={
                                                    setConteoAprobando
                                                }
                                                onRechazar={
                                                    setConteoRechazando
                                                }
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="space-y-3 md:hidden">
                        {pendientes.map((pendiente) => (
                            <article
                                key={pendiente.id}
                                className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 shadow-lg"
                            >
                                <div className="flex items-start gap-3">
                                    <MiniaturaConteo
                                        fotoUrl={pendiente.foto_url}
                                        referencia={
                                            pendiente.referencia_confirmada
                                        }
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="break-words font-mono text-sm font-semibold text-white">
                                            {pendiente.referencia_confirmada ||
                                                '—'}
                                        </p>
                                        {pendiente.referencia_sugerida ? (
                                            <p className="mt-1 break-words text-xs text-gray-500">
                                                Sugerida:{' '}
                                                {
                                                    pendiente.referencia_sugerida
                                                }
                                            </p>
                                        ) : null}
                                        <p className="mt-2 break-words text-sm text-gray-300">
                                            {pendiente.descripcion ||
                                                'Sin descripción'}
                                        </p>
                                    </div>
                                </div>

                                <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                                    <div>
                                        <dt className="text-gray-500">
                                            Cantidad
                                        </dt>
                                        <dd className="mt-0.5 font-semibold text-white">
                                            {pendiente.cantidad_contada}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-gray-500">
                                            Ubicación
                                        </dt>
                                        <dd className="mt-0.5 font-mono text-gray-200">
                                            {pendiente.ubicacion || '—'}
                                        </dd>
                                    </div>
                                    <div className="col-span-2">
                                        <dt className="text-gray-500">
                                            Asesor
                                        </dt>
                                        <dd className="mt-0.5 break-all text-gray-300">
                                            {pendiente.asesor_email || '—'}
                                        </dd>
                                    </div>
                                    <div className="col-span-2">
                                        <dt className="text-gray-500">
                                            Fecha
                                        </dt>
                                        <dd className="mt-0.5 text-gray-300">
                                            {formatearFecha(
                                                pendiente.creado_en
                                            )}
                                        </dd>
                                    </div>
                                </dl>

                                <div className="mt-4">
                                    <BotonesAccion
                                        pendiente={pendiente}
                                        deshabilitados={
                                            accionesDeshabilitadas
                                        }
                                        onAprobar={setConteoAprobando}
                                        onRechazar={setConteoRechazando}
                                        anchoCompleto
                                    />
                                </div>
                            </article>
                        ))}
                    </div>
                </>
            ) : null}

            {conteoAprobando ? (
                <AprobarConteoModal
                    pendiente={conteoAprobando}
                    isOpen
                    onClose={cerrarAprobacion}
                    onSuccess={async () => {
                        setConteoAprobando(null);
                        await cargarPendientes();
                    }}
                    accionEnCurso={accionEnCurso}
                    onAccionEnCursoChange={setAccionEnCurso}
                />
            ) : null}

            {conteoRechazando ? (
                <RechazarConteoModal
                    pendiente={conteoRechazando}
                    isOpen
                    onClose={cerrarRechazo}
                    onSuccess={async () => {
                        setConteoRechazando(null);
                        await cargarPendientes();
                    }}
                    accionEnCurso={accionEnCurso}
                    onAccionEnCursoChange={setAccionEnCurso}
                />
            ) : null}
        </div>
    );
}
