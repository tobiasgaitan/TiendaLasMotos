'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { ZodIssue } from 'zod';
import { AlertCircle, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import ModalWrapper from '@/components/admin/ModalWrapper';
import { useAuth } from '@/context/AuthContext';
import { crearRepuesto } from '@/app/admin/inventario-repuestos/actions/crearRepuesto';
import { crearRepuestoSchema } from '@/lib/actions/inventario-repuestos-schemas';
import { parseAplicaA } from '@/lib/inventario/ui-helpers';

interface CrearRepuestoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreado: () => Promise<void>;
}

function mensajeDeError(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return fallback;
}

const ETIQUETAS_CAMPO: Record<string, string> = {
    referencia: 'Referencia maestra',
    descripcion: 'Descripción',
    fabricante: 'Fabricante',
    aplica_a: 'Aplica a',
    categoria: 'Categoría',
    precio: 'Precio de compra',
    stock: 'Stock',
    stock_minimo: 'Stock mínimo',
    imagen_url: 'Imagen URL',
};

function etiquetaDeCampo(issue: ZodIssue): string {
    const [campo, indice] = issue.path;
    if (campo === 'referencias_alternativas') {
        return `Referencia alternativa #${
            typeof indice === 'number' ? indice + 1 : 1
        }`;
    }
    if (typeof campo === 'string' && ETIQUETAS_CAMPO[campo]) {
        return ETIQUETAS_CAMPO[campo];
    }
    return 'Formulario';
}

function mensajesDeValidacion(issues: ZodIssue[]): string {
    return issues
        .map((issue) => `${etiquetaDeCampo(issue)}: ${issue.message}`)
        .join('\n');
}

