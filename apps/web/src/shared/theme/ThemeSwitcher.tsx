'use client';

import { useTranslations } from 'next-intl';
import { ObcDropdownButton } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import type { ObcDropdownButtonChangeEvent } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import { useDropdownAriaLabel } from '@/shared/openbridge/useDropdownAriaLabel';
import { useTheme } from './ThemeProvider';

export function ThemeSwitcher() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  const label = t('label');

  const ref = useDropdownAriaLabel(label);

  return (
    <ObcDropdownButton
      ref={ref}
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
