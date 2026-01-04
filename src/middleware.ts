import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const hostname = request.headers.get('host') || ''
    const session = request.cookies.get('__session')?.value

    // --- DOMAIN IDENTIFICATION ---
    // Production Domains: tiendalasmotos.com, tiendalasmotos.web.app, (and likely firebaseapp.com alias)
    // We treat anything NOT explicitly "beta" or "localhost" as production for safety.
    const isBeta = hostname.includes('tiendalasmotos-beta')
    const isLocalhost = hostname.includes('localhost')
    const isProduction = !isBeta && !isLocalhost

    // --- PATH DEFINITIONS ---
    const isMaintenancePage = pathname === '/maintenance'

    // Critical Fix: Explicitly define Login Path
    const isLoginPage = pathname === '/admin/login';

    // Critical Fix: Exclude Login Page from isAdminPath check to prevent infinite loop
    const isAdminPath = pathname.startsWith('/admin') && !isLoginPage;

    const isStaticAsset = pathname.startsWith('/_next') || pathname.includes('.') || pathname.startsWith('/api')

    // --- ROUTING LOGIC ---

    // --- ROUTING LOGIC ---

    // 1. BETA ENV: [REMOVED REDIRECTION FOR QA PURPOSES]
    // Previously redirected admin to production. Removed to allow testing.

    // Protect Admin Routes: If no session, go to login
    // Strict Check: /admin or /admin/*
    if (isAdminPath && !session) {
        const loginUrl = new URL('/admin/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Redirect Logged-in Users: If session exists and trying to access login, go to admin (or callbackUrl)
    if (isLoginPage && session) {
        const callbackUrl = request.nextUrl.searchParams.get('callbackUrl');
        if (callbackUrl && callbackUrl.startsWith('/')) {
            return NextResponse.redirect(new URL(callbackUrl, request.url));
        }
        return NextResponse.redirect(new URL('/admin', request.url))
    }

    return NextResponse.next()
}

// Configure matcher to run on all paths so we can intercept public traffic
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
}
