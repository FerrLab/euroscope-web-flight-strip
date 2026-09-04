import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
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

async function lastRequestBody(fetchSpy: ReturnType<typeof vi.spyOn>) {
  const call = fetchSpy.mock.calls.at(-1);
  // fetchBaseQuery (RTK Query) invokes `fetch(new Request(...))` — a single
  // Request argument, not the classic `fetch(url, init)` pair — so the JSON
  // body has to be read off the Request itself.
  const request = call?.[0] as Request;
  return request.clone().json();
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
    await userEvent.type(await screen.findByShadowLabelText('Text'), 'hi');
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Submit' }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0]![0] as Request;
    expect(call.url).toContain('/api/proxy/api/ping');
    expect(call.method).toBe('POST');
    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({ note: { en: 'hi' } });
  });

  it('submits an empty note as an empty string (invalid, no client-side blocking)', async () => {
    // Migrating off react-hook-form drops its `required`/`minLength`
    // validation-before-submit behavior (matches the pattern already used
    // by CommandComposer, StructuredComposer, ConnectionSettingsCard): a
    // `useState`-backed form submits whatever it holds and lets the backend
    // validate, rather than blocking the request itself.
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '01H', note: { en: '' }, created_at: 'now' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(wrap(<RecordPingForm />));
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Submit' }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({ note: { en: '' } });
  });

  it('shows server error on 5xx (garbage)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    render(wrap(<RecordPingForm />));
    await userEvent.type(await screen.findByShadowLabelText('Text'), 'hi');
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Submit' }));
    expect(await screen.findByShadowText('Failed')).toBeInTheDocument();
  });
});
