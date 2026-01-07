'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Loader2, Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';

export default function LoginForm() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Login State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Reset State
    const [showReset, setShowReset] = useState(false);
    const [resetEmail, setResetEmail] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Cookie setting is handled by onAuthStateChanged listener in page or middleware usually, 
            // but here we just wait for redirect or trigger server action if needed. 
            // For client-side auth, Next.js routing will handle it if we redirect.
            // Actually, we usually need to set a session cookie for Middleware. 
            // Assuming existing auth persistence or 'admin-auth' logic handles it.
            // Let's stick to standard Client Auth -> Redirect for now.

            // Force strict redirect
            window.location.href = '/admin/simulador';
        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
                setError('Credenciales incorrectas.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Demasiados intentos. Intenta más tarde.');
            } else {
                setError('Error al iniciar sesión.');
            }
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetEmail) {
            setError('Ingresa tu correo para restablecer.');
            return;
        }
        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            await sendPasswordResetEmail(auth, resetEmail);
            setSuccessMsg('Se ha enviado un correo de recuperación. Revisa tu bandeja.');
            setTimeout(() => setShowReset(false), 3000);
        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/user-not-found') {
                setError('No existe cuenta con este correo.');
            } else {
                setError('Error enviando correo de recuperación.');
            }
        } finally {
            setLoading(false);
        }
    };

    if (showReset) {
        return (
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-6 animate-in fade-in zoom-in duration-300">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900">Recuperar Acceso</h2>
                    <p className="text-gray-500 mt-2">Te enviaremos un link a tu correo.</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" /> {error}
                    </div>
                )}
                {successMsg && (
                    <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> {successMsg}
                    </div>
                )}

                <form onSubmit={handleResetPassword} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                            <input
                                type="email"
                                value={resetEmail}
                                onChange={(e) => setResetEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-all text-black bg-white"
                                placeholder="admin@ejemplo.com"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-brand-blue hover:bg-blue-800 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : 'Enviar Enlace'}
                    </button>

                    <button
                        type="button"
                        onClick={() => { setShowReset(false); setError(''); }}
                        className="w-full text-gray-500 text-sm hover:underline"
                    >
                        Volver al Login
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-8 animate-in fade-in zoom-in duration-300">
            <div className="text-center">
                <h1 className="text-3xl font-black text-brand-blue tracking-tight">TiendaMotos</h1>
                <p className="text-gray-500 mt-2">Acceso Administrativo Seguro</p>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 animate-pulse">
                    <AlertCircle className="w-4 h-4" /> {error}
                </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Correo Corporativo</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-all text-black bg-white"
                            placeholder="usuario@dominio.com"
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-all text-black bg-white"
                            placeholder="••••••••"
                            required
                            minLength={8}
                        />
                    </div>
                    <div className="flex justify-end mt-1">
                        <button
                            type="button"
                            onClick={() => { setShowReset(true); setError(''); setResetEmail(email); }}
                            className="text-xs text-brand-blue hover:underline font-medium"
                        >
                            ¿Olvidaste tu contraseña?
                        </button>
                    </div>
                </div>

                <div className="pt-2">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-brand-blue hover:bg-blue-800 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 transform active:scale-95"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : 'Iniciar Sesión'}
                    </button>
                </div>
            </form>

            <div className="text-center border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-400">
                    Sistema protegido. IP y Accesos monitoreados.
                </p>
            </div>
        </div>
    );
}
