'use client';

import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Button, Input } from '@azimuth/ui';
import { useState } from 'react';
import { useRecordPingMutation } from '../api';

interface FormShape {
  noteEn: string;
}

export function RecordPingForm() {
  const t = useTranslations('ping');
  const [recordPing, { isLoading }] = useRecordPingMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormShape>({
    defaultValues: { noteEn: '' },
  });

  return (
    <form
      className="flex flex-col gap-3 max-w-md"
      onSubmit={handleSubmit(async (values) => {
        setServerError(null);
        const result = await recordPing({ note: { en: values.noteEn } });
        if ('error' in result) {
          setServerError(t('error'));
        } else {
          reset({ noteEn: '' });
        }
      })}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm">{t('noteText')}</span>
        <Input
          aria-invalid={!!errors.noteEn}
          aria-label={t('noteText')}
          {...register('noteEn', { required: true, minLength: 1 })}
        />
      </label>
      {serverError && <p className="text-accent-danger text-sm">{serverError}</p>}
      <Button type="submit" disabled={isLoading}>
        {t('submit')}
      </Button>
    </form>
  );
}
