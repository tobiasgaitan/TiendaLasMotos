import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User, UserCredential } from 'firebase/auth';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginForm from '@/app/admin/login/LoginForm';
import { createSession } from '@/app/actions/auth';
import { sesionCookiePresente } from '@/app/actions/session-status';
import { CLAVE_FLAG_ASESOR } from '@/lib/firebase';

const authState = vi.hoisted(() => ({
    user: null as User | null,
    role: null as string | null,
    loading: false,
}));

const searchParamsState = vi.hoisted(() => ({
    current: new URLSearchParams(),
}));

const locationState = vi.hoisted(() => ({
    href: '',
    flagAlNavegar: null as string | null,
}));

let hrefValue = '';

vi.mock('next/navigation', () => ({
    useSearchParams: () => searchParamsState.current,
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => authState,
}));

vi.mock('@/lib/firebase', () => ({
    auth: { currentUser: null },
    CLAVE_FLAG_ASESOR: 'tlm_offline_asesor',
}));

vi.mock('firebase/auth', () => ({
    signInWithEmailAndPassword: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
}));

vi.mock('@/app/admin/users/whitelist-actions', () => ({
    verificarWhitelist: vi.fn(),
}));

vi.mock('@/app/actions/auth', () => ({
    createSession: vi.fn(),
}));

vi.mock('@/app/actions/session-status', () => ({
    sesionCookiePresente: vi.fn(),
}));

const usuario = {
    uid: 'uid-asesor',
    email: 'asesor@test.com',
    getIdTokenResult: vi.fn().mockResolvedValue({ token: 'token-prueba' }),
} as unknown as User;

function configurarLoginExitoso(role: string): void {
    authState.user = usuario;
    authState.role = role;
    authState.loading = false;

    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
        user: usuario,
    } as unknown as UserCredential);
    vi.mocked(createSession).mockResolvedValue(undefined);
    vi.mocked(sesionCookiePresente).mockResolvedValue(true);
}

async function completarLogin(): Promise<void> {
    const user = userEvent.setup();

    await user.type(
        screen.getByLabelText('Correo Electrónico'),
        'asesor@test.com'
    );
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    await user.click(
        screen.getByRole('button', { name: 'Iniciar Sesión' })
    );
}

describe('LoginForm render', () => {
    beforeEach(() => {
        authState.user = null;
        authState.role = null;
        authState.loading = false;
        searchParamsState.current = new URLSearchParams();

        hrefValue = '';
        locationState.flagAlNavegar = null;

        Object.defineProperty(locationState, 'href', {
            configurable: true,
            get: () => hrefValue,
            set: (value: string) => {
                locationState.flagAlNavegar =
                    window.localStorage.getItem(CLAVE_FLAG_ASESOR);
                hrefValue = value;
            },
        });

        vi.stubGlobal('location', locationState);
        window.localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        window.localStorage.clear();
    });

    it('renderiza los campos y el botón de inicio de sesión', () => {
        render(<LoginForm />);

        expect(screen.getByLabelText('Correo Electrónico')).toBeVisible();
        expect(screen.getByLabelText('Contraseña')).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Iniciar Sesión' })
        ).toBeVisible();
    });

    it('rechaza callbackUrl externo y navega al destino por defecto', async () => {
        searchParamsState.current = new URLSearchParams(
            'callbackUrl=https://evil.com'
        );
        configurarLoginExitoso('asesor');

        render(<LoginForm />);
        await completarLogin();

        await waitFor(() => {
            expect(locationState.href).toBe(
                '/admin/simulador?defaultLanding=1'
            );
        });
        expect(locationState.href).not.toContain('evil.com');
    });

    it('canonicaliza /admin/simulator al simulador con defaultLanding=1', async () => {
        searchParamsState.current = new URLSearchParams(
            'callbackUrl=/admin/simulator'
        );
        configurarLoginExitoso('asesor');

        render(<LoginForm />);
        await completarLogin();

        await waitFor(() => {
            expect(locationState.href).toBe(
                '/admin/simulador?defaultLanding=1'
            );
        });
    });

    it('preserva deep link de asesor y escribe el flag antes de navegar', async () => {
        searchParamsState.current = new URLSearchParams(
            'callbackUrl=/admin/inventario-asesor'
        );
        configurarLoginExitoso('asesor');

        render(<LoginForm />);
        await completarLogin();

        await waitFor(() => {
            expect(locationState.href).toBe('/admin/inventario-asesor');
        });
        expect(window.localStorage.getItem(CLAVE_FLAG_ASESOR)).toBe('1');
        expect(locationState.flagAlNavegar).toBe('1');
    });
});
