'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import ModalWrapper from '@/components/admin/ModalWrapper';
import { useAuth } from '@/context/AuthContext';
import { crearCategoriaRepuesto } from './actions/crearCategoria';
import { editarCategoriaRepuesto } from './actions/editarCategoria';
import {
    CATEGORIA_DESCRIPCION_MAX,
    CATEGORIA_ORDEN_MAX,
} from '@/lib/inventario/categorias';
import {
    crearCategoriaRepuestoSchema,
    editarCategoriaRepuestoSchema,
} from '@/lib/actions/categorias-repuestos-schemas';
import type { CategoriaRepuestoDTO } from '@/types/categorias-repuestos';

interface CategoriaModalProps {
    isOpen: boolean;
    categoria: CategoriaRepuestoDTO | null;
    onClose: () => void;
    onGuardada: () => Promise<void>;
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

export default function CategoriaModal({
    isOpen,
    categoria,
    onClose,
    onGuardada,
}: CategoriaModalProps) {
    const { user } = useAuth();
    const [nombre, setNombre] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [orden, setOrden] = useState('100');
    const [activo, setActivo] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const esEdicion = categoria !== null;

    useEffect(() => {
        if (!isOpen) return;
        setNombre(categoria?.nombre ?? '');
        setDescripcion(categoria?.descripcion ?? '');
        setOrden(String(categoria?.orden ?? 100));
        setActivo(categoria?.activo ?? true);
        setGuardando(false);
        setError(null);
    }, [isOpen, categoria]);

    function cerrar(): void {
        if (guardando) return;
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

        const ordenNumero = Number(orden.trim());
        if (
            !Number.isInteger(ordenNumero) ||
            ordenNumero < 0 ||
            ordenNumero > CATEGORIA_ORDEN_MAX
        ) {
            setError(
                `El orden debe ser un entero entre 0 y ${CATEGORIA_ORDEN_MAX}.`
            );
            return;
        }

        if (!esEdicion) {
            const validacion = crearCategoriaRepuestoSchema.safeParse({
                nombre,
                descripcion,
                orden: ordenNumero,
            });
            if (!validacion.success) {
                setError(
                    validacion.error.issues[0]?.message ??
                        'Revisa los datos de la categoría.'
                );
                return;
            }

            setGuardando(true);
            try {
                const idToken = await usuario.getIdToken();
                const resultado = await crearCategoriaRepuesto(
                    validacion.data,
                    { uid: usuario.uid, idToken }
                );

                if (!resultado.success) {
                    const mensaje = mensajeDeRespuesta(
                        resultado.message,
                        'No se pudo crear la categoría.'
                    );
                    setError(mensaje);
                    toast.error(mensaje);
                    return;
                }

                toast.success('Categoría creada.');
                await onGuardada();
                onClose();
            } catch (errorCrear) {
                console.error(
                    '[inventario-categorias-ui] crearCategoria falló:',
                    errorCrear
                );
                const mensaje =
                    errorCrear instanceof Error &&
                    errorCrear.message.trim()
                        ? errorCrear.message
                        : 'No se pudo crear la categoría.';
                setError(mensaje);
                toast.error(mensaje);
            } finally {
                setGuardando(false);
            }
            return;
        }

        const validacion = editarCategoriaRepuestoSchema.safeParse({
            clave: categoria.clave,
            nombre: categoria.nombre,
            cambios: {
                descripcion,
                orden: ordenNumero,
                activo,
            },
        });
        if (!validacion.success) {
            setError(
                validacion.error.issues[0]?.message ??
                    'Revisa los datos de la categoría.'
            );
            return;
        }

        setGuardando(true);
        try {
            const idToken = await usuario.getIdToken();
            const resultado = await editarCategoriaRepuesto(
                validacion.data,
                { uid: usuario.uid, idToken }
            );

            if (!resultado.success) {
                const mensaje = mensajeDeRespuesta(
                    resultado.message,
                    'No se pudo editar la categoría.'
                );
                setError(mensaje);
                toast.error(mensaje);
                return;
            }

            toast.success(
                resultado.idempotente
                    ? 'Sin cambios en la categoría.'
                    : 'Categoría actualizada.'
            );
            await onGuardada();
            onClose();
        } catch (errorEditar) {
            console.error(
                '[inventario-categorias-ui] editarCategoria falló:',
                errorEditar
            );
            const mensaje =
                errorEditar instanceof Error && errorEditar.message.trim()
                    ? errorEditar.message
                    : 'No se pudo editar la categoría.';
            setError(mensaje);
            toast.error(mensaje);
        } finally {
            setGuardando(false);
        }
    }

    return (
        <ModalWrapper
            isOpen={isOpen}
            onClose={cerrar}
            title={esEdicion ? 'Editar categoría' : 'Nueva categoría'}
            maxWidth="560px"
        >
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
                <div>
                    <label
                        htmlFor="categoria-nombre"
                        className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                    >
                        Nombre
                    </label>
                    <input
                        id="categoria-nombre"
                        type="text"
                        value={nombre}
                        maxLength={100}
                        disabled={guardando || esEdicion}
                        onChange={(event) => setNombre(event.target.value)}
                        placeholder="Ej. FILTROS"
                        className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <p className="mt-1.5 text-xs text-gray-500">
                        {esEdicion
                            ? 'El nombre es inmutable en esta versión. Para corregirlo se requiere una migración.'
                            : 'Se guarda en mayúsculas. Debe ser único.'}
                    </p>
                </div>

                <div>
                    <label
                        htmlFor="categoria-descripcion"
                        className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                    >
                        Descripción
                    </label>
                    <textarea
                        id="categoria-descripcion"
                        value={descripcion}
                        maxLength={CATEGORIA_DESCRIPCION_MAX}
                        disabled={guardando}
                        onChange={(event) =>
                            setDescripcion(event.target.value)
                        }
                        rows={3}
                        placeholder="Nota interna opcional."
                        className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label
                            htmlFor="categoria-orden"
                            className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                        >
                            Orden
                        </label>
                        <input
                            id="categoria-orden"
                            type="number"
                            min={0}
                            max={CATEGORIA_ORDEN_MAX}
                            step={1}
                            value={orden}
                            disabled={guardando}
                            onChange={(event) =>
                                setOrden(event.target.value)
                            }
                            className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>

                    {esEdicion ? (
                        <label className="flex items-center gap-3 self-end rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2.5 text-sm text-gray-200">
                            <input
                                type="checkbox"
                                checked={activo}
                                disabled={guardando}
                                onChange={(event) =>
                                    setActivo(event.target.checked)
                                }
                                className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-red-500 focus:ring-red-500"
                            />
                            Activa
                        </label>
                    ) : null}
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
                        <span>{error}</span>
                    </div>
                ) : null}

                <div className="flex justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={cerrar}
                        disabled={guardando}
                        className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={
                            guardando ||
                            (!esEdicion && nombre.trim().length === 0)
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {guardando ? (
                            <Loader2
                                aria-hidden="true"
                                className="h-4 w-4 animate-spin"
                            />
                        ) : (
                            <Save aria-hidden="true" className="h-4 w-4" />
                        )}
                        {esEdicion ? 'Guardar cambios' : 'Crear categoría'}
                    </button>
                </div>
            </form>
        </ModalWrapper>
    );
}
