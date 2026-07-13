import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ConsoleClient } from '@/features/gateway/components/ConsoleClient';
import { SESSION_COOKIE_NAME } from '@/shared/auth/cookie';

export default async function ConsolePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!session?.value) redirect(`/${locale}/login`);
  return <ConsoleClient />;
}
