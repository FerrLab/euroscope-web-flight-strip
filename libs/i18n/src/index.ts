import enMessages from './messages/en.json';
import ptMessages from './messages/pt.json';
import { LOCALES, type Locale, DEFAULT_LOCALE, isLocale } from './locales';

export const messages: Record<Locale, typeof enMessages> = {
  en: enMessages,
  pt: ptMessages,
};

export { LOCALES, DEFAULT_LOCALE, isLocale };
export type { Locale };
export type Messages = typeof enMessages;
