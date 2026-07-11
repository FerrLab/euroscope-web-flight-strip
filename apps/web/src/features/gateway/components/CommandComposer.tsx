'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@eurostrip/ui';
import { parseComposerInput } from '../schema';
import { useSendCommandMutation } from '../api';

export function CommandComposer() {
  const t = useTranslations('gateway.console.composer');
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sendCommand, { isLoading }] = useSendCommandMutation();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const parsed = parseComposerInput(raw);
        if (!parsed.ok) {
          setError(parsed.error === 'invalid-json' ? t('invalidJson') : t('invalidEnvelope'));
          return;
        }
        const result = await sendCommand(parsed.envelope);
        if ('error' in result && result.error) {
          setError(t('sendFailed'));
        } else {
          setRaw('');
        }
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm">{t('label')}</span>
        <textarea
          aria-label={t('label')}
          className="min-h-24 border border-neutral-600 bg-transparent p-2 font-mono text-sm"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={t('hint')}
        />
      </label>
      {error && <p className="text-accent-danger text-sm">{error}</p>}
      <Button type="submit" disabled={isLoading}>
        {t('send')}
      </Button>
    </form>
  );
}
