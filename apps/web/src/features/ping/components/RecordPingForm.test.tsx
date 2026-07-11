import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { RecordPingForm } from './RecordPingForm';

const messages = {
  ping: {
    create: 'Create ping',
    noteLocale: 'Locale',
    noteText: 'Text',
    submit: 'Submit',
    error: 'Failed',
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

describe('RecordPingForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('submits a valid en payload (happy)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '01H', note: { en: 'hi' }, created_at: 'now' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(wrap(<RecordPingForm />));
    await userEvent.type(screen.getByLabelText('Text'), 'hi');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    // RTK Query's fetchBaseQuery passes a Request to fetch (not url+options).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0]![0] as Request;
    expect(call.url).toContain('/api/proxy/api/ping');
    expect(call.method).toBe('POST');
  });

  it('blocks submit on empty text (invalid)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(wrap(<RecordPingForm />));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows server error on 5xx (garbage)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    render(wrap(<RecordPingForm />));
    await userEvent.type(screen.getByLabelText('Text'), 'hi');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Failed')).toBeInTheDocument();
  });
});
