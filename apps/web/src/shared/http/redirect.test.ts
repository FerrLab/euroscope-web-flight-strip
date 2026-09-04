import { describe, it, expect } from 'vitest';
import { relativeRedirect } from './redirect';

describe('relativeRedirect', () => {
  it('emits a root-relative Location carrying no origin (happy)', () => {
    const res = relativeRedirect('/en/dashboard');

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/en/dashboard');
  });

  it('preserves the query string and honours an explicit status (happy)', () => {
    const res = relativeRedirect('/en/login?error=oauth', 303);

    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/en/login?error=oauth');
  });

  it('rejects an absolute URL, which would reintroduce a hardcoded origin (invalid)', () => {
    expect(() => relativeRedirect('http://0.0.0.0:3000/en/dashboard')).toThrow(TypeError);
  });

  it('rejects a protocol-relative path, which is an off-site redirect (garbage)', () => {
    expect(() => relativeRedirect('//evil.example/en/dashboard')).toThrow(TypeError);
  });

  it('rejects a path that is not root-relative (garbage)', () => {
    expect(() => relativeRedirect('en/dashboard')).toThrow(TypeError);
  });
});
