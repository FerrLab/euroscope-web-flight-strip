'use client';

import { useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { ObcDropdownButton } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import type { ObcDropdownButtonChangeEvent } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import type { ObcDropdownButton as ObcDropdownButtonElement } from '@oicl/openbridge-webcomponents/dist/components/dropdown-button/dropdown-button';
import { LOCALES, type Locale } from '@eurostrip/i18n';

export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const label = t('label');

  // `ObcDropdownButton` never forwards its host `aria-label` to the native
  // `<select>` it renders inside its shadow DOM (verified against the
  // component's source: `render()` sets no aria attribute on the `<select>`),
  // so the control has no accessible name out of the box. Bridge it manually
  // so screen readers (and role-based test queries) can find "Language".
  const ref = useRef<ObcDropdownButtonElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const applyLabel = () => {
      el.shadowRoot?.querySelector('select')?.setAttribute('aria-label', label);
    };
    applyLabel();
    void el.updateComplete?.then(applyLabel);
  });

  return (
    <ObcDropdownButton
      ref={ref}
      aria-label={label}
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
