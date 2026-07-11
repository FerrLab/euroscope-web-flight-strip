import { getRequestConfig } from 'next-intl/server';
import { LOCALES, DEFAULT_LOCALE, isLocale, messages as shared } from '@azimuth/i18n';
import { notFound } from 'next/navigation';

import authEn from '@/messages/auth.en.json';
import authPt from '@/messages/auth.pt.json';
import pingEn from '@/messages/ping.en.json';
import pingPt from '@/messages/ping.pt.json';

const PER_FEATURE: Record<string, Record<string, unknown>> = {
  en: { ...authEn, ...pingEn },
  pt: { ...authPt, ...pingPt },
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : DEFAULT_LOCALE;
  if (!LOCALES.includes(locale)) notFound();
  return {
    locale,
    messages: { ...shared[locale], ...PER_FEATURE[locale] },
  };
});
