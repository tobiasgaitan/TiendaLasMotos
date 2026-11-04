import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { crearConteoPendiente } from '@/app/admin/inventory/actions/crearConteoPendiente';
import {
    esStoragePathDeAsesor,
    extraerStoragePath,
} from '@/lib/actions/inventario-schemas';
import type {
    ActorInput,
    CrearConteoInput,
} from '@/lib/actions/inventario-schemas';
import {
    calcularBackoffMs,
    construirStoragePath,
    esBorradorSincronizable,
    esMimeFotoPermitido,
    esUuid,
    EVENTO_OUTBOX,
    extensionDesdeMime,
    generarConteoId,
    MAX_FOTO_BYTES,
    MAX_FOTO_COMPRIMIDA_BYTES,
    normalizarNombreArchivo,
    OUTBOX_DB_NAME,
    OUTBOX_DB_VERSION,
    OUTBOX_STORE_BORRADORES,
    OUTBOX_STORE_FOTOS,
    type FotoSubida,
    type MimeFoto,
    type OpcionesEncolarConteo,
} from './outbox-utils';

export const OUTBOX_DB = OUTBOX_DB_NAME;
export const OUTBOX_VERSION = OUTBOX_DB_VERSION;
export { EVENTO_OUTBOX } from './outbox-utils';

export type EstadoEnvioOutbox = 'pendiente' | 'sincronizando' | 'error';

export type BorradorConteoPayload = Omit<CrearConteoInput, 'foto_url'> & {
    foto_url?: string;
};

export interface BorradorConteoOutbox {
    conteo_id: string;
    payload: BorradorConteoPayload;
    intentos: number;
    estado_envio: EstadoEnvioOutbox;
    creado_en: number;
    actualizado_en: number;
    proximo_intento_en: number;
    ultimo_error: string;
}

export interface FotoBorradorOutbox {
    conteo_id: string;
    blob: Blob;
    storage_path: string;
    nombre_archivo: string;
    mime_type: MimeFoto;
    tamano_bytes: number;
}

export type EntradaBorradorConteo = Omit<
    CrearConteoInput,
    | 'conteo_id'
    | 'foto_url'
    | 'storage_path'
    | 'nombre_archivo'
    | 'mime_type'
    | 'tamano_bytes'
>;

export interface ResultadoEncolar {
    conteo_id: string;
    storage_path: string;
}

export interface ResultadoSincronizacion {
    procesados: number;
    exitosos: number;
    fallidos: number;
    ultimoError: string | null;
}

export interface FotoPreparada {
    blob: Blob;
    mime_type: MimeFoto;
    nombre_archivo: string;
    tamano_bytes: number;
}

interface FuenteImagen {
    fuente: CanvasImageSource;
    ancho: number;
    alto: number;
    liberar: () => void;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let sincronizandoOutbox = false;

function emitirCambioOutbox(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(EVENTO_OUTBOX));
}

