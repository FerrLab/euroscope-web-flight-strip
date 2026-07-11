import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function HomePage() {
  return <ServerHomePage />;
}

function ServerHomePage() {
  const t = useTranslations('common');
  const tNav = useTranslations('nav');
  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold mb-2">{t('appName')}</h1>
      <p className="text-fg-secondary mb-6">{t('tagline')}</p>
      <nav className="flex gap-4">
        <Link href="/dashboard" className="underline">
          {tNav('dashboard')}
        </Link>
      </nav>
    </main>
  );
}
