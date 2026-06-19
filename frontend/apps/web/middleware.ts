import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_ROUTES: Array<{ prefix: string; reason: 'auth' | 'auth-to-buy' | 'admin' }> = [
  { prefix: '/create/repertoires', reason: 'auth' },
  { prefix: '/create/song', reason: 'auth' },
  { prefix: '/account', reason: 'auth' },
  { prefix: '/admin', reason: 'admin' },
  { prefix: '/checkout', reason: 'auth-to-buy' },
  { prefix: '/premium', reason: 'auth-to-buy' },
  { prefix: '/payment', reason: 'auth-to-buy' }
];

const AUTH_ROUTE = '/auth';

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

function readSessionPayload(value: string): { valid: boolean; role?: string } {
  const parts = value.split('.');
  if (parts.length !== 3) {
    return { valid: false };
  }

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { exp?: number; sub?: string; user_id?: string; role?: unknown };
    const subject = typeof payload.sub === 'string' && payload.sub.trim().length > 0
      ? payload.sub.trim()
      : typeof payload.user_id === 'string' && payload.user_id.trim().length > 0
        ? payload.user_id.trim()
        : '';

    if (!subject) {
      return { valid: false };
    }

    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false };
    }

    return {
      valid: true,
      role: typeof payload.role === 'string' ? payload.role : undefined
    };
  } catch {
    return { valid: false };
  }
}

function buildRedirect(request: NextRequest, reason: 'auth' | 'auth-to-buy' | 'admin'): NextResponse {
  const loginUrl = new URL(AUTH_ROUTE, request.url);
  loginUrl.searchParams.set('redirect', request.nextUrl.pathname);

  if (reason === 'auth-to-buy') {
    loginUrl.searchParams.set('reason', 'purchase');
  } else if (reason === 'admin') {
    loginUrl.searchParams.set('reason', 'admin');
  }

  return NextResponse.redirect(loginUrl);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(AUTH_ROUTE)) {
    return NextResponse.next();
  }

  const matched = PROTECTED_ROUTES.find((route) => pathname.startsWith(route.prefix));

  if (!matched) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('__session')?.value;
  const session = sessionCookie ? readSessionPayload(sessionCookie) : { valid: false };

  if (!session.valid) {
    return buildRedirect(request, matched.reason);
  }

  if (matched.reason === 'admin' && session.role !== 'admin') {
    return buildRedirect(request, 'admin');
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/create/repertoires/:path*',
    '/create/song/:path*',
    '/account/:path*',
    '/admin/:path*',
    '/checkout/:path*',
    '/premium/:path*',
    '/payment/:path*'
  ]
};
