import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { crearConteoPendiente } from '@/app/admin/inventario-asesor/actions/crearConteoPendiente';
import type {
    ActorInput,
    CrearConteoInput,
} from '@/lib/actions/inventario-schemas';
import { emitirCambioOutbox, obtenerFoto } from '../db';
import type { ResultadoSincronizacion } from '../types';
import {
    eliminarBorrador,
    finalizarSincronizacion,
    intentarIniciarSincronizacion,
    marcarError,
    marcarSincronizando,
    obtenerSiguientePendiente,
} from './queue';

export async function sincronizarOutbox(
    actor: ActorInput,
    opciones: { respetarBackoff?: boolean; maxItems?: number } = {}
): Promise<ResultadoSincronizacion> {
    if (
        !actor ||
        typeof actor.uid !== 'string' ||
        !actor.uid.trim()
    ) {
        const error = new Error(
            'No se puede sincronizar el outbox sin un propietario válido.'
        );
        console.error('[offline] sincronizarOutbox sin propietario:', error);
        return {
            procesados: 0,
            exitosos: 0,
            fallidos: 0,
            ultimoError: error.message,
        };
    }

    if (!intentarIniciarSincronizacion()) {
        return {
            procesados: 0,
            exitosos: 0,
            fallidos: 0,
            ultimoError: null,
        };
    }

    const propietarioUid = actor.uid.trim();
    const maxItems =
        typeof opciones.maxItems === 'number'
            ? Math.max(1, Math.floor(opciones.maxItems))
            : 20;
    const respetarBackoff = opciones.respetarBackoff !== false;

    let procesados = 0;
    let exitosos = 0;
    let fallidos = 0;
    let ultimoError: string | null = null;

    try {
        for (let indice = 0; indice < maxItems; indice++) {
            const pendiente = await obtenerSiguientePendiente(
                respetarBackoff,
                propietarioUid
            );
            if (!pendiente) break;

            procesados += 1;
            const enProceso = await marcarSincronizando(
                pendiente.conteo_id,
                propietarioUid
            );
            if (!enProceso) continue;

            try {
                const foto = await obtenerFoto(
                    pendiente.conteo_id,
                    propietarioUid
                );
                let fotoUrl =
                    typeof pendiente.payload.foto_url === 'string'
                        ? pendiente.payload.foto_url
                        : '';

                if (foto) {
                    const storageRef = ref(storage, foto.storage_path);
                    await uploadBytes(storageRef, foto.blob, {
                        contentType: foto.mime_type,
                        customMetadata: {
                            conteo_id: pendiente.conteo_id,
                        },
                    });
                    fotoUrl = await getDownloadURL(storageRef);
                }

                if (!fotoUrl) {
                    const mensaje =
                        'El borrador no tiene foto ni URL para sincronizar.';
                    console.error('[offline] Borrador incompleto:', {
                        conteoId: pendiente.conteo_id,
                    });
                    await marcarError(
                        pendiente.conteo_id,
                        mensaje,
                        enProceso.intentos,
                        propietarioUid
                    );
                    ultimoError = mensaje;
                    fallidos += 1;
                    continue;
                }

                const input: CrearConteoInput = {
                    ...pendiente.payload,
                    foto_url: fotoUrl,
                    storage_path: foto
                        ? foto.storage_path
                        : pendiente.payload.storage_path,
                    nombre_archivo: foto
                        ? foto.nombre_archivo
                        : pendiente.payload.nombre_archivo,
                    mime_type: foto
                        ? foto.mime_type
                        : pendiente.payload.mime_type,
                    tamano_bytes: foto
                        ? foto.tamano_bytes
                        : pendiente.payload.tamano_bytes,
                    etiquetas_vision: pendiente.payload.etiquetas_vision,
                    cantidad_sugerida_multimodal:
                        pendiente.payload.cantidad_sugerida_multimodal ?? null,
                    justificacion_multimodal:
                        pendiente.payload.justificacion_multimodal ?? null,
                    confidence_multimodal:
                        pendiente.payload.confidence_multimodal ?? null,
                };

                const resultado = await crearConteoPendiente(input, actor);
                if (!resultado.success) {
                    const mensaje =
                        resultado.message ||
                        'La Server Action rechazó el conteo.';
                    console.error(
                        '[offline] crearConteoPendiente rechazó el borrador:',
                        {
                            conteoId: pendiente.conteo_id,
                            mensaje,
                        }
                    );
                    await marcarError(
                        pendiente.conteo_id,
                        mensaje,
                        enProceso.intentos,
                        propietarioUid
                    );
                    ultimoError = mensaje;
                    fallidos += 1;
                    continue;
                }

                await eliminarBorrador(
                    pendiente.conteo_id,
                    propietarioUid
                );
                exitosos += 1;
            } catch (error) {
                const mensaje =
                    error instanceof Error
                        ? error.message
                        : 'Error desconocido al sincronizar.';
                console.error('[offline] Error sincronizando borrador:', {
                    conteoId: pendiente.conteo_id,
                    error,
                });

                try {
                    await marcarError(
                        pendiente.conteo_id,
                        mensaje,
                        enProceso.intentos,
                        propietarioUid
                    );
                } catch (errorMarcando) {
                    console.error(
                        '[offline] No se pudo marcar el borrador con error:',
                        errorMarcando
                    );
                }

                ultimoError = mensaje;
                fallidos += 1;

                if (
                    typeof navigator !== 'undefined' &&
                    !navigator.onLine
                ) {
                    break;
                }
            }
        }

        return { procesados, exitosos, fallidos, ultimoError };
    } catch (error) {
        console.error('[offline] sincronizarOutbox falló:', error);
        throw error;
    } finally {
        finalizarSincronizacion();
        emitirCambioOutbox();
    }
}
