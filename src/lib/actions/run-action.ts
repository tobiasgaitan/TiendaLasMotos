import { revalidatePath } from 'next/cache';
import type { ZodError, ZodType } from 'zod';
import { getDb } from '@/lib/firebase-admin';
import {
    requirePermiso,
    type ResultadoPermiso,
    type ScopeDoc,
} from '@/lib/auth/require-permiso';
import type { Accion, ColeccionPermiso } from '@/types/roles';
import { requireActor, validarActor, type VerifiedActor } from './actor';
import {
    appendAuditoria,
    type AuditoriaInput,
} from './audit';
import type { ActionResult } from './result';
import { AuthorizationError } from './errors';

type Db = ReturnType<typeof getDb>;

export interface ActionContext<TInput> {
    db: Db;
    actor: VerifiedActor;
    input: TInput;
    requirePermiso: (
        coleccion: ColeccionPermiso,
        accion: Accion,
        scopeDoc?: ScopeDoc | null
    ) => Promise<ResultadoPermiso>;
    audit: (entry: Omit<AuditoriaInput, 'actor'>) => Promise<void>;
}

export interface ActionOptions<TInput> {
    name: string;
    schema?: ZodType<TInput>;
    invalidMessage?: string | ((error: ZodError<TInput>) => string);
    permission?: {
        coleccion: ColeccionPermiso;
        accion: Accion;
    };
    revalidate?: string[];
    errorPrefix?: string;
}

function esErrorDeAutorizacion(error: unknown): boolean {
    return (
        error instanceof AuthorizationError ||
        (error instanceof Error && error.message.startsWith('No autorizado'))
    );
}

export async function runAction<TInput, TResult extends ActionResult>(
    options: ActionOptions<TInput>,
    input: unknown,
    actorInput: unknown,
    handler: (ctx: ActionContext<TInput>) => Promise<TResult>
): Promise<TResult> {
    const actor = validarActor(actorInput);
    if (!actor) {
        return {
            success: false,
            message: 'No autorizado. Sesión inválida.',
        } as TResult;
    }

    const parsed = options.schema
        ? options.schema.safeParse(input)
        : ({ success: true as const, data: input as TInput });
    if (!parsed.success) {
        const message =
            typeof options.invalidMessage === 'function'
                ? options.invalidMessage(parsed.error)
                : options.invalidMessage ?? 'Datos inválidos.';
        return { success: false, message } as TResult;
    }

    try {
        const me = await requireActor(actor.idToken);
        const db = getDb();
        let permissionChecked = Boolean(options.permission);

        const ctx: ActionContext<TInput> = {
            db,
            actor: me,
            input: parsed.data,
            requirePermiso: async (coleccion, accion, scopeDoc) => {
                permissionChecked = true;
                return requirePermiso(me, coleccion, accion, scopeDoc);
            },
            audit: (entry) => appendAuditoria({ ...entry, actor: me }),
        };

        if (options.permission) {
            await requirePermiso(
                me,
                options.permission.coleccion,
                options.permission.accion
            );
        }

        const result = await handler(ctx);

        // Red de seguridad: una acción de escritura no puede terminar sin autorización.
        if (result.success && !permissionChecked) {
            throw new Error(`PERMISSION_NOT_CHECKED: ${options.name}`);
        }
        if (result.success && options.revalidate) {
            options.revalidate.forEach((path) => revalidatePath(path));
        }
        return result;
    } catch (error) {
        console.error(`[${options.name}] falló:`, error);
        if (esErrorDeAutorizacion(error)) {
            return { success: false, message: 'No autorizado.' } as TResult;
        }
        const msg =
            error instanceof Error ? error.message : 'Excepción desconocida';
        return {
            success: false,
            message: `${options.errorPrefix ?? `Error en ${options.name}`}: ${msg}`,
        } as TResult;
    }
}

export function withAuthAndAudit<TInput, TResult extends ActionResult>(
    options: ActionOptions<TInput>,
    handler: (ctx: ActionContext<TInput>) => Promise<TResult>
) {
    return async (input: unknown, actor: unknown): Promise<TResult> =>
        runAction(options, input, actor, handler);
}
