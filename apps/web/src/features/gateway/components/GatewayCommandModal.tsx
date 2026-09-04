'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ButtonVariant } from '@oicl/openbridge-webcomponents/dist/components/button/button.js';
import { IconButtonVariant } from '@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js';
import { ObcIconButton } from '@oicl/openbridge-webcomponents-react/components/icon-button/icon-button';
import { ObiCloseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-close-google';
import { ObiCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-check-google';

const COPIED_RESET_MS = 2_000;

export interface GatewayCommandModalProps {
  /** The full `.lpc gateway config …` line to hand the controller. */
  commandLine: string;
  onClose(): void;
}

/**
 * Reveals the freshly minted gateway command line.
 *
 * The backend hands the token secret over exactly once, so this modal
 * deliberately has no backdrop-click dismissal — only the explicit Close
 * button and the title-bar X — to keep a stray click from destroying a
 * secret that cannot be re-read.
 */
export function GatewayCommandModal({ commandLine, onClose }: GatewayCommandModalProps) {
  const t = useTranslations('gateway.dashboard.command');
  const tCommon = useTranslations('common');
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(commandLine);
    } catch {
      // A denied clipboard permission still leaves the line selectable
      // on screen, so there is nothing to report to the controller.
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  return (
    <div
      data-testid="gateway-command-modal"
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.45)',
        padding: 32,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        style={{
          width: 840,
          maxWidth: '100%',
          border: '1px solid var(--border-outline-color)',
          background: 'var(--container-global-color)',
          boxShadow: 'var(--shadow-overlay)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            height: 48,
            borderBottom: '1px solid var(--border-outline-color)',
          }}
        >
          <div />
          <div
            style={{
              fontSize: 12,
              lineHeight: '16px',
              fontWeight: 670,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              color: 'var(--element-neutral-color)',
            }}
          >
            {t('title')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 4 }}>
            <ObcIconButton
              data-testid="gateway-command-close"
              variant={IconButtonVariant.flat}
              aria-label={tCommon('close')}
              onClick={onClose}
            >
              <ObiCloseGoogle />
            </ObcIconButton>
          </div>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p
            style={{
              margin: 0,
              fontSize: 16,
              lineHeight: '24px',
              color: 'var(--element-active-color)',
            }}
          >
            {t('hint')}
          </p>
          <div
            data-testid="gateway-command-line"
            style={{
              padding: 16,
              border: '1px solid var(--border-outline-color)',
              background: 'var(--container-backdrop-color)',
              fontFamily: 'var(--ff-mono)',
              fontSize: 16,
              lineHeight: '24px',
              wordBreak: 'break-all',
              userSelect: 'all',
              color: 'var(--element-active-color)',
            }}
          >
            {commandLine}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <ObcButton variant={ButtonVariant.normal} onClick={onClose}>
              {tCommon('close')}
            </ObcButton>
            <ObcButton variant={ButtonVariant.raised} onClick={() => void copy()}>
              {copied && (
                <span slot="leading-icon">
                  <ObiCheckGoogle />
                </span>
              )}
              {copied ? t('copied') : t('copy')}
            </ObcButton>
          </div>
        </div>
      </div>
    </div>
  );
}
