import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    // 1. Get session cookie
    const session = request.cookies.get('__session')?.value

    // 2. Define routes
    const isProtectedRoute = request.nextUrl.pathname.startsWith('/admin')
    const isLoginPage = request.nextUrl.pathname === '/login'

    // 3. Redirection Logic

    // Protect Admin Routes: If no session, go to login
    if (isProtectedRoute && !session) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Redirect Logged-in Users: If session exists and trying to access login, go to admin
    if (isLoginPage && session) {
        return NextResponse.redirect(new URL('/admin', request.url))
    }

    return NextResponse.next()
}

// Configure matcher to include both admin paths and login for the reverse redirect check
export const config = {
    matcher: ['/admin/:path*', '/login'],
}
