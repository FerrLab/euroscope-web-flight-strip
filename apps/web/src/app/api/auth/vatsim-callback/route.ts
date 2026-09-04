import { buildSessionCookie } from '@/shared/auth/cookie';
import { relativeRedirect } from '@/shared/http/redirect';
import { serverLog, originOf } from '@/shared/observability/log';
import { LOCALES, type Locale } from '@eurostrip/i18n';

const BACKEND_URL = process.env.EUROSTRIP_BACKEND_URL ?? 'http://127.0.0.1:8000';

function pickLocale(value: string | null): Locale {
  if (value && (LOCALES as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return 'en';
}

function loginError(locale: Locale) {
  return relativeRedirect(`/${locale}/login?error=oauth`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = pickLocale(url.searchParams.get('locale'));
  const code = url.searchParams.get('code');

  if (!code) {
    serverLog('warn', 'auth.exchange.missing_code', { locale });

    return loginError(locale);
  }

  // The origin, never the code: it is bearer-equivalent for its 60-second
  // life. A wrong EUROSTRIP_BACKEND_URL is the failure this line exists to
  // make obvious, and the origin is enough to see it.
  const backend = originOf(BACKEND_URL);

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/auth/socialite/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch (cause) {
    // Connection refused, DNS, timeout — the request never reached the
    // backend, which is why nothing appears in its log. Split from the
    // parse failure below on purpose: these two used to collapse into one
    // `error=oauth` and they call for opposite fixes (deployment config vs
    // a backend bug). Route handlers have no page-level error boundary, so
    // an uncaught throw here would surface as a framework 500.
    serverLog('error', 'auth.exchange.unreachable', {
      backend: backend,
      cause: cause instanceof Error ? cause.message : String(cause),
    });

    return loginError(locale);
  }

  if (!upstream.ok) {
    serverLog('warn', 'auth.exchange.rejected', { backend, status: upstream.status });

    return loginError(locale);
  }

  let body: { access_token?: string };
  try {
    body = (await upstream.json()) as { access_token?: string };
  } catch {
    serverLog('error', 'auth.exchange.malformed', { backend, status: upstream.status });

    return loginError(locale);
  }

  if (!body.access_token) {
    serverLog('error', 'auth.exchange.no_token', { backend, status: upstream.status });

    return loginError(locale);
  }

  const secure = process.env.NODE_ENV === 'production';
  const cookie = buildSessionCookie(body.access_token, { secure });

  serverLog('info', 'auth.exchange.ok', { locale });

  const res = relativeRedirect(`/${locale}/dashboard`);
  res.headers.set('Set-Cookie', cookie);
  return res;
}
