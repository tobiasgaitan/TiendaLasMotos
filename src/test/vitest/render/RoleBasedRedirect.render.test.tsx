import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoleBasedRedirect from '@/components/RoleBasedRedirect';

const navigationState = vi.hoisted(() => ({
    pathname: '/admin/simulador',
    searchParams: new URLSearchParams(),
}));

const routerState = vi.hoisted(() => ({
    replace: vi.fn(),
}));

const authState = vi.hoisted(() => ({
    user: null as { email?: string | null } | null,
    role: null as string | null,
    loading: false,
}));

vi.mock('next/navigation', () => ({
    usePathname: () => navigationState.pathname,
    useRouter: () => routerState,
    useSearchParams: () => navigationState.searchParams,
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => authState,
}));

vi.mock('@/components/EsperandoActivacion', () => ({
    default: ({ email }: { email: string }) => (
        <div data-testid="esperando">Esperando {email}</div>
    ),
}));

const children = <div>contenido</div>;

describe('RoleBasedRedirect render', () => {
    beforeEach(() => {
        navigationState.pathname = '/admin/simulador';
        navigationState.searchParams = new URLSearchParams();

        authState.user = null;
        authState.role = null;
        authState.loading = false;
        routerState.replace.mockReset();
    });

    it('renderiza Cargando y no children mientras loading', () => {
        authState.loading = true;
        authState.role = 'asesor';

        render(<RoleBasedRedirect>{children}</RoleBasedRedirect>);

        expect(screen.getByText('Cargando…')).toBeVisible();
        expect(screen.queryByText('contenido')).not.toBeInTheDocument();
    });

    it('sin defaultLanding no redirige y renderiza children', () => {
        navigationState.pathname = '/admin/simulador';
        authState.role = 'admin_creditos';

        render(<RoleBasedRedirect>{children}</RoleBasedRedirect>);

        expect(navigationState.searchParams.get('defaultLanding')).toBeNull();
        expect(screen.getByText('contenido')).toBeVisible();
        expect(routerState.replace).not.toHaveBeenCalled();
    });

    it('redirige admin_creditos a /admin/creditos y suprime children', async () => {
        navigationState.pathname = '/admin/simulador';
        navigationState.searchParams = new URLSearchParams(
            'defaultLanding=1'
        );
        authState.role = 'admin_creditos';

        render(<RoleBasedRedirect>{children}</RoleBasedRedirect>);

        await waitFor(() => {
            expect(routerState.replace).toHaveBeenCalledWith('/admin/creditos');
        });
        expect(screen.getByText('Cargando…')).toBeVisible();
        expect(screen.queryByText('contenido')).not.toBeInTheDocument();
    });

    it('redirige asesor a /admin/inventario-asesor', async () => {
        navigationState.pathname = '/admin';
        navigationState.searchParams = new URLSearchParams(
            'defaultLanding=1'
        );
        authState.role = 'asesor';

        render(<RoleBasedRedirect>{children}</RoleBasedRedirect>);

        await waitFor(() => {
            expect(routerState.replace).toHaveBeenCalledWith(
                '/admin/inventario-asesor'
            );
        });
    });

    it('renderiza EsperandoActivacion para guest con usuario', () => {
        navigationState.pathname = '/admin';
        authState.role = 'guest';
        authState.user = { email: 'guest@test.com' };

        render(<RoleBasedRedirect>{children}</RoleBasedRedirect>);

        expect(screen.getByTestId('esperando')).toHaveTextContent(
            'Esperando guest@test.com'
        );
        expect(screen.queryByText('contenido')).not.toBeInTheDocument();
    });
});
