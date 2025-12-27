import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware to protect administrative routes.
 * Checks for the presence of the '__session' cookie on all /admin paths.
 * Redirects unauthenticated users to /admin/login.
 */
export function middleware(request: NextRequest) {
    // Only intercept requests under /admin
    if (request.nextUrl.pathname.startsWith('/admin')) {

        // Allow access to the login page itself to avoid redirect loops
        if (request.nextUrl.pathname === '/admin/login') {
            return NextResponse.next();
        }

        const session = request.cookies.get('__session');

        // If no session cookie exists, redirect to login
        if (!session) {
            return NextResponse.redirect(new URL('/admin/login', request.url));
        }
    }
    return NextResponse.next();
}

/**
 * Configuration to match only specific paths.
 */
export const config = {
    matcher: ['/admin/:path*'],
};
