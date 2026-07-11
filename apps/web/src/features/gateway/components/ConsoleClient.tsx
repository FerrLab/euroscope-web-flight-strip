'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card } from '@eurostrip/ui';
import { useGatewayPoll } from '../useGatewayPoll';
import { CommandComposer } from './CommandComposer';
import { StructuredComposer } from './StructuredComposer';
import { ConsoleStatusHeader } from './ConsoleStatusHeader';
import { MessageFeed } from './MessageFeed';

type ComposerMode = 'structured' | 'raw';

export function ConsoleClient() {
  const t = useTranslations('gateway.console');
  const [mode, setMode] = useState<ComposerMode>('structured');
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
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            {mode === 'structured' ? (
              <Button type="button" onClick={() => setMode('raw')}>
                {t('toggle.raw')}
              </Button>
            ) : (
              <Button type="button" onClick={() => setMode('structured')}>
                {t('toggle.structured')}
              </Button>
            )}
          </div>
          {mode === 'structured' ? <StructuredComposer /> : <CommandComposer />}
        </div>
      </Card>
    </main>
  );
}
