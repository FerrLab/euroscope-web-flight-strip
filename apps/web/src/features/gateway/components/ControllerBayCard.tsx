'use client';

import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ButtonVariant } from '@oicl/openbridge-webcomponents/dist/components/button/button.js';
import { StatusIndicatorStatus } from '@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
import { ObcStatusIndicator } from '@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator';
import { useAppSelector } from '@/shared/store/hooks';
import { lastMessageAt } from '../lastMessage';
import { DashboardRow, DashboardValue } from './DashboardRow';

// A neutral placeholder for a clock the feed cannot supply yet.
const MISSING_FIELD_PLACEHOLDER = '—';

/**
 * The controller's entry point: is the plugin talking to us, when did it
 * last say anything, and the way through to the strip board.
 */
export function ControllerBayCard() {
  const t = useTranslations('gateway.dashboard');
  const connected = useAppSelector((s) => s.gateway.pluginConnected);
  const at = useAppSelector((s) => lastMessageAt(s.gateway.messages));

  return (
    <ObcCard>
      <span slot="title" style={{ textTransform: 'uppercase' }}>
        {t('controllerBay')}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <DashboardRow label={t('plugin')} divided>
            <ObcStatusIndicator
              data-testid="dashboard-plugin-status"
              status={connected ? StatusIndicatorStatus.running : StatusIndicatorStatus.inactive}
            >
              {connected ? t('pluginConnected') : t('pluginOffline')}
            </ObcStatusIndicator>
          </DashboardRow>
          <DashboardRow label={t('lastMessage')}>
            <DashboardValue testId="dashboard-last-message">
              {at ? `${at} UTC` : MISSING_FIELD_PLACEHOLDER}
            </DashboardValue>
          </DashboardRow>
        </div>
        <ObcButton variant={ButtonVariant.raised} fullWidth href="./strips">
          {t('startControlling')}
        </ObcButton>
      </div>
    </ObcCard>
  );
}
