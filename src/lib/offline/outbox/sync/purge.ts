import {
    calcularBackoffMs,
    esBorradorDePropietario,
    OUTBOX_STORE_BORRADORES,
    OUTBOX_STORE_FOTOS,
} from '../../outbox-utils';
import {
    abrirDbOutbox,
    borrarRegistrosDePropietario,
    emitirCambioOutbox,
    esperarSolicitud,
    esperarTransaccion,
} from '../db';
import type { BorradorConteoOutbox } from '../types';

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
