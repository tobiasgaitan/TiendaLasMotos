'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
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

export default function CrearRepuestoModal({
    isOpen,
    onClose,
    onCreado,
}: CrearRepuestoModalProps) {
    const { user } = useAuth();

    const [referencia, setReferencia] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [fabricante, setFabricante] = useState('');
    const [aplicaA, setAplicaA] = useState('');
    const [categoria, setCategoria] = useState('');
    const [precio, setPrecio] = useState('');
    const [ubicacion, setUbicacion] = useState('');
    const [stock, setStock] = useState('0');
    const [stockMinimo, setStockMinimo] = useState('0');
    const [imagenUrl, setImagenUrl] = useState('');
    const [creando, setCreando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        setReferencia('');
        setDescripcion('');
        setFabricante('');
        setAplicaA('');
        setCategoria('');
        setPrecio('');
        setUbicacion('');
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
            ubicacion,
            stock,
            stock_minimo: stockMinimo,
            imagen_url: imagenUrl.trim() ? imagenUrl.trim() : null,
        });

        if (!validacion.success) {
            const primerError = validacion.error.issues[0];
            setError(
                primerError
                    ? primerError.message
                    : 'Revisa los datos del repuesto.'
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
                    La referencia se usará como identificador canónico del
                    repuesto. Si ya existe, el alta será rechazada.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label
                            htmlFor="crear-referencia"
                            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                        >
                            Referencia <span aria-hidden="true">*</span>
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
                                    actual.trim().toUpperCase()
                                )
                            }
                            className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 font-mono text-sm uppercase text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Ej. 5VL-E1341-00"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="crear-ubicacion"
                            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                        >
                            Ubicación <span aria-hidden="true">*</span>
                        </label>
                        <input
                            id="crear-ubicacion"
                            type="text"
                            required
                            value={ubicacion}
                            maxLength={8}
                            autoCapitalize="characters"
                            spellCheck={false}
                            disabled={creando}
                            onChange={(event) =>
                                setUbicacion(event.target.value)
                            }
                            onBlur={() =>
                                setUbicacion((actual) =>
                                    actual.trim().toUpperCase()
                                )
                            }
                            className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 font-mono text-sm uppercase text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="A-01-05"
                        />
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

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label
                            htmlFor="crear-fabricante"
                            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                        >
                            Fabricante <span aria-hidden="true">*</span>
                        </label>
                        <input
                            id="crear-fabricante"
                            type="text"
                            required
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
                            Categoría <span aria-hidden="true">*</span>
                        </label>
                        <input
                            id="crear-categoria"
                            type="text"
                            required
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
                        Aplica a <span aria-hidden="true">*</span>
                    </label>
                    <input
                        id="crear-aplica-a"
                        type="text"
                        required
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
                            Precio <span aria-hidden="true">*</span>
                        </label>
                        <input
                            id="crear-precio"
                            type="number"
                            required
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
                            Stock <span aria-hidden="true">*</span>
                        </label>
                        <input
                            id="crear-stock"
                            type="number"
                            required
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
                            Stock mínimo <span aria-hidden="true">*</span>
                        </label>
                        <input
                            id="crear-stock-minimo"
                            type="number"
                            required
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
                        <p className="leading-relaxed">{error}</p>
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
