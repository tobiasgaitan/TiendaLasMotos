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
} from '../../outbox-utils';
import {
    abrirDbOutbox,
    emitirCambioOutbox,
    esperarSolicitud,
    esperarTransaccion,
} from '../db';
import { prepararFotoConteo, validarFotoSubida } from '../images';
import type {
    BorradorConteoOutbox,
    BorradorConteoPayload,
    EntradaBorradorConteo,
    FotoBorradorOutbox,
    FotoPreparada,
    ResultadoEncolar,
} from '../types';

let sincronizandoOutbox = false;

export function intentarIniciarSincronizacion(): boolean {
    if (sincronizandoOutbox) return false;
    sincronizandoOutbox = true;
    return true;
}

export function finalizarSincronizacion(): void {
    sincronizandoOutbox = false;
}

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
            precio_etiqueta_fisica: entrada.precio_etiqueta_fisica ?? null,
            cantidad_sugerida_multimodal:
                entrada.cantidad_sugerida_multimodal ?? null,
            justificacion_multimodal:
                entrada.justificacion_multimodal ?? null,
            confidence_multimodal: entrada.confidence_multimodal ?? null,
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

export async function marcarSincronizando(
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

export async function marcarError(
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

export async function eliminarBorrador(
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

export async function obtenerSiguientePendiente(
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
