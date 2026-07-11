import { describe, it, expect, vi } from 'vitest';
import { render, screen as rtlScreen } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
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
    // The loading spinner's accessible label is a light-DOM `sr-only` span,
    // not shadow content, so a plain RTL query works here — see
    // TokenPanel.tsx for the same pattern.
    expect(rtlScreen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty state when API returns [] (invalid → empty)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(wrap(<PingList />));
    expect(await rtlScreen.findByText('No pings yet')).toBeInTheDocument();
  });

  it('renders rows from data in an ObcTable (happy)', async () => {
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

    // `ObcTable` renders into its own shadow root as `role="table"` >
    // `role="row"` (header) + one `role="row"` <button> per data row, each
    // containing `role="cell"` <div>s with a plain <span> of text — verified
    // empirically via `screen.debug()` against the real rendered DOM, not
    // assumed from the TS source. Cell/header content lives in shadow DOM,
    // so shadow-piercing queries are required.
    expect(await screen.findByShadowRole('table')).toBeInTheDocument();
    expect(await screen.findByShadowRole('columnheader', { name: 'ID' })).toBeInTheDocument();
    expect(await screen.findByShadowRole('columnheader', { name: 'Text' })).toBeInTheDocument();
    expect(await screen.findByShadowRole('columnheader', { name: 'When' })).toBeInTheDocument();
    expect(await screen.findByShadowText('hi')).toBeInTheDocument();
    expect(await screen.findByShadowText('yo')).toBeInTheDocument();

    const dataRows = screen.getAllByShadowRole('row');
    // First `role="row"` is the header row; the rest are data rows.
    expect(dataRows).toHaveLength(3);
  });

  it('shows error state on 5xx (garbage)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    render(wrap(<PingList />));
    expect(await rtlScreen.findByText('Failed')).toBeInTheDocument();
  });
});
