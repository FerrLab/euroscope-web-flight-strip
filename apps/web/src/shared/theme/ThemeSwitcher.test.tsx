import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from './ThemeProvider';
import { ThemeSwitcher } from './ThemeSwitcher';

const messages = {
  theme: { label: 'Theme', day: 'Day', dusk: 'Dusk', night: 'Night', bright: 'Bright' },
};

function wrap(initial: string, ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeProvider initialTheme={initial}>{ui}</ThemeProvider>
    </NextIntlClientProvider>
  );
}

describe('ThemeSwitcher', () => {
  it('renders 4 options (happy)', async () => {
    render(wrap('day', <ThemeSwitcher />));
    await userEvent.click(await screen.findByShadowRole('combobox', { name: 'Theme' }));
    expect(await screen.findByShadowRole('option', { name: 'Day' })).toBeInTheDocument();
    expect(await screen.findByShadowRole('option', { name: 'Dusk' })).toBeInTheDocument();
    expect(await screen.findByShadowRole('option', { name: 'Night' })).toBeInTheDocument();
    expect(await screen.findByShadowRole('option', { name: 'Bright' })).toBeInTheDocument();
  });

  it('updates data-theme attribute on selection (happy)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    render(wrap('day', <ThemeSwitcher />));
    const combobox = await screen.findByShadowRole('combobox', { name: 'Theme' });
    await userEvent.selectOptions(
      combobox,
      await screen.findByShadowRole('option', { name: 'Night' }),
    );
    expect(document.documentElement.dataset.theme).toBe('night');
    expect(document.documentElement.dataset.obcTheme).toBe('night');
  });

  it('starts at the cookie theme (initialTheme prop)', async () => {
    render(wrap('dusk', <ThemeSwitcher />));
    expect(await screen.findByShadowRole('combobox', { name: 'Theme' })).toBeInTheDocument();
  });

  it('rejects invalid initialTheme as garbage (garbage → falls back to day)', async () => {
    render(wrap('purple', <ThemeSwitcher />));
    expect(await screen.findByShadowRole('combobox', { name: 'Theme' })).toBeInTheDocument();
  });
});
