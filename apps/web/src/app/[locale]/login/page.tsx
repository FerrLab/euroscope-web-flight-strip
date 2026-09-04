'use client';

import { Suspense } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';

// The backend appends ?error=<code> when a Socialite round trip ends badly.
// Mapping codes to catalog keys here (rather than rendering the code) keeps
// an unrecognised or hand-typed value from reaching the page as text.
const ERROR_MESSAGE_KEYS = {
  oauth: 'loginError',
  forbidden: 'loginForbidden',
} as const;

function isErrorCode(value: string | null): value is keyof typeof ERROR_MESSAGE_KEYS {
  return value !== null && value in ERROR_MESSAGE_KEYS;
}

/**
 * Split out behind Suspense because useSearchParams() opts its subtree into
 * client-side rendering; keeping it off the card means the sign-in buttons
 * still render on the server.
 */
function LoginError() {
  const t = useTranslations('auth');
  const error = useSearchParams().get('error');

  if (!isErrorCode(error)) {
    return null;
  }

  return (
    <p role="alert" className="mb-4 text-accent-danger">
      {t(ERROR_MESSAGE_KEYS[error])}
    </p>
  );
}

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg-secondary p-4">
      <ObcCard className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-4">{t('loginTitle')}</h1>
        <Suspense fallback={null}>
          <LoginError />
        </Suspense>
        {/*
          Plain anchors, not next/link. These are route handlers that 302 off
          to the backend, not app pages. <Link> prefetches on viewport entry,
          fetching the href with RSC headers; the fetch follows the redirect
          cross-origin to the API host, trips a CORS preflight that no Laravel
          route answers, and fills the console with failures before falling
          back to a normal navigation. Prefetching an endpoint that mints OAuth
          state is also a hazard in its own right — the preflight is all that
          stops the prefetch from rotating the `state` the real click depends on.
        */}
        <a href={`/api/auth/vatsim-redirect?locale=${locale}`}>
          <ObcButton fullWidth>{t('continueWithVatsim')}</ObcButton>
        </a>
        {process.env.NODE_ENV !== 'production' && (
          <a href={`/api/auth/stub-redirect?locale=${locale}`} className="block mt-2">
            <ObcButton fullWidth>{t('continueWithStub')}</ObcButton>
          </a>
        )}
      </ObcCard>
    </main>
  );
}
