import { z } from 'zod';
import { UNIDADES_MEDIDA } from '@/types/inventario';
import {
    FIREBASE_STORAGE_HOST,
    extraerStoragePath,
    normalizarReferenciasAlternativas,
    referenciaRepuestoEstrictaSchema,
    referenciasAlternativasSchema,
    ubicacionSchema,
} from './inventario-schemas';

/**
 * WEB-038 — Contrato de entrada de la pantalla de inventario de repuestos.
 *
 * Este archivo NO modifica el schema documental de `inventario_repuestos`
 * (NAMING LOCK §10.B). Solo valida el payload de edición parcial enviado por
 * la UI y reutiliza los validadores canónicos de referencia/ubicación.
 */

const stockSchema = z.number().int().min(0).max(1_000_000);
const precioSchema = z.number().finite().min(0);

/**
 * WEB-INV-049 — Aditivo de imágenes de referencia.
 *
 * Solo URLs HTTPS del bucket canónico de Firebase Storage y dentro del prefijo
 * `inventario_repuestos/`. No se guarda base64 ni hosts alternos.
 */
export const MAX_IMAGENES_REFERENCIA = 5;

const imagenReferenciaUrlSchema = z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((value) => {
        try {
            const url = new URL(value);
            if (url.protocol !== 'https:') return false;
            if (url.host !== FIREBASE_STORAGE_HOST) return false;
            const path = extraerStoragePath(value);
            return path !== null && path.startsWith('inventario_repuestos/');
        } catch {
            return false;
        }
    }, 'La imagen debe ser una URL HTTPS de Firebase Storage.');

export const imagenesReferenciaSchema = z
    .array(imagenReferenciaUrlSchema)
    .max(
        MAX_IMAGENES_REFERENCIA,
        `Máximo ${MAX_IMAGENES_REFERENCIA} imágenes de referencia.`
    )
    .refine(
        (urls) => new Set(urls).size === urls.length,
        'No se permiten imágenes de referencia duplicadas.'
    )
    .optional();

const textoCatalogoSchema = z
    .string()
    .trim()
    .toUpperCase()
    .max(100);

export const unidadMedidaSchema = z.enum(UNIDADES_MEDIDA);

export const cambiosRepuestoSchema = z
    .object({
        descripcion: z.string().trim().min(1).max(500).optional(),
        categoria: textoCatalogoSchema.min(1).optional(),
        stock: stockSchema.optional(),
        stock_minimo: stockSchema.optional(),
        precio: precioSchema.optional(),
        unidad_medida: unidadMedidaSchema.optional(),
        ubicacion: ubicacionSchema.optional(),
        referencias_alternativas: referenciasAlternativasSchema,
        imagenes_referencia: imagenesReferenciaSchema,
    })
    .strict()
    .refine((cambios) => Object.keys(cambios).length > 0, {
        message: 'Debes enviar al menos un campo para editar.',
    });

export const editarRepuestoSchema = z
    .object({
        documento_id: z.string().trim().min(1).max(200),
        referencia: referenciaRepuestoEstrictaSchema,
        cambios: cambiosRepuestoSchema,
    })
    .strict()
    .transform((data) => ({
        ...data,
        cambios: {
            ...data.cambios,
            ...(data.cambios.referencias_alternativas !== undefined
                ? {
                      referencias_alternativas:
                          normalizarReferenciasAlternativas(
                              data.cambios.referencias_alternativas,
                              data.referencia
                          ),
                  }
                : {}),
        },
    }));

export const crearRepuestoSchema = z
    .object({
        referencia: referenciaRepuestoEstrictaSchema,
        descripcion: z.string().trim().min(1).max(500),
        sede_id: z.string().trim().max(200).optional(),
        fabricante: textoCatalogoSchema.optional(),
        aplica_a: z
            .array(z.string().trim().min(1).max(100))
            .max(50)
            .optional(),
        categoria: textoCatalogoSchema.min(1, {
            message: 'Selecciona una categoría.',
        }),
        unidad_medida: unidadMedidaSchema.default('unidad'),
        precio: z.coerce.number().finite().min(0).optional(),
        ubicacion: ubicacionSchema.optional(),
        stock: z.coerce
            .number()
            .int()
            .min(0)
            .max(1_000_000)
            .optional(),
        stock_minimo: z.coerce
            .number()
            .int()
            .min(0)
            .max(1_000_000)
            .optional(),
        referencias_alternativas: referenciasAlternativasSchema,
        imagenes_referencia: imagenesReferenciaSchema,
        imagen_url: z
            .union([
                z.string().trim().url().max(2048),
                z.literal(''),
                z.null(),
            ])
            .optional(),
    })
    .strict()
    .transform((data) => ({
        ...data,
        referencias_alternativas: normalizarReferenciasAlternativas(
            data.referencias_alternativas,
            data.referencia
        ),
    }));

export const LIMITE_REPUESTOS_POR_PAGINA = 50;
export const LIMITE_MAXIMO_REPUESTOS_POR_PAGINA = 200;

const referenciaPrefijoSchema = z
    .string()
    .trim()
    .max(64)
    .refine(
        (value) =>
            value === '' || /^[A-Z0-9._-]+$/i.test(value),
        {
            message:
                'La referencia de búsqueda solo admite A-Z, 0-9, ., _, -.',
        }
    )
    .transform((value) => value.toUpperCase());

const filtrosRepuestosShape = {
    referencia: referenciaPrefijoSchema.default(''),
    categoria: textoCatalogoSchema.default(''),
    fabricante: textoCatalogoSchema.default(''),
    referencia_alternativa: referenciaPrefijoSchema.default(''),
};

export const listarRepuestosSchema = z
    .object({
        ...filtrosRepuestosShape,
        limite: z.coerce
            .number()
            .int()
            .min(1)
            .max(LIMITE_MAXIMO_REPUESTOS_POR_PAGINA)
            .default(LIMITE_REPUESTOS_POR_PAGINA),
        cursor: z
            .object({
                referencia: z.string().trim().min(1).max(200),
                documento_id: z.string().trim().min(1).max(200),
            })
            .strict()
            .optional(),
    })
    .strict();

export const contarRepuestosSchema = z
    .object(filtrosRepuestosShape)
    .strict();

export const eliminarRepuestoSchema = z
    .object({
        documento_id: z.string().trim().min(1).max(200),
        referencia: referenciaRepuestoEstrictaSchema,
    })
    .strict();

export type EditarRepuestoInput = z.infer<typeof editarRepuestoSchema>;
export type CambiosRepuestoInput = z.infer<typeof cambiosRepuestoSchema>;
export type CrearRepuestoInput = z.infer<typeof crearRepuestoSchema>;
export type EliminarRepuestoInput = z.infer<typeof eliminarRepuestoSchema>;
export type ListarRepuestosInput = z.infer<typeof listarRepuestosSchema>;
export type ContarRepuestosInput = z.infer<typeof contarRepuestosSchema>;
