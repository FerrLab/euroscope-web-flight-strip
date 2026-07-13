'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
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
      <ObcCard>
        <MessageFeed />
      </ObcCard>
      <ObcCard>
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            {mode === 'structured' ? (
              <ObcButton onClick={() => setMode('raw')}>{t('toggle.raw')}</ObcButton>
            ) : (
              <ObcButton onClick={() => setMode('structured')}>{t('toggle.structured')}</ObcButton>
            )}
          </div>
          {mode === 'structured' ? <StructuredComposer /> : <CommandComposer />}
        </div>
      </ObcCard>
    </main>
  );
}
