'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
import { ThemeSwitcher } from '@/shared/theme/ThemeSwitcher';
import { LocaleSwitcher } from '@/shared/i18n/LocaleSwitcher';

export function DashboardClient() {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  return (
    <main className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{tCommon('appName')}</h1>
        <div className="flex gap-3">
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      </header>
      <ObcCard>
        <nav className="flex gap-4">
          <Link href="./ping" className="underline">
            {t('ping')}
          </Link>
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
    </main>
  );
}
