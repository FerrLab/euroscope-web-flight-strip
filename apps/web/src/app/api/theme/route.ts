import { NextResponse } from 'next/server';

const VALID = ['day', 'dusk', 'night', 'bright'] as const;

export async function POST(request: Request) {
  const { theme } = (await request.json()) as { theme?: string };
  if (!theme || !VALID.includes(theme as (typeof VALID)[number])) {
    return new NextResponse('invalid theme', { status: 400 });
  }
  const secure = process.env.NODE_ENV === 'production';
  const cookie = [
    `azimuth_theme=${theme}`,
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${60 * 60 * 24 * 365}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', cookie);
  return res;
}
