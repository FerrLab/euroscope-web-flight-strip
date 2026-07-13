'use client';

import { useTranslations } from 'next-intl';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
import { PingList } from '@/features/ping/components/PingList';
import { RecordPingForm } from '@/features/ping/components/RecordPingForm';

export function PingPageClient() {
  const t = useTranslations('ping');
  return (
    <main className="p-8 space-y-8">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <ObcCard>
        <h2 className="text-xl font-semibold mb-4">{t('create')}</h2>
        <RecordPingForm />
      </ObcCard>
      <ObcCard>
        <PingList />
      </ObcCard>
    </main>
  );
}
