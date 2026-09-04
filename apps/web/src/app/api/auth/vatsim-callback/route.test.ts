import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

const mockFetch = vi.fn();
let logs: Array<{ level: string; event: string; [k: string]: unknown }>;

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();

  // Capture the structured lines the handler writes, so these assert on what
  // `docker logs` would actually show rather than on a mocked logger.
  logs = [];
  const capture = (line: unknown) => {
    logs.push(JSON.parse(String(line)));
  };
  vi.spyOn(console, 'info').mockImplementation(capture);
  vi.spyOn(console, 'warn').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function loggedEvent(event: string) {
  return logs.find((entry) => entry.event === event);
}

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

  it('distinguishes an unreachable backend from a rejected code (invalid — opposite fixes)', async () => {
    mockFetch.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8000'));

    await GET(makeReq('?code=abc123&locale=pt'));

    const entry = loggedEvent('auth.exchange.unreachable');
    expect(entry).toBeDefined();
    expect(entry?.level).toBe('error');
    expect(entry?.cause).toContain('ECONNREFUSED');
    // The origin it actually tried is the point: a wrong
    // EUROSTRIP_BACKEND_URL is invisible without it.
    expect(entry?.backend).toBeTruthy();
  });

  it('records the upstream status when the backend rejects the code (invalid)', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ message: 'bad' }), { status: 422 }));

    await GET(makeReq('?code=expired&locale=en'));

    const entry = loggedEvent('auth.exchange.rejected');
    expect(entry).toBeDefined();
    expect(entry?.status).toBe(422);
  });

  it('separates a malformed body from a missing token (garbage)', async () => {
    mockFetch.mockResolvedValue(
      new Response('<html>gateway error</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await GET(makeReq('?code=abc123&locale=en'));

    expect(loggedEvent('auth.exchange.malformed')).toBeDefined();
    expect(loggedEvent('auth.exchange.no_token')).toBeUndefined();
  });

  it('records a token-less 200 as its own failure (garbage)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ nope: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await GET(makeReq('?code=abc123&locale=en'));

    expect(loggedEvent('auth.exchange.no_token')).toBeDefined();
  });

  it('never writes the exchange code or the token to a log line (invalid — both are secrets)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'super-secret-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await GET(makeReq('?code=super-secret-code&locale=en'));

    expect(loggedEvent('auth.exchange.ok')).toBeDefined();
    const serialised = JSON.stringify(logs);
    expect(serialised).not.toContain('super-secret-code');
    expect(serialised).not.toContain('super-secret-token');
  });
});
