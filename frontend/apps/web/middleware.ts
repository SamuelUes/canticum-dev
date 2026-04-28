import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_ROUTES: Array<{ prefix: string; reason: 'auth' | 'auth-to-buy' }> = [
  { prefix: '/repertoires', reason: 'auth' },
  { prefix: '/create/repertoires', reason: 'auth' },
  { prefix: '/create/song', reason: 'auth' },
  { prefix: '/artistas', reason: 'auth' },
  { prefix: '/checkout', reason: 'auth-to-buy' },
  { prefix: '/premium', reason: 'auth-to-buy' }
];

const AUTH_ROUTE = '/auth';

function buildRedirect(request: NextRequest, reason: 'auth' | 'auth-to-buy'): NextResponse {
  const loginUrl = new URL(AUTH_ROUTE, request.url);
  loginUrl.searchParams.set('redirect', request.nextUrl.pathname);

  if (reason === 'auth-to-buy') {
    loginUrl.searchParams.set('reason', 'purchase');
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

  const hasSession = request.cookies.has('__session');

  if (!hasSession) {
    return buildRedirect(request, matched.reason);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/repertoires/:path*',
    '/create/repertoires/:path*',
    '/create/song/:path*',
    '/artistas/:path*',
    '/checkout/:path*',
    '/premium/:path*'
  ]
};
