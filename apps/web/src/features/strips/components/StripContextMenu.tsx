'use client';

import { useTranslations } from 'next-intl';
import { useAppDispatch } from '@/shared/store/hooks';
import { stripsActions } from '../slice';
import type { BayKind, Strip, StripsTab } from '../types';
import { bayDisplayTitle } from './bayTitle';

interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  danger?: boolean;
  onClick(): void;
}

export interface StripContextMenuProps {
  strip: Strip;
  tab: StripsTab;
  x: number;
  y: number;
  onClose(): void;
  onOpenFpl(): void;
  onOpenDcl(): void;
  onOpenXfr(): void;
  onOpenConfirm(): void;
}

const ICON_BOX: React.CSSProperties = { width: 24, height: 24, display: 'block', flex: 'none' };

export function StripContextMenu({
  strip,
  tab,
  x,
  y,
  onClose,
  onOpenFpl,
  onOpenDcl,
  onOpenXfr,
  onOpenConfirm,
}: StripContextMenuProps) {
  const t = useTranslations('strips.ctx');
  const tBays = useTranslations('strips.bays');
  const dispatch = useAppDispatch();

  const items: MenuItem[] = [
    ...(strip.xfr?.state === 'PENDING'
      ? [
          {
            key: 'cancelHandoff',
            icon: <obi-not-allowed style={ICON_BOX} />,
            label: t('cancelHandoff', { to: strip.xfr.to }),
            disabled: false,
            onClick: () => {
              dispatch(stripsActions.transferCancelled(strip.id));
              onClose();
            },
          },
        ]
      : []),
    {
      key: 'issueClearance',
      icon: <obi-check-google style={ICON_BOX} />,
      label: t('issueClearance'),
      disabled: strip.cleared || strip.dir === 'ARR',
      onClick: () => {
        dispatch(stripsActions.clearanceIssued(strip.id));
        onClose();
      },
    },
    {
      key: 'pdc',
      icon: <obi-com-message-google style={ICON_BOX} />,
      label: t('pdc'),
      disabled: strip.dir === 'ARR',
      onClick: onOpenDcl,
    },
    {
      key: 'transfer',
      icon: <obi-arrow-bidirectional-horizontal style={ICON_BOX} />,
      label: t('transfer'),
      disabled: false,
      onClick: onOpenXfr,
    },
    {
      key: 'editFpl',
      icon: <obi-edit-google style={ICON_BOX} />,
      label: t('editFpl'),
      disabled: false,
      onClick: onOpenFpl,
    },
    {
      key: 'archive',
      icon: <obi-history-google style={ICON_BOX} />,
      label: t('archive'),
      disabled: false,
      onClick: () => {
        dispatch(stripsActions.stripArchived({ stripId: strip.id }));
        onClose();
      },
    },
    {
      key: 'delete',
      icon: <obi-delete-filled style={ICON_BOX} />,
      label: t('delete'),
      disabled: false,
      danger: true,
      onClick: onOpenConfirm,
    },
  ];

  const kindLabel = (kind: BayKind) => tBays(`kinds.${kind}`);

  return (
    <div
      data-testid="strip-ctx-menu"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: Math.max(8, Math.min(x, typeof window !== 'undefined' ? window.innerWidth - 324 : x)),
        top: Math.max(8, Math.min(y, typeof window !== 'undefined' ? window.innerHeight - 560 : y)),
        zIndex: 80,
        width: 312,
        background: 'var(--container-global-color)',
        border: '1px solid var(--border-outline-color)',
        boxShadow: 'var(--shadow-floating)',
        padding: 4,
        animation: 'fscFadeIn 100ms ease',
      }}
    >
      <div
        style={{
          padding: '8px 12px 6px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          borderBottom: '1px solid var(--border-divider-color)',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 14,
            lineHeight: '18px',
            fontWeight: 670,
            fontFeatureSettings: "'tnum' 1",
          }}
        >
          {strip.cs}
        </span>
        <span style={{ fontSize: 11, lineHeight: '15px', color: 'var(--element-neutral-color)' }}>
          {t('sub', { adep: strip.adep, ades: strip.ades, type: strip.type })}
        </span>
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          disabled={item.disabled}
          onClick={item.disabled ? undefined : item.onClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            minHeight: 48,
            padding: '10px 14px',
            boxSizing: 'border-box',
            background: 'transparent',
            border: 'none',
            cursor: item.disabled ? 'default' : 'pointer',
            color: item.danger ? 'var(--alert-alarm-color)' : 'var(--element-active-color)',
            fontSize: 16,
            lineHeight: '24px',
            textAlign: 'left',
            opacity: item.disabled ? 0.4 : 1,
          }}
        >
          <span style={ICON_BOX}>{item.icon}</span>
          <span style={{ flex: 1 }}>{item.label}</span>
        </button>
      ))}
      <div
        style={{
          borderTop: '1px solid var(--border-divider-color)',
          marginTop: 4,
          padding: '10px 12px 8px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            lineHeight: '14px',
            letterSpacing: '0.6px',
            color: 'var(--element-inactive-color)',
            marginBottom: 8,
          }}
        >
          {t('moveTo')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {tab.bays.map((bay) => {
            const active = strip.bay === bay.id;
            return (
              <button
                key={bay.id}
                type="button"
                onClick={() => {
                  dispatch(
                    stripsActions.stripMoved({ stripId: strip.id, bayId: bay.id, source: 'menu' }),
                  );
                  onClose();
                }}
                style={{
                  minHeight: 44,
                  boxSizing: 'border-box',
                  fontSize: 13,
                  lineHeight: '17px',
                  fontWeight: 570,
                  letterSpacing: '0.3px',
                  padding: '6px 10px',
                  background: active ? 'var(--selected-enabled-background-color)' : 'transparent',
                  border: '1px solid var(--border-outline-color)',
                  color: active
                    ? 'var(--on-selected-active-color)'
                    : 'var(--element-neutral-color)',
                  cursor: 'pointer',
                  overflow: 'hidden',
                }}
              >
                {bayDisplayTitle(bay, tab, kindLabel)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
