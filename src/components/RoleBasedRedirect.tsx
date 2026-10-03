'use client';

/**
 * WEB-038 — Redirect por rol con alcance limitado (scoped).
 *
 * Se monta ÚNICAMENTE en `src/app/admin/page.tsx` (dashboard) y como
 * wrapper en `src/app/admin/simulador/page.tsx`. PROHIBIDO montarlo en
 * `layout.tsx` (God Node).
 *
 * Comportamiento:
 * - Observa `role`/`loading` del AuthContext + `pathname`.
 * - Gate v4: el redirect SOLO se dispara si
 *   `searchParams.get('defaultLanding') === '1'` (flag inyectado por
 *   LoginForm cuando no hay callbackUrl explícito). Sin el flag, un admin
 *   que navegue manualmente a /admin/simulador NO es redirigido.
 * - `role === 'guest'` en rutas landing → delega a <EsperandoActivacion/>
 *   (polling de activación), nunca renderiza `children`.
 */

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { landingPorRol } from '@/lib/auth/landing';
import EsperandoActivacion from './EsperandoActivacion';

function esRutaLanding(pathname: string): boolean {
    return pathname === '/admin' || pathname === '/admin/simulador';
}

export default function RoleBasedRedirect({ children }: { children: React.ReactNode }) {
    const { user, role, loading } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const defaultLanding = searchParams.get('defaultLanding') === '1';

    useEffect(() => {
        if (loading || !role || role === 'guest') return;
        if (!defaultLanding) return;
        if (!esRutaLanding(pathname)) return;
        const landing = landingPorRol(role);
        if (landing !== pathname) {
            router.replace(landing);
        }
    }, [loading, role, pathname, defaultLanding, router]);

    if (loading || !role) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                Cargando…
            </div>
        );
    }

    if (role === 'guest' && user && esRutaLanding(pathname)) {
        return <EsperandoActivacion email={user.email ?? ''} />;
    }

    return <>{children}</>;
}
