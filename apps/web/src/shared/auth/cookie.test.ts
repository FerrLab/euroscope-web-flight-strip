import { describe, it, expect } from 'vitest';
import { buildSessionCookie, buildLogoutCookie, SESSION_COOKIE_NAME } from './cookie';

describe('cookie helpers', () => {
  it('emits HttpOnly + SameSite=Lax + Max-Age (happy)', () => {
    const c = buildSessionCookie('tok', { secure: true });
    expect(c).toContain(`${SESSION_COOKIE_NAME}=tok`);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Max-Age=');
    expect(c).toContain('Secure');
  });

  it('omits Secure in dev (invalid → flag off)', () => {
    const c = buildSessionCookie('tok', { secure: false });
    expect(c).not.toContain('Secure');
  });

  it('logout cookie clears with Max-Age=0 (happy)', () => {
    const c = buildLogoutCookie({ secure: true });
    expect(c).toContain('Max-Age=0');
    expect(c).toContain(`${SESSION_COOKIE_NAME}=`);
  });

  it('handles empty token as garbage (garbage)', () => {
    const c = buildSessionCookie('', { secure: false });
    expect(c).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;`));
  });
});
