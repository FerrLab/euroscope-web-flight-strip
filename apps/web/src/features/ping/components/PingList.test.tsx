import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { PingList } from './PingList';

const messages = {
  ping: {
    title: 'Pings',
    loading: 'Loading…',
    empty: 'No pings yet',
    error: 'Failed',
    noteText: 'Text',
    id: 'ID',
    when: 'When',
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

describe('PingList', () => {
  it('shows loading state initially (happy)', () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(() => {}) as unknown as Promise<Response>,
    );
    render(wrap(<PingList />));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty state when API returns [] (invalid → empty)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(wrap(<PingList />));
    expect(await screen.findByText('No pings yet')).toBeInTheDocument();
  });

  it('renders rows when API returns pings (happy)', async () => {
    const rows = [
      { id: '01H', note: { en: 'hi' }, created_at: '2026-01-01T00:00:00Z' },
      { id: '01J', note: { en: 'yo' }, created_at: '2026-01-02T00:00:00Z' },
    ];
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(wrap(<PingList />));
    expect(await screen.findByText('hi')).toBeInTheDocument();
    expect(await screen.findByText('yo')).toBeInTheDocument();
  });

  it('shows error state on 5xx (garbage)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    render(wrap(<PingList />));
    expect(await screen.findByText('Failed')).toBeInTheDocument();
  });
});
