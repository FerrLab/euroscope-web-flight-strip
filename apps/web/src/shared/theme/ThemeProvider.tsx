'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type Theme = 'day' | 'dusk' | 'night' | 'bright';
const THEMES: readonly Theme[] = ['day', 'dusk', 'night', 'bright'] as const;

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => Promise<void>;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: string;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(
    THEMES.includes(initialTheme as Theme) ? (initialTheme as Theme) : 'day',
  );

  async function setTheme(t: Theme): Promise<void> {
    document.documentElement.dataset.theme = t;
    setThemeState(t);
    await fetch('/api/theme', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: t }),
    });
  }

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
