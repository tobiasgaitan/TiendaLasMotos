import { z } from 'zod';
import {
    CATEGORIA_DESCRIPCION_MAX,
    CATEGORIA_NOMBRE_MAX,
    CATEGORIA_ORDEN_DEFAULT,
    CATEGORIA_ORDEN_MAX,
    claveCategoria,
    normalizarNombreCategoria,
} from '@/lib/inventario/categorias';

/**
 * WEB-INV-053 — Contrato de entrada del CRUD de categorías canónicas.
 *
 * Este archivo NO lleva 'use server' y no importa SDKs. El nombre es inmutable
 * en v1: la edición solo acepta descripción, orden y estado activo.
 */

const nombreCategoriaSchema = z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio.')
    .max(CATEGORIA_NOMBRE_MAX)
    .transform(normalizarNombreCategoria)
    .refine((nombre) => claveCategoria(nombre).length > 0, {
        message: 'La categoría debe contener letras o números.',
    });

const descripcionCategoriaSchema = z
    .string()
    .trim()
    .max(CATEGORIA_DESCRIPCION_MAX);

const ordenCategoriaSchema = z.coerce
    .number()
    .int()
    .min(0)
    .max(CATEGORIA_ORDEN_MAX);

export const crearCategoriaRepuestoSchema = z
    .object({
        nombre: nombreCategoriaSchema,
        descripcion: descripcionCategoriaSchema.optional().default(''),
        orden: ordenCategoriaSchema
            .optional()
            .default(CATEGORIA_ORDEN_DEFAULT),
    })
    .strict();

export const cambiosCategoriaRepuestoSchema = z
    .object({
        descripcion: descripcionCategoriaSchema.optional(),
        orden: ordenCategoriaSchema.optional(),
        activo: z.boolean().optional(),
    })
    .strict()
    .refine((cambios) => Object.keys(cambios).length > 0, {
        message: 'Debes enviar al menos un campo para editar.',
    });

export const editarCategoriaRepuestoSchema = z
    .object({
        clave: z.string().trim().min(1).max(CATEGORIA_NOMBRE_MAX),
        nombre: nombreCategoriaSchema,
        cambios: cambiosCategoriaRepuestoSchema,
    })
    .strict();

export const eliminarCategoriaRepuestoSchema = z
    .object({
        clave: z.string().trim().min(1).max(CATEGORIA_NOMBRE_MAX),
        nombre: nombreCategoriaSchema,
    })
    .strict();

export const listarCategoriasRepuestosSchema = z
    .object({
        incluirArchivadas: z.boolean().optional().default(true),
    })
    .strict();

export type CrearCategoriaRepuestoInput = z.infer<
    typeof crearCategoriaRepuestoSchema
>;
export type EditarCategoriaRepuestoInput = z.infer<
    typeof editarCategoriaRepuestoSchema
>;
export type EliminarCategoriaRepuestoInput = z.infer<
    typeof eliminarCategoriaRepuestoSchema
>;
export type ListarCategoriasRepuestosInput = z.infer<
    typeof listarCategoriasRepuestosSchema
>;
