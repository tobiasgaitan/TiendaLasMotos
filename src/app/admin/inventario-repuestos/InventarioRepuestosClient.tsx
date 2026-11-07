'use client';

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    AlertCircle,
    Loader2,
    Pencil,
    RefreshCw,
    Save,
    Search,
    X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { listarRepuestos } from './actions/listarRepuestos';
import { editarRepuesto } from './actions/editarRepuesto';
import {
    construirCambiosRepuesto,
    filtrarRepuestos,
} from '@/lib/inventario/repuestos';
import type {
    BorradorRepuesto,
    FiltrosRepuesto,
    RepuestoInventarioDTO,
} from '@/types/inventario-repuestos';

type CampoBorrador = keyof BorradorRepuesto;

interface EdicionRepuesto {
    referencia: string;
    borrador: BorradorRepuesto;
}

const FILTROS_INICIALES: FiltrosRepuesto = {
    referencia: '',
    categoria: '',
    fabricante: '',
};

function formatearPrecio(valor: number): string {
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0,
        }).format(valor);
    } catch (error) {
        console.error('[inventario-repuestos-ui] formatearPrecio falló:', error);
        return `$ ${valor}`;
    }
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

export default function InventarioRepuestosClient() {
    const { user } = useAuth();
    const [repuestos, setRepuestos] = useState<RepuestoInventarioDTO[]>([]);
    const [filtros, setFiltros] = useState<FiltrosRepuesto>(FILTROS_INICIALES);
    const [edicion, setEdicion] = useState<EdicionRepuesto | null>(null);
    const [loading, setLoading] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cargaRef = useRef(0);

    const cargarRepuestos = useCallback(async () => {
        if (!user) {
            setError('Sesión inválida. Vuelve a iniciar sesión.');
            setLoading(false);
            return;
        }

        const cargaActual = cargaRef.current + 1;
        cargaRef.current = cargaActual;
        setLoading(true);
        setError(null);

        try {
            const idToken = await user.getIdToken();
            const resultado = await listarRepuestos(
                {},
                { uid: user.uid, idToken }
            );

            if (cargaActual !== cargaRef.current) return;

            if (!resultado.success) {
                setError(
                    mensajeDeRespuesta(
                        resultado.message,
                        'No se pudo cargar el inventario de repuestos.'
                    )
                );
                return;
            }

            setRepuestos(resultado.repuestos);
        } catch (errorCarga) {
            if (cargaActual !== cargaRef.current) return;
            console.error(
                '[inventario-repuestos-ui] No se pudo cargar el inventario:',
                errorCarga
            );
            setError(
                mensajeDeError(
                    errorCarga,
                    'No se pudo cargar el inventario de repuestos.'
                )
            );
        } finally {
            if (cargaActual === cargaRef.current) {
                setLoading(false);
            }
        }
    }, [user]);

    useEffect(() => {
        void cargarRepuestos();
    }, [cargarRepuestos]);

    const categorias = useMemo(() => {
        const valores = new Set<string>();
        for (const repuesto of repuestos) {
            const categoria = repuesto.categoria.trim();
            if (categoria) valores.add(categoria);
        }
        return Array.from(valores).sort((a, b) =>
            a.localeCompare(b, 'es')
        );
    }, [repuestos]);

    const fabricantes = useMemo(() => {
        const valores = new Set<string>();
        for (const repuesto of repuestos) {
            const fabricante = repuesto.fabricante.trim();
            if (fabricante) valores.add(fabricante);
        }
        return Array.from(valores).sort((a, b) =>
            a.localeCompare(b, 'es')
        );
    }, [repuestos]);

    const repuestosFiltrados = useMemo(
        () => filtrarRepuestos(repuestos, filtros),
        [repuestos, filtros]
    );

    function iniciarEdicion(repuesto: RepuestoInventarioDTO): void {
        if (guardando) return;
        setEdicion({
            referencia: repuesto.referencia,
            borrador: {
                descripcion: repuesto.descripcion,
                stock: String(repuesto.stock),
                stock_minimo: String(repuesto.stock_minimo),
                precio: String(repuesto.precio),
                ubicacion: repuesto.ubicacion,
            },
        });
        setError(null);
    }

    function cancelarEdicion(): void {
        if (guardando) return;
        setEdicion(null);
    }

    function actualizarBorrador(campo: CampoBorrador, valor: string): void {
        setEdicion((actual) => {
            if (!actual) return actual;
            return {
                ...actual,
                borrador: {
                    ...actual.borrador,
                    [campo]: valor,
                },
            };
        });
    }

    async function guardarEdicion(): Promise<void> {
        if (!edicion || !user || guardando) return;

        const original = repuestos.find(
            (repuesto) => repuesto.referencia === edicion.referencia
        );
        if (!original) {
            setError(
                'El repuesto ya no está en la lista. Actualiza e inténtalo de nuevo.'
            );
            return;
        }

        setGuardando(true);
        setError(null);

        try {
            const cambios = construirCambiosRepuesto(
                original,
                edicion.borrador
            );

            if (Object.keys(cambios).length === 0) {
                setEdicion(null);
                return;
            }

            const idToken = await user.getIdToken();
            const resultado = await editarRepuesto(
                { referencia: original.referencia, cambios },
                { uid: user.uid, idToken }
            );

            if (!resultado.success) {
                setError(
                    mensajeDeRespuesta(
                        resultado.message,
                        'No se pudo guardar la edición.'
                    )
                );
                return;
            }

            setEdicion(null);
            await cargarRepuestos();
        } catch (errorGuardar) {
            console.error(
                '[inventario-repuestos-ui] No se pudo guardar la edición:',
                errorGuardar
            );
            setError(
                mensajeDeError(
                    errorGuardar,
                    'No se pudo guardar la edición.'
                )
            );
        } finally {
            setGuardando(false);
        }
    }

    function renderAcciones(repuesto: RepuestoInventarioDTO) {
        const enEdicion =
            edicion !== null && edicion.referencia === repuesto.referencia;

        if (enEdicion) {
            return (
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            void guardarEdicion();
                        }}
                        disabled={guardando}
                        aria-label={`Guardar cambios de ${repuesto.referencia}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Save aria-hidden="true" className="h-4 w-4" />
                        {guardando ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button
                        type="button"
                        onClick={cancelarEdicion}
                        disabled={guardando}
                        aria-label={`Cancelar edición de ${repuesto.referencia}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <X aria-hidden="true" className="h-4 w-4" />
                        Cancelar
                    </button>
                </div>
            );
        }

        return (
            <button
                type="button"
                onClick={() => iniciarEdicion(repuesto)}
                disabled={guardando}
                aria-label={`Editar ${repuesto.referencia}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
                <Pencil aria-hidden="true" className="h-4 w-4" />
                Editar
            </button>
        );
    }

    return (
        <div className="mx-auto w-full max-w-7xl space-y-5 pb-12">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
                        Inventario de repuestos
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
                        Repuestos
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-gray-400">
                        Consulta y edita stock, stock mínimo, precio, ubicación
                        y descripción. Cada cambio queda auditado.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        void cargarRepuestos();
                    }}
                    disabled={loading || guardando}
                    aria-label="Actualizar lista de repuestos"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <RefreshCw
                        aria-hidden="true"
                        className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
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
                                    void cargarRepuestos();
                                }}
                                disabled={loading || guardando}
                                aria-label="Reintentar carga de repuestos"
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

            <div className="grid gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 sm:grid-cols-3">
                <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Referencia
                    <span className="relative block">
                        <Search
                            aria-hidden="true"
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
                        />
                        <input
                            type="search"
                            value={filtros.referencia}
                            onChange={(event) =>
                                setFiltros((actual) => ({
                                    ...actual,
                                    referencia: event.target.value,
                                }))
                            }
                            aria-label="Filtrar por referencia"
                            placeholder="Buscar referencia…"
                            className="w-full rounded-lg border border-gray-700 bg-gray-950 py-2.5 pl-9 pr-3 text-sm font-normal normal-case text-white placeholder-gray-500 outline-none focus:border-red-500"
                        />
                    </span>
                </label>

                <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Categoría
                    <select
                        value={filtros.categoria}
                        onChange={(event) =>
                            setFiltros((actual) => ({
                                ...actual,
                                categoria: event.target.value,
                            }))
                        }
                        aria-label="Filtrar por categoría"
                        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm font-normal normal-case text-white outline-none focus:border-red-500"
                    >
                        <option value="">Todas</option>
                        {categorias.map((categoria) => (
                            <option key={categoria} value={categoria}>
                                {categoria}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Fabricante
                    <select
                        value={filtros.fabricante}
                        onChange={(event) =>
                            setFiltros((actual) => ({
                                ...actual,
                                fabricante: event.target.value,
                            }))
                        }
                        aria-label="Filtrar por fabricante"
                        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm font-normal normal-case text-white outline-none focus:border-red-500"
                    >
                        <option value="">Todos</option>
                        {fabricantes.map((fabricante) => (
                            <option key={fabricante} value={fabricante}>
                                {fabricante}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {loading && repuestos.length === 0 ? (
                <div
                    role="status"
                    className="flex items-center justify-center gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-10 text-sm text-gray-300"
                >
                    <Loader2
                        aria-hidden="true"
                        className="h-5 w-5 animate-spin text-red-400"
                    />
                    Cargando repuestos…
                </div>
            ) : null}

            {!loading && !error && repuestos.length === 0 ? (
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-10 text-center">
                    <p className="text-sm font-semibold text-gray-200">
                        No hay repuestos registrados.
                    </p>
                    <p className="mt-2 text-xs text-gray-500">
                        Los repuestos aprobados aparecerán aquí.
                    </p>
                </div>
            ) : null}

            {repuestos.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900/60 shadow-lg">
                    <div className="border-b border-gray-800 px-4 py-3 text-xs text-gray-400">
                        Mostrando{' '}
                        <span className="font-semibold text-white">
                            {repuestosFiltrados.length}
                        </span>{' '}
                        de{' '}
                        <span className="font-semibold text-white">
                            {repuestos.length}
                        </span>{' '}
                        repuestos.
                    </div>
                    <table className="w-full min-w-[1150px] text-left text-sm">
                        <thead className="border-b border-gray-800 text-xs uppercase tracking-wide text-gray-400">
                            <tr>
                                <th scope="col" className="px-4 py-3">
                                    Referencia
                                </th>
                                <th scope="col" className="px-4 py-3">
                                    Descripción
                                </th>
                                <th scope="col" className="px-4 py-3">
                                    Categoría
                                </th>
                                <th scope="col" className="px-4 py-3">
                                    Fabricante
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-right"
                                >
                                    Stock
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-right"
                                >
                                    Stock mínimo
                                </th>
                                <th scope="col" className="px-4 py-3">
                                    Ubicación
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-right"
                                >
                                    Precio
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {repuestosFiltrados.map((repuesto) => {
                                const borrador =
                                    edicion !== null &&
                                    edicion.referencia === repuesto.referencia
                                        ? edicion.borrador
                                        : null;

                                return (
                                    <tr
                                        key={repuesto.referencia}
                                        className="align-top hover:bg-gray-900/80"
                                    >
                                        <td className="min-w-[150px] px-4 py-4">
                                            <p className="font-mono text-sm font-semibold text-white">
                                                {repuesto.referencia}
                                            </p>
                                            <div className="mt-2">
                                                {renderAcciones(repuesto)}
                                            </div>
                                        </td>
                                        <td className="max-w-[240px] px-4 py-4 text-gray-300">
                                            {borrador ? (
                                                <input
                                                    type="text"
                                                    value={borrador.descripcion}
                                                    maxLength={500}
                                                    onChange={(event) =>
                                                        actualizarBorrador(
                                                            'descripcion',
                                                            event.target.value
                                                        )
                                                    }
                                                    aria-label={`Descripción de ${repuesto.referencia}`}
                                                    className="w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white outline-none focus:border-red-500"
                                                />
                                            ) : (
                                                <p className="break-words">
                                                    {repuesto.descripcion ||
                                                        '—'}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-gray-300">
                                            {repuesto.categoria || '—'}
                                        </td>
                                        <td className="px-4 py-4 text-gray-300">
                                            {repuesto.fabricante || '—'}
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            {borrador ? (
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={borrador.stock}
                                                    onChange={(event) =>
                                                        actualizarBorrador(
                                                            'stock',
                                                            event.target.value
                                                        )
                                                    }
                                                    aria-label={`Stock de ${repuesto.referencia}`}
                                                    className="w-24 rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-right text-sm text-white outline-none focus:border-red-500"
                                                />
                                            ) : (
                                                <span className="font-semibold text-white">
                                                    {repuesto.stock}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            {borrador ? (
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={
                                                        borrador.stock_minimo
                                                    }
                                                    onChange={(event) =>
                                                        actualizarBorrador(
                                                            'stock_minimo',
                                                            event.target.value
                                                        )
                                                    }
                                                    aria-label={`Stock mínimo de ${repuesto.referencia}`}
                                                    className="w-24 rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-right text-sm text-white outline-none focus:border-red-500"
                                                />
                                            ) : (
                                                <span className="text-gray-200">
                                                    {repuesto.stock_minimo}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4">
                                            {borrador ? (
                                                <input
                                                    type="text"
                                                    value={borrador.ubicacion}
                                                    onChange={(event) =>
                                                        actualizarBorrador(
                                                            'ubicacion',
                                                            event.target.value
                                                        )
                                                    }
                                                    aria-label={`Ubicación de ${repuesto.referencia}`}
                                                    placeholder="A-01-05"
                                                    className="w-28 rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-red-500"
                                                />
                                            ) : (
                                                <span className="font-mono text-xs text-gray-300">
                                                    {repuesto.ubicacion || '—'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            {borrador ? (
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="0.01"
                                                    value={borrador.precio}
                                                    onChange={(event) =>
                                                        actualizarBorrador(
                                                            'precio',
                                                            event.target.value
                                                        )
                                                    }
                                                    aria-label={`Precio de ${repuesto.referencia}`}
                                                    className="w-28 rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-right text-sm text-white outline-none focus:border-red-500"
                                                />
                                            ) : (
                                                <span className="font-mono text-sm text-emerald-400">
                                                    {formatearPrecio(
                                                        repuesto.precio
                                                    )}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {repuestosFiltrados.length === 0 ? (
                        <div className="border-t border-gray-800 p-8 text-center text-sm text-gray-400">
                            No hay repuestos que coincidan con los filtros.
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
