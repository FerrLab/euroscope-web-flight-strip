'use client';

import { useTranslations } from 'next-intl';
import { useAppSelector } from '@/shared/store/hooks';

export function ConsoleStatusHeader() {
  const t = useTranslations('gateway.console');
  const pluginConnected = useAppSelector((s) => s.gateway.pluginConnected);
  const pollStatus = useAppSelector((s) => s.gateway.pollStatus);

  return (
    <div className="flex items-center gap-4 text-sm" data-testid="console-status">
      <span>{pluginConnected ? t('connected') : t('disconnected')}</span>
      <span>{pollStatus === 'backoff' ? t('pollBackoff') : t('pollLive')}</span>
    </div>
  );
}
