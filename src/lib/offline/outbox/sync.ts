import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { crearConteoPendiente } from '@/app/admin/inventory/actions/crearConteoPendiente';
import type {
    ActorInput,
    CrearConteoInput,
} from '@/lib/actions/inventario-schemas';
import {
    calcularBackoffMs,
    construirStoragePath,
    esBorradorDePropietario,
    esBorradorSincronizable,
    esUuid,
    filtrarPorPropietario,
    generarConteoId,
    normalizarNombreArchivo,
    OUTBOX_STORE_BORRADORES,
    OUTBOX_STORE_FOTOS,
    type MimeFoto,
    type OpcionesEncolarConteo,
} from '../outbox-utils';
import {
    abrirDbOutbox,
    borrarRegistrosDePropietario,
    emitirCambioOutbox,
    esperarSolicitud,
    esperarTransaccion,
    obtenerFoto,
} from './db';
import { prepararFotoConteo, validarFotoSubida } from './images';
import type {
    BorradorConteoOutbox,
    BorradorConteoPayload,
    EntradaBorradorConteo,
    FotoBorradorOutbox,
    FotoPreparada,
    ResultadoEncolar,
    ResultadoSincronizacion,
} from './types';

let sincronizandoOutbox = false;

export async function encolarConteo(
    entrada: EntradaBorradorConteo,
    foto: File | Blob,
    asesorEmail: string,
    propietarioUid: string,
    opciones: OpcionesEncolarConteo = {}
): Promise<ResultadoEncolar> {
    try {
        const propietario = typeof propietarioUid === 'string'
            ? propietarioUid.trim()
            : '';
        if (!propietario) {
            const error = new Error(
                'El propietario del borrador offline es obligatorio.'
            );
            console.error('[offline] Encolado sin propietario:', error);
            throw error;
        }

        const conteoIdRaw =
            typeof opciones.conteoId === 'string'
                ? opciones.conteoId.trim()
                : '';
        const conteoId = conteoIdRaw || generarConteoId();
        if (!esUuid(conteoId)) {
            const error = new Error('El conteo_id no es un UUID válido.');
            console.error('[offline] conteo_id inválido:', {
                conteoId,
                error,
            });
            throw error;
        }

        const email = asesorEmail.trim().toLowerCase();
        if (!email) {
            const error = new Error('El email del asesor está vacío.');
            console.error('[offline] Email inválido al encolar:', error);
            throw error;
        }

        const fotoSubida = opciones.fotoSubida;
        let preparada: FotoPreparada | null = null;
        let storagePath = '';
        let nombreArchivo = '';
        let mimeType: MimeFoto = 'image/jpeg';
        let tamanoBytes = 0;
        let fotoUrl = '';

        if (fotoSubida) {
            validarFotoSubida(fotoSubida, email, conteoId);
            storagePath = fotoSubida.storage_path;
            nombreArchivo = fotoSubida.nombre_archivo;
            mimeType = fotoSubida.mime_type;
            tamanoBytes = fotoSubida.tamano_bytes;
            fotoUrl = fotoSubida.foto_url;
        } else {
            preparada = await prepararFotoConteo(foto, conteoId);
            storagePath = construirStoragePath(
                email,
                conteoId,
                preparada.mime_type
            );
            nombreArchivo = normalizarNombreArchivo(
                preparada.nombre_archivo,
                conteoId,
                preparada.mime_type
            );
            mimeType = preparada.mime_type;
            tamanoBytes = preparada.tamano_bytes;
        }

        const etiquetasVision = Array.isArray(entrada.etiquetas_vision)
            ? entrada.etiquetas_vision.slice(0, 10)
            : [];
        const ahora = Date.now();

        const payload: BorradorConteoPayload = {
            ...entrada,
            conteo_id: conteoId,
            foto_url: fotoUrl,
            storage_path: storagePath,
            nombre_archivo: nombreArchivo,
            mime_type: mimeType,
            tamano_bytes: tamanoBytes,
            etiquetas_vision: etiquetasVision,
        };

        const borrador: BorradorConteoOutbox = {
            conteo_id: conteoId,
            propietario_uid: propietario,
            payload,
            intentos: 0,
            estado_envio: 'pendiente',
            creado_en: ahora,
            actualizado_en: ahora,
            proximo_intento_en: 0,
            ultimo_error: '',
        };

        const fotoBorrador: FotoBorradorOutbox | null = preparada
            ? {
                  conteo_id: conteoId,
                  propietario_uid: propietario,
                  blob: preparada.blob,
                  storage_path: storagePath,
                  nombre_archivo: nombreArchivo,
                  mime_type: mimeType,
                  tamano_bytes: tamanoBytes,
              }
            : null;

        const db = await abrirDbOutbox();
        const tx = db.transaction(
            [OUTBOX_STORE_BORRADORES, OUTBOX_STORE_FOTOS],
            'readwrite'
        );
        const txDone = esperarTransaccion(tx);
        tx.objectStore(OUTBOX_STORE_BORRADORES).put(borrador);
        if (fotoBorrador) {
            tx.objectStore(OUTBOX_STORE_FOTOS).put(fotoBorrador);
        } else {
            tx.objectStore(OUTBOX_STORE_FOTOS).delete(conteoId);
        }
        await txDone;
        emitirCambioOutbox();

        return { conteo_id: conteoId, storage_path: storagePath };
    } catch (error) {
        console.error('[offline] No se pudo encolar el conteo:', error);
        throw error;
    }
}

