import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith('/api/');
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  console.info(JSON.stringify({
    level: 'info', event: 'http_request', requestId,
    method: request.method, path: request.nextUrl.pathname, createdAt: new Date().toISOString(),
  }));
  if (!isApi && !request.cookies.has('badminton_token')) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/', '/api/:path*', '/sessions/:path*', '/members/:path*', '/shuttlecock/:path*', '/treasury/:path*', '/audit/:path*'],
};
