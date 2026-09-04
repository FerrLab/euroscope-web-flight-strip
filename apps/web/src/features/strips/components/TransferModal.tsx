'use client';

import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ButtonVariant } from '@oicl/openbridge-webcomponents/dist/components/button/button.js';
import type { Station } from '../airports';
import type { Strip } from '../types';
import { ModalShell } from './ModalShell';

export function TransferModal({
  strip,
  stations,
  onTransfer,
  onCancelPending,
  onClose,
}: {
  strip: Strip;
  /** Live session controllers when connected, else the static roster. */
  stations: Station[];
  onTransfer(stationCs: string): void;
  onCancelPending(): void;
  onClose(): void;
}) {
  const t = useTranslations('strips.modals');
  const pending = strip.xfr?.state === 'PENDING';

  return (
    <ModalShell
      title={t('xfr.title')}
      identity={strip.cs}
      width={500}
      onClose={onClose}
      buttons={
        <ObcButton variant={ButtonVariant.flat} onClick={onClose}>
          {t('close')}
        </ObcButton>
      }
    >
      <div style={{ padding: '12px 12px 4px' }}>
        {pending && strip.xfr && (
          <button
            type="button"
            onClick={onCancelPending}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              width: '100%',
              minHeight: 56,
              boxSizing: 'border-box',
              padding: '10px 14px',
              marginBottom: 10,
              background: 'transparent',
              border: '1px solid var(--alert-alarm-color)',
              color: 'var(--alert-alarm-color)',
              fontSize: 16,
              lineHeight: '22px',
              fontWeight: 570,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ width: 24, height: 24, display: 'block', flex: 'none' }}>
              <obi-not-allowed style={{ width: 24, height: 24, display: 'block' }} />
            </span>
            <span style={{ flex: 1 }}>{t('xfr.cancelPending', { to: strip.xfr.to })}</span>
          </button>
        )}
        {stations.map((station) => {
          const active = pending && strip.xfr?.to === station.cs;
          return (
            <button
              key={station.cs}
              type="button"
              onClick={() => onTransfer(station.cs)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                minHeight: 64,
                boxSizing: 'border-box',
                padding: '10px 14px',
                marginBottom: 8,
                background: active ? 'var(--selected-enabled-background-color)' : 'transparent',
                border: `1px solid ${active ? 'var(--selected-enabled-border-color)' : 'var(--border-outline-color)'}`,
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--element-active-color)',
              }}
            >
              <span
                className="rounded-full"
                style={{
                  width: 10,
                  height: 10,
                  background: 'var(--alert-success-color)',
                  flex: 'none',
                }}
              />
              <span
                style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}
              >
                <span
                  style={{
                    fontSize: 18,
                    lineHeight: '24px',
                    fontWeight: 670,
                    letterSpacing: '0.4px',
                    fontFeatureSettings: "'tnum' 1, 'ss04' 1",
                  }}
                >
                  {station.cs}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    lineHeight: '17px',
                    color: 'var(--element-neutral-color)',
                  }}
                >
                  {station.role}
                </span>
              </span>
              <span
                style={{
                  fontSize: 16,
                  lineHeight: '22px',
                  fontWeight: 570,
                  color: 'var(--element-neutral-color)',
                  fontFeatureSettings: "'tnum' 1",
                  flex: 'none',
                }}
              >
                {station.freq}
              </span>
              <span
                style={{
                  width: 24,
                  height: 24,
                  display: 'block',
                  flex: 'none',
                  color: 'var(--element-neutral-color)',
                }}
              >
                <obi-arrow-right-google style={{ width: 24, height: 24, display: 'block' }} />
              </span>
            </button>
          );
        })}
        <div
          style={{
            fontSize: 12,
            lineHeight: '16px',
            color: 'var(--element-inactive-color)',
            padding: '4px 4px 6px',
          }}
        >
          {t('xfr.note')}
        </div>
      </div>
    </ModalShell>
  );
}
