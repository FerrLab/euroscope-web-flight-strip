import { describe, it, expect } from 'vitest';
import { GET } from './route';

function makeReq(query: string) {
  return new Request(`http://localhost:3000/api/auth/vatsim-redirect${query}`);
}

describe('/api/auth/vatsim-redirect', () => {
  it('redirects to a browser-resolvable backend origin, not the Docker-internal one (happy — connectivity property)', async () => {
    const res = await GET(makeReq('?locale=en'));

    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toBeTruthy();

    // The Docker-internal hostname the backend uses for server-side fetches
    // (EUROSTRIP_BACKEND_URL) is never resolvable by the browser that
    // actually follows this redirect — regression guard for the bug this
    // was, where the redirect silently pointed there instead.
    expect(new URL(location as string).origin).not.toBe('http://backend:8000');
    expect(location).toContain('/auth/socialite/vatsim/redirect');
    expect(location).toContain('locale=en');
  });

  it('defaults the locale to en when missing (garbage)', async () => {
    const res = await GET(makeReq(''));

    expect(res.headers.get('Location')).toContain('locale=en');
  });
});
