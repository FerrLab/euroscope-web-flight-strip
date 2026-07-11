'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@eurostrip/ui';
import type { CommandEnvelope } from '../schema';
import { useSendCommandMutation } from '../api';
import { GATEWAY_ACTIONS, ALTITUDE_SPECIALS, type ActionDef } from '../actions';

type AltitudeMode = 'feet' | 'special';

const fieldClassName = 'border border-neutral-600 bg-transparent p-2 text-sm';

export function StructuredComposer() {
  const t = useTranslations('gateway.console.structured');
  const [actionKey, setActionKey] = useState<string>(GATEWAY_ACTIONS[0].action);
  const [callsign, setCallsign] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [altitudeMode, setAltitudeMode] = useState<AltitudeMode>('feet');
  const [error, setError] = useState<string | null>(null);
  const [sendCommand, { isLoading }] = useSendCommandMutation();

  const action = GATEWAY_ACTIONS.find((a) => a.action === actionKey) as ActionDef;

  function handleActionChange(next: string) {
    setActionKey(next);
    setValues({});
    setAltitudeMode('feet');
    setError(null);
  }

  function setFieldValue(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const payload: Record<string, unknown> = {};

    for (const field of action.fields) {
      if (field.kind === 'altitude-mode') {
        if (altitudeMode === 'feet') {
          const raw = (values.feet ?? '').trim();
          if (raw === '') {
            setError(t('errors.required', { field: t('fields.feet') }));
            return;
          }
          const feet = Number(raw);
          if (Number.isNaN(feet)) {
            setError(t('errors.invalidNumber', { field: t('fields.feet') }));
            return;
          }
          payload.feet = feet;
        } else {
          const special = (values.special ?? '').trim();
          if (special === '') {
            setError(t('errors.required', { field: t('fields.special') }));
            return;
          }
          payload.special = special;
        }
        continue;
      }

      const raw = values[field.name] ?? '';

      if (field.kind === 'number') {
        const trimmed = raw.trim();
        if (trimmed === '') {
          if (field.optional) continue;
          setError(t('errors.required', { field: t(`fields.${field.name}`) }));
          return;
        }
        const num = Number(trimmed);
        if (Number.isNaN(num)) {
          setError(t('errors.invalidNumber', { field: t(`fields.${field.name}`) }));
          return;
        }
        payload[field.name] = num;
        continue;
      }

      if (field.kind === 'select') {
        if (raw === '') {
          setError(t('errors.required', { field: t(`fields.${field.name}`) }));
          return;
        }
        payload[field.name] = raw;
        continue;
      }

      // 'text'
      if (raw === '' && field.optional) continue;
      payload[field.name] = raw;
    }

    const envelope: CommandEnvelope = {
      action: action.action,
      ...(action.needsCallsign ? { callsign } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    };

    const result = await sendCommand(envelope);
    if ('error' in result && result.error) {
      setError(t('sendFailed'));
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1">
        <span className="text-sm">{t('actionLabel')}</span>
        {/* Action names are protocol identifiers, not user-facing prose —
            not translated, same precedent as the `.wsc` line and ground
            state enum values (see TokenPanel.tsx and
            docs/conventions/i18n.md "What NOT to translate"). */}
        <select
          aria-label={t('actionLabel')}
          className={fieldClassName}
          value={actionKey}
          onChange={(e) => handleActionChange(e.target.value)}
        >
          {GATEWAY_ACTIONS.map((a) => (
            <option key={a.action} value={a.action}>
              {a.action}
            </option>
          ))}
        </select>
      </label>

      {action.needsCallsign && (
        <label className="flex flex-col gap-1">
          <span className="text-sm">{t('callsignLabel')}</span>
          <input
            aria-label={t('callsignLabel')}
            className={fieldClassName}
            value={callsign}
            onChange={(e) => setCallsign(e.target.value)}
          />
        </label>
      )}

      {action.fields.map((field) => {
        if (field.kind === 'altitude-mode') {
          return (
            <div key={field.name} className="flex flex-col gap-2">
              <span className="text-sm">{t('fields.altitude')}</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="altitude-mode"
                  checked={altitudeMode === 'feet'}
                  onChange={() => setAltitudeMode('feet')}
                />
                {t('altitudeMode.feet')}
              </label>
              {altitudeMode === 'feet' && (
                <input
                  aria-label={t('fields.feet')}
                  type="number"
                  className={fieldClassName}
                  value={values.feet ?? ''}
                  onChange={(e) => setFieldValue('feet', e.target.value)}
                />
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="altitude-mode"
                  checked={altitudeMode === 'special'}
                  onChange={() => setAltitudeMode('special')}
                />
                {t('altitudeMode.special')}
              </label>
              {altitudeMode === 'special' && (
                <select
                  aria-label={t('fields.special')}
                  className={fieldClassName}
                  value={values.special ?? ''}
                  onChange={(e) => setFieldValue('special', e.target.value)}
                >
                  <option value="" disabled>
                    {t('selectPlaceholder')}
                  </option>
                  {ALTITUDE_SPECIALS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        }

        if (field.kind === 'select') {
          return (
            <label key={field.name} className="flex flex-col gap-1">
              <span className="text-sm">{t(`fields.${field.name}`)}</span>
              <select
                aria-label={t(`fields.${field.name}`)}
                className={fieldClassName}
                value={values[field.name] ?? ''}
                onChange={(e) => setFieldValue(field.name, e.target.value)}
              >
                <option value="" disabled>
                  {t('selectPlaceholder')}
                </option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        return (
          <label key={field.name} className="flex flex-col gap-1">
            <span className="text-sm">{t(`fields.${field.name}`)}</span>
            <input
              aria-label={t(`fields.${field.name}`)}
              type={field.kind === 'number' ? 'number' : 'text'}
              className={fieldClassName}
              value={values[field.name] ?? ''}
              onChange={(e) => setFieldValue(field.name, e.target.value)}
            />
          </label>
        );
      })}

      {error && <p className="text-accent-danger text-sm">{error}</p>}
      <Button type="submit" disabled={isLoading}>
        {t('send')}
      </Button>
    </form>
  );
}
