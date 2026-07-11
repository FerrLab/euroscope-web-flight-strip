import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { Button, Card } from '@azimuth/ui';

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg-secondary p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-4">{t('loginTitle')}</h1>
        <Link href={`/api/auth/stub-redirect?locale=${locale}`}>
          <Button variant="primary" className="w-full">
            {t('continueWithStub')}
          </Button>
        </Link>
      </Card>
    </main>
  );
}
