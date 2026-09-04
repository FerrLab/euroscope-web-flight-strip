import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import stripsEn from '@/messages/strips.en.json';
import { makeStore, type AppStore } from '@/shared/store/index';
import { stripsActions } from '../slice';
import { AddAirportModal } from './AddAirportModal';

function renderModal(store: AppStore = makeStore()) {
  return {
    store,
    ...render(
      <Provider store={store}>
        <NextIntlClientProvider locale="en" messages={stripsEn}>
          <AddAirportModal onClose={() => {}} />
        </NextIntlClientProvider>
      </Provider>,
    ),
  };
}

describe('AddAirportModal', () => {
  it('opens a known airport from the list (happy)', () => {
    const { store } = renderModal();
    // ObcButton renders in shadow DOM; its slotted label is light DOM.
    fireEvent.click(screen.getAllByText('Open')[1]);
    expect(store.getState().strips.tabsOrder.length).toBeGreaterThan(2);
  });

  it('opens any airport typed as an ICAO code (happy)', () => {
    const { store } = renderModal();
    const input = screen.getByTestId('addtab-icao-input');
    fireEvent.change(input, { target: { value: 'sbgr' } });
    fireEvent.click(screen.getByTestId('addtab-icao-open'));
    expect(store.getState().strips.tabsOrder).toContain('SBGR');
    expect(store.getState().strips.activeTab).toBe('SBGR');
    expect(store.getState().strips.tabs.SBGR.metar.station).toBe('SBGR');
  });

  it('suggests airports derived from the live controller list (happy)', () => {
    const store = makeStore();
    store.dispatch(
      stripsActions.controllersUpdated([
        { cs: 'SBGR_TWR', role: 'Guarulhos Tower', freq: '118.400' },
        { cs: 'LPPT_DEL', role: 'Lisboa Delivery', freq: '118.950' },
      ]),
    );
    renderModal(store);
    // LPPT is already open, so only SBGR appears as a session suggestion.
    expect(screen.getByText('SBGR')).toBeTruthy();
  });

  it('refuses a malformed ICAO (invalid)', () => {
    const { store } = renderModal();
    const input = screen.getByTestId('addtab-icao-input');
    fireEvent.change(input, { target: { value: 'SB' } });
    fireEvent.click(screen.getByTestId('addtab-icao-open'));
    expect(store.getState().strips.tabsOrder).not.toContain('SB');
    expect(store.getState().strips.tabsOrder).toEqual(['LPPT', 'LPPR']);
  });

  it('tolerates garbage input without dispatching (garbage)', () => {
    const { store } = renderModal();
    const input = screen.getByTestId('addtab-icao-input');
    fireEvent.change(input, { target: { value: '12!@' } });
    fireEvent.click(screen.getByTestId('addtab-icao-open'));
    expect(store.getState().strips.tabsOrder).toEqual(['LPPT', 'LPPR']);
  });
});
