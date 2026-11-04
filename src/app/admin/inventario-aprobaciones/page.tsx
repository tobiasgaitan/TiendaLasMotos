'use client';

import { useAuth } from '@/context/AuthContext';
import AccesoDenegado from '@/components/inventario/AccesoDenegado';
import AprobacionesClient from './AprobacionesClient';

export default function InventarioAprobacionesPage() {
    const { user, role, loading, puedeAccion } = useAuth();

    if (loading) {
        return (
            <div
                role="status"
                className="flex items-center justify-center p-12"
            >
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-red-500" />
                    <p className="animate-pulse text-gray-400">
                        Validando sesión…
                    </p>
                </div>
            </div>
        );
    }

    if (!user || typeof user.email !== 'string' || !user.email.trim()) {
        return (
            <AccesoDenegado mensaje="Sesión inválida. Vuelve a iniciar sesión." />
        );
    }

    const esAdmin = role === 'admin' || role === 'superadmin';
    const puedeAprobar = puedeAccion(
        'conteos_pendientes_repuestos',
        'update'
    );

    if (!esAdmin || !puedeAprobar) {
        return (
            <AccesoDenegado mensaje="Solo administradores pueden revisar conteos." />
        );
    }

    return <AprobacionesClient />;
}
