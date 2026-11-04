"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";
import {
    esStoragePathDeAsesor,
    extraerStoragePath,
} from "@/lib/actions/inventario-schemas";
import { prepararFotoConteo } from "@/lib/offline/outbox";
import {
    construirStoragePath,
    esUuid,
    normalizarNombreArchivo,
    type FotoSubida,
} from "@/lib/offline/outbox-utils";

export type { FotoSubida } from "@/lib/offline/outbox-utils";

/**
 * WEB-038-UI — Subida de la foto del conteo.
 *
 * Reutiliza el compresor del outbox y la sesión Firebase del asesor.
 * La ruta se valida en cliente antes de tocar Storage:
 *   inventario_repuestos/{asesor_email}/{uuid}.{ext}
 */
export async function prepararYSubirFoto(
    foto: File | Blob,
    asesorEmail: string,
    conteoId: string
): Promise<FotoSubida> {
    try {
        const email = asesorEmail.trim().toLowerCase();
        const id = conteoId.trim();

        if (!email) {
            const error = new Error("El email del asesor está vacío.");
            console.error("[inventario-ui] Email inválido al subir foto:", error);
            throw error;
        }

        if (!esUuid(id)) {
            const error = new Error("El conteo_id no es un UUID válido.");
            console.error("[inventario-ui] conteo_id inválido al subir foto:", {
                conteoId,
                error,
            });
            throw error;
        }

        const preparada = await prepararFotoConteo(foto, id);
        const storagePath = construirStoragePath(
            email,
            id,
            preparada.mime_type
        );

        if (!esStoragePathDeAsesor(storagePath, email)) {
            const error = new Error(
                "La ruta de Storage no pertenece al asesor."
            );
            console.error(
                "[inventario-ui] Ruta de Storage fuera del prefijo:",
                { email, storagePath, error }
            );
            throw error;
        }

        const nombreArchivo = normalizarNombreArchivo(
            preparada.nombre_archivo,
            id,
            preparada.mime_type
        );
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, preparada.blob, {
            contentType: preparada.mime_type,
            customMetadata: {
                conteo_id: id,
            },
        });

        const fotoUrl = await getDownloadURL(storageRef);
        const pathEnUrl = extraerStoragePath(fotoUrl);
        if (!pathEnUrl || pathEnUrl !== storagePath) {
            const error = new Error(
                "La URL de la foto no coincide con la ruta subida."
            );
            console.error(
                "[inventario-ui] URL de foto inconsistente tras subir:",
                { storagePath, pathEnUrl, error }
            );
            throw error;
        }

        return {
            foto_url: fotoUrl,
            storage_path: storagePath,
            nombre_archivo: nombreArchivo,
            mime_type: preparada.mime_type,
            tamano_bytes: preparada.tamano_bytes,
        };
    } catch (error) {
        console.error("[inventario-ui] prepararYSubirFoto falló:", error);
        throw error;
    }
}
