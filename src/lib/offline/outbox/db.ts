import {
    esBorradorDePropietario,
    EVENTO_OUTBOX,
    OUTBOX_DB_NAME,
    OUTBOX_DB_VERSION,
    OUTBOX_STORE_BORRADORES,
    OUTBOX_STORE_FOTOS,
} from '../outbox-utils';
import type { FotoBorradorOutbox } from './types';

export let dbPromise: Promise<IDBDatabase> | null = null;

export function emitirCambioOutbox(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(EVENTO_OUTBOX));
}

export function abrirDbOutbox(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    if (typeof indexedDB === 'undefined') {
        const error = new Error('IndexedDB no está disponible en este navegador.');
        console.error('[offline] No se puede abrir la base local:', error);
        return Promise.reject(error);
    }

    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const solicitud = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);

        solicitud.onupgradeneeded = () => {
            const db = solicitud.result;
            if (!solicitud.transaction) {
                const error = new Error(
                    'La transacción de upgrade de IndexedDB no está disponible.'
                );
                console.error('[offline] Migración v2 falló:', error);
                throw error;
            }
            const tx = solicitud.transaction;
            let descartados = 0;

            const prepararStore = (nombre: string): IDBObjectStore => {
                if (!db.objectStoreNames.contains(nombre)) {
                    const store = db.createObjectStore(nombre, {
                        keyPath: 'conteo_id',
                    });
                    store.createIndex('propietario_uid', 'propietario_uid', {
                        unique: false,
                    });
                    if (nombre === OUTBOX_STORE_BORRADORES) {
                        store.createIndex('estado_envio', 'estado_envio', {
                            unique: false,
                        });
                    }
                    return store;
                }

                const store = tx.objectStore(nombre);
                if (!store.indexNames.contains('propietario_uid')) {
                    store.createIndex('propietario_uid', 'propietario_uid', {
                        unique: false,
                    });
                }
                if (
                    nombre === OUTBOX_STORE_BORRADORES &&
                    !store.indexNames.contains('estado_envio')
                ) {
                    store.createIndex('estado_envio', 'estado_envio', {
                        unique: false,
                    });
                }
                return store;
            };

            const borradores = prepararStore(OUTBOX_STORE_BORRADORES);
            const fotos = prepararStore(OUTBOX_STORE_FOTOS);

            for (const store of [borradores, fotos]) {
                const solicitudCursor = store.openCursor();
                solicitudCursor.onsuccess = () => {
                    const cursor = solicitudCursor.result;
                    if (!cursor) return;

                    const valor = cursor.value as {
                        conteo_id?: unknown;
                        propietario_uid?: unknown;
                    };
                    const propietario = valor.propietario_uid;
                    if (
                        typeof propietario !== 'string' ||
                        !propietario.trim()
                    ) {
                        const conteoId =
                            typeof valor.conteo_id === 'string'
                                ? valor.conteo_id
                                : '(sin conteo_id)';
                        descartados += 1;
                        console.debug(
                            '[offline] Migración v2: descartando registro legado sin propietario:',
                            conteoId
                        );
                        cursor.delete();
                    }
                    cursor.continue();
                };
                solicitudCursor.onerror = () => {
                    const error =
                        solicitudCursor.error ||
                        new Error('Cursor de migración v2 falló.');
                    console.error(
                        '[offline] Migración v2 falló; se aborta el upgrade:',
                        error
                    );
                    tx.abort();
                };
            }

            tx.oncomplete = () => {
                console.info(
                    `[offline] Migración v2 completada; ${descartados} registro(s) legado(s) descartados.`
                );
            };
        };

        solicitud.onsuccess = () => {
            const db = solicitud.result;
            db.onversionchange = () => {
                db.close();
                dbPromise = null;
                console.error(
                    '[offline] La versión de IndexedDB cambió; conexión cerrada.'
                );
            };
            resolve(db);
        };

        solicitud.onerror = () => {
            const error =
                solicitud.error || new Error('No se pudo abrir tlm_offline.');
            console.error('[offline] Error abriendo IndexedDB:', error);
            dbPromise = null;
            reject(error);
        };

        solicitud.onblocked = () => {
            console.error(
                '[offline] IndexedDB bloqueada por otra pestaña; se esperará.'
            );
        };
    });

    return dbPromise;
}

export function esperarSolicitud<T>(solicitud: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        solicitud.onsuccess = () => resolve(solicitud.result);
        solicitud.onerror = () => {
            const error =
                solicitud.error || new Error('Operación IndexedDB falló.');
            console.error('[offline] Operación IndexedDB falló:', error);
            reject(error);
        };
    });
}

export function esperarTransaccion(tx: IDBTransaction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => {
            const error =
                tx.error || new Error('Transacción IndexedDB abortada.');
            console.error('[offline] Transacción IndexedDB abortada:', error);
            reject(error);
        };
        tx.onerror = () => {
            const error =
                tx.error || new Error('Transacción IndexedDB con error.');
            console.error('[offline] Transacción IndexedDB con error:', error);
            reject(error);
        };
    });
}

export async function obtenerFoto(
    conteoId: string,
    propietarioUid: string
): Promise<FotoBorradorOutbox | null> {
    const db = await abrirDbOutbox();
    const tx = db.transaction(OUTBOX_STORE_FOTOS, 'readonly');
    const txDone = esperarTransaccion(tx);
    const foto = await esperarSolicitud(
        tx.objectStore(OUTBOX_STORE_FOTOS).get(conteoId)
    );
    await txDone;
    if (!foto) return null;

    const fotoBorrador = foto as FotoBorradorOutbox;
    if (!esBorradorDePropietario(fotoBorrador, propietarioUid)) {
        const error = new Error(
            'La foto del borrador no pertenece al propietario de la sesión.'
        );
        console.error('[offline] Foto con propietario distinto:', {
            conteoId,
            error,
        });
        throw error;
    }
    return fotoBorrador;
}

export async function borrarRegistrosDePropietario(
    store: IDBObjectStore,
    propietarioUid: string
): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        const indice = store.index('propietario_uid');
        const solicitud = indice.openCursor(
            IDBKeyRange.only(propietarioUid)
        );
        let borrados = 0;

        solicitud.onsuccess = () => {
            const cursor = solicitud.result;
            if (!cursor) {
                resolve(borrados);
                return;
            }
            borrados += 1;
            cursor.delete();
            cursor.continue();
        };

        solicitud.onerror = () => {
            const error =
                solicitud.error ||
                new Error('No se pudo borrar el outbox del propietario.');
            console.error(
                '[offline] Error borrando registros del propietario:',
                error
            );
            reject(error);
        };
    });
}