function abrirDbOutbox(): Promise<IDBDatabase> {
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
            if (!db.objectStoreNames.contains(OUTBOX_STORE_BORRADORES)) {
                const store = db.createObjectStore(OUTBOX_STORE_BORRADORES, {
                    keyPath: 'conteo_id',
                });
                store.createIndex('estado_envio', 'estado_envio', {
                    unique: false,
                });
            }
            if (!db.objectStoreNames.contains(OUTBOX_STORE_FOTOS)) {
                db.createObjectStore(OUTBOX_STORE_FOTOS, {
                    keyPath: 'conteo_id',
                });
            }
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

function esperarSolicitud<T>(solicitud: IDBRequest<T>): Promise<T> {
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

function esperarTransaccion(tx: IDBTransaction): Promise<void> {
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

function obtenerNombreOriginal(
    foto: File | Blob,
    conteoId: string,
    mime: MimeFoto
): string {
    if (typeof File !== 'undefined' && foto instanceof File) {
        if (foto.name.trim()) return foto.name;
    }
    return `${conteoId}.${extensionDesdeMime(mime)}`;
}

function reemplazarExtension(nombre: string, extension: string): string {
    const indice = nombre.lastIndexOf('.');
    const base = indice > 0 ? nombre.slice(0, indice) : nombre;
    return `${base}.${extension}`;
}

async function cargarFuenteImagen(blob: Blob): Promise<FuenteImagen> {
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(blob);
            return {
                fuente: bitmap,
                ancho: bitmap.width,
                alto: bitmap.height,
                liberar: () => bitmap.close(),
            };
        } catch (error) {
            console.error(
                '[offline] createImageBitmap falló; se intentará con Image:',
                error
            );
        }
    }

    if (typeof Image === 'undefined' || typeof URL === 'undefined') {
        const error = new Error(
            'El navegador no puede decodificar la imagen para comprimirla.'
        );
        console.error('[offline] Compresión de foto no disponible:', error);
        throw error;
    }

    const objectUrl = URL.createObjectURL(blob);
    try {
        const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                const error = new Error('No se pudo decodificar la imagen.');
                console.error('[offline] Error decodificando imagen:', error);
                reject(error);
            };
            img.src = objectUrl;
        });

        return {
            fuente: imagen,
            ancho: imagen.naturalWidth,
            alto: imagen.naturalHeight,
            liberar: () => URL.revokeObjectURL(objectUrl),
        };
    } catch (error) {
        console.error(
            '[offline] Error cargando la imagen para compresión:',
            error
        );
        URL.revokeObjectURL(objectUrl);
        throw error;
    }
}

function canvasABlob(
    canvas: HTMLCanvasElement,
    tipo: 'image/jpeg',
    calidad: number
): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
        try {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                        return;
                    }
                    const error = new Error(
                        'canvas.toBlob devolvió un resultado vacío.'
                    );
                    console.error(
                        '[offline] Compresión de foto falló:',
                        error
                    );
                    reject(error);
                },
                tipo,
                calidad
            );
        } catch (error) {
            console.error('[offline] canvas.toBlob lanzó un error:', error);
            reject(error);
        }
    });
}

async function comprimirImagen(
    foto: Blob,
    maxBytes: number
): Promise<Blob> {
    const fuente = await cargarFuenteImagen(foto);

    try {
        if (fuente.ancho <= 0 || fuente.alto <= 0) {
            const error = new Error('La imagen no tiene dimensiones válidas.');
            console.error('[offline] Compresión de foto falló:', error);
            throw error;
        }

        const maxDimension = 1600;
        const mayor = Math.max(fuente.ancho, fuente.alto);
        let escala = Math.min(1, maxDimension / mayor);
        let calidad = 0.85;

        for (let intento = 0; intento < 9; intento++) {
            const ancho = Math.max(1, Math.round(fuente.ancho * escala));
            const alto = Math.max(1, Math.round(fuente.alto * escala));
            const canvas = document.createElement('canvas');
            canvas.width = ancho;
            canvas.height = alto;

            const contexto = canvas.getContext('2d');
            if (!contexto) {
                const error = new Error(
                    'No se pudo obtener el contexto 2D del canvas.'
                );
                console.error('[offline] Compresión de foto falló:', error);
                throw error;
            }

            contexto.fillStyle = '#ffffff';
            contexto.fillRect(0, 0, ancho, alto);
            contexto.drawImage(fuente.fuente, 0, 0, ancho, alto);

            const comprimida = await canvasABlob(
                canvas,
                'image/jpeg',
                calidad
            );
            if (comprimida.size <= maxBytes) {
                return comprimida;
            }

            if (calidad > 0.5) {
                calidad -= 0.15;
            } else {
                escala *= 0.8;
            }
        }

        const error = new Error(
            'No se pudo comprimir la foto por debajo de 1.5 MB.'
        );
        console.error('[offline] Compresión de foto falló:', error);
        throw error;
    } finally {
        try {
            fuente.liberar();
        } catch (error) {
            console.error(
                '[offline] No se pudo liberar la imagen comprimida:',
                error
            );
        }
    }
}

