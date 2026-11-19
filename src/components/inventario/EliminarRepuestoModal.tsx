'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ModalWrapper from '@/components/admin/ModalWrapper';
import { useAuth } from '@/context/AuthContext';
import { eliminarRepuesto } from '@/app/admin/inventario-repuestos/actions/eliminarRepuesto';
import type { RepuestoInventarioDTO } from '@/types/inventario-repuestos';

interface EliminarRepuestoModalProps {
    isOpen: boolean;
    repuesto: RepuestoInventarioDTO | null;
    onClose: () => void;
    onEliminado: () => Promise<void>;
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

export default function EliminarRepuestoModal({
    isOpen,
    repuesto,
    onClose,
    onEliminado,
}: EliminarRepuestoModalProps) {
    const { user } = useAuth();
    const [eliminando, setEliminando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setEliminando(false);
        setError(null);
    }, [isOpen, repuesto?.documento_id]);

    if (!repuesto) return null;

    function cerrar(): void {
        if (eliminando) return;
        onClose();
    }

    async function handleEliminar(): Promise<void> {
        const usuario = user;
        if (!usuario || !repuesto) {
            setError('Sesión inválida. Vuelve a iniciar sesión.');
            return;
        }

        setEliminando(true);
        setError(null);

        try {
            const idToken = await usuario.getIdToken();
            const resultado = await eliminarRepuesto(
                {
                    documento_id: repuesto.documento_id,
                    referencia: repuesto.referencia,
                },
                { uid: usuario.uid, idToken }
            );

            if (!resultado.success) {
                const mensaje = mensajeDeRespuesta(
                    resultado.message,
                    'No se pudo eliminar el repuesto.'
                );
                setError(mensaje);
                toast.error(mensaje);
                return;
            }

            toast.success('Repuesto eliminado.');
            await onEliminado();
            onClose();
        } catch (errorEliminar) {
            console.error(
                '[inventario-repuestos-ui] eliminarRepuesto falló:',
                errorEliminar
            );
            const mensaje =
                errorEliminar instanceof Error &&
                errorEliminar.message.trim()
                    ? errorEliminar.message
                    : 'No se pudo eliminar el repuesto.';
            setError(mensaje);
            toast.error(mensaje);
        } finally {
            setEliminando(false);
        }
    }

    return (
        <ModalWrapper
            isOpen={isOpen}
            onClose={cerrar}
            title="Eliminar repuesto"
            maxWidth="520px"
        >
            <div className="space-y-4 p-6">
                <div className="rounded-xl border border-red-900/70 bg-red-950/30 p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle
                            aria-hidden="true"
                            className="mt-0.5 h-5 w-5 shrink-0 text-red-300"
                        />
                        <div className="space-y-2 text-sm text-red-100">
                            <p className="leading-relaxed">
                                Vas a eliminar permanentemente{' '}
                                <span className="font-mono font-semibold text-white">
                                    {repuesto.referencia}
                                </span>
                                .
                            </p>
                            <p className="leading-relaxed text-red-200/80">
                                Esta acción no se puede deshacer y quedará
                                auditada en el ledger de inventario.
                            </p>
                        </div>
                    </div>
                </div>

                <p className="text-xs leading-relaxed text-gray-400">
                    Si el repuesto tiene conteos pendientes asociados, el
                    sistema bloqueará el borrado para no romper la trazabilidad.
                </p>

                {error ? (
                    <div
                        role="alert"
                        className="flex items-start gap-2 rounded-xl border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-100"
                    >
                        <AlertTriangle
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
                        disabled={eliminando}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            void handleEliminar();
                        }}
                        disabled={eliminando}
                        aria-label={`Confirmar eliminación de ${repuesto.referencia}`}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                        {eliminando
                            ? 'Eliminando…'
                            : 'Eliminar definitivamente'}
                    </button>
                </div>
            </div>
        </ModalWrapper>
    );
}
