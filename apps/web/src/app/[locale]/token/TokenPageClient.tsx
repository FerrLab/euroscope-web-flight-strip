'use client';

import { useTranslations } from 'next-intl';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
import { TokenPanel } from '@/features/gateway/components/TokenPanel';

export function TokenPageClient() {
  const t = useTranslations('gateway.token');
  return (
    <main className="p-8 space-y-8">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <ObcCard>
        <TokenPanel />
      </ObcCard>
    </main>
  );
}
