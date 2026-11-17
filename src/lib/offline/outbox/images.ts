import {
    esStoragePathDeAsesor,
    extraerStoragePath,
} from '@/lib/actions/inventario-schemas';
import {
    construirStoragePath,
    esMimeFotoPermitido,
    extensionDesdeMime,
    MAX_FOTO_BYTES,
    MAX_FOTO_COMPRIMIDA_BYTES,
    normalizarNombreArchivo,
    type FotoSubida,
    type MimeFoto,
} from '../outbox-utils';
import type { FotoPreparada } from './types';

interface FuenteImagen {
    fuente: CanvasImageSource;
    ancho: number;
    alto: number;
    liberar: () => void;
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

export function validarFotoSubida(
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
