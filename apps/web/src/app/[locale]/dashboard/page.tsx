import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Card } from '@azimuth/ui';
import { ThemeSwitcher } from '@/shared/theme/ThemeSwitcher';
import { LocaleSwitcher } from '@/shared/i18n/LocaleSwitcher';
import { SESSION_COOKIE_NAME } from '@/shared/auth/cookie';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!session?.value) redirect(`/${locale}/login`);
  return <DashboardClient />;
}

function DashboardClient() {
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
      <Card>
        <nav className="flex gap-4">
          <Link href="./ping" className="underline">
            {t('ping')}
          </Link>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="underline">
              {t('logout')}
            </button>
          </form>
        </nav>
      </Card>
    </main>
  );
}
