'use client';

import { useEffect, useRef, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    Loader2,
    Search,
    WifiOff,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { buscarCandidatosRepuesto } from '@/app/admin/inventory/actions/buscarCandidatosRepuesto';
import { rankearCandidatos } from '@/lib/inventario/matching';
import type { RepuestoCandidato } from '@/types/inventario';

interface SelectorReferenciaRepuestoProps {
    etiquetas: string[];
    referenciaSeleccionada: string;
    onSeleccion: (candidato: RepuestoCandidato | null) => void;
    onSugerencia: (referencia: string) => void;
    online: boolean;
    disabled?: boolean;
}

interface CatalogoCache {
    actualizado_en: string;
    candidatos: RepuestoCandidato[];
    total: number;
}

const CACHE_PREFIX = 'tlm:inventario:candidatos:v1';
const LIMITE_CATALOGO = 100;
const LIMITE_BUSQUEDA = 20;

function claveCache(uid: string): string {
    return `${CACHE_PREFIX}:${uid}`;
}

function esCandidatoCache(value: unknown): value is RepuestoCandidato {
    if (!value || typeof value !== 'object') return false;
    const candidato = value as Record<string, unknown>;
    return (
        typeof candidato.referencia === 'string' &&
        typeof candidato.descripcion === 'string' &&
        typeof candidato.fabricante === 'string' &&
        typeof candidato.categoria === 'string' &&
        typeof candidato.stock === 'number' &&
        Number.isFinite(candidato.stock) &&
        typeof candidato.score === 'number' &&
        Number.isFinite(candidato.score) &&
        Array.isArray(candidato.coincidencias) &&
        candidato.coincidencias.every(
            (item) => typeof item === 'string'
        )
    );
}

function leerCache(uid: string): CatalogoCache | null {
    try {
        const raw = window.localStorage.getItem(claveCache(uid));
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (
            !parsed ||
            typeof parsed !== 'object' ||
            typeof parsed.actualizado_en !== 'string' ||
            !Array.isArray(parsed.candidatos)
        ) {
            console.error(
                '[inventario-ui] Caché de candidatos con estructura inválida.'
            );
            return null;
        }

        const candidatos = parsed.candidatos.filter(esCandidatoCache);
        if (candidatos.length !== parsed.candidatos.length) {
            console.error(
                '[inventario-ui] Caché de candidatos con entradas inválidas.',
                {
                    validas: candidatos.length,
                    totales: parsed.candidatos.length,
                }
            );
        }

        return {
            actualizado_en: parsed.actualizado_en,
            candidatos,
            total:
                typeof parsed.total === 'number' &&
                Number.isFinite(parsed.total)
                    ? parsed.total
                    : candidatos.length,
        };
    } catch (error) {
        console.error(
            '[inventario-ui] No se pudo leer la caché de candidatos:',
            error
        );
        return null;
    }
}

function guardarCache(
    uid: string,
    candidatos: RepuestoCandidato[],
    total: number
): void {
    try {
        const cache: CatalogoCache = {
            actualizado_en: new Date().toISOString(),
            candidatos,
            total,
        };
        window.localStorage.setItem(claveCache(uid), JSON.stringify(cache));
    } catch (error) {
        console.error(
            '[inventario-ui] No se pudo guardar la caché de candidatos:',
            error
        );
    }
}

function formatearFechaCache(iso: string): string {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return 'fecha desconocida';
    return fecha.toLocaleString('es-CO', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function SelectorReferenciaRepuesto({
    etiquetas,
    referenciaSeleccionada,
    onSeleccion,
    onSugerencia,
    online,
    disabled = false,
}: SelectorReferenciaRepuestoProps) {
    const { user } = useAuth();
    const [consulta, setConsulta] = useState('');
    const [candidatos, setCandidatos] = useState<RepuestoCandidato[]>([]);
    const [catalogoLocal, setCatalogoLocal] = useState<
        RepuestoCandidato[]
    >([]);
    const [cacheDisponible, setCacheDisponible] = useState(false);
    const [cacheTotal, setCacheTotal] = useState(0);
    const [cacheActualizadoEn, setCacheActualizadoEn] = useState<
        string | null
    >(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const secuenciaRef = useRef(0);
    const onSugerenciaRef = useRef(onSugerencia);
    const usuario = user;

    useEffect(() => {
        onSugerenciaRef.current = onSugerencia;
    }, [onSugerencia]);

    useEffect(() => {
        if (!usuario) {
            setCatalogoLocal([]);
            setCacheDisponible(false);
            setCacheTotal(0);
            setCacheActualizadoEn(null);
            return;
        }

        const cache = leerCache(usuario.uid);
        if (!cache) {
            setCatalogoLocal([]);
            setCacheDisponible(false);
            setCacheTotal(0);
            setCacheActualizadoEn(null);
            return;
        }

        setCatalogoLocal(cache.candidatos);
        setCacheDisponible(cache.candidatos.length > 0);
        setCacheTotal(cache.total);
        setCacheActualizadoEn(cache.actualizado_en);
    }, [usuario]);

    const buscarOnline = async (
        etiquetasBusqueda: string[],
        consultaBusqueda: string
    ): Promise<void> => {
        if (!usuario) {
            setCandidatos([]);
            setError('Sesión inválida. Vuelve a iniciar sesión.');
            return;
        }

        const secuencia = secuenciaRef.current + 1;
        secuenciaRef.current = secuencia;
        const esCatalogo =
            etiquetasBusqueda.length === 0 && !consultaBusqueda.trim();

        setCargando(true);
        setError(null);

        try {
            const idToken = await usuario.getIdToken();
            const resultado = await buscarCandidatosRepuesto(
                {
                    etiquetas: etiquetasBusqueda,
                    consulta: consultaBusqueda,
                    limite: esCatalogo
                        ? LIMITE_CATALOGO
                        : LIMITE_BUSQUEDA,
                },
                { uid: usuario.uid, idToken }
            );

            if (secuenciaRef.current !== secuencia) return;

            if (!resultado.success) {
                setCandidatos([]);
                setError(
                    resultado.message ??
                        'No se pudo consultar el catálogo de referencias.'
                );
                onSugerenciaRef.current('');
                return;
            }

            setCandidatos(resultado.candidatos);

            if (esCatalogo) {
                const total = resultado.total ?? resultado.candidatos.length;
                setCatalogoLocal(resultado.candidatos);
                setCacheDisponible(resultado.candidatos.length > 0);
                setCacheTotal(total);
                setCacheActualizadoEn(new Date().toISOString());
                guardarCache(usuario.uid, resultado.candidatos, total);
                onSugerenciaRef.current('');
                return;
            }

            onSugerenciaRef.current(
                resultado.candidatos[0]?.referencia ?? ''
            );
        } catch (errorBusqueda) {
            if (secuenciaRef.current !== secuencia) return;
            console.error(
                '[inventario-ui] búsqueda de candidatos falló:',
                errorBusqueda
            );
            setCandidatos([]);
            setError(
                errorBusqueda instanceof Error &&
                    errorBusqueda.message.trim()
                    ? errorBusqueda.message
                    : 'No se pudo consultar el catálogo de referencias.'
            );
            onSugerenciaRef.current('');
        } finally {
            if (secuenciaRef.current === secuencia) {
                setCargando(false);
            }
        }
    };

    useEffect(() => {
        if (!online || !usuario) return;

        const timer = setTimeout(() => {
            void buscarOnline(etiquetas, consulta);
        }, 300);

        return () => clearTimeout(timer);
    }, [etiquetas, consulta, online, usuario]);

    useEffect(() => {
        if (online || !usuario) return;

        if (!cacheDisponible) {
            setCandidatos([]);
            setError(
                'Sin conexión y sin catálogo local de referencias. Conéctate para seleccionar una referencia existente.'
            );
            onSugerenciaRef.current('');
            return;
        }

        const filtrados = rankearCandidatos(catalogoLocal, {
            etiquetas,
            consulta,
        });
        setCandidatos(filtrados.slice(0, LIMITE_BUSQUEDA));
        setError(null);
        onSugerenciaRef.current(
            etiquetas.length > 0 || consulta.trim()
                ? filtrados[0]?.referencia ?? ''
                : ''
        );
    }, [
        online,
        usuario,
        cacheDisponible,
        catalogoLocal,
        etiquetas,
        consulta,
    ]);

    const seleccionar = (candidato: RepuestoCandidato): void => {
        onSeleccion(candidato);
    };

    const limpiarSeleccion = (): void => {
        onSeleccion(null);
        onSugerenciaRef.current('');
    };

    return (
        <section className="space-y-3">
            <div>
                <label
                    htmlFor="referencia-selector"
                    className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                >
                    Referencia existente <span aria-hidden="true">*</span>
                </label>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    Solo puedes elegir una referencia del catálogo maestro.
                    Busca por referencia, descripción o categoría.
                </p>
            </div>

            {referenciaSeleccionada ? (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-900/70 bg-emerald-950/30 px-3 py-3">
                    <div className="flex min-w-0 items-start gap-2">
                        <CheckCircle2
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                        />
                        <div className="min-w-0">
                            <p className="font-mono text-sm font-semibold text-white">
                                {referenciaSeleccionada}
                            </p>
                            <p className="text-xs text-emerald-200/80">
                                Referencia confirmada
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={limpiarSeleccion}
                        disabled={disabled}
                        className="shrink-0 text-xs font-semibold text-emerald-200 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Cambiar
                    </button>
                </div>
            ) : null}

            <div className="relative">
                <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
                />
                <input
                    id="referencia-selector"
                    type="search"
                    value={consulta}
                    maxLength={64}
                    disabled={disabled}
                    onChange={(event) => setConsulta(event.target.value)}
                    aria-label="Buscar referencia existente"
                    className="w-full rounded-xl border border-gray-700 bg-gray-950/80 py-3 pl-10 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Buscar por referencia, descripción o categoría"
                />
            </div>

            {!online ? (
                <p className="flex items-start gap-2 rounded-xl border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-100">
                    <WifiOff
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    Sin conexión: el selector usa el catálogo local
                    {cacheActualizadoEn
                        ? ` (actualizado ${formatearFechaCache(cacheActualizadoEn)})`
                        : ''}
                    . El servidor volverá a validar la referencia al guardar.
                </p>
            ) : null}

            {cacheDisponible &&
            cacheTotal > catalogoLocal.length &&
            !online ? (
                <p className="rounded-xl border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-100">
                    Catálogo local parcial: {catalogoLocal.length} de{' '}
                    {cacheTotal} referencias.
                </p>
            ) : null}

            {cargando ? (
                <div
                    role="status"
                    className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950/60 px-3 py-3 text-sm text-gray-300"
                >
                    <Loader2
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin text-red-400"
                    />
                    Buscando referencias existentes…
                </div>
            ) : null}

            {error ? (
                <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-red-900/70 bg-red-950/30 px-3 py-2 text-xs leading-relaxed text-red-100"
                >
                    <AlertCircle
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <p>{error}</p>
                </div>
            ) : null}

            {!cargando && !error && candidatos.length === 0 ? (
                <p className="text-xs text-gray-500">
                    No hay referencias que coincidan con la búsqueda.
                </p>
            ) : null}

            {candidatos.length > 0 ? (
                <ul
                    role="listbox"
                    aria-label="Referencias existentes"
                    className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-gray-800 bg-gray-950/40 p-1"
                >
                    {candidatos.map((candidato) => {
                        const seleccionada =
                            candidato.referencia === referenciaSeleccionada;
                        return (
                            <li key={candidato.referencia}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={seleccionada}
                                    disabled={disabled}
                                    onClick={() => seleccionar(candidato)}
                                    className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                                        seleccionada
                                            ? 'border border-emerald-800 bg-emerald-950/30'
                                            : 'border border-transparent hover:bg-gray-800/70'
                                    } disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                    <span className="block font-mono text-xs font-semibold text-white">
                                        {candidato.referencia}
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs text-gray-300">
                                        {candidato.descripcion ||
                                            'Sin descripción'}
                                    </span>
                                    <span className="mt-0.5 block text-[11px] text-gray-500">
                                        {[candidato.fabricante, candidato.categoria]
                                            .filter(Boolean)
                                            .join(' · ') || 'Sin clasificar'}
                                        {' · '}
                                        Stock: {candidato.stock}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </section>
    );
}
