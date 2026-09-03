import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.EUROSTRIP_BACKEND_URL ?? 'http://127.0.0.1:8000';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get('locale') ?? 'en';
  const target = new URL('/auth/socialite/vatsim/redirect', BACKEND_URL);
  target.searchParams.set('locale', locale);
  return NextResponse.redirect(target, 302);
}
