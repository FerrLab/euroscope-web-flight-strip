'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcTextareaField } from '@oicl/openbridge-webcomponents-react/components/textarea-field/textarea-field';
import { TextareaFieldType } from '@oicl/openbridge-webcomponents/dist/components/textarea-field/textarea-field.js';
import { parseComposerInput } from '../schema';
import { useSendCommandMutation } from '../api';

export function CommandComposer() {
  const t = useTranslations('gateway.console.composer');
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sendCommand, { isLoading }] = useSendCommandMutation();
  const formRef = useRef<HTMLFormElement>(null);

  async function submit() {
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
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <ObcTextareaField
        type={TextareaFieldType.Rich}
        showToolbar={false}
        showVoiceRecording={false}
        label={t('label')}
        value={raw}
        placeholder={t('hint')}
        error={!!error}
        errorText={error ?? ''}
        onInput={(e: CustomEvent<{ value: string }>) => setRaw(e.detail.value)}
      />
      <ObcButton disabled={isLoading} onClick={() => formRef.current?.requestSubmit()}>
        {t('send')}
      </ObcButton>
    </form>
  );
}
