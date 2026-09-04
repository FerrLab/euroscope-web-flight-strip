'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ButtonVariant } from '@oicl/openbridge-webcomponents/dist/components/button/button.js';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
import { ObcSequenceLoadingSpinner } from '@oicl/openbridge-webcomponents-react/components/sequence-loading-spinner/sequence-loading-spinner';
import { useRotateTokenMutation, useTokenStatusQuery } from '../api';
import { lpcConfigLine } from '../lpcConfig';
import { DashboardRow, DashboardValue } from './DashboardRow';
import { GatewayCommandModal } from './GatewayCommandModal';

type Phase = 'idle' | 'confirming';

/**
 * Token lifecycle in one card: what the controller has now, and the
 * two-step rotate that guards against knocking a live plugin offline.
 * A minted secret leaves through the command modal — it is never parked
 * in this card, because the backend only ever hands it over once.
 */
export function ConnectionSettingsCard() {
  const t = useTranslations('gateway.dashboard');
  const tToken = useTranslations('gateway.token');
  const { data, isLoading } = useTokenStatusQuery();
  const [rotateToken, { isLoading: isRotating }] = useRotateTokenMutation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [commandLine, setCommandLine] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const exists = data?.exists ?? false;

  async function rotate() {
    setPhase('idle');
    setFailed(false);
    const result = await rotateToken();
    if ('error' in result && result.error) {
      setFailed(true);
    } else if (result.data) {
      setCommandLine(lpcConfigLine(result.data.token));
    }
  }

  return (
    <>
      <ObcCard>
        <span slot="title" style={{ textTransform: 'uppercase' }}>
          {t('connectionSettings')}
        </span>
        <div
          style={{
            width: '100%',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            alignItems: 'stretch',
          }}
        >
          <DashboardRow label={tToken('title')} divided>
            {isLoading ? (
              <span role="status" aria-live="polite" aria-label={tToken('loading')}>
                <ObcSequenceLoadingSpinner />
                <span className="sr-only">{tToken('loading')}</span>
              </span>
            ) : (
              <DashboardValue testId="dashboard-token-status">
                {exists && data?.created_at
                  ? tToken('createdAt', { date: new Date(data.created_at).toLocaleString() })
                  : t('tokenNone')}
              </DashboardValue>
            )}
          </DashboardRow>

          {/* Withheld until the status query resolves: the label flips between
              Generate and Rotate on that answer, and offering the wrong one
              first invites a click on a button that is about to change. */}
          {!isLoading && phase === 'idle' && (
            <ObcButton
              variant={ButtonVariant.normal}
              fullWidth
              disabled={isRotating}
              onClick={() => (exists ? setPhase('confirming') : void rotate())}
            >
              {exists ? tToken('rotate') : tToken('generate')}
            </ObcButton>
          )}

          {phase === 'confirming' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p
                style={{
                  margin: 0,
                  padding: '0 8px',
                  fontSize: 16,
                  lineHeight: '24px',
                  color: 'var(--element-active-color)',
                }}
              >
                {tToken('confirm')}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <ObcButton
                  variant={ButtonVariant.raised}
                  disabled={isRotating}
                  onClick={() => void rotate()}
                >
                  {tToken('confirmYes')}
                </ObcButton>
                <ObcButton variant={ButtonVariant.normal} onClick={() => setPhase('idle')}>
                  {tToken('confirmNo')}
                </ObcButton>
              </div>
            </div>
          )}

          {failed && <p className="text-accent-danger text-sm">{tToken('error')}</p>}
        </div>
      </ObcCard>

      {/* Kept outside the card so the fixed overlay is never clipped or
          re-anchored by the card's own stacking context. */}
      {commandLine && (
        <GatewayCommandModal commandLine={commandLine} onClose={() => setCommandLine(null)} />
      )}
    </>
  );
}
