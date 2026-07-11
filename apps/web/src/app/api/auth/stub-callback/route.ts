import { NextResponse } from 'next/server';
import { buildSessionCookie } from '@/shared/auth/cookie';
import { LOCALES, type Locale } from '@eurostrip/i18n';

// Default to 127.0.0.1 not localhost: Node's fetch (undici) on some Windows/IPv6
// configurations tries ::1 first and fails with ECONNREFUSED when the upstream
// (Docker on Desktop) only meaningfully binds IPv4. 127.0.0.1 sidesteps it.
const BACKEND_URL = process.env.EUROSTRIP_BACKEND_URL ?? 'http://127.0.0.1:8000';

function pickLocale(value: string | null): Locale {
  if (value && (LOCALES as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return 'en';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const identity = url.searchParams.get('identity') ?? 'stub-user@eurostrip.local';
  const locale = pickLocale(url.searchParams.get('locale'));

  const upstream = await fetch(
    `${BACKEND_URL}/auth/socialite/stub/callback?identity=${encodeURIComponent(identity)}`,
    { headers: { Accept: 'application/json' } },
  );

  if (!upstream.ok) {
    return new NextResponse('upstream auth error', { status: 502 });
  }

  const body = (await upstream.json()) as {
    access_token: string;
    user: { id: number; email: string };
  };
  if (!body.access_token) {
    return new NextResponse('missing token', { status: 502 });
  }

  const secure = process.env.NODE_ENV === 'production';
  const cookie = buildSessionCookie(body.access_token, { secure });

  const dashboard = new URL(`/${locale}/dashboard`, url);
  const res = NextResponse.redirect(dashboard, 302);
  res.headers.set('Set-Cookie', cookie);
  return res;
}
