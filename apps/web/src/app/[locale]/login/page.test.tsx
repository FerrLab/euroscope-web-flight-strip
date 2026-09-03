import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import LoginPage from './page';

const messages = {
  auth: {
    loginTitle: 'Sign in to EuroStrip',
    continueWithVatsim: 'Continue with VATSIM',
    continueWithStub: 'Continue with Stub',
    logoutLabel: 'Log out',
    loginError: 'Sign-in failed. Please try again.',
  },
};

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginPage />
    </NextIntlClientProvider>,
  );
}

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('always shows the VATSIM button (happy)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Continue with VATSIM' })).toBeTruthy();
  });

  it('shows the stub button outside production (happy — dev/test convenience)', () => {
    vi.stubEnv('NODE_ENV', 'test');
    renderPage();
    expect(screen.getByRole('link', { name: 'Continue with Stub' })).toBeTruthy();
  });

  it('hides the stub button in production (invalid — must never reach real users)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    renderPage();
    expect(screen.queryByRole('link', { name: 'Continue with Stub' })).toBeNull();
  });
});
