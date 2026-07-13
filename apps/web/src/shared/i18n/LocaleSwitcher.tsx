'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { ObcDropdownButton } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import type { ObcDropdownButtonChangeEvent } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import { LOCALES, type Locale } from '@eurostrip/i18n';
import { useDropdownAriaLabel } from '@/shared/openbridge/useDropdownAriaLabel';

export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const label = t('label');

  const ref = useDropdownAriaLabel(label);

  return (
    <ObcDropdownButton
      ref={ref}
      value={current}
      onDropdownChange={(e: ObcDropdownButtonChangeEvent) => {
        const next = e.detail.value;
        const newPath = pathname.replace(new RegExp(`^/(${LOCALES.join('|')})`), `/${next}`);
        router.replace(newPath);
      }}
      options={LOCALES.map((l) => ({ value: l, label: t(l as Locale) }))}
    />
  );
}
