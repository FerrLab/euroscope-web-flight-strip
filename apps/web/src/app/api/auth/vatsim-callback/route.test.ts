import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

function makeReq(query: string) {
  return new Request(`http://localhost:3000/api/auth/vatsim-callback${query}`);
}

describe('/api/auth/vatsim-callback', () => {
  it('exchanges the code and redirects to /en/dashboard with the session cookie (happy)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await GET(makeReq('?code=abc123&locale=en'));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/socialite/exchange'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/en/dashboard');
    expect(res.headers.get('Set-Cookie')).toContain('eurostrip_session=tok');
  });

  it('honors locale=pt (happy)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await GET(makeReq('?code=abc123&locale=pt'));

    expect(res.headers.get('Location')).toBe('/pt/dashboard');
  });

  it('redirects to login with an error when the code is missing (invalid)', async () => {
    const res = await GET(makeReq(''));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/en/login?error=oauth');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('redirects to login with an error when the backend rejects the code (invalid)', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ message: 'bad' }), { status: 422 }));

    const res = await GET(makeReq('?code=expired&locale=en'));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/en/login?error=oauth');
  });

  it('redirects to login with an error on a malformed backend response (garbage)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ nope: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await GET(makeReq('?code=abc123&locale=en'));

    expect(res.headers.get('Location')).toBe('/en/login?error=oauth');
  });

  it('redirects to login with an error when the fetch itself throws (garbage)', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));

    const res = await GET(makeReq('?code=abc123&locale=en'));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/en/login?error=oauth');
  });
});