export async function contarPendientes(
    propietarioUid: string
): Promise<number> {
    const borradores = await listarBorradores(propietarioUid);
    return borradores.length;
}

export async function listarBorradores(
    propietarioUid: string
): Promise<BorradorConteoOutbox[]> {
    const uid = typeof propietarioUid === 'string'
        ? propietarioUid.trim()
        : '';
    if (!uid) {
        console.error('[offline] listarBorradores: uid vacío.');
        return [];
    }

    try {
        const db = await abrirDbOutbox();
        const tx = db.transaction(OUTBOX_STORE_BORRADORES, 'readonly');
        const txDone = esperarTransaccion(tx);
        const indice = tx
            .objectStore(OUTBOX_STORE_BORRADORES)
            .index('propietario_uid');
        const filas = await esperarSolicitud(indice.getAll(uid));
        await txDone;

        return filtrarPorPropietario(
            filas as BorradorConteoOutbox[],
            uid
        ).sort((a, b) => a.creado_en - b.creado_en);
    } catch (error) {
        console.error(
            '[offline] No se pudo listar la cola del propietario:',
            error
        );
        return [];
    }
}

async function marcarSincronizando(
    conteoId: string,
    propietarioUid: string
): Promise<BorradorConteoOutbox | null> {
    const db = await abrirDbOutbox();
    const tx = db.transaction(OUTBOX_STORE_BORRADORES, 'readwrite');
    const txDone = esperarTransaccion(tx);
    const store = tx.objectStore(OUTBOX_STORE_BORRADORES);
    const actual = await esperarSolicitud(store.get(conteoId));

    if (!actual) {
        await txDone;
        return null;
    }

    const borrador = actual as BorradorConteoOutbox;
    if (!esBorradorDePropietario(borrador, propietarioUid)) {
        console.error(
            '[offline] No se puede marcar sincronizando un borrador ajeno:',
            conteoId
        );
        await txDone;
        return null;
    }

    const ahora = Date.now();
    const actualizado: BorradorConteoOutbox = {
        ...borrador,
        intentos: borrador.intentos + 1,
        estado_envio: 'sincronizando',
        actualizado_en: ahora,
        ultimo_error: '',
    };

    store.put(actualizado);
    await txDone;
    return actualizado;
}

async function marcarError(
    conteoId: string,
    mensaje: string,
    intentos: number,
    propietarioUid: string
): Promise<void> {
    const db = await abrirDbOutbox();
    const tx = db.transaction(OUTBOX_STORE_BORRADORES, 'readwrite');
    const txDone = esperarTransaccion(tx);
    const store = tx.objectStore(OUTBOX_STORE_BORRADORES);
    const actual = await esperarSolicitud(store.get(conteoId));

    if (!actual) {
        await txDone;
        return;
    }

    const borrador = actual as BorradorConteoOutbox;
    if (!esBorradorDePropietario(borrador, propietarioUid)) {
        console.error(
            '[offline] No se puede marcar error en un borrador ajeno:',
            conteoId
        );
        await txDone;
        return;
    }

    const ahora = Date.now();
    const actualizado: BorradorConteoOutbox = {
        ...borrador,
        estado_envio: 'error',
        actualizado_en: ahora,
        proximo_intento_en: ahora + calcularBackoffMs(intentos),
        ultimo_error: mensaje.slice(0, 500),
    };

    store.put(actualizado);
    await txDone;
    emitirCambioOutbox();
}

async function eliminarBorrador(
    conteoId: string,
    propietarioUid: string
): Promise<void> {
    const db = await abrirDbOutbox();
    const tx = db.transaction(
        [OUTBOX_STORE_BORRADORES, OUTBOX_STORE_FOTOS],
        'readwrite'
    );
    const txDone = esperarTransaccion(tx);
    const storeBorradores = tx.objectStore(OUTBOX_STORE_BORRADORES);
    const actual = await esperarSolicitud(storeBorradores.get(conteoId));

    if (!actual) {
        await txDone;
        return;
    }

    const borrador = actual as BorradorConteoOutbox;
    if (!esBorradorDePropietario(borrador, propietarioUid)) {
        console.error(
            '[offline] No se puede eliminar un borrador ajeno:',
            conteoId
        );
        await txDone;
        return;
    }

    storeBorradores.delete(conteoId);
    tx.objectStore(OUTBOX_STORE_FOTOS).delete(conteoId);
    await txDone;
    emitirCambioOutbox();
}

