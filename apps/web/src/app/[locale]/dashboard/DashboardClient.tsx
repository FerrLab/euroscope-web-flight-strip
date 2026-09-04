'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
import { ConnectionSettingsCard } from '@/features/gateway/components/ConnectionSettingsCard';
import { ControllerBayCard } from '@/features/gateway/components/ControllerBayCard';
import { useGatewayPoll } from '@/features/gateway/useGatewayPoll';
import { LocaleSwitcher } from '@/shared/i18n/LocaleSwitcher';
import { ThemeSwitcher } from '@/shared/theme/ThemeSwitcher';

export function DashboardClient() {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');

  // The controller bay reports live plugin state, so the dashboard owns a
  // long poll of its own rather than waiting for the console to be opened.
  useGatewayPoll();

  return (
    <main className="flex flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{tCommon('appName')}</h1>
        <div className="flex gap-3">
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      </header>

      <ObcCard>
        <nav className="flex gap-4">
          <Link href="./console" className="underline">
            {t('console')}
          </Link>
          <Link href="./token" className="underline">
            {t('gatewayToken')}
          </Link>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="underline">
              {t('logout')}
            </button>
          </form>
        </nav>
      </ObcCard>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] items-stretch gap-6">
        <ControllerBayCard />
        <ConnectionSettingsCard />
      </div>
    </main>
  );
}
