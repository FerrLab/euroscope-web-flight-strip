import { describe, it, expect, afterEach, vi } from 'vitest';
import { POST } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/auth/logout', () => {
  it('clears the session cookie and redirects to the login page (happy)', async () => {
    const res = await POST();

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/en/login');
    expect(res.headers.get('Set-Cookie')).toContain('eurostrip_session=');
  });

  it('emits an origin-free Location so the browser stays on its own host (happy)', async () => {
    const res = await POST();

    // Regression guard: an absolute Location here would be built from the
    // Next server's bind address (0.0.0.0:3000 in the production image),
    // not the public origin, and would strand the browser.
    expect(res.headers.get('Location')).not.toMatch(/^https?:\/\//);
  });

  it('marks the cleared cookie Secure in production (invalid — must not leak over http)', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const res = await POST();

    expect(res.headers.get('Set-Cookie')).toContain('Secure');
  });
});
