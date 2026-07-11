'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { Select } from '@eurostrip/ui';
import { LOCALES, type Locale } from '@eurostrip/i18n';

export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Select
      aria-label={t('label')}
      placeholder={t('label')}
      value={current}
      onValueChange={(next) => {
        const newPath = pathname.replace(new RegExp(`^/(${LOCALES.join('|')})`), `/${next}`);
        router.replace(newPath);
      }}
      options={LOCALES.map((l) => ({ value: l, label: t(l as Locale) }))}
    />
  );
}
