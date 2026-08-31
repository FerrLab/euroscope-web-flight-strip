import { describe, it, expect, beforeEach } from 'vitest';
import { stripsSlice, stripsActions } from './slice';
import { initialStripsState } from './seed';
import { extractLayout, loadLayout, saveLayout, LAYOUT_KEY } from './persistence';

const reduce = stripsSlice.reducer;

describe('layout persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips open tabs, active tab, bays and locks (happy)', () => {
    let s = initialStripsState();
    s = reduce(s, stripsActions.airportOpened('SBGR'));
    s = reduce(
      s,
      stripsActions.baySplit({ bayId: 'TAXI', newTitle: 'Taxi B', sourceTitle: 'Taxi A' }),
    );
    s = reduce(s, stripsActions.bayLockToggled('RUNWAY'));
    s = reduce(s, stripsActions.tabSelected('LPPT'));
    s = reduce(s, stripsActions.stripArchived({ stripId: 'p7' })); // THY1756
    s = reduce(s, stripsActions.tabSelected('SBGR'));
    saveLayout(s);

    const restored = reduce(initialStripsState(), stripsActions.layoutRestored(loadLayout()!));
    expect(restored.tabsOrder).toEqual(['LPPT', 'LPPR', 'SBGR']);
    expect(restored.tabs.LPPT.archived.map((a) => a.cs)).toContain('THY1756');
    expect(restored.activeTab).toBe('SBGR');
    expect(restored.tabs.SBGR.metar.station).toBe('SBGR');
    expect(restored.tabs.SBGR.bays.filter((b) => b.kind === 'TAXI')).toHaveLength(2);
    expect(restored.tabs.SBGR.locks.RUNWAY).toBe(true);
  });

  it('extractLayout captures only layout, never strips (happy)', () => {
    const layout = extractLayout(initialStripsState());
    expect(JSON.stringify(layout)).not.toContain('TAP751');
  });

  it('returns null when nothing is saved (invalid)', () => {
    expect(loadLayout()).toBeNull();
  });

  it('survives corrupted storage (garbage)', () => {
    localStorage.setItem(LAYOUT_KEY, '{not json');
    expect(loadLayout()).toBeNull();
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ tabsOrder: 'nope' }));
    expect(loadLayout()).toBeNull();
  });

  it('layoutRestored ignores malformed entries but keeps valid ones (garbage)', () => {
    const s = reduce(
      initialStripsState(),
      stripsActions.layoutRestored({
        tabsOrder: ['LPPT', 'x!', 'SBGR'],
        activeTab: 'GONE',
        tabs: {
          SBGR: {
            bays: [
              { id: 'TAXI', kind: 'TAXI', title: null },
              { id: 'bad', kind: 'WAT' as never, title: null },
            ],
            locks: { TAXI: true },
          },
        },
      }),
    );
    expect(s.tabsOrder).toEqual(['LPPT', 'SBGR']);
    expect(s.activeTab).toBe('LPPT');
    expect(s.tabs.SBGR.bays).toHaveLength(1);
    expect(s.tabs.SBGR.locks.TAXI).toBe(true);
  });

  it('layoutRestored with an empty order is a no-op (invalid)', () => {
    const before = initialStripsState();
    const s = reduce(
      before,
      stripsActions.layoutRestored({ tabsOrder: [], activeTab: '', tabs: {} }),
    );
    expect(s.tabsOrder).toEqual(['LPPT', 'LPPR']);
  });
});
