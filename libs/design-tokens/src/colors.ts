export type ThemeName = 'day' | 'dusk' | 'night' | 'bright';

export type ColorTokens = {
  bg: { primary: string; secondary: string; tertiary: string };
  fg: { primary: string; secondary: string; tertiary: string };
  border: { default: string; subtle: string; emphasis: string };
  accent: {
    primary: string;
    success: string;
    warning: string;
    danger: string;
  };
};

export const colors: Record<ThemeName, ColorTokens> = {
  day: {
    bg: { primary: '#f0f0f0', secondary: '#e8e8e8', tertiary: '#dcdcdc' },
    fg: { primary: '#0a0a0a', secondary: '#3a3a3a', tertiary: '#6a6a6a' },
    border: { default: '#c8c8c8', subtle: '#dadada', emphasis: '#0a0a0a' },
    accent: { primary: '#0066cc', success: '#2c8c2c', warning: '#cc7a00', danger: '#c41e3a' },
  },
  dusk: {
    bg: { primary: '#1a1410', secondary: '#241c16', tertiary: '#2e241c' },
    fg: { primary: '#d4a574', secondary: '#a07a55', tertiary: '#705540' },
    border: { default: '#3e302a', subtle: '#2c241e', emphasis: '#d4a574' },
    accent: { primary: '#d49d4d', success: '#7a8a4d', warning: '#d4742d', danger: '#a83232' },
  },
  night: {
    bg: { primary: '#000000', secondary: '#080808', tertiary: '#101010' },
    fg: { primary: '#aa0000', secondary: '#770000', tertiary: '#440000' },
    border: { default: '#220000', subtle: '#110000', emphasis: '#aa0000' },
    accent: { primary: '#cc0000', success: '#660000', warning: '#aa3300', danger: '#ff0000' },
  },
  bright: {
    bg: { primary: '#ffffff', secondary: '#f4f4f4', tertiary: '#e8e8e8' },
    fg: { primary: '#000000', secondary: '#1a1a1a', tertiary: '#3a3a3a' },
    border: { default: '#000000', subtle: '#888888', emphasis: '#000000' },
    accent: { primary: '#0000ff', success: '#006600', warning: '#cc6600', danger: '#cc0000' },
  },
};
