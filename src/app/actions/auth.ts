'use server';

import { cookies } from 'next/headers';

/**
 * Creates a server-side session cookie to allow Middleware to validate access.
 * Required for Firebase Hosting + Next.js Middleware integration.
 * The cookie is named '__session' as required by Firebase Hosting.
 */
export async function createSession(idToken: string) {
    const cookieStore = await cookies();

    // Set the cookie with restrictive security settings
    // The token itself is the Firebase ID Token (valid for 1h, but we can set cookie longer if we had refresh logic)
    // For now, we match a reasonable session duration.
    cookieStore.set('__session', idToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 5, // 5 days persistence
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
