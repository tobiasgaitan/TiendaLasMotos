import { z } from 'zod';
import { getAdminAuth } from '@/lib/firebase-admin';
import { AuthorizationError } from './errors';

export const actorSchema = z.object({
    uid: z.string().min(1),
    idToken: z.string().min(1),
});

export type ActorInput = z.infer<typeof actorSchema>;

export type VerifiedActor = {
    uid: string;
    email?: string;
};

export function validarActor(actor: unknown): ActorInput | null {
    const parsed = actorSchema.safeParse(actor);
    if (!parsed.success) return null;
    return parsed.data;
}

export async function requireActor(
    idToken: string
): Promise<VerifiedActor> {
    if (!idToken || typeof idToken !== 'string') {
        throw new AuthorizationError('No autorizado');
    }
    try {
        const adminAuth = getAdminAuth();
        const decoded = await adminAuth.verifyIdToken(idToken);
        if (!decoded || !decoded.uid) {
            throw new AuthorizationError('No autorizado');
        }
        return { uid: decoded.uid, email: decoded.email };
    } catch (error) {
        console.error('[creditos] requireActor: token inválido', error);
        throw new AuthorizationError('No autorizado');
    }
}
