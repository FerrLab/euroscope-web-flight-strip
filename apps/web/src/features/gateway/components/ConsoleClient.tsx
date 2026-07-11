'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@eurostrip/ui';
import { useGatewayPoll } from '../useGatewayPoll';
import { CommandComposer } from './CommandComposer';
import { ConsoleStatusHeader } from './ConsoleStatusHeader';
import { MessageFeed } from './MessageFeed';

export function ConsoleClient() {
  const t = useTranslations('gateway.console');
  useGatewayPoll();

  return (
    <main className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{t('title')}</h1>
        <ConsoleStatusHeader />
      </header>
      <Card>
        <MessageFeed />
      </Card>
      <Card>
        <CommandComposer />
      </Card>
    </main>
  );
}
