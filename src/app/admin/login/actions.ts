'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Creates a secure session cookie with the Firebase ID Token.
 * 
 * @param {string} idToken - The Firebase ID Token obtained after successful login.
 */
export async function createSession(idToken: string, redirectTo: string = '/admin/inventory') {
    const cookieStore = await cookies();

    // Set secure, HTTP-only cookie for session management
    // Firebase Hosting requires the cookie name to be '__session'
    cookieStore.set('__session', idToken, {
        httpOnly: true,
        secure: true, // Always secure for Firebase Hosting (Production & Preview)
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 5, // 5 days
        path: '/',
    });

    redirect(redirectTo);
}

/**
 * Deletes the session cookie and redirects to the login page.
 */
export async function deleteSession() {
    const cookieStore = await cookies();
    cookieStore.delete('__session');
    redirect('/admin/login');
}
