import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { TokenPanel } from './TokenPanel';

const messages = {
  gateway: {
    token: {
      title: 'Gateway token',
      loading: 'Loading token status…',
      none: 'No gateway token yet.',
      createdAt: 'Created {date}',
      generate: 'Generate token',
      rotate: 'Rotate token',
      confirm: 'Rotating disconnects the currently connected plugin. Continue?',
      confirmYes: 'Yes, rotate',
      confirmNo: 'Cancel',
      revealHint: 'Copy these now — the secret is shown only once.',
      error: 'Token operation failed.',
    },
  },
};

function wrap(ui: React.ReactElement) {
  return (
    <Provider store={makeStore()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {ui}
      </NextIntlClientProvider>
    </Provider>
  );
}

function mockFetch(handler: (method: string) => Response | null) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const method = input instanceof Request ? input.method : (init?.method ?? 'GET');
    const response = handler(method.toUpperCase());
    if (!response) {
      throw new Error('unexpected fetch');
    }
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

describe('TokenPanel', () => {
  it('shows the empty state and generates directly without confirm (happy)', async () => {
    mockFetch((method) =>
      method === 'GET'
        ? json({ exists: false, created_at: null })
        : json({ token: 'secret-abc', created_at: '2026-07-10T12:00:00Z' }, 201),
    );
    render(wrap(<TokenPanel />));

    expect(await screen.findByText('No gateway token yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Generate token' }));

    expect(await screen.findByTestId('gateway-token-secret')).toHaveTextContent('secret-abc');
    expect(screen.getByText(/\.wsc gateway token secret-abc/)).toBeInTheDocument();
    expect(screen.getByText(/\.wsc gateway url /)).toBeInTheDocument();
  });

  it('requires confirmation before rotating an existing token (happy)', async () => {
    mockFetch((method) =>
      method === 'GET'
        ? json({ exists: true, created_at: '2026-07-01T00:00:00Z' })
        : json({ token: 'secret-new', created_at: '2026-07-10T12:00:00Z' }, 201),
    );
    render(wrap(<TokenPanel />));

    await userEvent.click(await screen.findByRole('button', { name: 'Rotate token' }));
    expect(
      screen.getByText('Rotating disconnects the currently connected plugin. Continue?'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Yes, rotate' }));
    expect(await screen.findByTestId('gateway-token-secret')).toHaveTextContent('secret-new');
  });

  it('cancel keeps the token untouched (invalid path)', async () => {
    mockFetch((method) =>
      method === 'GET' ? json({ exists: true, created_at: '2026-07-01T00:00:00Z' }) : null,
    );
    render(wrap(<TokenPanel />));

    await userEvent.click(await screen.findByRole('button', { name: 'Rotate token' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('gateway-token-secret')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rotate token' })).toBeInTheDocument();
  });

  it('surfaces a rotate failure (garbage)', async () => {
    mockFetch((method) =>
      method === 'GET'
        ? json({ exists: false, created_at: null })
        : new Response('boom', { status: 500 }),
    );
    render(wrap(<TokenPanel />));

    await userEvent.click(await screen.findByRole('button', { name: 'Generate token' }));

    expect(await screen.findByText('Token operation failed.')).toBeInTheDocument();
  });
});
