import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/shared/auth/cookie';

// Default to 127.0.0.1 not localhost: Node's fetch (undici) on some Windows/IPv6
// configurations tries ::1 first and fails with ECONNREFUSED when the upstream
// (Docker on Desktop) only meaningfully binds IPv4. 127.0.0.1 sidesteps it.
const BACKEND_URL = process.env.EUROSTRIP_BACKEND_URL ?? 'http://127.0.0.1:8000';

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const token = match?.[1];

  if (!token) {
    return new NextResponse('unauthenticated', { status: 401 });
  }

  const url = `${BACKEND_URL}/${path.join('/')}${new URL(request.url).search}`;
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('host');
  headers.set('Authorization', `Bearer ${token}`);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(url, init);
  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete('set-cookie');
  // Node's fetch transparently decodes the upstream content-encoding (gzip,
  // br, zstd, …) before handing us the body. Forwarding the original
  // content-encoding header would make the browser try to decode the already-
  // decoded payload, surfacing as ERR_CONTENT_DECODING_FAILED. Drop the
  // encoding-related headers so Next.js sets fresh ones for the client.
  respHeaders.delete('content-encoding');
  respHeaders.delete('content-length');
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
