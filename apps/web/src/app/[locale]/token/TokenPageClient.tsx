'use client';

import { useTranslations } from 'next-intl';
import { ConnectionSettingsCard } from '@/features/gateway/components/ConnectionSettingsCard';

export function TokenPageClient() {
  const t = useTranslations('gateway.token');
  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      {/* The same card the dashboard mounts: one token surface, so the
          one-shot secret can only ever leave through the command modal. */}
      <ConnectionSettingsCard />
    </main>
  );
}
