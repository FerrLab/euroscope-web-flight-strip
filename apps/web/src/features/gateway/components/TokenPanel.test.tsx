import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
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
      revealHint: 'Copy this now — the secret is shown only once.',
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

function fromBase64Url(encoded: string): string {
  const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
  return atob(padded.replaceAll('-', '+').replaceAll('_', '/'));
}

// `ÿ` repeated forces a byte pattern that standard base64 always
// renders as `/` (verified: btoa of a run of 0xFF bytes always hits the
// alphabet's index-63 character). This reproduces the exact bug where
// plain btoa() output re-introduces the `/` EuroScope's `.lpc` command
// line rejects — a token like `secret-abc` never exercises this path.
const SLASH_FORCING_TOKEN = 'ÿÿÿ-realistic-jwt-body-1234567890';

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
    await userEvent.click(screen.getByShadowRole('button', { name: 'Generate token' }));

    expect(await screen.findByTestId('gateway-token-secret')).toHaveTextContent('secret-abc');
    const configLine = screen.getByText(/\.lpc gateway config /).textContent ?? '';
    const encoded = configLine.replace('.lpc gateway config ', '');
    expect(fromBase64Url(encoded)).toMatch(/^https?:\/\/.+:secret-abc$/);
  });

  it('encodes the config blob as base64url, never producing / + or = (happy)', async () => {
    mockFetch((method) =>
      method === 'GET'
        ? json({ exists: false, created_at: null })
        : json({ token: SLASH_FORCING_TOKEN, created_at: '2026-07-10T12:00:00Z' }, 201),
    );
    render(wrap(<TokenPanel />));

    await userEvent.click(await screen.findByShadowRole('button', { name: 'Generate token' }));

    const configLine = screen.getByText(/\.lpc gateway config /).textContent ?? '';
    const encoded = configLine.replace('.lpc gateway config ', '');
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(encoded)).toMatch(new RegExp(`:${SLASH_FORCING_TOKEN}$`));
  });

  it('requires confirmation before rotating an existing token (happy)', async () => {
    mockFetch((method) =>
      method === 'GET'
        ? json({ exists: true, created_at: '2026-07-01T00:00:00Z' })
        : json({ token: 'secret-new', created_at: '2026-07-10T12:00:00Z' }, 201),
    );
    render(wrap(<TokenPanel />));

    await userEvent.click(await screen.findByShadowRole('button', { name: 'Rotate token' }));
    expect(
      screen.getByText('Rotating disconnects the currently connected plugin. Continue?'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByShadowRole('button', { name: 'Yes, rotate' }));
    expect(await screen.findByTestId('gateway-token-secret')).toHaveTextContent('secret-new');
  });

  it('cancel keeps the token untouched (invalid path)', async () => {
    mockFetch((method) =>
      method === 'GET' ? json({ exists: true, created_at: '2026-07-01T00:00:00Z' }) : null,
    );
    render(wrap(<TokenPanel />));

    await userEvent.click(await screen.findByShadowRole('button', { name: 'Rotate token' }));
    await userEvent.click(screen.getByShadowRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('gateway-token-secret')).not.toBeInTheDocument();
    expect(screen.getByShadowRole('button', { name: 'Rotate token' })).toBeInTheDocument();
  });

  it('surfaces a rotate failure (garbage)', async () => {
    mockFetch((method) =>
      method === 'GET'
        ? json({ exists: false, created_at: null })
        : new Response('boom', { status: 500 }),
    );
    render(wrap(<TokenPanel />));

    await userEvent.click(await screen.findByShadowRole('button', { name: 'Generate token' }));

    expect(await screen.findByText('Token operation failed.')).toBeInTheDocument();
  });
});
