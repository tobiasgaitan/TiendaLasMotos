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
    const isAdminPath = pathname.startsWith('/admin')
    const isLoginPath = pathname.startsWith('/login')
    const isStaticAsset = pathname.startsWith('/_next') || pathname.includes('.') || pathname.startsWith('/api')

    // --- ROUTING LOGIC ---

    // 1. BETA ENV: Redirect Admin to Production
    // We want the Beta env to show the full commercial site, BUT redirect admin actions to Prod
    // to avoid "Blocked Domain" auth errors and keep admin centralized.
    if (isBeta && isAdminPath) {
        return NextResponse.redirect(new URL('https://tiendalasmotos.com/admin', request.url))
    }

    // 2. PRODUCTION ENV: Maintenance Mode for Public
    // If it's production, we ONLY allow Admin, Login, and Maintenance page.
    // Everything else (the public commercial site) goes to Maintenance.
    if (isProduction) {
        // Allow: Admin, Login, Maintenance itself, Static assets/API
        if (!isAdminPath && !isLoginPath && !isMaintenancePage && !isStaticAsset) {
            return NextResponse.redirect(new URL('/maintenance', request.url))
        }
    }

    // --- AUTHENTICATION LOGIC (Applies globally where Admin is accessible) ---

    // Protect Admin Routes: If no session, go to login
    if (isAdminPath && !session) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Redirect Logged-in Users: If session exists and trying to access login, go to admin
    if (isLoginPath && session) {
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
