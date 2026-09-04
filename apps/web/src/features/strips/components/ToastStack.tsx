'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAppDispatch, useAppSelector } from '@/shared/store/hooks';
import { stripsActions } from '../slice';
import type { BayKind, ToastKind } from '../types';
import { bayDisplayTitle } from './bayTitle';

const TOAST_LIFETIME_MS = 5600;

const KIND_STYLE: Record<ToastKind, { color: string; border: string }> = {
  info: {
    color: 'var(--instrument-enhanced-secondary-dif-color)',
    border: 'var(--border-outline-color)',
  },
  ok: { color: 'var(--alert-success-color)', border: 'var(--border-outline-color)' },
  caution: { color: 'var(--alert-caution-color)', border: 'var(--alert-caution-color)' },
  alarm: { color: 'var(--alert-alarm-color)', border: 'var(--alert-alarm-color)' },
};

function ToastIcon({ kind }: { kind: ToastKind }) {
  const style: React.CSSProperties = { width: 22, height: 22, display: 'block' };
  if (kind === 'ok') return <obi-check-google style={style} />;
  if (kind === 'caution') return <obi-caution-google style={style} />;
  if (kind === 'alarm') return <obi-not-allowed style={style} />;
  return <obi-com-message-google style={style} />;
}

export function ToastStack() {
  const t = useTranslations('strips');
  const dispatch = useAppDispatch();
  const toasts = useAppSelector((s) => s.strips.toasts);
  const tab = useAppSelector((s) => s.strips.tabs[s.strips.activeTab]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    for (const toast of toasts) {
      if (!timers.current.has(toast.id)) {
        timers.current.set(
          toast.id,
          setTimeout(() => {
            timers.current.delete(toast.id);
            dispatch(stripsActions.toastDismissed(toast.id));
          }, TOAST_LIFETIME_MS),
        );
      }
    }
  }, [toasts, dispatch]);

  useEffect(() => {
    const held = timers.current;
    return () => {
      held.forEach(clearTimeout);
      held.clear();
    };
  }, []);

  function resolveParams(params: Record<string, string | number>): Record<string, string | number> {
    const resolved = { ...params };
    if (typeof resolved.bay === 'string' && tab) {
      const bay = tab.bays.find((b) => b.id === resolved.bay);
      if (bay) {
        resolved.bay = bayDisplayTitle(bay, tab, (kind: BayKind) => t(`bays.kinds.${kind}`));
      }
    }
    return resolved;
  }

  if (toasts.length === 0) return null;

  return (
    <div
      data-testid="toast-stack"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: 336,
      }}
    >
      {toasts.map((toast) => {
        const style = KIND_STYLE[toast.kind];
        const params = resolveParams(toast.params);
        return (
          <div
            key={toast.id}
            style={{
              display: 'flex',
              gap: 10,
              padding: '10px 12px',
              background: 'var(--container-global-color)',
              border: `1px solid ${style.border}`,
              boxShadow: 'var(--shadow-floating)',
              animation: 'fscToastIn 160ms ease',
            }}
          >
            <span
              style={{ width: 22, height: 22, flex: 'none', display: 'block', color: style.color }}
            >
              <ToastIcon kind={toast.kind} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, lineHeight: '17px', fontWeight: 670 }}>
                {t(`toasts.${toast.key}.title`, params)}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: '17px',
                  color: 'var(--element-neutral-color)',
                  marginTop: 1,
                }}
              >
                {t(`toasts.${toast.key}.text`, params)}
              </div>
            </div>
            <button
              type="button"
              aria-label={t('modals.close')}
              onClick={() => dispatch(stripsActions.toastDismissed(toast.id))}
              style={{
                width: 24,
                height: 24,
                flex: 'none',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--element-inactive-color)',
                padding: 0,
              }}
            >
              <span style={{ width: 18, height: 18, display: 'block', margin: '0 auto' }}>
                <obi-close-google style={{ width: 18, height: 18, display: 'block' }} />
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