export default function CrearRepuestoModal({
    isOpen,
    onClose,
    onCreado,
}: CrearRepuestoModalProps) {
    const { user } = useAuth();

    const [referencia, setReferencia] = useState('');
    const [referenciasAlternativas, setReferenciasAlternativas] = useState<
        string[]
    >([]);
    const [descripcion, setDescripcion] = useState('');
    const [fabricante, setFabricante] = useState('');
    const [aplicaA, setAplicaA] = useState('');
    const [categoria, setCategoria] = useState('');
    const [precio, setPrecio] = useState('');
    const [stock, setStock] = useState('0');
    const [stockMinimo, setStockMinimo] = useState('0');
    const [imagenUrl, setImagenUrl] = useState('');
    const [creando, setCreando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        setReferencia('');
        setReferenciasAlternativas([]);
        setDescripcion('');
        setFabricante('');
        setAplicaA('');
        setCategoria('');
        setPrecio('');
        setStock('0');
        setStockMinimo('0');
        setImagenUrl('');
        setCreando(false);
        setError(null);
    }, [isOpen]);

    function cerrar(): void {
        if (creando) return;
        onClose();
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);

        const usuario = user;
        if (!usuario) {
            setError('Sesión inválida. Vuelve a iniciar sesión.');
            return;
        }

        const validacion = crearRepuestoSchema.safeParse({
            referencia,
            descripcion,
            fabricante,
            aplica_a: parseAplicaA(aplicaA),
            categoria,
            precio,
            stock,
            stock_minimo: stockMinimo,
            referencias_alternativas: referenciasAlternativas.filter(
                (item) => item.trim()
            ),
            imagen_url: imagenUrl.trim() ? imagenUrl.trim() : null,
        });

        if (!validacion.success) {
            setError(
                mensajesDeValidacion(validacion.error.issues) ||
                    'Revisa los datos del repuesto.'
            );
            return;
        }

        setCreando(true);

        try {
            const idToken = await usuario.getIdToken();
            const resultado = await crearRepuesto(validacion.data, {
                uid: usuario.uid,
                idToken,
            });

            if (!resultado.success) {
                const mensaje =
                    resultado.message?.trim() ||
                    'No se pudo crear el repuesto.';
                setError(mensaje);
                toast.error(mensaje);
                return;
            }

            toast.success('Repuesto creado.');
            await onCreado();
            onClose();
        } catch (errorCreacion) {
            console.error(
                '[inventario-repuestos-ui] No se pudo crear el repuesto:',
                errorCreacion
            );
            const mensaje = mensajeDeError(
                errorCreacion,
                'No se pudo crear el repuesto.'
            );
            setError(mensaje);
            toast.error(mensaje);
        } finally {
            setCreando(false);
        }
    }

    return (
        <ModalWrapper
            isOpen={isOpen}
            onClose={cerrar}
            title="Nuevo repuesto"
            maxWidth="720px"
        >
            <form
                onSubmit={handleSubmit}
                className="space-y-4 p-6"
                noValidate
            >
                <p className="text-xs leading-relaxed text-gray-400">
                    La referencia maestra identifica la ficha comercial. Puedes
                    registrar referencias alternativas del mismo repuesto para
                    que también sean buscables.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label
                            htmlFor="crear-referencia"
                            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                        >
                            Referencia maestra{' '}
                            <span aria-hidden="true">*</span>
                        </label>
                        <input
                            id="crear-referencia"
                            type="text"
                            required
                            value={referencia}
                            maxLength={64}
                            autoCapitalize="characters"
                            spellCheck={false}
                            disabled={creando}
                            onChange={(event) =>
                                setReferencia(event.target.value)
                            }
                            onBlur={() =>
                                setReferencia((actual) =>
                                    actual.toUpperCase()
                                )
                            }
                            className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 font-mono text-sm uppercase text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Ej. 5VL-E1341-00"
                        />
                        <p className="mt-1 text-[11px] text-gray-500">
                            A-Z, 0-9, ., _, - · sin espacios · máximo 64.
                        </p>
                    </div>

</div>

                <div>
                    <label
                        htmlFor="crear-descripcion"
                        className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                    >
                        Descripción <span aria-hidden="true">*</span>
                    </label>
                    <input
                        id="crear-descripcion"
                        type="text"
                        required
                        value={descripcion}
                        maxLength={500}
                        disabled={creando}
                        onChange={(event) =>
                            setDescripcion(event.target.value)
                        }
                        className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Ej. Filtro de aceite"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Referencias alternativas
                    </label>
                    <p className="mt-1 text-[11px] text-gray-500">
                        Referencias adicionales del proveedor para el mismo
                        repuesto. La referencia maestra no se repite aquí.
                        Formato: A-Z, 0-9, ., _, - · sin espacios · máximo 64.
                    </p>
                    <div className="mt-2 space-y-2">
                        {referenciasAlternativas.map((alternativa, indice) => (
                            <div
                                key={`alternativa-${indice}`}
                                className="flex items-center gap-2"
                            >
                                <input
                                    type="text"
                                    value={alternativa}
                                    maxLength={64}
                                    disabled={creando}
                                    onChange={(event) =>
                                        setReferenciasAlternativas((actual) =>
                                            actual.map((item, posicion) =>
                                                posicion === indice
                                                    ? event.target.value
                                                    : item
                                            )
                                        )
                                    }
                                    onBlur={() =>
                                        setReferenciasAlternativas((actual) =>
                                            actual.map((item, posicion) =>
                                                posicion === indice
                                                    ? item.toUpperCase()
                                                    : item
                                            )
                                        )
                                    }
                                    className="w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 font-mono text-sm uppercase text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                    placeholder="Ej. 5VL-E1341-01"
                                />
                                <button
                                    type="button"
                                    disabled={creando}
                                    onClick={() =>
                                        setReferenciasAlternativas((actual) =>
                                            actual.filter(
                                                (_, posicion) =>
                                                    posicion !== indice
                                            )
                                        )
                                    }
                                    className="shrink-0 rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label={`Quitar referencia alternativa ${indice + 1}`}
                                >
                                    Quitar
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        disabled={
                            creando || referenciasAlternativas.length >= 50
                        }
                        onClick={() =>
                            setReferenciasAlternativas((actual) => [
                                ...actual,
                                '',
                            ])
                        }
                        className="mt-2 text-xs font-semibold text-red-300 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        + Agregar referencia
                    </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label
                            htmlFor="crear-fabricante"
                            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                        >
                            Fabricante
                        </label>
                        <input
                            id="crear-fabricante"
                            type="text"
                            value={fabricante}
                            maxLength={100}
                            disabled={creando}
                            onChange={(event) =>
                                setFabricante(event.target.value)
                            }
                            className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Ej. Bosch"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="crear-categoria"
                            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                        >
                            Categoría
                        </label>
                        <input
                            id="crear-categoria"
                            type="text"
                            value={categoria}
                            maxLength={100}
                            disabled={creando}
                            onChange={(event) =>
                                setCategoria(event.target.value)
                            }
                            className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Ej. Filtros"
                        />
                    </div>
                </div>

                <div>
                    <label
                        htmlFor="crear-aplica-a"
                        className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                    >
                        Aplica a
                    </label>
                    <input
                        id="crear-aplica-a"
                        type="text"
                        value={aplicaA}
                        maxLength={5000}
                        disabled={creando}
                        onChange={(event) => setAplicaA(event.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="motor, frenos, embrague"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                        Separa los elementos con comas.
                    </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                        <label
                            htmlFor="crear-precio"
                            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                        >
                            Precio de compra
                        </label>
                        <input
                            id="crear-precio"
                            type="number"
                            min={0}
                            step={0.01}
                            inputMode="decimal"
                            value={precio}
                            disabled={creando}
                            onChange={(event) => setPrecio(event.target.value)}
                            className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="0.00"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="crear-stock"
                            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                        >
                            Stock
                        </label>
                        <input
                            id="crear-stock"
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={stock}
                            disabled={creando}
                            onChange={(event) => setStock(event.target.value)}
                            className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="crear-stock-minimo"
                            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                        >
                            Stock mínimo
                        </label>
                        <input
                            id="crear-stock-minimo"
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={stockMinimo}
                            disabled={creando}
                            onChange={(event) =>
                                setStockMinimo(event.target.value)
                            }
                            className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                </div>

                <div>
                    <label
                        htmlFor="crear-imagen-url"
                        className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                    >
                        Imagen URL
                    </label>
                    <input
                        id="crear-imagen-url"
                        type="url"
                        value={imagenUrl}
                        maxLength={2048}
                        disabled={creando}
                        onChange={(event) => setImagenUrl(event.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Opcional"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                        Puedes dejar este campo vacío. Se guardará como cadena
                        vacía.
                    </p>
                </div>

                {error ? (
                    <div
                        role="alert"
                        className="flex items-start gap-2 rounded-xl border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-100"
                    >
                        <AlertCircle
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <p className="whitespace-pre-line leading-relaxed">
                            {error}
                        </p>
                    </div>
                ) : null}

                <div className="flex flex-col-reverse gap-2 border-t border-gray-800 pt-4 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={cerrar}
                        disabled={creando}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={creando}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {creando ? (
                            <Loader2
                                aria-hidden="true"
                                className="h-4 w-4 animate-spin"
                            />
                        ) : (
                            <Save aria-hidden="true" className="h-4 w-4" />
                        )}
                        {creando ? 'Creando…' : 'Crear repuesto'}
                    </button>
                </div>
            </form>
        </ModalWrapper>
    );
}
