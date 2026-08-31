'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ButtonVariant } from '@oicl/openbridge-webcomponents/dist/components/button/button.js';
import { useAppDispatch } from '@/shared/store/hooks';
import { fplDraftOf, type FplDraft } from '../fpl';
import { stripsActions } from '../slice';
import type { Strip } from '../types';
import { ModalShell } from './ModalShell';

type FieldKind = 'input' | 'select' | 'area';

interface FieldDef {
  key: keyof FplDraft;
  /** ICAO item number shown before the label (empty for ATC fields). */
  item: string;
  span: number;
  kind?: FieldKind;
  rows?: number;
  options?: string[];
  optionsNs?: 'rules' | 'ftypes' | 'wakes';
  disabled?: boolean;
}

const ICAO_FIELDS: FieldDef[] = [
  { key: 'ident', item: '7', span: 4, disabled: true },
  {
    key: 'rules',
    item: '8',
    span: 4,
    kind: 'select',
    options: ['I', 'V', 'Y', 'Z'],
    optionsNs: 'rules',
  },
  {
    key: 'ftype',
    item: '8',
    span: 4,
    kind: 'select',
    options: ['S', 'N', 'G', 'M', 'X'],
    optionsNs: 'ftypes',
  },
  { key: 'num', item: '9', span: 2 },
  { key: 'actype', item: '9', span: 3 },
  {
    key: 'wake',
    item: '9',
    span: 2,
    kind: 'select',
    options: ['L', 'M', 'H', 'J'],
    optionsNs: 'wakes',
  },
  { key: 'equip', item: '10', span: 5 },
  { key: 'adep', item: '13', span: 4 },
  { key: 'eobt', item: '13', span: 2 },
  { key: 'tas', item: '15', span: 3 },
  { key: 'rfl', item: '15', span: 3 },
  { key: 'route', item: '15', span: 12, kind: 'area', rows: 2 },
  { key: 'ades', item: '16', span: 4 },
  { key: 'eet', item: '16', span: 2 },
  { key: 'altn', item: '16', span: 3 },
  { key: 'altn2', item: '16', span: 3 },
  { key: 'other', item: '18', span: 12, kind: 'area', rows: 2 },
];

const ATC_FIELDS: FieldDef[] = [
  { key: 'sqkA', item: '', span: 3 },
  { key: 'proc', item: '', span: 3 },
  { key: 'rwy', item: '', span: 2 },
  { key: 'cfl', item: '', span: 2 },
  { key: 'gate', item: '', span: 2 },
  { key: 'freeText', item: '', span: 12 },
];

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  fontSize: 14,
  lineHeight: '19px',
  padding: '6px 9px',
  background: 'var(--indent-enabled-background-color)',
  border: '1px solid var(--indent-enabled-border-color)',
  color: 'var(--element-active-color)',
  fontFeatureSettings: "'tnum' 1, 'ss04' 1",
};

export function FplModal({ strip, onClose }: { strip: Strip; onClose(): void }) {
  const t = useTranslations('strips.modals');
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<FplDraft>(() => fplDraftOf(strip));

  function set<K extends keyof FplDraft>(key: K, value: FplDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function renderField(field: FieldDef) {
    const value = draft[field.key];
    const itemPrefix = field.item ? `${field.item} ` : '';
    return (
      <label
        key={field.key}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          gridColumn: `span ${field.span}`,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            lineHeight: '13px',
            letterSpacing: '0.5px',
            color: 'var(--element-inactive-color)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {field.item && (
            <span
              style={{ color: 'var(--instrument-enhanced-secondary-dif-color)', fontWeight: 670 }}
            >
              {itemPrefix}
            </span>
          )}
          {t(`fpl.fields.${field.key}`)}
        </span>
        {field.kind === 'select' ? (
          <select
            value={value}
            onChange={(e) => set(field.key, e.target.value)}
            style={{ ...INPUT_STYLE, padding: '6px 6px', height: 33, fontFamily: 'inherit' }}
          >
            {(field.options ?? []).map((opt) => {
              const optionLabel = `${opt} — ${t(`fpl.${field.optionsNs}.${opt}`)}`;
              return (
                <option key={opt} value={opt}>
                  {optionLabel}
                </option>
              );
            })}
          </select>
        ) : field.kind === 'area' ? (
          <textarea
            value={value}
            rows={field.rows ?? 2}
            onChange={(e) => set(field.key, e.target.value)}
            style={{
              ...INPUT_STYLE,
              resize: 'vertical',
              fontSize: 13.5,
              fontFamily: 'inherit',
              letterSpacing: '0.2px',
            }}
          />
        ) : (
          <input
            value={value}
            disabled={field.disabled}
            onChange={(e) => set(field.key, e.target.value)}
            style={{ ...INPUT_STYLE, opacity: field.disabled ? 0.55 : 1 }}
          />
        )}
      </label>
    );
  }

  function renderSection(title: string, fields: FieldDef[]) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span
            style={{
              fontSize: 11,
              lineHeight: '14px',
              fontWeight: 670,
              letterSpacing: '0.8px',
              color: 'var(--element-neutral-color)',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
          <span style={{ flex: 1, height: 1, background: 'var(--border-divider-color)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 10 }}>
          {fields.map(renderField)}
        </div>
      </div>
    );
  }

  return (
    <ModalShell
      title={t('fpl.title')}
      identity={strip.cs}
      width={760}
      onClose={onClose}
      buttons={
        <>
          <ObcButton variant={ButtonVariant.flat} onClick={onClose}>
            {t('cancel')}
          </ObcButton>
          <ObcButton
            variant={ButtonVariant.normal}
            onClick={() => {
              dispatch(stripsActions.fplApplied({ stripId: strip.id, draft }));
              onClose();
            }}
          >
            {t('fpl.apply')}
          </ObcButton>
        </>
      }
    >
      <div style={{ padding: '16px 20px 4px' }}>
        {renderSection(t('fpl.icaoSection'), ICAO_FIELDS)}
        {renderSection(t('fpl.atcSection'), ATC_FIELDS)}
        <div
          style={{
            fontSize: 12,
            lineHeight: '16px',
            color: 'var(--element-inactive-color)',
            marginTop: 2,
          }}
        >
          {t('fpl.note')}
        </div>
      </div>
    </ModalShell>
  );
}
