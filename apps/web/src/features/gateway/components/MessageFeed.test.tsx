import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { batchReceived } from '../slice';
import { MessageFeed } from './MessageFeed';

const messages = {
  gateway: {
    console: {
      title: 'Gateway console',
      empty: 'No messages yet — connect your plugin or send a command.',
      pause: 'Pause auto-scroll',
      resume: 'Resume auto-scroll',
      directionIn: '▼ in',
      directionOut: '▲ out',
    },
  },
};

function renderWith(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <MessageFeed />
      </NextIntlClientProvider>
    </Provider>,
  );
}

describe('MessageFeed', () => {
  it('shows the empty state (happy empty)', () => {
    renderWith(makeStore());
    expect(
      screen.getByText('No messages yet — connect your plugin or send a command.'),
    ).toBeInTheDocument();
  });

  it('renders rows with direction, type, action and callsign (happy)', () => {
    const store = makeStore();
    store.dispatch(
      batchReceived({
        messages: [
          {
            id: '1720527600000-0',
            direction: 'in',
            envelope: { type: 'event', action: 'flight_updated', callsign: 'DLH4TX' },
          },
          {
            id: '1720527600001-0',
            direction: 'out',
            envelope: { type: 'command', action: 'set_squawk', callsign: 'ABC1234' },
          },
        ],
        cursor: '1720527600001-0',
        reset: false,
        pluginConnected: true,
      }),
    );
    renderWith(store);

    expect(screen.getByText('flight_updated')).toBeInTheDocument();
    expect(screen.getByText('set_squawk')).toBeInTheDocument();
    expect(screen.getByText('▼ in')).toBeInTheDocument();
    expect(screen.getByText('▲ out')).toBeInTheDocument();
    expect(screen.getByText('DLH4TX')).toBeInTheDocument();
  });

  it('tolerates envelopes missing standard fields (garbage)', () => {
    const store = makeStore();
    store.dispatch(
      batchReceived({
        messages: [{ id: '1-0', direction: 'in', envelope: { weird: true } }],
        cursor: '1-0',
        reset: false,
        pluginConnected: true,
      }),
    );
    renderWith(store);
    // Renders without crashing; the row exists with placeholder dashes.
    expect(screen.getByText('▼ in')).toBeInTheDocument();
  });

  it('toggles the pause label (happy)', async () => {
    renderWith(makeStore());
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Pause auto-scroll' }));
    expect(screen.getByShadowRole('button', { name: 'Resume auto-scroll' })).toBeInTheDocument();
  });
});
