'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ButtonVariant } from '@oicl/openbridge-webcomponents/dist/components/button/button.js';
import { useAppDispatch, useAppSelector } from '@/shared/store/hooks';
import { AIRPORTS } from '../airports';
import { stripsActions } from '../slice';
import { ModalShell } from './ModalShell';

const ICAO_RE = /^[A-Za-z]{4}$/;

/** SBGR_TWR → SBGR; anything without a 4-letter prefix is skipped. */
function icaoOfStation(cs: string): string | null {
  const prefix = cs.split('_')[0] ?? '';
  return ICAO_RE.test(prefix) ? prefix.toUpperCase() : null;
}

export function AddAirportModal({ onClose }: { onClose(): void }) {
  const t = useTranslations('strips.modals');
  const dispatch = useAppDispatch();
  const tabsOrder = useAppSelector((s) => s.strips.tabsOrder);
  const controllers = useAppSelector((s) => s.strips.controllers);
  const seenAirports = useAppSelector((s) => s.strips.seenAirports);
  const [icaoInput, setIcaoInput] = useState('');

  const staticEntries = Object.keys(AIRPORTS)
    .filter((icao) => !tabsOrder.includes(icao))
    .map((icao) => ({
      icao,
      label: t('addTab.name', { name: AIRPORTS[icao].name, pos: AIRPORTS[icao].pos }),
    }));

  // Airports the live session implies: every origin/destination the
  // flights mention, plus controller callsign prefixes.
  const sessionEntries = [
    ...new Set([
      ...seenAirports,
      ...controllers.map((c) => icaoOfStation(c.cs)).filter((x): x is string => !!x),
    ]),
  ]
    .sort()
    .filter((icao) => !tabsOrder.includes(icao) && !AIRPORTS[icao])
    .map((icao) => ({ icao, label: t('addTab.fromSession') }));

  const entries = [...sessionEntries, ...staticEntries];
  const icaoValid = ICAO_RE.test(icaoInput.trim());

  function openIcao() {
    if (!icaoValid) return;
    dispatch(stripsActions.airportOpened(icaoInput.trim().toUpperCase()));
    onClose();
  }

  return (
    <ModalShell
      title={t('addTab.title')}
      width={480}
      onClose={onClose}
      buttons={
        <ObcButton variant={ButtonVariant.flat} onClick={onClose}>
          {t('close')}
        </ObcButton>
      }
    >
      <div style={{ padding: '12px 12px 4px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            padding: '4px 10px 14px',
            borderBottom: '1px solid var(--border-divider-color)',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <span
              style={{
                fontSize: 11,
                lineHeight: '14px',
                letterSpacing: '0.5px',
                color: 'var(--element-neutral-color)',
                textTransform: 'uppercase',
              }}
            >
              {t('addTab.custom')}
            </span>
            <input
              data-testid="addtab-icao-input"
              value={icaoInput}
              onChange={(e) => setIcaoInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openIcao();
              }}
              placeholder={t('addTab.customPlaceholder')}
              maxLength={4}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontSize: 16,
                lineHeight: '22px',
                fontWeight: 670,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                padding: '7px 10px',
                background: 'var(--indent-enabled-background-color)',
                border: '1px solid var(--indent-enabled-border-color)',
                color: 'var(--element-active-color)',
              }}
            />
          </label>
          <span data-testid="addtab-icao-open-wrap">
            <ObcButton
              data-testid="addtab-icao-open"
              variant={ButtonVariant.normal}
              disabled={!icaoValid}
              onClick={openIcao}
            >
              {t('addTab.open')}
            </ObcButton>
          </span>
        </div>
        {entries.map((entry) => (
          <div
            key={entry.icao}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 10px',
              borderBottom: '1px solid var(--border-divider-color)',
            }}
          >
            <span
              style={{
                fontSize: 16,
                lineHeight: '22px',
                fontWeight: 670,
                letterSpacing: '0.5px',
                width: 56,
              }}
            >
              {entry.icao}
            </span>
            <span
              style={{
                fontSize: 13,
                lineHeight: '18px',
                color: 'var(--element-neutral-color)',
                flex: 1,
              }}
            >
              {entry.label}
            </span>
            <ObcButton
              variant={ButtonVariant.normal}
              onClick={() => {
                dispatch(stripsActions.airportOpened(entry.icao));
                onClose();
              }}
            >
              {t('addTab.open')}
            </ObcButton>
          </div>
        ))}
        <div
          style={{
            fontSize: 12,
            lineHeight: '16px',
            color: 'var(--element-inactive-color)',
            padding: '10px 10px 6px',
          }}
        >
          {t('addTab.note')}
        </div>
      </div>
    </ModalShell>
  );
}
