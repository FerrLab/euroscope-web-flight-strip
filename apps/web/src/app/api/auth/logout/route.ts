import { buildLogoutCookie } from '@/shared/auth/cookie';
import { relativeRedirect } from '@/shared/http/redirect';

export async function POST() {
  const secure = process.env.NODE_ENV === 'production';
  const res = relativeRedirect('/en/login');
  res.headers.set('Set-Cookie', buildLogoutCookie({ secure }));
  return res;
}
