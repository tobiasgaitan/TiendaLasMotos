'use server';

import { cookies } from 'next/headers';

import { getAdminAuth } from '@/lib/firebase-admin';

/**
 * Creates a server-side session cookie to allow Middleware to validate access.
 * Required for Firebase Hosting + Next.js Middleware integration.
 * The cookie is named '__session' as required by Firebase Hosting.
 */
export async function createSession(idToken: string) {
    const auth = getAdminAuth();
    const cookieStore = await cookies();

    // 🛡️ REGLA v7.0.2: Generar SessionCookie oficial para evitar error de "iss"
    // El idToken crudo tiene un emisor distinto al que espera el Admin SDK para Sesiones.
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 días en ms
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    // Set the cookie with restrictive security settings
    cookieStore.set('__session', sessionCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 5, // 5 días
        path: '/',
    });
}

/**
 * Removes the session cookie on logout
 */
export async function removeSession() {
    const cookieStore = await cookies();
    cookieStore.delete('__session');
}
