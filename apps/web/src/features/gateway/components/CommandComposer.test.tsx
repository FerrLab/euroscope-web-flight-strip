import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { CommandComposer } from './CommandComposer';

const messages = {
  gateway: {
    console: {
      composer: {
        label: 'Command JSON',
        hint: '{"action":"set_squawk"}',
        send: 'Send',
        invalidJson: 'Not valid JSON.',
        invalidEnvelope: 'The envelope needs at least an "action" string.',
        sendFailed: 'Sending failed — try again.',
      },
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CommandComposer', () => {
  it('sends a valid envelope and clears the textarea (happy)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ queued: { type: 'command', action: 'ping' } }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(wrap(<CommandComposer />));

    const box = screen.getByLabelText('Command JSON');
    await userEvent.type(box, '{{"action":"ping"}');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(fetchSpy).toHaveBeenCalled();
    expect(await screen.findByLabelText('Command JSON')).toHaveValue('');
  });

  it('rejects invalid JSON without calling the API (invalid)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(wrap(<CommandComposer />));

    await userEvent.type(screen.getByLabelText('Command JSON'), '{{not json');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Not valid JSON.')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an envelope without action (invalid)', async () => {
    render(wrap(<CommandComposer />));

    await userEvent.type(screen.getByLabelText('Command JSON'), '{{"callsign":"ABC1234"}');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('The envelope needs at least an "action" string.'),
    ).toBeInTheDocument();
  });

  it('surfaces a server failure (garbage)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    render(wrap(<CommandComposer />));

    await userEvent.type(screen.getByLabelText('Command JSON'), '{{"action":"ping"}');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Sending failed — try again.')).toBeInTheDocument();
  });
});
