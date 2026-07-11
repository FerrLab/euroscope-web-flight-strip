'use client';

import { useTranslations } from 'next-intl';
import { Select } from '@eurostrip/ui';
import { useTheme } from './ThemeProvider';

export function ThemeSwitcher() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  return (
    <Select
      aria-label={t('label')}
      placeholder={t('label')}
      value={theme}
      onValueChange={(v) => void setTheme(v as 'day' | 'dusk' | 'night' | 'bright')}
      options={[
        { value: 'day', label: t('day') },
        { value: 'dusk', label: t('dusk') },
        { value: 'night', label: t('night') },
        { value: 'bright', label: t('bright') },
      ]}
    />
  );
}
