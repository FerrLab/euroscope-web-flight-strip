const COOKIE_NAME = 'eurostrip_session';

export function buildSessionCookie(token: string, opts: { secure: boolean }): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    // Lax, not Strict: the VATSIM OAuth callback's final redirect to
    // /{locale}/dashboard is the tail of a chain that started cross-site
    // at auth.vatsim.net. Browsers withhold Strict cookies on that
    // navigation; Lax still blocks the cookie on cross-site POSTs,
    // iframes and subresources — the real CSRF vectors — and all of
    // EuroStrip's API traffic goes through this server-side proxy, never
    // a browser-direct call.
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 14}`,
  ];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function buildLogoutCookie(opts: { secure: boolean }): string {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
