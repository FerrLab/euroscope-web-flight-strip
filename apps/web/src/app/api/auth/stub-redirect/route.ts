import { NextResponse } from 'next/server';
import { relativeRedirect } from '@/shared/http/redirect';

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }
  const url = new URL(request.url);
  const identity = url.searchParams.get('identity') ?? 'stub-user@eurostrip.local';
  const locale = url.searchParams.get('locale') ?? 'en';
  const query = new URLSearchParams({ identity, locale });

  return relativeRedirect(`/api/auth/stub-callback?${query}`);
}
