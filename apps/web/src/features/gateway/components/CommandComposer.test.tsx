import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
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

    const box = await screen.findByShadowLabelText('Command JSON');
    await userEvent.type(box, '{{"action":"ping"}');
    await userEvent.click(screen.getByShadowRole('button', { name: 'Send' }));

    expect(fetchSpy).toHaveBeenCalled();
    expect(await screen.findByShadowLabelText('Command JSON')).toHaveValue('');
  });

  it('rejects invalid JSON without calling the API (invalid)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(wrap(<CommandComposer />));

    await userEvent.type(await screen.findByShadowLabelText('Command JSON'), '{{not json');
    await userEvent.click(screen.getByShadowRole('button', { name: 'Send' }));

    expect(await screen.findByShadowText('Not valid JSON.')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an envelope without action (invalid)', async () => {
    render(wrap(<CommandComposer />));

    await userEvent.type(
      await screen.findByShadowLabelText('Command JSON'),
      '{{"callsign":"ABC1234"}',
    );
    await userEvent.click(screen.getByShadowRole('button', { name: 'Send' }));

    expect(
      await screen.findByShadowText('The envelope needs at least an "action" string.'),
    ).toBeInTheDocument();
  });

  it('surfaces a server failure (garbage)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    render(wrap(<CommandComposer />));

    await userEvent.type(await screen.findByShadowLabelText('Command JSON'), '{{"action":"ping"}');
    await userEvent.click(screen.getByShadowRole('button', { name: 'Send' }));

    expect(await screen.findByShadowText('Sending failed — try again.')).toBeInTheDocument();
  });
});
