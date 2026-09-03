import { NextResponse } from 'next/server';

// Browser-facing on purpose: this redirect is followed by the user's own
// browser (not a server-side fetch), and must land on the same origin as
// VATSIM_REDIRECT_URI so the OAuth state cookie survives the round trip.
// Do NOT switch this to EUROSTRIP_BACKEND_URL (http://backend:8000) the way
// the server-side route handlers in this directory do — that hostname only
// resolves inside the Docker network.
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get('locale') ?? 'en';
  const target = new URL('/auth/socialite/vatsim/redirect', BACKEND_URL);
  target.searchParams.set('locale', locale);
  return NextResponse.redirect(target, 302);
}
