import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { ConnectionSettingsCard } from './ConnectionSettingsCard';

const messages = {
  common: { close: 'Close' },
  gateway: {
    dashboard: {
      connectionSettings: 'Connection settings',
      tokenNone: 'Not generated',
      command: {
        title: 'Gateway command',
        hint: "Paste this line into EuroScope's command line. It is shown only once.",
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

function renderCard() {
  render(
    <Provider store={makeStore()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConnectionSettingsCard />
      </NextIntlClientProvider>
    </Provider>,
  );
}

function mockFetch(handler: (method: string) => Response | null) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const method = input instanceof Request ? input.method : (init?.method ?? 'GET');
    const response = handler(method.toUpperCase());
    if (!response) throw new Error('unexpected fetch');
    return response;
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConnectionSettingsCard', () => {
  it('generates without confirmation and reveals the command line (happy)', async () => {
    mockFetch((method) =>
      method === 'GET'
        ? json({ exists: false, created_at: null })
        : json({ token: 'secret-abc', created_at: '2026-07-10T12:00:00Z' }, 201),
    );
    renderCard();

    expect(await screen.findByText('Not generated')).toBeInTheDocument();
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Generate token' }));

    expect(await screen.findByTestId('gateway-command-line')).toHaveTextContent(
      /^\.lpc gateway config [A-Za-z0-9_-]+$/,
    );
  });

  it('announces the in-flight token status query (happy)', () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));
    renderCard();

    // The spinner's accessible label is a light-DOM `sr-only` span, not
    // shadow content, so a plain text query resolves it.
    expect(screen.getByText('Loading token status…')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-token-status')).not.toBeInTheDocument();
    // No action button yet — its label depends on the answer still in flight.
    expect(screen.queryByShadowRole('button')).not.toBeInTheDocument();
  });

  it('shows when the existing token was created (happy)', async () => {
    mockFetch((method) =>
      method === 'GET' ? json({ exists: true, created_at: '2026-07-01T00:00:00Z' }) : null,
    );
    renderCard();

    expect(await screen.findByTestId('dashboard-token-status')).toHaveTextContent(/^Created /);
    expect(await screen.findByShadowRole('button', { name: 'Rotate token' })).toBeInTheDocument();
  });

  it('requires confirmation before rotating a live token (happy)', async () => {
    mockFetch((method) =>
      method === 'GET'
        ? json({ exists: true, created_at: '2026-07-01T00:00:00Z' })
        : json({ token: 'secret-new', created_at: '2026-07-10T12:00:00Z' }, 201),
    );
    renderCard();

    await userEvent.click(await screen.findByShadowRole('button', { name: 'Rotate token' }));
    expect(
      screen.getByText('Rotating disconnects the currently connected plugin. Continue?'),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByShadowRole('button', { name: 'Yes, rotate' }));
    expect(await screen.findByTestId('gateway-command-modal')).toBeInTheDocument();
  });

  it('cancelling leaves the token alone (invalid path)', async () => {
    mockFetch((method) =>
      method === 'GET' ? json({ exists: true, created_at: '2026-07-01T00:00:00Z' }) : null,
    );
    renderCard();

    await userEvent.click(await screen.findByShadowRole('button', { name: 'Rotate token' }));
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('gateway-command-modal')).not.toBeInTheDocument();
    expect(await screen.findByShadowRole('button', { name: 'Rotate token' })).toBeInTheDocument();
  });

  it('surfaces a rotate failure instead of opening an empty modal (garbage)', async () => {
    mockFetch((method) =>
      method === 'GET'
        ? json({ exists: false, created_at: null })
        : new Response('boom', { status: 500 }),
    );
    renderCard();

    await userEvent.click(await screen.findByShadowRole('button', { name: 'Generate token' }));

    expect(await screen.findByText('Token operation failed.')).toBeInTheDocument();
    expect(screen.queryByTestId('gateway-command-modal')).not.toBeInTheDocument();
  });
});
