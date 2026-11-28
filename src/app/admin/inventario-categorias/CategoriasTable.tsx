'use client';

import { useMemo, useState } from 'react';
import {
    AlertCircle,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Tag,
    Trash2,
} from 'lucide-react';
import { useCategoriasRepuestos } from '@/hooks/useCategoriasRepuestos';
import CategoriaModal from './CategoriaModal';
import CategoriaDeleteConfirm from './CategoriaDeleteConfirm';
import type { CategoriaRepuestoDTO } from '@/types/categorias-repuestos';

interface CategoriasTableProps {
    puedeCrear: boolean;
    puedeEditar: boolean;
    puedeEliminar: boolean;
}

/**
 * WEB-INV-053 — Tabla de categorías canónicas.
 *
 * El orden es editable desde la UI (default de seed), el nombre es inmutable
 * en v1 y el borrado físico solo se permite si ningún repuesto la referencia.
 */
export default function CategoriasTable({
    puedeCrear,
    puedeEditar,
    puedeEliminar,
}: CategoriasTableProps) {
    const { categorias, cargando, error, recargar } = useCategoriasRepuestos();
    const [modalAbierto, setModalAbierto] = useState(false);
    const [categoriaEnEdicion, setCategoriaEnEdicion] =
        useState<CategoriaRepuestoDTO | null>(null);
    const [categoriaAEliminar, setCategoriaAEliminar] =
        useState<CategoriaRepuestoDTO | null>(null);

    const activas = useMemo(
        () => categorias.filter((categoria) => categoria.activo).length,
        [categorias]
    );

    function abrirCrear(): void {
        setCategoriaEnEdicion(null);
        setModalAbierto(true);
    }

    function abrirEditar(categoria: CategoriaRepuestoDTO): void {
        setCategoriaEnEdicion(categoria);
        setModalAbierto(true);
    }

    return (
        <div className="mx-auto w-full max-w-7xl space-y-5 pb-12">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">
                        Categorías de Repuestos
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
                        Catálogo canónico usado por el alta, la edición y el
                        filtro de repuestos. El nombre es inmutable; puedes
                        ajustar descripción, orden y estado. Si una categoría
                        está en uso, archívala en lugar de eliminarla.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            void recargar();
                        }}
                        disabled={cargando}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-700 px-3 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCw
                            aria-hidden="true"
                            className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`}
                        />
                        Recargar
                    </button>
                    {puedeCrear ? (
                        <button
                            type="button"
                            onClick={abrirCrear}
                            disabled={cargando}
                            aria-label="Crear nueva categoría"
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-950/30 transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            Nueva Categoría
                        </button>
                    ) : null}
                </div>
            </header>

            <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Total
                    </p>
                    <p className="mt-1 text-2xl font-bold text-white">
                        {categorias.length}
                    </p>
                </div>
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Activas
                    </p>
                    <p className="mt-1 text-2xl font-bold text-emerald-400">
                        {activas}
                    </p>
                </div>
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Archivadas
                    </p>
                    <p className="mt-1 text-2xl font-bold text-amber-400">
                        {categorias.length - activas}
                    </p>
                </div>
            </div>

            {error ? (
                <div
                    role="alert"
                    className="rounded-2xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-100"
                >
                    <div className="flex items-start gap-3">
                        <AlertCircle
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <span>{error}</span>
                    </div>
                </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-gray-800">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-gray-800 bg-gray-900/80 text-left text-xs uppercase tracking-wide text-gray-500">
                                <th className="px-4 py-3 font-semibold">
                                    Orden
                                </th>
                                <th className="px-4 py-3 font-semibold">
                                    Nombre
                                </th>
                                <th className="px-4 py-3 font-semibold">
                                    Descripción
                                </th>
                                <th className="px-4 py-3 font-semibold">
                                    Estado
                                </th>
                                <th className="px-4 py-3 text-right font-semibold">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-4 py-10 text-center text-gray-400"
                                    >
                                        <span className="inline-flex items-center gap-2">
                                            <Loader2
                                                aria-hidden="true"
                                                className="h-4 w-4 animate-spin"
                                            />
                                            Cargando categorías…
                                        </span>
                                    </td>
                                </tr>
                            ) : categorias.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-4 py-10 text-center text-gray-400"
                                    >
                                        <span className="inline-flex flex-col items-center gap-2">
                                            <Tag
                                                aria-hidden="true"
                                                className="h-6 w-6 text-gray-600"
                                            />
                                            No hay categorías registradas.
                                        </span>
                                    </td>
                                </tr>
                            ) : (
                                categorias.map((categoria) => (
                                    <tr
                                        key={categoria.clave}
                                        className="border-b border-gray-800/70 last:border-b-0 hover:bg-gray-900/40"
                                    >
                                        <td className="px-4 py-4 font-mono text-xs text-gray-400">
                                            {categoria.orden}
                                        </td>
                                        <td className="px-4 py-4 font-semibold text-white">
                                            {categoria.nombre}
                                        </td>
                                        <td className="px-4 py-4 text-gray-300">
                                            {categoria.descripcion || '—'}
                                        </td>
                                        <td className="px-4 py-4">
                                            <span
                                                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                                    categoria.activo
                                                        ? 'border-emerald-800/70 bg-emerald-950/40 text-emerald-300'
                                                        : 'border-amber-800/70 bg-amber-950/40 text-amber-300'
                                                }`}
                                            >
                                                {categoria.activo
                                                    ? 'Activa'
                                                    : 'Archivada'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex justify-end gap-2">
                                                {puedeEditar ? (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            abrirEditar(categoria)
                                                        }
                                                        aria-label={`Editar ${categoria.nombre}`}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-800"
                                                    >
                                                        <Pencil
                                                            aria-hidden="true"
                                                            className="h-4 w-4"
                                                        />
                                                        Editar
                                                    </button>
                                                ) : null}
                                                {puedeEliminar ? (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setCategoriaAEliminar(
                                                                categoria
                                                            )
                                                        }
                                                        aria-label={`Eliminar ${categoria.nombre}`}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/70 bg-red-950/30 px-3 py-2 text-xs font-semibold text-red-100 transition-colors hover:bg-red-900/50"
                                                    >
                                                        <Trash2
                                                            aria-hidden="true"
                                                            className="h-4 w-4"
                                                        />
                                                        Eliminar
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <CategoriaModal
                isOpen={modalAbierto}
                categoria={categoriaEnEdicion}
                onClose={() => setModalAbierto(false)}
                onGuardada={recargar}
            />

            <CategoriaDeleteConfirm
                categoria={categoriaAEliminar}
                onClose={() => setCategoriaAEliminar(null)}
                onEliminada={recargar}
            />
        </div>
    );
}
