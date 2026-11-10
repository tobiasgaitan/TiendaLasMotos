import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const loginForm = readFileSync(
    'src/app/admin/login/LoginForm.tsx',
    'utf8'
);
const sessionStatus = readFileSync(
    'src/app/actions/session-status.ts',
    'utf8'
);
const authAction = readFileSync('src/app/actions/auth.ts', 'utf8');
const proxy = readFileSync('src/proxy.ts', 'utf8');

function bloque(fuente: string, inicio: string, fin: string): string {
    const desde = fuente.indexOf(inicio);
    const hasta = fuente.indexOf(fin, desde + inicio.length);
    expect(desde).toBeGreaterThanOrEqual(0);
    expect(hasta).toBeGreaterThan(desde);
    return fuente.slice(desde, hasta);
}

describe('WEB-047-P1 — race condition de __session', () => {
    it('LoginForm verifica la cookie antes de navegar en el login', () => {
        const login = bloque(
            loginForm,
            'const handleLogin = async',
            'const handleRegister = async'
        );

        expect(login).toContain('esperarCookieSesion');
        expect(login.indexOf('esperarCookieSesion') <
            login.indexOf('navegarAlDestino')).toBe(true);
        expect(loginForm).toContain(
            'if (await sesionCookiePresente()) return true;'
        );
        expect(login).not.toContain('document.cookie');
    });

    it('espera con backoff acotado y máximo 6 intentos', () => {
        expect(loginForm).toContain(
            'const ESPERAS_COOKIE_MS = [100, 200, 400, 800, 1200]'
        );
        expect(loginForm).toContain('intento < 6');
        expect(loginForm).toContain('intento < 5');
    });

    it('la Server Action solo devuelve presencia booleana', () => {
        expect(sessionStatus.startsWith("'use server';")).toBe(true);
        expect(sessionStatus).toContain('cookies()');
        expect(sessionStatus).toContain('Boolean(cookieStore.get');
        expect(sessionStatus).toContain('__session');
        expect(sessionStatus).not.toContain('firebase');
        expect(sessionStatus).not.toContain('.set(');
        expect(sessionStatus).not.toContain('.delete(');
    });

    it('createSession conserva httpOnly y no fue sustituido', () => {
        expect(authAction).toContain('createSessionCookie');
        expect(authAction).toContain('__session');
        expect(authAction).toContain('httpOnly: true');
        expect(authAction).not.toContain('sesionCookiePresente');
    });

    it('el reintento no vuelve a pedir credenciales', () => {
        const reintento = bloque(
            loginForm,
            'async function handleReintentarSesion',
            'const handleLogin = async'
        );

        expect(reintento).toContain('auth.currentUser');
        expect(reintento).toContain('reintentarSesion');
        expect(reintento).not.toContain('signInWithEmailAndPassword');
        expect(reintento).not.toContain('password');

        const helper = bloque(
            loginForm,
            'async function reintentarSesion',
            'async function handleReintentarSesion'
        );
        expect(helper).toContain('createSession');
        expect(helper).toContain('getIdTokenResult(true)');
        expect(helper).not.toContain('signInWithEmailAndPassword');
    });

    it('proxy conserva el redirect automático deshabilitado', () => {
        expect(proxy).toContain(
            'DISABLED: Preventing infinite loop if Client SDK disagrees with Cookie.'
        );
        expect(proxy).toContain("request.cookies.get('__session')");
    });

    it('LoginForm ofrece el botón de reintento sin password', () => {
        expect(loginForm).toContain("Reintentar sesión");
        expect(loginForm).toContain('handleReintentarSesion');
    });
});
