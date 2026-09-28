'use server';

import { getDb } from "@/lib/firebase-admin";
import { emailCanonSchema } from "@/lib/actions/users-schemas";

/**
 * Verificación de whitelist pre-auth (WEB-031).
 *
 * SIN requirePermiso/requireActor (es pre-autenticación): resuelve existencia +
 * `active` de `sys_admin_users/{email}` vía Admin SDK.
 * Rate-limit lógico en memoria: 5 intentos / 60s por email (no distribuido
 * entre instancias; disuasión documentada). Logging forense en exceso y fallo.
 */

const LIMITE_INTENTOS = 5;
const VENTANA_MS = 60_000;

const intentos = new Map<string, { count: number; resetAt: number }>();

function limiteExcedido(emailKey: string): boolean {
    const ahora = Date.now();
    const reg = intentos.get(emailKey);
    if (reg && ahora < reg.resetAt) {
        if (reg.count >= LIMITE_INTENTOS) {
            console.warn("[whitelist] rate-limit excedido:", { email: emailKey });
            return true;
        }
        reg.count += 1;
        return false;
    }
    intentos.set(emailKey, { count: 1, resetAt: ahora + VENTANA_MS });
    return false;
}

export async function verificarWhitelist(
    email: unknown
): Promise<{ exists: boolean; active: boolean }> {
    const parsed = emailCanonSchema.safeParse(typeof email === "string" ? email : "");
    if (!parsed.success) return { exists: false, active: false };
    const emailKey = parsed.data;
    if (limiteExcedido(emailKey)) return { exists: false, active: false };
    try {
        const adminDb = getDb();
        const snap = await adminDb.collection("sys_admin_users").doc(emailKey).get();
        if (!snap.exists) return { exists: false, active: false };
        const data = snap.data() as { active?: boolean } | undefined;
        return { exists: true, active: data?.active === true };
    } catch (error) {
        console.error("[whitelist] verificarWhitelist falló:", error);
        return { exists: false, active: false };
    }
}
