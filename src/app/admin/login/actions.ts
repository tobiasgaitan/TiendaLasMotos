'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Creates a secure session cookie with the Firebase ID Token.
 * 
 * @param {string} idToken - The Firebase ID Token obtained after successful login.
 */
export async function createSession(idToken: string) {
    const cookieStore = await cookies();

    // Set secure, HTTP-only cookie for session management
    cookieStore.set('__session', idToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 5, // 5 days
        path: '/',
    });

    redirect('/admin/inventory');
}

/**
 * Deletes the session cookie and redirects to the login page.
 */
export async function deleteSession() {
    const cookieStore = await cookies();
    cookieStore.delete('__session');
    redirect('/admin/login');
}
