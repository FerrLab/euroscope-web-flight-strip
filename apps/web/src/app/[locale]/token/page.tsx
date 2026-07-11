import { useTranslations } from 'next-intl';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Card } from '@eurostrip/ui';
import { TokenPanel } from '@/features/gateway/components/TokenPanel';
import { SESSION_COOKIE_NAME } from '@/shared/auth/cookie';

export default async function TokenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!session?.value) redirect(`/${locale}/login`);
  return <TokenPageClient />;
}

function TokenPageClient() {
  const t = useTranslations('gateway.token');
  return (
    <main className="p-8 space-y-8">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <Card>
        <TokenPanel />
      </Card>
    </main>
  );
}
