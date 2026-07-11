import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { batchReceived, pollFailed } from '../slice';
import { ConsoleStatusHeader } from './ConsoleStatusHeader';

const messages = {
  gateway: {
    console: {
      connected: '● Plugin connected',
      disconnected: '○ Plugin offline',
      pollLive: 'Live',
      pollBackoff: 'Reconnecting…',
    },
  },
};

function renderWith(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConsoleStatusHeader />
      </NextIntlClientProvider>
    </Provider>,
  );
}

describe('ConsoleStatusHeader', () => {
  it('shows offline + live defaults after a first empty batch (happy)', () => {
    const store = makeStore();
    store.dispatch(
      batchReceived({ messages: [], cursor: null, reset: false, pluginConnected: false }),
    );
    renderWith(store);
    expect(screen.getByText('○ Plugin offline')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows connected when the plugin polled recently (happy)', () => {
    const store = makeStore();
    store.dispatch(
      batchReceived({ messages: [], cursor: null, reset: false, pluginConnected: true }),
    );
    renderWith(store);
    expect(screen.getByText('● Plugin connected')).toBeInTheDocument();
  });

  it('shows reconnecting while backing off (invalid)', () => {
    const store = makeStore();
    store.dispatch(pollFailed());
    renderWith(store);
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
  });
});
