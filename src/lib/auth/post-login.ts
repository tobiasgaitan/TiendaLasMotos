/**
 * WEB-040 — Destino seguro posterior al login.
 *
 * Este helper NO resuelve el rol. `RoleBasedRedirect` sigue aplicando
 * `landingPorRol(role)` como única fuente de verdad después de la navegación:
 * - asesor → /admin/inventario-asesor
 * - admin_creditos → /admin/creditos
 * - resto → /admin/simulador
 *
 * Responsabilidad exclusiva:
 * - evitar open-redirect por `callbackUrl`;
 * - canonicalizar el slug inexistente `/admin/simulator`;
 * - garantizar el flag `defaultLanding=1` cuando el destino es el simulador.
 */

export const DESTINO_POST_LOGIN_DEFAULT = '/admin/simulador?defaultLanding=1';

const BASE_INTERNA = 'https://tiendalasmotos.local';
const RUTA_ADMIN = '/admin';
const RUTA_LOGIN = '/admin/login';
const RUTA_SIMULADOR = '/admin/simulador';
const RUTA_SIMULADOR_LEGACY = '/admin/simulator';

function normalizarPathname(pathname: string): string {
    if (pathname.length <= 1) return pathname;
    return pathname.replace(/\/+$/, '') || '/';
}

/**
 * Resuelve un `callbackUrl` no confiable a un destino interno seguro.
 *
 * Acepta únicamente rutas absolutas internas bajo `/admin`.
 * Cualquier valor externo, protocol-relative, malformado, `/admin/login`
 * o fuera de `/admin` cae al destino canónico por defecto.
 */
export function resolverDestinoPostLogin(raw: string | null | undefined): string {
    if (typeof raw !== 'string') return DESTINO_POST_LOGIN_DEFAULT;

    const candidato = raw.trim();
    if (!candidato || !candidato.startsWith('/') || candidato.startsWith('//')) {
        return DESTINO_POST_LOGIN_DEFAULT;
    }

    let url: URL;
    try {
        url = new URL(candidato, BASE_INTERNA);
    } catch {
        return DESTINO_POST_LOGIN_DEFAULT;
    }

    // `new URL` resuelve las rutas relativas contra BASE_INTERNA. Si el origen
    // cambió, el candidato era una URL absoluta externa.
    if (url.origin !== BASE_INTERNA) return DESTINO_POST_LOGIN_DEFAULT;

    const pathname = normalizarPathname(url.pathname);
    if (pathname === RUTA_LOGIN) return DESTINO_POST_LOGIN_DEFAULT;
    if (pathname !== RUTA_ADMIN && !pathname.startsWith(`${RUTA_ADMIN}/`)) {
        return DESTINO_POST_LOGIN_DEFAULT;
    }

    if (pathname === RUTA_SIMULADOR || pathname === RUTA_SIMULADOR_LEGACY) {
        url.pathname = RUTA_SIMULADOR;
        url.searchParams.set('defaultLanding', '1');
        return `${url.pathname}${url.search}${url.hash}`;
    }

    url.pathname = pathname;
    return `${url.pathname}${url.search}${url.hash}`;
}
