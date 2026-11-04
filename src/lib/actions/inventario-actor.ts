/**
 * WEB-038 — Verificación de actor para Server Actions de inventario.
 *
 * Este archivo NO lleva 'use server': puede exportar helpers síncronos.
 * Solo debe importarse desde código de servidor.
 */
import { getAdminAuth } from '@/lib/firebase-admin';
import { actorSchema, type ActorInput } from './inventario-schemas';

export function validarActor(actor: unknown): ActorInput | null {
    const parsed = actorSchema.safeParse(actor);
    if (!parsed.success) return null;
    return parsed.data;
}

export async function requireActorInventario(
    idToken: string
): Promise<{ uid: string; email: string }> {
    if (!idToken || typeof idToken !== 'string') {
        throw new Error('No autorizado');
    }

    try {
        const adminAuth = getAdminAuth();
        const decoded = await adminAuth.verifyIdToken(idToken);
        if (!decoded || !decoded.uid) {
            throw new Error('No autorizado');
        }

        const email =
            typeof decoded.email === 'string'
                ? decoded.email.toLowerCase().trim()
                : '';

        if (!email) {
            throw new Error('No autorizado: usuario sin correo verificado.');
        }

        return { uid: decoded.uid, email };
    } catch (error) {
        console.error('[inventario] requireActor: token inválido', error);
        throw new Error('No autorizado');
    }
}
