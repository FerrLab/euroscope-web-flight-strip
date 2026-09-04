'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcTextInputField } from '@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field';
import { ObcNumberInputField } from '@oicl/openbridge-webcomponents-react/components/number-input-field/number-input-field';
import { ObcDropdownButton } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import type { ObcDropdownButtonChangeEvent } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import { useDropdownAriaLabel } from '@/shared/openbridge/useDropdownAriaLabel';
import { readInputValue } from '@/shared/openbridge/readInputValue';
import type { CommandEnvelope } from '../schema';
import { useSendCommandMutation } from '../api';
import { GATEWAY_ACTIONS, ALTITUDE_SPECIALS, type ActionDef } from '../actions';

type AltitudeMode = 'feet' | 'special';

export function StructuredComposer() {
  const t = useTranslations('gateway.console.structured');
  const [actionKey, setActionKey] = useState<string>(GATEWAY_ACTIONS[0].action);
  const [callsign, setCallsign] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [altitudeMode, setAltitudeMode] = useState<AltitudeMode>('feet');
  const [error, setError] = useState<string | null>(null);
  const [sendCommand, { isLoading }] = useSendCommandMutation();
  const formRef = useRef<HTMLFormElement>(null);

  const action = GATEWAY_ACTIONS.find((a) => a.action === actionKey) as ActionDef;

  const actionAriaRef = useDropdownAriaLabel(t('actionLabel'));
  const specialAriaRef = useDropdownAriaLabel(t('fields.special'));

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
          // ObcDropdownButton always shows a real selection (it defaults to
          // the first option, never a blank state) — mirror that default
          // here so an untouched dropdown validates the same value the UI
          // is actually showing, rather than reading stale empty state.
          const special = (values.special ?? ALTITUDE_SPECIALS[0]).trim();
          payload.special = special;
        }
        continue;
      }

      if (field.kind === 'select') {
        const options = field.options ?? [];
        const raw = values[field.name] ?? options[0] ?? '';
        payload[field.name] = raw;
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

      // 'text' (the 'select' and 'altitude-mode' kinds are both handled
      // above and always `continue` before reaching here)
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
    <form ref={formRef} className="flex flex-col gap-3" onSubmit={handleSubmit}>
      {/* Action names are protocol identifiers, not user-facing prose —
          not translated, same precedent as the `.lpc` line and ground
          state enum values (see lpcConfig.ts and
          docs/conventions/i18n.md "What NOT to translate"). */}
      <ObcDropdownButton
        ref={actionAriaRef}
        value={actionKey}
        onDropdownChange={(e: ObcDropdownButtonChangeEvent) => handleActionChange(e.detail.value)}
        options={GATEWAY_ACTIONS.map((a) => ({ value: a.action, label: a.action }))}
      />

      {action.needsCallsign && (
        <ObcTextInputField
          label={t('callsignLabel')}
          value={callsign}
          onInput={(e: Event) => setCallsign(readInputValue(e))}
        />
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
                <ObcNumberInputField
                  label={t('fields.feet')}
                  value={values.feet ?? ''}
                  onInput={(e: Event) => setFieldValue('feet', readInputValue(e))}
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
                <ObcDropdownButton
                  ref={specialAriaRef}
                  value={values.special ?? ALTITUDE_SPECIALS[0]}
                  onDropdownChange={(e: ObcDropdownButtonChangeEvent) =>
                    setFieldValue('special', e.detail.value)
                  }
                  options={ALTITUDE_SPECIALS.map((opt) => ({ value: opt, label: opt }))}
                />
              )}
            </div>
          );
        }

        if (field.kind === 'select') {
          const options = field.options ?? [];
          return (
            <SelectField
              key={field.name}
              label={t(`fields.${field.name}`)}
              value={values[field.name] ?? options[0]}
              options={options}
              onChange={(next) => setFieldValue(field.name, next)}
            />
          );
        }

        const InputComponent = field.kind === 'number' ? ObcNumberInputField : ObcTextInputField;
        return (
          <InputComponent
            key={field.name}
            label={t(`fields.${field.name}`)}
            value={values[field.name] ?? ''}
            onInput={(e: Event) => setFieldValue(field.name, readInputValue(e))}
          />
        );
      })}

      {error && <p className="text-accent-danger text-sm">{error}</p>}
      <ObcButton disabled={isLoading} onClick={() => formRef.current?.requestSubmit()}>
        {t('send')}
      </ObcButton>
    </form>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
}) {
  const ariaRef = useDropdownAriaLabel(label);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm">{label}</span>
      <ObcDropdownButton
        ref={ariaRef}
        value={value}
        onDropdownChange={(e: ObcDropdownButtonChangeEvent) => onChange(e.detail.value)}
        options={options.map((opt) => ({ value: opt, label: opt }))}
      />
    </div>
  );
}
