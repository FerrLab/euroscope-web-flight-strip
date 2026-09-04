import { describe, it, expect, vi, afterEach } from 'vitest';
import { serverLog, originOf } from './log';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('serverLog', () => {
  it('emits one JSON line carrying the event and context (happy)', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    serverLog('info', 'auth.exchange.ok', { locale: 'pt' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({
      level: 'info',
      event: 'auth.exchange.ok',
      locale: 'pt',
    });
  });

  it('routes each level to its own console channel (happy)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    serverLog('warn', 'a');
    serverLog('error', 'b');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('works with no context at all (invalid — nothing to add)', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    serverLog('info', 'auth.exchange.start');

    expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({
      level: 'info',
      event: 'auth.exchange.start',
    });
  });
});

describe('originOf', () => {
  it('strips path and query, keeping only the origin (happy)', () => {
    expect(originOf('http://backend:8000/auth/socialite/exchange?code=secret')).toBe(
      'http://backend:8000',
    );
  });

  it('returns the raw value when it will not parse (garbage)', () => {
    expect(originOf('not a url')).toBe('not a url');
  });
});
