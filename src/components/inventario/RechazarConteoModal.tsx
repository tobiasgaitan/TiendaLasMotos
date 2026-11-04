'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ModalWrapper from '@/components/admin/ModalWrapper';
import { useAuth } from '@/context/AuthContext';
import { rechazarConteo } from '@/app/admin/inventory/actions/rechazarConteo';
import { validarMotivoRechazo } from '@/lib/inventario/ui-helpers';
import type { PendienteDTO } from '@/types/inventario';

interface RechazarConteoModalProps {
    pendiente: PendienteDTO;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => Promise<void>;
    accionEnCurso: boolean;
    onAccionEnCursoChange: (enCurso: boolean) => void;
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

export default function RechazarConteoModal({
    pendiente,
    isOpen,
    onClose,
    onSuccess,
    accionEnCurso,
    onAccionEnCursoChange,
}: RechazarConteoModalProps) {
    const { user } = useAuth();

    const [motivo, setMotivo] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setMotivo('');
        setError(null);
    }, [isOpen, pendiente.id]);

    const motivoValido = validarMotivoRechazo(motivo);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);

        const usuario = user;
        if (!usuario) {
            setError('Sesión inválida. Vuelve a iniciar sesión.');
            return;
        }

        if (!pendiente.id.trim()) {
            setError('El conteo no tiene un identificador válido.');
            return;
        }

        const motivoLimpio = motivo.trim();
        if (!validarMotivoRechazo(motivoLimpio)) {
            setError('El motivo debe tener entre 5 y 500 caracteres.');
            return;
        }

        onAccionEnCursoChange(true);

        try {
            const idToken = await usuario.getIdToken();
            const resultado = await rechazarConteo(
                {
                    conteo_id: pendiente.id,
                    motivo_rechazo: motivoLimpio,
                },
                { uid: usuario.uid, idToken }
            );

            if (resultado.success) {
                toast.success('Conteo rechazado.');
                await onSuccess();
                return;
            }

            const mensaje = mensajeDeRespuesta(
                resultado.message,
                'No se pudo rechazar el conteo.'
            );
            setError(mensaje);
            toast.error(mensaje);
        } catch (errorEnvio) {
            console.error(
                '[inventario-ui] rechazarConteo falló:',
                errorEnvio
            );
            const mensaje = mensajeDeError(
                errorEnvio,
                'No se pudo rechazar el conteo.'
            );
            setError(mensaje);
            toast.error(mensaje);
        } finally {
            onAccionEnCursoChange(false);
        }
    }

    return (
        <ModalWrapper
            isOpen={isOpen}
            onClose={onClose}
            title="Rechazar conteo"
            maxWidth="560px"
        >
            <form
                onSubmit={handleSubmit}
                className="space-y-4 p-6"
                noValidate
            >
                <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-3">
                    <p className="font-mono text-sm font-semibold text-white">
                        {pendiente.referencia_confirmada || '—'}
                    </p>
                    <p className="mt-1 text-sm text-gray-300">
                        {pendiente.descripcion || 'Sin descripción'}
                    </p>
                </div>

                <div>
                    <label
                        htmlFor="rechazo-motivo"
                        className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
                    >
                        Motivo del rechazo{' '}
                        <span aria-hidden="true">*</span>
                    </label>
                    <textarea
                        id="rechazo-motivo"
                        required
                        rows={4}
                        maxLength={500}
                        value={motivo}
                        disabled={accionEnCurso}
                        onChange={(event) => setMotivo(event.target.value)}
                        className="mt-1.5 w-full resize-y rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                        placeholder="Explica qué debe corregir el asesor (mínimo 5 caracteres)."
                    />
                    <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
                        <p className="text-gray-500">
                            Mínimo 5 y máximo 500 caracteres.
                        </p>
                        <p
                            className={
                                motivo.length > 500
                                    ? 'text-red-300'
                                    : 'text-gray-500'
                            }
                        >
                            {motivo.length}/500
                        </p>
                    </div>
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
                        onClick={onClose}
                        disabled={accionEnCurso}
                        aria-label="Cancelar rechazo"
                        className="inline-flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={!motivoValido || accionEnCurso}
                        aria-label="Rechazar conteo"
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {accionEnCurso ? (
                            <Loader2
                                aria-hidden="true"
                                className="h-4 w-4 animate-spin"
                            />
                        ) : null}
                        Rechazar
                    </button>
                </div>
            </form>
        </ModalWrapper>
    );
}
