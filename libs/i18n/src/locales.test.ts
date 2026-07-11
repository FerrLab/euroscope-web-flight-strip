import { describe, it, expect } from 'vitest';
import { LOCALES, DEFAULT_LOCALE, isLocale, messages } from './index';

describe('locales', () => {
  it('exposes en and pt (happy)', () => {
    expect(LOCALES).toEqual(['en', 'pt']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('isLocale narrows correctly (happy)', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('pt')).toBe(true);
  });

  it('rejects unknown locale strings (invalid)', () => {
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('')).toBe(false);
  });

  it('handles non-string input safely (garbage)', () => {
    // @ts-expect-error — runtime guard test
    expect(isLocale(undefined)).toBe(false);
    // @ts-expect-error — runtime guard test
    expect(isLocale(123)).toBe(false);
  });

  it('every locale has a populated messages catalog (happy)', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]).toBeDefined();
      expect(messages[locale].common.appName).toBe('EuroStrip');
    }
  });

  it('catalogs have parallel key shapes (happy)', () => {
    const enKeys = JSON.stringify(Object.keys(messages.en).sort());
    const ptKeys = JSON.stringify(Object.keys(messages.pt).sort());
    expect(ptKeys).toBe(enKeys);
  });
});
