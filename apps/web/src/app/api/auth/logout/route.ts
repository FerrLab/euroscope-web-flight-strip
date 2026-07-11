import { NextResponse } from 'next/server';
import { buildLogoutCookie } from '@/shared/auth/cookie';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const secure = process.env.NODE_ENV === 'production';
  const res = NextResponse.redirect(new URL('/en/login', url), 302);
  res.headers.set('Set-Cookie', buildLogoutCookie({ secure }));
  return res;
}
