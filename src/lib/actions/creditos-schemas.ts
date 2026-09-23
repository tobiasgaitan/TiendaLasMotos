import { z } from "zod";

/**
 * Esquemas zod compartidos del Módulo de Créditos y Renting (Fase 9).
 *
 * SIN directiva 'use server': los archivos 'use server' de Next.js solo pueden
 * exportar funciones async (los `export const` de runtime rompen el build).
 * `actions.ts` y `financiero-actions.ts` consumen estos esquemas por import.
 */

export const actorSchema = z.object({
    uid: z.string().min(1),
    idToken: z.string().min(1),
});

export type ActorInput = z.infer<typeof actorSchema>;

// Float (double) para dinero — Int64/Float del Módulo 1
export const moneySchema = z.coerce.number().finite().min(0);
// Int64 para contadores/enteros
export const intSchema = z.coerce.number().int().min(0);
