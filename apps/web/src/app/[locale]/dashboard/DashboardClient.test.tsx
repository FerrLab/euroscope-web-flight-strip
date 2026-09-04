import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';
import { DashboardClient } from './DashboardClient';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/en/dashboard',
}));

const messages = {
  common: { appName: 'EuroStrip', close: 'Close' },
  nav: { console: 'Console', gatewayToken: 'Gateway token', logout: 'Log out' },
  theme: { label: 'Theme', day: 'Day', dusk: 'Dusk', night: 'Night', bright: 'Bright' },
  locale: { label: 'Language', en: 'English', pt: 'Português' },
  gateway: {
    dashboard: {
      controllerBay: 'Controller bay',
      plugin: 'Plugin',
      pluginConnected: 'Connected',
      pluginOffline: 'Offline',
      lastMessage: 'Last message',
      startControlling: 'Start controlling',
      connectionSettings: 'Connection settings',
      tokenNone: 'Not generated',
      command: {
        title: 'Gateway command',
        hint: 'Paste it.',
        copy: 'Copy command',
        copied: 'Copied',
      },
    },
    token: {
      title: 'Gateway token',
      loading: 'Loading token status…',
      createdAt: 'Created {date}',
      generate: 'Generate token',
      rotate: 'Rotate token',
      confirm: 'Rotating disconnects the currently connected plugin. Continue?',
      confirmYes: 'Yes, rotate',
      confirmNo: 'Cancel',
      error: 'Token operation failed.',
    },
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Answers the token query and parks the long poll so it never resolves. */
function mockBackend(tokenBody: unknown) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('console/poll')) return new Promise<Response>(() => {});
    return json(tokenBody);
  });
}

function renderDashboard() {
  render(
    <Provider store={makeStore()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ThemeProvider initialTheme="day">
          <DashboardClient />
        </ThemeProvider>
      </NextIntlClientProvider>
    </Provider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DashboardClient', () => {
  it('lays out the nav and both gateway cards (happy)', async () => {
    mockBackend({ exists: true, created_at: '2026-07-01T00:00:00Z' });
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'EuroStrip' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Console' })).toHaveAttribute('href', './console');
    expect(screen.getByRole('link', { name: 'Gateway token' })).toHaveAttribute('href', './token');
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();

    expect(screen.getByText('Controller bay')).toBeInTheDocument();
    expect(screen.getByText('Connection settings')).toBeInTheDocument();
    expect(await screen.findByShadowRole('link', { name: 'Start controlling' })).toHaveAttribute(
      'href',
      './strips',
    );
  });

  it('starts with the plugin offline until a poll lands (invalid path)', () => {
    mockBackend({ exists: false, created_at: null });
    renderDashboard();

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-last-message')).toHaveTextContent('—');
  });

  it('still renders the bay when the token endpoint is unavailable (garbage)', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('console/poll')) return new Promise<Response>(() => {});
      return new Response('boom', { status: 500 });
    });
    renderDashboard();

    expect(await screen.findByText('Not generated')).toBeInTheDocument();
    expect(screen.getByText('Controller bay')).toBeInTheDocument();
  });
});
