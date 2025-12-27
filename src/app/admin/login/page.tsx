'use client';

import { useState } from 'react';
import { loginAdminWithGoogle } from '@/lib/auth/admin-auth';
import { createSession } from './actions';

/**
 * Admin Login Page Component.
 * Provides Google Authentication for verify admin access.
 */
export default function AdminLoginPage() {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        setLoading(true);
        setError('');

        try {
            // 1. Client-side: Authenticate with Google & check whitelist
            const token = await loginAdminWithGoogle();

            // 2. Server-side: Create session cookie
            await createSession(token);
        } catch (err: any) {
            setError(err.message || "Error al iniciar sesión");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">TiendaLasMotos</h1>
                    <p className="text-gray-400 text-sm">Acceso Administrativo Corporativo</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500 text-red-200 p-3 rounded-lg mb-6 text-sm text-center">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full bg-white hover:bg-gray-100 text-gray-900 font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? "Verificando..." : "Ingresar con Google"}
                </button>
            </div>
        </div>
    );
}
