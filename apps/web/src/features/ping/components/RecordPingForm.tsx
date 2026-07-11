'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcTextInputField } from '@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field';
import { useRecordPingMutation } from '../api';

/**
 * `ObcTextInputField` (unlike `ObcTextareaField`) doesn't dispatch a
 * synthetic `CustomEvent` with a `detail.value` payload — it just lets the
 * shadow-DOM `<input>`'s native, composed `input` event bubble out. By the
 * time it reaches this listener (attached to the host by `@lit/react`), the
 * event has been retargeted to the host custom element, whose own `.value`
 * property the component already updated internally before the event
 * bubbled. Read the value off the event's `currentTarget` (the host) rather
 * than `e.detail`, which is `undefined` for this event. See
 * StructuredComposer.tsx for the same pattern.
 */
function readInputValue(e: Event): string {
  return (e.currentTarget as unknown as { value: string }).value;
}

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
