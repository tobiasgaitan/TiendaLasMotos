'use server';

import { cookies } from 'next/headers';

/**
 * WEB-047-P1 — Confirma que la cookie de sesión llegó físicamente al servidor.
 *
 * No expone el valor de la cookie, no escribe cookies y no usa Firestore.
 */
export async function sesionCookiePresente(): Promise<boolean> {
    const cookieStore = await cookies();
    return Boolean(cookieStore.get('__session')?.value);
}
