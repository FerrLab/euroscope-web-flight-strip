import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import stripsEn from '@/messages/strips.en.json';
import { makeStore, type AppStore } from '@/shared/store/index';
import { stripsActions } from '../slice';
import { StripBoard } from './StripBoard';

function renderBoard(store: AppStore = makeStore()) {
  const noop = () => {};
  const utils = render(
    <Provider store={store}>
      <NextIntlClientProvider locale="en" messages={stripsEn}>
        <StripBoard
          tab={store.getState().strips.tabs.LPPT}
          compact={false}
          onStripContextMenu={noop}
          onBayContextMenu={noop}
          renamingBay={null}
          onRenamingBayChange={noop}
        />
      </NextIntlClientProvider>
    </Provider>,
  );
  return { store, ...utils };
}

describe('StripBoard', () => {
  it('renders the six flow columns with the seeded strips (happy)', () => {
    renderBoard();
    for (const kind of ['PENDING', 'CLEARED', 'PUSHBACK', 'TAXI', 'RUNWAY', 'APPROACH']) {
      expect(screen.getByTestId(`column-${kind}`)).toBeTruthy();
    }
    expect(screen.getByTestId('strip-TAP751')).toBeTruthy();
    expect(screen.getByTestId('strip-VLG8460')).toBeTruthy();
  });

  it('titles the runway bay after the active runway (happy)', () => {
    renderBoard();
    expect(screen.getByText('Runway 21')).toBeTruthy();
  });

  it('shows the runway occupancy cap (happy)', () => {
    renderBoard();
    expect(screen.getByText('1 / 1')).toBeTruthy();
  });

  it('locks a bay from the header button and shows the badge (happy)', () => {
    const { store } = renderBoard();
    fireEvent.click(screen.getByTestId('bay-lock-CLEARED'));
    expect(store.getState().strips.tabs.LPPT.locks.CLEARED).toBe(true);
  });

  it('dispatches a drag-drop move into an allowed bay (happy)', () => {
    const { store } = renderBoard();
    const card = screen.getByTestId('strip-TAP751');
    const clearedZone = screen.getByTestId('bay-CLEARED').children[1];
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => 'p1'),
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(clearedZone, { dataTransfer });
    fireEvent.drop(clearedZone, { dataTransfer });
    const p1 = store.getState().strips.tabs.LPPT.strips.find((s) => s.id === 'p1');
    expect(p1?.bay).toBe('CLEARED');
  });

  it('rejects a guarded drop and raises the toast (invalid)', () => {
    const { store } = renderBoard();
    const card = screen.getByTestId('strip-TAP751');
    const runwayZone = screen.getByTestId('bay-RUNWAY').children[1];
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => 'p1'),
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(runwayZone, { dataTransfer });
    const p1 = store.getState().strips.tabs.LPPT.strips.find((s) => s.id === 'p1');
    expect(p1?.bay).toBe('PENDING');
    expect(store.getState().strips.toasts.length).toBeGreaterThan(0);
  });

  it('survives a drop carrying an unknown strip id (garbage)', () => {
    const { store } = renderBoard();
    const zone = screen.getByTestId('bay-TAXI').children[1];
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => 'nope'),
      effectAllowed: '',
      dropEffect: '',
    };
    expect(() => fireEvent.drop(zone, { dataTransfer })).not.toThrow();
    expect(store.getState().strips.toasts).toHaveLength(0);
  });

  it('reorders a strip dropped onto another card in the same bay (happy)', () => {
    const { store } = renderBoard();
    const card = screen.getByTestId('strip-TAP751');
    const targetSlot = screen.getByTestId('strip-slot-CSDHS');
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => 'p1'),
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(card, { dataTransfer });
    // jsdom rects are zero-height, so the drop computes as "after" CSDHS.
    fireEvent.drop(targetSlot, { dataTransfer, clientY: 0 });
    const pending = store
      .getState()
      .strips.tabs.LPPT.strips.filter((s) => s.bay === 'PENDING')
      .map((s) => s.id);
    expect(pending).toEqual(['p2', 'p3', 'p1']);
    // Reorder is cosmetic: no toast, no feed entry.
    expect(store.getState().strips.toasts).toHaveLength(0);
  });

  it('bumps cards apart to preview the insertion slot while dragging (happy)', () => {
    renderBoard();
    const card = screen.getByTestId('strip-TAP751');
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => 'p1'),
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(card, { dataTransfer });
    // jsdom rects are zero-height → hover computes as "after RYR2394",
    // so the slot opens above CSDHS.
    fireEvent.dragOver(screen.getByTestId('strip-slot-RYR2394'), { dataTransfer, clientY: 0 });
    expect(screen.getByTestId('strip-slot-CSDHS').style.paddingTop).not.toBe('');
    expect(screen.getByTestId('strip-slot-CSDHS').style.paddingTop).not.toBe('0px');
  });

  it('shows no slot for a no-op drop right after the dragged card (boundary)', () => {
    renderBoard();
    const card = screen.getByTestId('strip-TAP751');
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => 'p1'),
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(card, { dataTransfer });
    // "After TAP751" would put p1 exactly where it already is.
    fireEvent.dragOver(screen.getByTestId('strip-slot-TAP751'), { dataTransfer, clientY: 0 });
    const next = screen.getByTestId('strip-slot-RYR2394').style.paddingTop;
    expect(next === '' || next === '0px').toBe(true);
  });

  it('closes the slot again when the drag ends (happy)', () => {
    renderBoard();
    const card = screen.getByTestId('strip-TAP751');
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => 'p1'),
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('strip-slot-RYR2394'), { dataTransfer, clientY: 0 });
    fireEvent.dragEnd(card);
    const gap = screen.getByTestId('strip-slot-CSDHS').style.paddingTop;
    expect(gap === '' || gap === '0px').toBe(true);
  });

  it('opens no slot over a bay the guard would reject (invalid)', () => {
    renderBoard();
    // p8 is an arrival — PENDING is flow-guarded against it.
    const card = screen.getByTestId('strip-VLG8460');
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => 'p8'),
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('strip-slot-TAP751'), { dataTransfer, clientY: 0 });
    const gap = screen.getByTestId('strip-slot-RYR2394').style.paddingTop;
    expect(gap === '' || gap === '0px').toBe(true);
  });

  it('shows the empty label for a vacated bay (happy)', () => {
    const store = makeStore();
    store.dispatch(stripsActions.stripArchived({ stripId: 'p5' }));
    renderBoard(store);
    expect(screen.getByText('No pushback in progress')).toBeTruthy();
  });
});
