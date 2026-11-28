'use client';

import type { CategoriaRepuestoDTO } from '@/types/categorias-repuestos';

interface SelectorCategoriaRepuestoProps {
    id: string;
    categorias: CategoriaRepuestoDTO[];
    value: string;
    onChange: (value: string) => void;
    label?: string;
    name?: string;
    disabled?: boolean;
    required?: boolean;
    incluirTodas?: boolean;
    placeholder?: string;
    ariaLabel?: string;
    compacto?: boolean;
}

/**
 * WEB-INV-053 — Selector nativo de categorías canónicas.
 *
 * No hay autocompletado ni texto libre: las opciones provienen de
 * `categorias_repuestos`. El llamador decide si incluye archivadas.
 */
export default function SelectorCategoriaRepuesto({
    id,
    categorias,
    value,
    onChange,
    label,
    name,
    disabled = false,
    required = false,
    incluirTodas = false,
    placeholder = 'Selecciona una categoría…',
    ariaLabel,
    compacto = false,
}: SelectorCategoriaRepuestoProps) {
    const selectClassName = compacto
        ? 'w-40 rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white outline-none focus:border-red-500 disabled:cursor-not-allowed disabled:opacity-50'
        : 'mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50';

    const select = (
        <select
            id={id}
            name={name}
            value={value}
            disabled={disabled}
            required={required}
            aria-label={ariaLabel ?? label ?? 'Categoría'}
            onChange={(event) => onChange(event.target.value)}
            className={selectClassName}
        >
            <option value="">
                {incluirTodas ? 'Todas las categorías' : placeholder}
            </option>
            {categorias.map((categoria) => (
                <option key={categoria.clave} value={categoria.nombre}>
                    {categoria.nombre}
                    {categoria.activo ? '' : ' (archivada)'}
                </option>
            ))}
        </select>
    );

    if (!label) return select;

    return (
        <label
            htmlFor={id}
            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
        >
            {label}
            {select}
        </label>
    );
}
