'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ModalWrapper from '@/components/admin/ModalWrapper';
import { useAuth } from '@/context/AuthContext';
import { eliminarCategoriaRepuesto } from './actions/eliminarCategoria';
import type { CategoriaRepuestoDTO } from '@/types/categorias-repuestos';

interface CategoriaDeleteConfirmProps {
    categoria: CategoriaRepuestoDTO | null;
    onClose: () => void;
    onEliminada: () => Promise<void>;
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

/**
 * WEB-INV-053 — Confirmación de borrado físico.
 *
 * Si la categoría está en uso, la Server Action la rechaza. La UI muestra el
 * mensaje y sugiere archivarla desde el modal de edición.
 */
export default function CategoriaDeleteConfirm({
    categoria,
    onClose,
    onEliminada,
}: CategoriaDeleteConfirmProps) {
    const { user } = useAuth();
    const [eliminando, setEliminando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setEliminando(false);
        setError(null);
    }, [categoria]);

    function cerrar(): void {
        if (eliminando) return;
        onClose();
    }

    async function confirmar(): Promise<void> {
        if (!categoria) return;

        setError(null);

        const usuario = user;
        if (!usuario) {
            setError('Sesión inválida. Vuelve a iniciar sesión.');
            return;
        }

        setEliminando(true);
        try {
            const idToken = await usuario.getIdToken();
            const resultado = await eliminarCategoriaRepuesto(
                { clave: categoria.clave, nombre: categoria.nombre },
                { uid: usuario.uid, idToken }
            );

            if (!resultado.success) {
                const mensaje = mensajeDeRespuesta(
                    resultado.message,
                    'No se pudo eliminar la categoría.'
                );
                setError(mensaje);
                toast.error(mensaje);
                return;
            }

            toast.success('Categoría eliminada.');
            await onEliminada();
            onClose();
        } catch (errorEliminar) {
            console.error(
                '[inventario-categorias-ui] eliminarCategoria falló:',
                errorEliminar
            );
            const mensaje =
                errorEliminar instanceof Error &&
                errorEliminar.message.trim()
                    ? errorEliminar.message
                    : 'No se pudo eliminar la categoría.';
            setError(mensaje);
            toast.error(mensaje);
        } finally {
            setEliminando(false);
        }
    }

    return (
        <ModalWrapper
            isOpen={categoria !== null}
            onClose={cerrar}
            title="Eliminar categoría"
            maxWidth="520px"
        >
            {categoria ? (
                <div className="space-y-4 p-6">
                    <div className="flex items-start gap-3 rounded-xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-100">
                        <AlertTriangle
                            aria-hidden="true"
                            className="mt-0.5 h-5 w-5 shrink-0"
                        />
                        <div className="space-y-1">
                            <p className="font-semibold">
                                ¿Eliminar «{categoria.nombre}»?
                            </p>
                            <p>
                                Solo se permite si ningún repuesto la
                                referencia. Si está en uso, archívala para
                                conservar la trazabilidad histórica.
                            </p>
                        </div>
                    </div>

                    {error ? (
                        <div
                            role="alert"
                            className="rounded-xl border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-100"
                        >
                            {error}
                        </div>
                    ) : null}

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={cerrar}
                            disabled={eliminando}
                            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                void confirmar();
                            }}
                            disabled={eliminando}
                            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {eliminando ? (
                                <Loader2
                                    aria-hidden="true"
                                    className="h-4 w-4 animate-spin"
                                />
                            ) : (
                                <Trash2
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                />
                            )}
                            Eliminar
                        </button>
                    </div>
                </div>
            ) : null}
        </ModalWrapper>
    );
}
