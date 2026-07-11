import { useTranslations } from 'next-intl';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Card } from '@eurostrip/ui';
import { PingList } from '@/features/ping/components/PingList';
import { RecordPingForm } from '@/features/ping/components/RecordPingForm';
import { SESSION_COOKIE_NAME } from '@/shared/auth/cookie';

export default async function PingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!session?.value) redirect(`/${locale}/login`);
  return <PingPageClient />;
}

function PingPageClient() {
  const t = useTranslations('ping');
  return (
    <main className="p-8 space-y-8">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <Card>
        <h2 className="text-xl font-semibold mb-4">{t('create')}</h2>
        <RecordPingForm />
      </Card>
      <Card>
        <PingList />
      </Card>
    </main>
  );
}
