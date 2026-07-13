'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcTextInputField } from '@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field';
import { useRecordPingMutation } from '../api';
import { readInputValue } from '@/shared/openbridge/readInputValue';

export function RecordPingForm() {
  const t = useTranslations('ping');
  const [recordPing, { isLoading }] = useRecordPingMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [noteEn, setNoteEn] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  async function submit() {
    setServerError(null);
    const result = await recordPing({ note: { en: noteEn } });
    if ('error' in result) {
      setServerError(t('error'));
    } else {
      setNoteEn('');
    }
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3 max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <ObcTextInputField
        label={t('noteText')}
        value={noteEn}
        error={!!serverError}
        onInput={(e: Event) => setNoteEn(readInputValue(e))}
      />
      {serverError && <p className="text-accent-danger text-sm">{serverError}</p>}
      <ObcButton disabled={isLoading} onClick={() => formRef.current?.requestSubmit()}>
        {t('submit')}
      </ObcButton>
    </form>
  );
}
