'use client';

import { Suspense } from 'react';
import LoginForm from './LoginForm';

export default function AdminLoginPage() {
    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <Suspense fallback={<div className="text-white">Cargando...</div>}>
                <LoginForm />
            </Suspense>
        </div>
    );
}
