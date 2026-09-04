import { describe, it, expect, afterEach, vi } from 'vitest';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeReq(query: string) {
  return new Request(`http://localhost:3000/api/auth/stub-redirect${query}`);
}

describe('/api/auth/stub-redirect', () => {
  it('redirects to the backend stub callback outside production (happy)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const res = await GET(makeReq('?identity=a@b'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/api/auth/stub-callback?identity=a%40b&locale=en');
  });

  it('404s in production (invalid — must never reach real users)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await GET(makeReq('?identity=a@b'));
    expect(res.status).toBe(404);
  });
});
