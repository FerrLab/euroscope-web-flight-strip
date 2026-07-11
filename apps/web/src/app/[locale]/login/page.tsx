import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg-secondary p-4">
      <ObcCard className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-4">{t('loginTitle')}</h1>
        <Link href={`/api/auth/stub-redirect?locale=${locale}`}>
          <ObcButton fullWidth>{t('continueWithStub')}</ObcButton>
        </Link>
      </ObcCard>
    </main>
  );
}
