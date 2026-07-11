import type { Config } from 'tailwindcss';

export const eurostripPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
        },
        fg: {
          primary: 'var(--color-fg-primary)',
          secondary: 'var(--color-fg-secondary)',
          tertiary: 'var(--color-fg-tertiary)',
        },
        border: {
          DEFAULT: 'var(--color-border-default)',
          subtle: 'var(--color-border-subtle)',
          emphasis: 'var(--color-border-emphasis)',
        },
        accent: {
          primary: 'var(--color-accent-primary)',
          success: 'var(--color-accent-success)',
          warning: 'var(--color-accent-warning)',
          danger: 'var(--color-accent-danger)',
        },
      },
      fontFamily: {
        sans: 'var(--ff-sans)',
        mono: 'var(--ff-mono)',
      },
    },
    borderRadius: {
      none: '0',
      full: '9999px',
    },
  },
};

export default eurostripPreset;
