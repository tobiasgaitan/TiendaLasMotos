import { z } from 'zod';
import { ESTADOS_CONTEO, type EstadoConteo } from '@/types/inventario';

/**
 * WEB-038 — Esquemas puros del inventario de repuestos.
 *
 * SIN directiva 'use server': los archivos 'use server' solo pueden exportar
 * funciones async. Estos schemas viven fuera y son consumidos por las actions.
 */

export const FIREBASE_STORAGE_HOST = 'firebasestorage.googleapis.com';

export const actorSchema = z.object({
    uid: z.string().min(1),
    idToken: z.string().min(1),
});

export type ActorInput = z.infer<typeof actorSchema>;

export const referenciaSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9._-]{0,63}$/, 'Referencia inválida.');

export const ubicacionSchema = z
    .string()
    .trim()
    .min(1, 'La ubicación es obligatoria.')
    .max(100, 'La ubicación no puede superar 100 caracteres.');

export const mimeTypeSchema = z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
]);

export const datosMaestroSchema = z.object({
    fabricante: z.string().trim().min(1).max(100),
    aplica_a: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
    categoria: z.string().trim().min(1).max(100),
    precio: z.coerce.number().finite().min(0),
    stock_minimo: z.coerce.number().int().min(0),
    imagen_url: z.string().trim().url().optional(),
});

export type DatosMaestroInput = z.infer<typeof datosMaestroSchema>;

/**
 * Extrae el path interno de una URL de descarga de Firebase Storage.
 * Solo acepta el host canónico. Devuelve null para URLs inválidas o ajenas.
 */
export function extraerStoragePath(fotoUrl: string): string | null {
    try {
        const url = new URL(fotoUrl);
        if (url.host !== FIREBASE_STORAGE_HOST) return null;

        const marcador = '/o/';
        const indice = url.pathname.indexOf(marcador);
        if (indice < 0) return null;

        const encodedPath = url.pathname.slice(indice + marcador.length);
        if (!encodedPath) return null;

        return decodeURIComponent(encodedPath);
    } catch (error) {
        console.error('[inventario] extraerStoragePath falló:', error);
        return null;
    }
}

export function esStoragePathDeAsesor(
    storagePath: string,
    asesorEmail: string
): boolean {
    const email = asesorEmail.toLowerCase().trim();
    if (!email) return false;
    return storagePath.startsWith(`inventario_repuestos/${email}/`);
}

export function esFotoUrlDeAsesor(
    fotoUrl: string,
    asesorEmail: string
): boolean {
    const path = extraerStoragePath(fotoUrl);
    if (!path) return false;
    return esStoragePathDeAsesor(path, asesorEmail);
}

export const crearConteoSchema = z
    .object({
        conteo_id: z.string().uuid(),
        referencia_sugerida: z.string().trim().max(64).default(''),
        referencia_confirmada: referenciaSchema,
        descripcion: z.string().trim().min(2).max(200),
        cantidad_contada: z.coerce.number().int().min(0).max(1_000_000),
        ubicacion: ubicacionSchema,
        anotaciones: z.string().trim().max(500).default(''),
        foto_url: z.string().trim().url(),
        storage_path: z.string().trim().min(1).max(500),
        nombre_archivo: z.string().trim().min(1).max(200),
        mime_type: mimeTypeSchema,
        tamano_bytes: z.coerce
            .number()
            .int()
            .min(1)
            .max(5 * 1024 * 1024),
        etiquetas_vision: z
            .array(z.string().trim().max(80))
            .max(10)
            .default([]),
    })
    .superRefine((data, ctx) => {
        const path = extraerStoragePath(data.foto_url);
        if (!path) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['foto_url'],
                message: 'La foto debe ser una URL de Firebase Storage.',
            });
            return;
        }
        if (path !== data.storage_path) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['storage_path'],
                message: 'storage_path no coincide con foto_url.',
            });
        }
    });

export type CrearConteoInput = z.infer<typeof crearConteoSchema>;

export const aprobarConteoSchema = z.object({
    conteo_id: z.string().uuid(),
    datos_maestro: datosMaestroSchema.optional(),
});

export type AprobarConteoInput = z.infer<typeof aprobarConteoSchema>;

export const rechazarConteoSchema = z.object({
    conteo_id: z.string().uuid(),
    motivo_rechazo: z.string().trim().min(5).max(500),
});

export type RechazarConteoInput = z.infer<typeof rechazarConteoSchema>;

export const listarPendientesSchema = z.object({
    estado: z
        .enum(['pendiente_revision', 'aprobado', 'rechazado'])
        .default('pendiente_revision'),
});

export type ListarPendientesInput = z.infer<typeof listarPendientesSchema>;

export const analizarImagenSchema = z
    .object({
        foto_url: z.string().trim().max(2048).url(),
    })
    .superRefine((data, ctx) => {
        if (typeof data.foto_url !== 'string') return;
        if (!z.string().url().safeParse(data.foto_url).success) return;

        const path = extraerStoragePath(data.foto_url);
        if (!path) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['foto_url'],
                message: 'La foto debe ser una URL de Firebase Storage.',
            });
        }
    });

export type AnalizarImagenInput = z.infer<typeof analizarImagenSchema>;

export function esEstadoConteo(value: unknown): value is EstadoConteo {
    return (
        typeof value === 'string' &&
        (ESTADOS_CONTEO as readonly string[]).includes(value)
    );
}
