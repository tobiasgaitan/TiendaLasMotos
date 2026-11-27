'use server';

import { requirePermiso } from '@/lib/auth/require-permiso';
import { validarActor } from '@/lib/actions/inventario-actor';
import { getAdminAuth } from '@/lib/firebase-admin';
import {
    analizarImagenSchema,
    esStoragePathDeAsesor,
    extraerStoragePath,
    FIREBASE_STORAGE_HOST,
} from '@/lib/actions/inventario-schemas';
import {
    esMimeVisionPermitido,
    esTamanoImagenPermitido,
    normalizarMimeVision,
    VISION_MAX_BYTES,
} from '@/lib/actions/vision-mapping';
import {
    analizarConteoMultimodal,
    VISION_MULTIMODAL_MODELO_REGEX,
} from '@/lib/vision-client';
import type { VisionConteoResult } from '@/types/inventario';

const DESCARGA_TIMEOUT_MS = 8_000;

function fallo(message = 'No se pudo analizar la imagen.'): VisionConteoResult {
    return { success: false, message };
}

/**
 * WEB-INV-044 — Conteo multimodal stateless vía OpenRouter.
 *
 * Faraday Cage:
 * - valida actor e input antes de tocar Firebase;
 * - verifica el ID token y exige rol asesor con scope de su email;
 * - descarga la foto desde una URL validada de Firebase Storage;
 * - NUNCA escribe en Firestore ni Storage y NUNCA acepta base64 del cliente.
 */
export async function analizarImagenConVision(
    input: unknown,
    actor: unknown
): Promise<VisionConteoResult> {
    const a = validarActor(actor);
    if (!a) {
        console.error('[vision-multimodal] actor inválido');
        return fallo('No autorizado. Sesión inválida.');
    }

    const parsed = analizarImagenSchema.safeParse(input);
    if (!parsed.success) {
        console.error('[vision-multimodal] input inválido: foto_url ausente o ajena');
        return fallo('La foto no es una URL válida de Firebase Storage.');
    }

    try {
        // Faraday Cage: verifyIdToken antes de cualquier lectura de Firestore.
        const decoded = await getAdminAuth().verifyIdToken(a.idToken);
        if (!decoded.uid) {
            return fallo('No autorizado. Sesión inválida.');
        }
        const email =
            typeof decoded.email === 'string'
                ? decoded.email.toLowerCase().trim()
                : '';
        if (!email) {
            return fallo('No autorizado. Sesión inválida.');
        }
        const me = { uid: decoded.uid, email };

        const permiso = await requirePermiso(
            me,
            'fotos_inventario',
            'create',
            { asesor_email: me.email }
        );
        if (permiso.rol !== 'asesor') {
            console.error('[vision-multimodal] rol no autorizado:', permiso.rol);
            return fallo('Solo un asesor puede analizar fotos de conteo.');
        }

        const data = parsed.data;
        let url: URL;
        try {
            url = new URL(data.foto_url);
        } catch (error) {
            console.error('[vision-multimodal] URL inválida:', error);
            return fallo('La foto no es una URL válida de Firebase Storage.');
        }

        if (url.protocol !== 'https:') {
            console.error('[vision-multimodal] URL sin HTTPS:', {
                host: url.host,
            });
            return fallo('La foto debe usar HTTPS.');
        }
        if (url.username || url.password) {
            console.error('[vision-multimodal] URL con credenciales embebidas');
            return fallo('La foto no es una URL válida de Firebase Storage.');
        }
        if (url.host !== FIREBASE_STORAGE_HOST) {
            console.error('[vision-multimodal] host no permitido:', {
                host: url.host,
            });
            return fallo('La foto no es una URL válida de Firebase Storage.');
        }

        const storagePath = extraerStoragePath(data.foto_url);
        if (!storagePath) {
            console.error('[vision-multimodal] URL fuera de Firebase Storage');
            return fallo('La foto no es una URL válida de Firebase Storage.');
        }
        if (!esStoragePathDeAsesor(storagePath, me.email)) {
            console.error('[vision-multimodal] foto fuera del prefijo del asesor:', {
                uid: me.uid,
            });
            return fallo('La foto no pertenece a tu carpeta de asesor.');
        }
        if (
            storagePath
                .split('/')
                .some((segmento) => segmento === '.' || segmento === '..')
        ) {
            console.error('[vision-multimodal] storage_path con segmentos relativos');
            return fallo('La foto no es una URL válida de Firebase Storage.');
        }

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey || !apiKey.trim()) {
            console.error('[vision-multimodal] OPENROUTER_API_KEY no configurada');
            return fallo('La visión multimodal no está configurada.');
        }

        const modelo = process.env.VISION_MODEL_SLUG;
        if (
            !modelo ||
            !modelo.trim() ||
            !VISION_MULTIMODAL_MODELO_REGEX.test(modelo.trim())
        ) {
            console.error('[vision-multimodal] VISION_MODEL_SLUG no configurado');
            return fallo('El modelo de visión multimodal no está configurado.');
        }

        let fotoResponse: Response;
        try {
            fotoResponse = await fetch(data.foto_url, {
                method: 'GET',
                headers: {
                    Accept: 'image/jpeg,image/png,image/webp',
                },
                redirect: 'error',
                cache: 'no-store',
                signal: AbortSignal.timeout(DESCARGA_TIMEOUT_MS),
            });
        } catch (error) {
            console.error(
                '[vision-multimodal] descarga de foto falló:',
                error instanceof Error ? error.message : 'error desconocido'
            );
            return fallo('No se pudo descargar la foto para el análisis.');
        }

        if (!fotoResponse.ok) {
            console.error(
                '[vision-multimodal] descarga de foto HTTP',
                fotoResponse.status
            );
            return fallo('No se pudo descargar la foto para el análisis.');
        }

        const mime = normalizarMimeVision(
            fotoResponse.headers.get('content-type')
        );
        if (!esMimeVisionPermitido(mime)) {
            console.error('[vision-multimodal] MIME no permitido:', mime);
            return fallo('La imagen debe ser JPG, PNG o WEBP.');
        }

        const contentLengthRaw = fotoResponse.headers.get('content-length');
        if (contentLengthRaw !== null) {
            const contentLength = Number(contentLengthRaw);
            if (!esTamanoImagenPermitido(contentLength)) {
                console.error(
                    '[vision-multimodal] tamaño inválido (header):',
                    contentLengthRaw
                );
                return fallo('La imagen supera el tamaño máximo permitido.');
            }
        }

        let buffer: Buffer;
        try {
            buffer = Buffer.from(await fotoResponse.arrayBuffer());
        } catch (error) {
            console.error(
                '[vision-multimodal] lectura de foto falló:',
                error instanceof Error ? error.message : 'error desconocido'
            );
            return fallo('No se pudo leer la foto para el análisis.');
        }

        if (!esTamanoImagenPermitido(buffer.byteLength)) {
            console.error('[vision-multimodal] tamaño inválido (buffer):', {
                bytes: buffer.byteLength,
                max: VISION_MAX_BYTES,
            });
            return fallo('La imagen supera el tamaño máximo permitido.');
        }

        return await analizarConteoMultimodal({
            apiKey: apiKey.trim(),
            modelo: modelo.trim(),
            base64: buffer.toString('base64'),
            mimeType: mime,
        });
    } catch (error) {
        console.error(
            '[vision-multimodal] analizarImagenConVision falló:',
            error instanceof Error ? error.message : 'error desconocido'
        );
        return fallo('No se pudo analizar la imagen. Cuenta manualmente.');
    }
}
