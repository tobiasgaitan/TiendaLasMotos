'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, Mail, Lock, AlertCircle, CheckCircle, Shield } from 'lucide-react';

export default function LoginForm() {
    const router = useRouter();
    const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Form States
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [resetEmail, setResetEmail] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = '/admin/simulador';
        } catch (err: any) {
            console.error(err);
            handleAuthError(err);
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (password.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres.');
            setLoading(false);
            return;
        }

        try {
            // 1. Check Whitelist in Firestore
            const emailKey = email.toLowerCase().trim();
            const whitelistRef = doc(db, 'sys_admin_users', emailKey);
            const whitelistSnap = await getDoc(whitelistRef);

            if (!whitelistSnap.exists() || !whitelistSnap.data()?.active) {
                setError('Este correo no está autorizado para acceder. Contacta al SuperAdmin.');
                setLoading(false);
                return;
            }

            // 2. Create Auth User
            await createUserWithEmailAndPassword(auth, email, password);
            setSuccessMsg('Cuenta activada correctamente. Ingresando...');
            setTimeout(() => {
                window.location.href = '/admin/simulador';
            }, 1000);

        } catch (err: any) {
            console.error(err);
            handleAuthError(err);
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
            setSuccessMsg('Se ha enviado un correo de recuperación.');
            setTimeout(() => setMode('login'), 3000);
        } catch (err: any) {
            handleAuthError(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAuthError = (err: any) => {
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
            setError('Credenciales incorrectas.');
        } else if (err.code === 'auth/user-not-found') {
            setError('Usuario no encontrado.');
        } else if (err.code === 'auth/email-already-in-use') {
            setError('Este correo ya está registrado. Intenta iniciar sesión.');
        } else if (err.code === 'auth/weak-password') {
            setError('La contraseña es muy débil.');
        } else {
            setError('Error de autenticación: ' + err.message);
        }
    };

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

            {successMsg && (
                <div className="p-4 bg-green-50 text-green-600 text-sm rounded-lg flex items-center gap-2 border border-green-100">
                    <CheckCircle size={16} /> {successMsg}
                </div>
            )}

            {mode === 'reset' ? (
                <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Correo Electrónico</label>
                        <input
                            type="email"
                            required
                            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-all"
                            placeholder="nombre@tudominio.com"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-brand-blue hover:bg-blue-800 text-white font-bold py-3 rounded-lg transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
                    >
                        {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Enviar Enlace'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="w-full text-sm text-gray-500 hover:text-gray-900 py-2"
                    >
                        Volver al Login
                    </button>
                </form>
            ) : (
                <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Correo Electrónico</label>
                        <input
                            type="email"
                            required
                            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-all"
                            placeholder="admin@tudominio.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Contraseña</label>
                        <input
                            type="password"
                            required
                            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-all"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        {mode === 'register' && <p className="text-xs text-brand-blue">Mínimo 8 caracteres</p>}
                    </div>

                    {mode === 'login' && (
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setMode('reset')}
                                className="text-sm text-brand-blue hover:underline font-medium"
                            >
                                ¿Olvidaste tu contraseña?
                            </button>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-brand-blue hover:bg-blue-800 text-white font-bold py-3 rounded-lg transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : mode === 'login' ? 'Iniciar Sesión' : 'Activar Cuenta'}
                    </button>

                    <div className="text-center pt-2">
                        <button
                            type="button"
                            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                            className="text-sm text-gray-500 hover:text-gray-900 font-medium"
                        >
                            {mode === 'login' ? '¿Primera vez? Activa tu cuenta aquí' : '¿Ya tienes cuenta? Inicia Sesión'}
                        </button>
                    </div>
                </form>
            )}

            <div className="text-center border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-400">
                    Sistema protegido. IP y Accesos monitoreados.
                </p>
            </div>
        </div>
    );
}
