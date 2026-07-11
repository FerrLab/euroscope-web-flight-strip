import type { Config } from 'tailwindcss';
import { azimuthPreset } from '@azimuth/design-tokens';

const config: Config = {
  presets: [azimuthPreset as Config],
  content: [
    './src/**/*.{ts,tsx}',
    '../../libs/ui/src/**/*.{ts,tsx}',
    '../../libs/i18n/src/**/*.{ts,tsx}',
  ],
};

export default config;
