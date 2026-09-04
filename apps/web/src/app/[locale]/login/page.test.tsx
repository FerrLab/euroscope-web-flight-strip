import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import LoginPage from './page';

const searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

const messages = {
  auth: {
    loginTitle: 'Sign in to EuroStrip',
    continueWithVatsim: 'Continue with VATSIM',
    continueWithStub: 'Continue with Stub',
    logoutLabel: 'Log out',
    loginError: 'Sign-in failed. Please try again.',
    loginForbidden: 'You are signed in to VATSIM, but this account does not have admin access.',
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
    searchParams.delete('error');
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

  it('says nothing when there is no error in the query (happy)', () => {
    renderPage();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains a denied admin sign-in (happy — the redirect must not be silent)', () => {
    searchParams.set('error', 'forbidden');
    renderPage();
    expect(screen.getByRole('alert').textContent).toContain('does not have admin access');
  });

  it('explains a failed OAuth round trip (happy)', () => {
    searchParams.set('error', 'oauth');
    renderPage();
    expect(screen.getByRole('alert').textContent).toContain('Sign-in failed');
  });

  it('ignores an unrecognised error code rather than echoing it (garbage)', () => {
    searchParams.set('error', '<script>alert(1)</script>');
    renderPage();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
