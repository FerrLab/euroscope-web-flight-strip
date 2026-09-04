'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

export interface ModalShellProps {
  title: string;
  /** Callsign (or other identity) shown at the right of the title bar. */
  identity?: string;
  width: number;
  onClose(): void;
  children: ReactNode;
  buttons: ReactNode;
}

export function ModalShell({
  title,
  identity,
  width,
  onClose,
  children,
  buttons,
}: ModalShellProps) {
  const t = useTranslations('strips.modals');
  return (
    <div
      data-testid="strips-modal"
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fscFadeIn 140ms ease',
      }}
    >
      <div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          background: 'var(--container-global-color)',
          border: '1px solid var(--border-outline-color)',
          boxShadow: 'var(--shadow-overlay)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 12px 12px 20px',
            borderBottom: '1px solid var(--border-divider-color)',
          }}
        >
          <span
            style={{
              fontSize: 12,
              lineHeight: '16px',
              fontWeight: 670,
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              color: 'var(--element-neutral-color)',
              flex: 1,
            }}
          >
            {title}
          </span>
          {identity && (
            <span
              style={{
                fontSize: 16,
                lineHeight: '22px',
                fontWeight: 670,
                fontFeatureSettings: "'tnum' 1",
              }}
            >
              {identity}
            </span>
          )}
          <button
            type="button"
            aria-label={t('close')}
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--element-neutral-color)',
              padding: 0,
            }}
          >
            <span style={{ width: 20, height: 20, display: 'block' }}>
              <obi-close-google style={{ width: 20, height: 20, display: 'block' }} />
            </span>
          </button>
        </div>
        {children}
        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px 16px' }}
        >
          {buttons}
        </div>
      </div>
    </div>
  );
}