async function obtenerSiguientePendiente(
    respetarBackoff: boolean,
    propietarioUid: string
): Promise<BorradorConteoOutbox | null> {
    const ahora = Date.now();
    const borradores = await listarBorradores(propietarioUid);

    for (const borrador of borradores) {
        if (
            esBorradorSincronizable(
                borrador.estado_envio,
                borrador.actualizado_en,
                borrador.proximo_intento_en,
                ahora,
                respetarBackoff
            )
        ) {
            return borrador;
        }
    }

    return null;
}

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

    if (sincronizandoOutbox) {
        return {
            procesados: 0,
            exitosos: 0,
            fallidos: 0,
            ultimoError: null,
        };
    }

    const propietarioUid = actor.uid.trim();
    sincronizandoOutbox = true;
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
        sincronizandoOutbox = false;
        emitirCambioOutbox();
    }
}

async function marcarErrorPurgaOwner(
    propietarioUid: string,
    mensaje: string
): Promise<void> {
    const db = await abrirDbOutbox();
    const tx = db.transaction(
        OUTBOX_STORE_BORRADORES,
        'readwrite'
    );
    const txDone = esperarTransaccion(tx);
    const store = tx.objectStore(OUTBOX_STORE_BORRADORES);
    const filas = await esperarSolicitud(
        store.index('propietario_uid').getAll(propietarioUid)
    );
    const ahora = Date.now();

    for (const fila of filas as BorradorConteoOutbox[]) {
        if (!esBorradorDePropietario(fila, propietarioUid)) continue;

        store.put({
            ...fila,
            estado_envio: 'error',
            actualizado_en: ahora,
            proximo_intento_en:
                ahora + calcularBackoffMs(fila.intentos),
            ultimo_error: mensaje.slice(0, 500),
        });
        console.error(
            '[offline] Purga owner-scoped falló; borrador conservado:',
            {
                conteoId: fila.conteo_id,
                propietarioUid,
            }
        );
    }

    await txDone;
    emitirCambioOutbox();
}

interface OpcionesLimpiarOutbox {
    forzarPurgaGlobal?: boolean;
}

export async function limpiarOutbox(
    propietarioUid?: string,
    opciones: OpcionesLimpiarOutbox = {}
): Promise<void> {
    const uid = typeof propietarioUid === 'string'
        ? propietarioUid.trim()
        : '';

    if (opciones.forzarPurgaGlobal === true) {
        console.warn(
            '[offline][outbox][GLOBAL_PURGE_EXPLICIT] Purga global explícita solicitada.'
        );
        if (uid) {
            console.warn(
                '[offline][outbox][GLOBAL_PURGE_EXPLICIT] UID ignorado por opción explícita:',
                uid
            );
        }

        try {
            const db = await abrirDbOutbox();
            const tx = db.transaction(
                [OUTBOX_STORE_BORRADORES, OUTBOX_STORE_FOTOS],
                'readwrite'
            );
            const txDone = esperarTransaccion(tx);
            tx.objectStore(OUTBOX_STORE_BORRADORES).clear();
            tx.objectStore(OUTBOX_STORE_FOTOS).clear();
            await txDone;
            emitirCambioOutbox();
        } catch (error) {
            console.error('[offline] No se pudo limpiar la cola global:', error);
            throw error;
        }
        return;
    }

    if (!uid) {
        console.warn(
            '[offline][outbox][NO_OWNER_PURGE_BLOCKED] limpiarOutbox sin propietario válido; no se purga ningún registro.'
        );
        return;
    }

    try {
        const db = await abrirDbOutbox();
        const tx = db.transaction(
            [OUTBOX_STORE_BORRADORES, OUTBOX_STORE_FOTOS],
            'readwrite'
        );
        const txDone = esperarTransaccion(tx);
        await borrarRegistrosDePropietario(
            tx.objectStore(OUTBOX_STORE_BORRADORES),
            uid
        );
        await borrarRegistrosDePropietario(
            tx.objectStore(OUTBOX_STORE_FOTOS),
            uid
        );
        await txDone;
        emitirCambioOutbox();
        return;
    } catch (error) {
        const mensaje =
            error instanceof Error
                ? error.message
                : 'Purga owner-scoped falló.';
        console.error(
            '[offline] Purga owner-scoped falló; se conserva el outbox del propietario:',
            { propietarioUid: uid, error }
        );

        try {
            await marcarErrorPurgaOwner(uid, mensaje);
        } catch (errorMarcando) {
            console.error(
                '[offline] No se pudo marcar el error de purga owner-scoped:',
                { propietarioUid: uid, error: errorMarcando }
            );
        }

        throw error;
    }
}
