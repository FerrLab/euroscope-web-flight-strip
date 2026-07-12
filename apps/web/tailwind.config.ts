import type { Config } from 'tailwindcss';
import { eurostripPreset } from '@eurostrip/design-tokens';

const config: Config = {
  presets: [eurostripPreset as Config],
  content: ['./src/**/*.{ts,tsx}', '../../libs/i18n/src/**/*.{ts,tsx}'],
};

export default config;
