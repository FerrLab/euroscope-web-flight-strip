import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

// Unconditional teardown (matching stub-redirect/route.test.ts): an inline
// unstub at the end of a test body leaks the env stub into the next test
// whenever an assertion above it throws.
afterEach(() => {
  vi.unstubAllEnvs();
});

function makeReq(query: string) {
  return new Request(`http://localhost:3000/api/auth/stub-callback${query}`);
}

describe('/api/auth/stub-callback', () => {
  it('redirects to /en/dashboard for default locale (happy)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', user: { id: 1, email: 'a' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await GET(makeReq('?identity=a@b'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/en/dashboard');
  });

  it('honors locale=pt query param (happy)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', user: { id: 1, email: 'a' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await GET(makeReq('?identity=a@b&locale=pt'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/pt/dashboard');
  });

  it('falls back to en for unknown locale (garbage)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', user: { id: 1, email: 'a' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await GET(makeReq('?identity=a@b&locale=fr'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/en/dashboard');
  });

  it('returns 502 when upstream fails (invalid)', async () => {
    mockFetch.mockResolvedValue(new Response('boom', { status: 503 }));
    const res = await GET(makeReq('?identity=a@b'));
    expect(res.status).toBe(502);
  });

  it('404s in production (invalid — must never reach real users)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await GET(makeReq('?identity=a@b'));
    expect(res.status).toBe(404);
  });
});
