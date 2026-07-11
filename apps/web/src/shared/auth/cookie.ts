const COOKIE_NAME = 'azimuth_session';

export function buildSessionCookie(token: string, opts: { secure: boolean }): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${60 * 60 * 24 * 14}`,
  ];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function buildLogoutCookie(opts: { secure: boolean }): string {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
