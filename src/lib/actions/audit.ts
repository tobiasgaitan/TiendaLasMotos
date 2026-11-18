import { getDb } from '@/lib/firebase-admin';
import type { OperacionAuditoria } from '@/types/creditos';
import type { VerifiedActor } from './actor';

export type { OperacionAuditoria } from '@/types/creditos';

export type AuditoriaInput = {
    coleccion: string;
    documentoId: string;
    operacion: OperacionAuditoria;
    antes: Record<string, unknown> | null;
    despues: Record<string, unknown> | null;
    actor: VerifiedActor;
};

function diffKeys(
    antes: Record<string, unknown>,
    despues: Record<string, unknown>
): string[] {
    const keys = new Set([...Object.keys(antes), ...Object.keys(despues)]);
    const changed: string[] = [];
    for (const k of keys) {
        let a: string, b: string;
        try {
            a = JSON.stringify(antes[k] ?? null);
        } catch {
            a = '[no-serializable]';
        }
        try {
            b = JSON.stringify(despues[k] ?? null);
        } catch {
            b = '[no-serializable]';
        }
        if (a !== b) changed.push(k);
    }
    return changed;
}

export async function appendAuditoria(
    input: AuditoriaInput
): Promise<void> {
    // OVERRIDE QWEN #4 — append-only vía add(); batch.set() PROHIBIDO en el ledger.
    const { coleccion, documentoId, operacion, antes, despues, actor } = input;
    const campos_modificados =
        operacion === 'CREATE'
            ? Object.keys(despues ?? {})
            : diffKeys(antes ?? {}, despues ?? {});
    try {
        const adminDb = getDb();
        await adminDb.collection('historial_auditoria').add({
            coleccion_afectada: coleccion,
            documento_id: documentoId,
            operacion,
            datos_anteriores: antes,
            datos_nuevos: despues,
            campos_modificados,
            registrado_por: actor.uid,
            registrado_por_email: actor.email ?? null,
            created_at: new Date(),
            version: 1,
        });
    } catch (error) {
        console.error('[creditos] appendAuditoria falló:', {
            coleccion,
            documentoId,
            operacion,
            error,
        });
        throw error;
    }
}
