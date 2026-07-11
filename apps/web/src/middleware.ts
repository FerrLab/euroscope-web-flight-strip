import createMiddleware from 'next-intl/middleware';
import { LOCALES, DEFAULT_LOCALE } from '@azimuth/i18n';

export default createMiddleware({
  locales: [...LOCALES],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
});

export const config = {
  matcher: ['/((?!api|_next|_vercel|favicon.ico).*)'],
};
