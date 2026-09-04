import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { batchReceived } from '../slice';
import type { ConsoleMessage } from '../slice';
import { ControllerBayCard } from './ControllerBayCard';

const messages = {
  gateway: {
    dashboard: {
      controllerBay: 'Controller bay',
      plugin: 'Plugin',
      pluginConnected: 'Connected',
      pluginOffline: 'Offline',
      lastMessage: 'Last message',
      startControlling: 'Start controlling',
    },
  },
};

function renderWith(batch?: { pluginConnected: boolean; messages: ConsoleMessage[] }) {
  const store = makeStore();
  if (batch) {
    store.dispatch(
      batchReceived({
        messages: batch.messages,
        cursor: null,
        reset: true,
        pluginConnected: batch.pluginConnected,
      }),
    );
  }
  render(
    <Provider store={store}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ControllerBayCard />
      </NextIntlClientProvider>
    </Provider>,
  );
}

const msg = (id: string): ConsoleMessage => ({ id, direction: 'in', envelope: {} });

// @lit/react assigns `status` as a DOM property; the Lit element does not
// reflect it back to an attribute, so read the property.
const pluginStatus = () =>
  (screen.getByTestId('dashboard-plugin-status') as HTMLElement & { status?: string }).status;

describe('ControllerBayCard', () => {
  it('reports a live plugin and the newest message clock (happy)', () => {
    const at = Date.UTC(2026, 8, 3, 11, 18, 52);
    renderWith({ pluginConnected: true, messages: [msg(`${at}-0`)] });

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(pluginStatus()).toBe('running');
    expect(screen.getByTestId('dashboard-last-message')).toHaveTextContent('11:18:52 UTC');
  });

  it('reports an offline plugin before any poll has landed (invalid path)', () => {
    renderWith();

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(pluginStatus()).toBe('inactive');
    expect(screen.getByTestId('dashboard-last-message')).toHaveTextContent('—');
  });

  it('falls back to the placeholder when message ids carry no clock (garbage)', () => {
    renderWith({ pluginConnected: true, messages: [msg('lolwut')] });

    expect(screen.getByTestId('dashboard-last-message')).toHaveTextContent('—');
  });

  it('links through to the strip board (happy)', async () => {
    renderWith();

    expect(await screen.findByShadowRole('link', { name: 'Start controlling' })).toHaveAttribute(
      'href',
      './strips',
    );
  });
});
