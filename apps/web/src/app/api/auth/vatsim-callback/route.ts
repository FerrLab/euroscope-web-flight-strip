import { NextResponse } from 'next/server';
import { buildSessionCookie } from '@/shared/auth/cookie';
import { LOCALES, type Locale } from '@eurostrip/i18n';

const BACKEND_URL = process.env.EUROSTRIP_BACKEND_URL ?? 'http://127.0.0.1:8000';

function pickLocale(value: string | null): Locale {
  if (value && (LOCALES as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return 'en';
}

function loginError(url: URL, locale: Locale): NextResponse {
  return NextResponse.redirect(new URL(`/${locale}/login?error=oauth`, url), 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = pickLocale(url.searchParams.get('locale'));
  const code = url.searchParams.get('code');

  if (!code) {
    return loginError(url, locale);
  }

  let body: { access_token?: string };
  try {
    const upstream = await fetch(`${BACKEND_URL}/auth/socialite/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (!upstream.ok) {
      return loginError(url, locale);
    }

    body = (await upstream.json()) as { access_token?: string };
  } catch {
    // Network failure (connection refused, DNS, timeout) or a non-JSON /
    // unparseable upstream body — route handlers have no page-level error
    // boundary, so an uncaught throw here would surface as a generic
    // framework 500 instead of the graceful login-error redirect.
    return loginError(url, locale);
  }

  if (!body.access_token) {
    return loginError(url, locale);
  }

  const secure = process.env.NODE_ENV === 'production';
  const cookie = buildSessionCookie(body.access_token, { secure });

  const dashboard = new URL(`/${locale}/dashboard`, url);
  const res = NextResponse.redirect(dashboard, 302);
  res.headers.set('Set-Cookie', cookie);
  return res;
}