export async function prepararFotoConteo(
    foto: File | Blob,
    conteoId: string
): Promise<FotoPreparada> {
    const mimeOriginal = foto.type.trim().toLowerCase();
    if (!esMimeFotoPermitido(mimeOriginal)) {
        const error = new Error(
            'La foto debe ser JPG, PNG o WEBP.'
        );
        console.error('[offline] MIME de foto no permitido:', mimeOriginal);
        throw error;
    }

    if (foto.size <= 0) {
        const error = new Error('La foto está vacía.');
        console.error('[offline] Foto vacía:', error);
        throw error;
    }

    if (foto.size > MAX_FOTO_BYTES) {
        const error = new Error('La foto supera el máximo de 5 MB.');
        console.error('[offline] Foto demasiado grande:', {
            bytes: foto.size,
            maximo: MAX_FOTO_BYTES,
        });
        throw error;
    }

    const nombreOriginal = obtenerNombreOriginal(foto, conteoId, mimeOriginal);

    if (foto.size <= MAX_FOTO_COMPRIMIDA_BYTES) {
        return {
            blob: foto,
            mime_type: mimeOriginal,
            nombre_archivo: normalizarNombreArchivo(
                nombreOriginal,
                conteoId,
                mimeOriginal
            ),
            tamano_bytes: foto.size,
        };
    }

    const comprimida = await comprimirImagen(
        foto,
        MAX_FOTO_COMPRIMIDA_BYTES
    );
    const mimeComprimido: MimeFoto = 'image/jpeg';
    const nombreComprimido = reemplazarExtension(nombreOriginal, 'jpg');

    return {
        blob: comprimida,
        mime_type: mimeComprimido,
        nombre_archivo: normalizarNombreArchivo(
            nombreComprimido,
            conteoId,
            mimeComprimido
        ),
        tamano_bytes: comprimida.size,
    };
}

function validarFotoSubida(
    fotoSubida: FotoSubida,
    asesorEmail: string,
    conteoId: string
): void {
    const email = asesorEmail.trim().toLowerCase();
    const storagePath = fotoSubida.storage_path.trim();

    if (!storagePath) {
        const error = new Error('La foto subida no tiene storage_path.');
        console.error('[offline] Foto subida inválida:', error);
        throw error;
    }

    if (!esStoragePathDeAsesor(storagePath, email)) {
        const error = new Error(
            'La foto subida no pertenece al prefijo del asesor.'
        );
        console.error('[offline] Foto subida fuera del prefijo:', {
            email,
            storagePath,
            error,
        });
        throw error;
    }

    const pathEnUrl = extraerStoragePath(fotoSubida.foto_url);
    if (!pathEnUrl || pathEnUrl !== storagePath) {
        const error = new Error(
            'La URL de la foto no coincide con storage_path.'
        );
        console.error('[offline] Foto subida con URL inconsistente:', {
            storagePath,
            pathEnUrl,
            error,
        });
        throw error;
    }

    const esperado = construirStoragePath(
        email,
        conteoId,
        fotoSubida.mime_type
    );
    if (storagePath !== esperado) {
        const error = new Error(
            'La ruta de la foto no coincide con el conteo_id.'
        );
        console.error('[offline] Foto subida con ruta inesperada:', {
            storagePath,
            esperado,
            error,
        });
        throw error;
    }

    if (
        !Number.isInteger(fotoSubida.tamano_bytes) ||
        fotoSubida.tamano_bytes <= 0 ||
        fotoSubida.tamano_bytes > MAX_FOTO_BYTES
    ) {
        const error = new Error('El tamaño de la foto subida es inválido.');
        console.error('[offline] Foto subida con tamaño inválido:', {
            tamano_bytes: fotoSubida.tamano_bytes,
            error,
        });
        throw error;
    }

    const nombreArchivo = fotoSubida.nombre_archivo.trim();
    if (!nombreArchivo || nombreArchivo.length > 200) {
        const error = new Error(
            'La foto subida no tiene un nombre_archivo válido.'
        );
        console.error('[offline] Foto subida sin nombre válido:', {
            nombreArchivo,
            error,
        });
        throw error;
    }

    if (!esMimeFotoPermitido(fotoSubida.mime_type)) {
        const error = new Error('El MIME de la foto subida no es válido.');
        console.error('[offline] Foto subida con MIME inválido:', {
            mime_type: fotoSubida.mime_type,
            error,
        });
        throw error;
    }
}

