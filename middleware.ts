// =============================================================================
// middleware.ts — Auth guard for dashboard routes
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifyAuthToken, isPasswordConfigured } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // If password protection is not configured, bypass
  if (!isPasswordConfigured()) {
    return NextResponse.next();
  }

  // Only protect dashboard pages and dashboard API routes
  const isDashboardPage = pathname.startsWith('/dashboard');
  const isDashboardApi = pathname.startsWith('/api/dashboard');

  if (!isDashboardPage && !isDashboardApi) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isValid = await verifyAuthToken(token);

  if (!isValid) {
    if (isDashboardApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/dashboard/:path*'],
};
