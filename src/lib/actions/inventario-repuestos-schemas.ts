import { z } from 'zod';
import { referenciaSchema, ubicacionSchema } from './inventario-schemas';

/**
 * WEB-038 — Contrato de entrada de la pantalla de inventario de repuestos.
 *
 * Este archivo NO modifica el schema documental de `inventario_repuestos`
 * (NAMING LOCK §10.B). Solo valida el payload de edición parcial enviado por
 * la UI y reutiliza los validadores canónicos de referencia/ubicación.
 */

const stockSchema = z.number().int().min(0).max(1_000_000);
const precioSchema = z.number().finite().min(0);

export const cambiosRepuestoSchema = z
    .object({
        descripcion: z.string().trim().min(1).max(500).optional(),
        stock: stockSchema.optional(),
        stock_minimo: stockSchema.optional(),
        precio: precioSchema.optional(),
        ubicacion: ubicacionSchema.optional(),
    })
    .strict()
    .refine((cambios) => Object.keys(cambios).length > 0, {
        message: 'Debes enviar al menos un campo para editar.',
    });

export const editarRepuestoSchema = z
    .object({
        referencia: referenciaSchema,
        cambios: cambiosRepuestoSchema,
    })
    .strict();

export const listarRepuestosSchema = z.object({}).strict();

export type EditarRepuestoInput = z.infer<typeof editarRepuestoSchema>;
export type CambiosRepuestoInput = z.infer<typeof cambiosRepuestoSchema>;
