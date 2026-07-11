import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const identity = url.searchParams.get('identity') ?? 'stub-user@eurostrip.local';
  const locale = url.searchParams.get('locale') ?? 'en';
  const cb = new URL('/api/auth/stub-callback', url);
  cb.searchParams.set('identity', identity);
  cb.searchParams.set('locale', locale);
  return NextResponse.redirect(cb, 302);
}
