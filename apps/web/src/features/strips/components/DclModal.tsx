'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ButtonVariant } from '@oicl/openbridge-webcomponents/dist/components/button/button.js';
import { dclTextFor } from '../fpl';
import type { Metar, Strip } from '../types';
import { ModalShell } from './ModalShell';

function utcNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function DclModal({
  strip,
  metar,
  onSend,
  onClose,
}: {
  strip: Strip;
  metar: Metar;
  onSend(remark: string): void;
  onClose(): void;
}) {
  const t = useTranslations('strips.modals');
  const [remark, setRemark] = useState('');

  const status =
    strip.dcl === 'ACK'
      ? { label: t('dcl.statusAck'), color: 'var(--alert-success-color)' }
      : strip.dcl === 'SENT'
        ? { label: t('dcl.statusSent'), color: 'var(--instrument-enhanced-secondary-dif-color)' }
        : { label: t('dcl.statusNone'), color: 'var(--element-inactive-color)' };

  return (
    <ModalShell
      title={t('dcl.title')}
      identity={strip.cs}
      width={560}
      onClose={onClose}
      buttons={
        <>
          <ObcButton variant={ButtonVariant.flat} onClick={onClose}>
            {t('close')}
          </ObcButton>
          <ObcButton variant={ButtonVariant.raised} onClick={() => onSend(remark)}>
            {strip.dcl === 'NONE' ? t('dcl.send') : t('dcl.resend')}
          </ObcButton>
        </>
      }
    >
      <div style={{ padding: '16px 20px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span
            style={{
              fontSize: 11,
              lineHeight: '14px',
              letterSpacing: '0.5px',
              color: 'var(--element-neutral-color)',
              textTransform: 'uppercase',
              flex: 1,
            }}
          >
            {t('dcl.header')}
          </span>
          <span
            data-testid="dcl-status"
            style={{
              fontSize: 11,
              lineHeight: '15px',
              fontWeight: 670,
              letterSpacing: '0.5px',
              color: status.color,
              border: `1px solid ${status.color}`,
              padding: '2px 8px',
              whiteSpace: 'nowrap',
            }}
          >
            {status.label}
          </span>
        </div>
        <div
          data-testid="dcl-text"
          style={{
            background: 'var(--container-section-color)',
            border: '1px solid var(--border-outline-color)',
            padding: '12px 14px',
            fontSize: 13.5,
            lineHeight: '20px',
            fontFeatureSettings: "'tnum' 1, 'ss04' 1",
            whiteSpace: 'pre-wrap',
            letterSpacing: '0.2px',
          }}
        >
          {dclTextFor(strip, metar, remark, utcNow())}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
          <span
            style={{
              fontSize: 11,
              lineHeight: '14px',
              letterSpacing: '0.5px',
              color: 'var(--element-neutral-color)',
              textTransform: 'uppercase',
            }}
          >
            {t('dcl.remarkLabel')}
          </span>
          <input
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder={t('dcl.remarkPlaceholder')}
            style={{
              width: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
              fontSize: 14,
              lineHeight: '20px',
              padding: '7px 10px',
              background: 'var(--indent-enabled-background-color)',
              border: '1px solid var(--indent-enabled-border-color)',
              color: 'var(--element-active-color)',
            }}
          />
        </label>
        <div
          style={{
            fontSize: 12,
            lineHeight: '16px',
            color: 'var(--element-inactive-color)',
            marginTop: 10,
          }}
        >
          {t('dcl.note')}
        </div>
      </div>
    </ModalShell>
  );
}
