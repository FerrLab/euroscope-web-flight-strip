import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { ConsoleClient } from './ConsoleClient';

const messages = {
  gateway: {
    console: {
      title: 'Gateway console',
      connected: '● Plugin connected',
      disconnected: '○ Plugin offline',
      pollLive: 'Live',
      pollBackoff: 'Reconnecting…',
      empty: 'No messages yet — connect your plugin or send a command.',
      pause: 'Pause auto-scroll',
      resume: 'Resume auto-scroll',
      directionIn: '▼ in',
      directionOut: '▲ out',
      toggle: { structured: 'Structured', raw: 'Raw JSON' },
      composer: {
        label: 'Command JSON',
        hint: '{"action":"ping"}',
        send: 'Send',
        invalidJson: 'Not valid JSON.',
        invalidEnvelope: 'The envelope needs at least an "action" string.',
        sendFailed: 'Sending failed — try again.',
      },
      structured: {
        actionLabel: 'Action',
        callsignLabel: 'Callsign',
        selectPlaceholder: 'Select…',
        send: 'Send',
        sendFailed: 'Sending failed — try again.',
        altitudeMode: { feet: 'Feet mode', special: 'Special mode' },
        fields: { filter: 'Filter' },
        errors: { required: '{field} is required.', invalidNumber: '{field} must be a number.' },
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

describe('ConsoleClient', () => {
  it('defaults to the structured composer (happy)', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(wrap(<ConsoleClient />));
    expect(await screen.findByShadowRole('combobox', { name: 'Action' })).toBeInTheDocument();
  });

  it('toggles to raw JSON and back (happy)', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(wrap(<ConsoleClient />));
    await userEvent.click(await screen.findByText('Raw JSON'));
    expect(await screen.findByShadowLabelText('Command JSON')).toBeInTheDocument();
    await userEvent.click(await screen.findByText('Structured'));
    expect(await screen.findByShadowRole('combobox', { name: 'Action' })).toBeInTheDocument();
  });
});
