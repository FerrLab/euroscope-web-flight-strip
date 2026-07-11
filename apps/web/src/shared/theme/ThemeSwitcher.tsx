'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ObcDropdownButton } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import type { ObcDropdownButtonChangeEvent } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import type { ObcDropdownButton as ObcDropdownButtonElement } from '@oicl/openbridge-webcomponents/dist/components/dropdown-button/dropdown-button';
import { useTheme } from './ThemeProvider';

export function ThemeSwitcher() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  const label = t('label');

  // `ObcDropdownButton` never forwards its host `aria-label` to the native
  // `<select>` it renders inside its shadow DOM (verified against the
  // component's source: `render()` sets no aria attribute on the `<select>`),
  // so the control has no accessible name out of the box. Bridge it manually
  // so screen readers (and role-based test queries) can find "Theme".
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
      value={theme}
      onDropdownChange={(e: ObcDropdownButtonChangeEvent) =>
        void setTheme(e.detail.value as 'day' | 'dusk' | 'night' | 'bright')
      }
      options={[
        { value: 'day', label: t('day') },
        { value: 'dusk', label: t('dusk') },
        { value: 'night', label: t('night') },
        { value: 'bright', label: t('bright') },
      ]}
    />
  );
}
