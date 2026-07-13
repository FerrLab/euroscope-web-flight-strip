import { describe, it, expect } from 'vitest';
import { setThemePrePaint } from './set-theme-pre-paint';

describe('setThemePrePaint', () => {
  it('sets both data-theme and data-obc-theme from the cookie (happy)', () => {
    document.cookie = 'eurostrip_theme=night';
    new Function(setThemePrePaint())();
    expect(document.documentElement.dataset.theme).toBe('night');
    expect(document.documentElement.dataset.obcTheme).toBe('night');
    document.cookie = 'eurostrip_theme=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('falls back both attributes to day for an invalid cookie value (garbage)', () => {
    document.cookie = 'eurostrip_theme=purple';
    new Function(setThemePrePaint())();
    expect(document.documentElement.dataset.theme).toBe('day');
    expect(document.documentElement.dataset.obcTheme).toBe('day');
    document.cookie = 'eurostrip_theme=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });
});
