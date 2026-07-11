import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

function makeReq(path: string, opts: { method?: string; cookie?: string; body?: BodyInit } = {}) {
  const url = `http://localhost:3000/api/proxy/${path}`;
  const headers = new Headers();
  if (opts.cookie) headers.set('cookie', opts.cookie);
  const init: RequestInit = { method: opts.method ?? 'GET', headers };
  if (opts.body !== undefined) init.body = opts.body;
  return new Request(url, init);
}

function makeCtx(path: string) {
  return { params: Promise.resolve({ path: path.split('/') }) };
}

describe('/api/proxy/[...path]', () => {
  it('forwards GET with Bearer header from cookie (happy)', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const req = makeReq('api/ping', { cookie: 'eurostrip_session=tok123' });
    const res = await GET(req, makeCtx('api/ping'));
    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('Authorization')).toBe('Bearer tok123');
    expect(res.status).toBe(200);
  });

  it('returns 401 if no cookie (invalid)', async () => {
    const req = makeReq('api/ping');
    const res = await GET(req, makeCtx('api/ping'));
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forwards POST body and content-type (happy)', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 201 }));
    const body = JSON.stringify({ note: { en: 'hi' } });
    const req = new Request('http://localhost:3000/api/proxy/api/ping', {
      method: 'POST',
      headers: { cookie: 'eurostrip_session=tok123', 'content-type': 'application/json' },
      body,
    });
    const res = await POST(req, makeCtx('api/ping'));
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers.get('content-type')).toBe('application/json');
    expect(res.status).toBe(201);
  });

  it('handles upstream 5xx as garbage (garbage)', async () => {
    mockFetch.mockResolvedValue(new Response('boom', { status: 503 }));
    const req = makeReq('api/ping', { cookie: 'eurostrip_session=tok123' });
    const res = await GET(req, makeCtx('api/ping'));
    expect(res.status).toBe(503);
  });
});
