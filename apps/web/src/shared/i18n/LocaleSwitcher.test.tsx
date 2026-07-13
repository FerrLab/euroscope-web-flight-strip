import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { LocaleSwitcher } from './LocaleSwitcher';

const messages = { locale: { label: 'Language', en: 'English', pt: 'Portuguese' } };

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/en/dashboard',
}));

describe('LocaleSwitcher', () => {
  it('lists en + pt (happy)', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LocaleSwitcher />
      </NextIntlClientProvider>,
    );
    await userEvent.click(await screen.findByShadowRole('combobox', { name: 'Language' }));
    expect(await screen.findByShadowRole('option', { name: 'English' })).toBeInTheDocument();
    expect(await screen.findByShadowRole('option', { name: 'Portuguese' })).toBeInTheDocument();
  });

  it('navigates on selection (happy)', async () => {
    replaceMock.mockReset();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LocaleSwitcher />
      </NextIntlClientProvider>,
    );
    const combobox = await screen.findByShadowRole('combobox', { name: 'Language' });
    await userEvent.selectOptions(
      combobox,
      await screen.findByShadowRole('option', { name: 'Portuguese' }),
    );
    expect(replaceMock).toHaveBeenCalledWith('/pt/dashboard');
  });

  it('handles current=pt path correctly (happy)', async () => {
    render(
      <NextIntlClientProvider locale="pt" messages={messages}>
        <LocaleSwitcher />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByShadowRole('combobox', { name: 'Language' })).toBeInTheDocument();
  });
});
