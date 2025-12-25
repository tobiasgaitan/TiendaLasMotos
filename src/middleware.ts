import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    // Check if we are checking an admin route
    if (request.nextUrl.pathname.startsWith('/admin')) {
        /**
         * Session Validation Logic:
         * We check for the presence of the '__session' cookie which is set by Firebase Auth.
         * This provides a basic layer of security at the edge before the request reaches the server components.
         * Fail-Closed: If the cookie is missing, we immediately redirect to login.
         */
        const sessionCookie = request.cookies.get('__session')

        if (!sessionCookie) {
            // Redirect to login if no session - FAIL CLOSED
            return NextResponse.redirect(new URL('/login', request.url))
        }
    }

    return NextResponse.next()
}

// Configure matcher to only run on /admin paths
export const config = {
    matcher: '/admin/:path*',
}
