'use client';

import { useTranslations } from 'next-intl';
import { useAppDispatch } from '@/shared/store/hooks';
import { RWYINFO } from '../airports';
import { stripsActions } from '../slice';
import type { Bay, BayKind, StripsTab } from '../types';
import { bayDisplayTitle } from './bayTitle';

export interface BayContextMenuProps {
  bay: Bay;
  tab: StripsTab;
  x: number;
  y: number;
  onClose(): void;
  onRename(): void;
}

const ICON_BOX: React.CSSProperties = { width: 24, height: 24, display: 'block', flex: 'none' };

export function BayContextMenu({ bay, tab, x, y, onClose, onRename }: BayContextMenuProps) {
  const t = useTranslations('strips.bayCtx');
  const tBays = useTranslations('strips.bays');
  const dispatch = useAppDispatch();

  const kindLabel = (kind: BayKind) => tBays(`kinds.${kind}`);
  const kindCount = tab.bays.filter((b) => b.kind === bay.kind).length;
  const occupants = tab.strips.filter((s) => s.bay === bay.id).length;
  const locked = !!tab.locks[bay.id];
  const title = bayDisplayTitle(bay, tab, kindLabel);

  function split() {
    // Titles are composed here so they localize: "Runway 03" for the
    // opposite runway end, else "<label> B", retitling the source "A".
    const base = kindLabel(bay.kind);
    const rw = RWYINFO[tab.icao];
    let newTitle: string;
    let sourceTitle: string | undefined;
    if (bay.kind === 'RUNWAY' && rw && kindCount === 1) {
      newTitle = `${base} ${rw.opp}`;
    } else {
      newTitle = `${base} ${String.fromCharCode(65 + kindCount)}`;
      if (kindCount === 1 && bay.title === null) sourceTitle = `${base} A`;
    }
    dispatch(
      stripsActions.baySplit({
        bayId: bay.id,
        newTitle,
        ...(sourceTitle !== undefined ? { sourceTitle } : {}),
      }),
    );
    onClose();
  }

  const items = [
    {
      key: 'rename',
      icon: <obi-edit-google style={ICON_BOX} />,
      label: t('rename'),
      disabled: false,
      danger: false,
      onClick: onRename,
    },
    {
      key: 'split',
      icon: <obi-screen-split-bottom style={ICON_BOX} />,
      label: t('split'),
      disabled: false,
      danger: false,
      onClick: split,
    },
    {
      key: 'lock',
      icon: locked ? (
        <obi-command-available style={ICON_BOX} />
      ) : (
        <obi-command-locked style={ICON_BOX} />
      ),
      label: locked ? t('unlock') : t('lock'),
      disabled: false,
      danger: false,
      onClick: () => {
        dispatch(stripsActions.bayLockToggled(bay.id));
        onClose();
      },
    },
    {
      key: 'remove',
      icon: <obi-delete-filled style={ICON_BOX} />,
      label: t('remove'),
      disabled: kindCount < 2,
      danger: true,
      onClick: () => {
        dispatch(stripsActions.bayRemoved(bay.id));
        onClose();
      },
    },
  ];

  return (
    <div
      data-testid="bay-ctx-menu"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: Math.max(8, Math.min(x, typeof window !== 'undefined' ? window.innerWidth - 296 : x)),
        top: Math.max(8, Math.min(y, typeof window !== 'undefined' ? window.innerHeight - 310 : y)),
        zIndex: 80,
        width: 288,
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
        <span style={{ fontSize: 14, lineHeight: '18px', fontWeight: 670 }}>{title}</span>
        <span style={{ fontSize: 11, lineHeight: '15px', color: 'var(--element-neutral-color)' }}>
          {t('sub', { count: occupants, locked: String(locked) })}
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
            color:
              item.danger && !item.disabled
                ? 'var(--alert-alarm-color)'
                : 'var(--element-active-color)',
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
    </div>
  );
}
