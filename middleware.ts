import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for Domain Separation and Auth Protection.
 * 
 * 1. Domain Separation:
 *    - Production (tiendalasmotos.com): Rewrites '/' to '/maintenance'.
 *    - Beta (tiendalasmotos-beta): Serves standard '/'.
 * 
 * 2. Admin Protection:
 *    - Checks for '__session' cookie on /admin routes.
 */
export function middleware(request: NextRequest) {
    const hostname = request.headers.get('host') || '';
    const { pathname } = request.nextUrl;

    // --- Domain Separation Logic ---
    // If we are NOT on beta, NOT on localhost, and NOT on the panel site
    const isProduction = !hostname.includes('beta') &&
        !hostname.includes('localhost') &&
        !hostname.includes('lasmotos-panel');

    // If Production User requests Home Page -> Show Maintenance
    if (isProduction && pathname === '/') {
        return NextResponse.rewrite(new URL('/maintenance', request.url));
    }

    // --- Admin Protection Logic ---
    if (pathname.startsWith('/admin')) {

        // Allow access to login
        if (pathname === '/admin/login') {
            return NextResponse.next();
        }

        const session = request.cookies.get('__session');

        // If no session cookie, redirect to login
        if (!session) {
            return NextResponse.redirect(new URL('/admin/login', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/', '/admin/:path*'], // Added '/' to matcher to ensure it runs on home page
};
