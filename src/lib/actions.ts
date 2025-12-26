'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Cierra la sesión del usuario eliminando la cookie de sesión.
 * Redirige a la página de login.
 */
export async function logoutAction() {
    const cookieStore = await cookies();
    cookieStore.delete('__session');
    redirect('/login');
}
