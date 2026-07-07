import { NextRequest, NextResponse } from 'next/server';

function isAllowedSheetUrl(url: URL): boolean {
  return (
    url.hostname === 'firebasestorage.googleapis.com'
    || url.hostname === 'storage.googleapis.com'
    || url.hostname.endsWith('.googleapis.com')
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sheetUrl = request.nextUrl.searchParams.get('url')?.trim() ?? '';

  if (!sheetUrl) {
    return NextResponse.json(
      { error: { code: 'invalid_argument', message: 'Missing url parameter.' } },
      { status: 400 }
    );
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(sheetUrl);
  } catch {
    return NextResponse.json(
      { error: { code: 'invalid_argument', message: 'Invalid url parameter.' } },
      { status: 400 }
    );
  }

  if (!isAllowedSheetUrl(targetUrl)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Only Storage URLs are allowed.' } },
      { status: 403 }
    );
  }

  const upstream = await fetch(targetUrl.toString(), {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store'
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: { code: 'upstream_error', message: `Failed to fetch sheet file (${upstream.status}).` } },
      { status: upstream.status }
    );
  }

  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  const contentLength = upstream.headers.get('content-length');

  if (contentType) {
    headers.set('content-type', contentType);
  }
  if (contentLength) {
    headers.set('content-length', contentLength);
  }
  headers.set('cache-control', 'no-store');
  headers.set('access-control-allow-origin', '*');
  headers.set('vary', 'origin');

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers
  });
}