export async function encolarConteo(
    entrada: EntradaBorradorConteo,
    foto: File | Blob,
    asesorEmail: string,
    opciones: OpcionesEncolarConteo = {}
): Promise<ResultadoEncolar> {
    try {
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

export async function contarPendientes(): Promise<number> {
    try {
        const db = await abrirDbOutbox();
        const tx = db.transaction(OUTBOX_STORE_BORRADORES, 'readonly');
        const txDone = esperarTransaccion(tx);
        const total = await esperarSolicitud(
            tx.objectStore(OUTBOX_STORE_BORRADORES).count()
        );
        await txDone;
        return total;
    } catch (error) {
        console.error('[offline] No se pudo contar la cola:', error);
        throw error;
    }
}

export async function listarBorradores(): Promise<BorradorConteoOutbox[]> {
    try {
        const db = await abrirDbOutbox();
        const tx = db.transaction(OUTBOX_STORE_BORRADORES, 'readonly');
        const txDone = esperarTransaccion(tx);
        const filas = await esperarSolicitud(
            tx.objectStore(OUTBOX_STORE_BORRADORES).getAll()
        );
        await txDone;
        return (filas as BorradorConteoOutbox[]).sort(
            (a, b) => a.creado_en - b.creado_en
        );
    } catch (error) {
        console.error('[offline] No se pudo listar la cola:', error);
        throw error;
    }
}

async function obtenerFoto(
    conteoId: string
): Promise<FotoBorradorOutbox | null> {
    const db = await abrirDbOutbox();
    const tx = db.transaction(OUTBOX_STORE_FOTOS, 'readonly');
    const txDone = esperarTransaccion(tx);
    const foto = await esperarSolicitud(
        tx.objectStore(OUTBOX_STORE_FOTOS).get(conteoId)
    );
    await txDone;
    if (!foto) return null;
    return foto as FotoBorradorOutbox;
}

async function marcarSincronizando(
    conteoId: string
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
    intentos: number
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

    const ahora = Date.now();
    const borrador = actual as BorradorConteoOutbox;
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

async function eliminarBorrador(conteoId: string): Promise<void> {
    const db = await abrirDbOutbox();
    const tx = db.transaction(
        [OUTBOX_STORE_BORRADORES, OUTBOX_STORE_FOTOS],
        'readwrite'
    );
    const txDone = esperarTransaccion(tx);
    tx.objectStore(OUTBOX_STORE_BORRADORES).delete(conteoId);
    tx.objectStore(OUTBOX_STORE_FOTOS).delete(conteoId);
    await txDone;
    emitirCambioOutbox();
}

async function obtenerSiguientePendiente(
    respetarBackoff: boolean
): Promise<BorradorConteoOutbox | null> {
    const ahora = Date.now();
    const borradores = await listarBorradores();

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
    if (sincronizandoOutbox) {
        return {
            procesados: 0,
            exitosos: 0,
            fallidos: 0,
            ultimoError: null,
        };
    }

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
                respetarBackoff
            );
            if (!pendiente) break;

            procesados += 1;
            const enProceso = await marcarSincronizando(
                pendiente.conteo_id
            );
            if (!enProceso) continue;

            try {
                const foto = await obtenerFoto(pendiente.conteo_id);
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
                        enProceso.intentos
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
                        enProceso.intentos
                    );
                    ultimoError = mensaje;
                    fallidos += 1;
                    continue;
                }

                await eliminarBorrador(pendiente.conteo_id);
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
                        enProceso.intentos
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

export async function limpiarOutbox(): Promise<void> {
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
        console.error('[offline] No se pudo limpiar la cola:', error);
        throw error;
    }
}
