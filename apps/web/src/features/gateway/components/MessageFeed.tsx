'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@eurostrip/ui';
import { useAppSelector } from '@/shared/store/hooks';
import type { ConsoleMessage } from '../slice';

// A neutral placeholder for envelope fields the protocol didn't provide.
const MISSING_FIELD_PLACEHOLDER = '—';

function entryTime(id: string): string {
  const ms = Number(id.split('-')[0]);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleTimeString() : '';
}

function FeedRow({ message }: { message: ConsoleMessage }) {
  const t = useTranslations('gateway.console');
  const envelope = message.envelope;
  const text = (key: string) =>
    typeof envelope[key] === 'string' ? String(envelope[key]) : MISSING_FIELD_PLACEHOLDER;

  return (
    <details className="border-b border-neutral-700 py-1 font-mono text-sm">
      <summary className="flex cursor-pointer gap-3">
        <span className="w-16 shrink-0">
          {message.direction === 'in' ? t('directionIn') : t('directionOut')}
        </span>
        <span className="w-20 shrink-0">{text('type')}</span>
        <span className="w-44 shrink-0">{text('action')}</span>
        <span className="w-24 shrink-0">{text('callsign')}</span>
        <span className="shrink-0">{entryTime(message.id)}</span>
      </summary>
      <pre className="overflow-x-auto p-2 text-xs">{JSON.stringify(envelope, null, 2)}</pre>
    </details>
  );
}

export function MessageFeed() {
  const t = useTranslations('gateway.console');
  const messages = useAppSelector((s) => s.gateway.messages);
  const [paused, setPaused] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused) {
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages, paused]);

  return (
    <section aria-label={t('title')}>
      <div className="flex justify-end pb-2">
        <Button type="button" onClick={() => setPaused((p) => !p)}>
          {paused ? t('resume') : t('pause')}
        </Button>
      </div>
      {messages.length === 0 && <p className="text-sm">{t('empty')}</p>}
      <div className="max-h-[60vh] overflow-y-auto">
        {messages.map((m) => (
          <FeedRow key={m.id} message={m} />
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}
