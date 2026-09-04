import { describe, it, expect } from 'vitest';
import { stripsSlice, stripsActions } from './slice';
import { initialStripsState } from './seed';
import type { StripsState } from './types';

const {
  tabSelected,
  tabClosed,
  airportOpened,
  stripMoved,
  clearanceIssued,
  stripArchived,
  stripDeleted,
  transferOffered,
  transferAccepted,
  transferCancelled,
  freeTextSet,
  squawkObserved,
  dclSent,
  dclAcked,
  fplApplied,
  stripAdded,
  suggestSet,
  bayRenamed,
  baySplit,
  bayLockToggled,
  bayRemoved,
  feedToggled,
  toastDismissed,
  eventLogged,
} = stripsActions;

const reduce = stripsSlice.reducer;

function state(): StripsState {
  return initialStripsState();
}

function findStrip(s: StripsState, id: string) {
  for (const icao of s.tabsOrder) {
    const hit = s.tabs[icao].strips.find((x) => x.id === id);
    if (hit) return hit;
  }
  return undefined;
}

describe('tabs', () => {
  it('selects a tab and clears its unseen count (happy)', () => {
    let s = state();
    s.tabs.LPPR.unseen = 3;
    s = reduce(s, tabSelected('LPPR'));
    expect(s.activeTab).toBe('LPPR');
    expect(s.tabs.LPPR.unseen).toBe(0);
  });

  it('closing the active tab activates the first remaining (happy)', () => {
    let s = state();
    s = reduce(s, tabClosed('LPPT'));
    expect(s.tabsOrder).toEqual(['LPPR']);
    expect(s.activeTab).toBe('LPPR');
  });

  it('refuses to close the last tab (invalid)', () => {
    let s = state();
    s = reduce(s, tabClosed('LPPT'));
    s = reduce(s, tabClosed('LPPR'));
    expect(s.tabsOrder).toEqual(['LPPR']);
  });

  it('opens a fresh airport with seeded METAR and activates it (happy)', () => {
    const s = reduce(state(), airportOpened('LPFR'));
    expect(s.tabsOrder).toContain('LPFR');
    expect(s.activeTab).toBe('LPFR');
    expect(s.tabs.LPFR.metar.station).toBe('LPFR');
  });

  it('ignores selecting an unknown tab (garbage)', () => {
    const s = reduce(state(), tabSelected('XXXX'));
    expect(s.activeTab).toBe('LPPT');
  });
});

describe('stripMoved', () => {
  it('moves a cleared strip and logs it (happy)', () => {
    const s = reduce(state(), stripMoved({ stripId: 'p6', bayId: 'PUSHBACK', source: 'drag' }));
    expect(findStrip(s, 'p6')?.bay).toBe('PUSHBACK');
    expect(s.tabs.LPPT.feed[0].key).toBe('moved');
  });

  it('marks an uncleared departure cleared when dropped into cleared (happy)', () => {
    const s = reduce(state(), stripMoved({ stripId: 'p1', bayId: 'CLEARED', source: 'drag' }));
    const p1 = findStrip(s, 'p1');
    expect(p1?.cleared).toBe(true);
    expect(p1?.bay).toBe('CLEARED');
  });

  it('rejects a guarded move with a toast and a feed entry (invalid)', () => {
    // p7 occupies RUNWAY (cap 1); p6 tries to enter.
    let s = state();
    s = reduce(s, stripMoved({ stripId: 'p6', bayId: 'RUNWAY', source: 'drag' }));
    // First move succeeds? No — p7 is already in RUNWAY, so it must reject.
    expect(findStrip(s, 'p6')?.bay).toBe('TAXI');
    expect(s.toasts.at(-1)?.key).toBe('occupancy');
    expect(s.tabs.LPPT.feed[0].kind).toBe('alarm');
  });

  it('ignores a move for an unknown strip (garbage)', () => {
    const before = state();
    const s = reduce(before, stripMoved({ stripId: 'nope', bayId: 'TAXI', source: 'drag' }));
    expect(s.toasts).toHaveLength(0);
  });

  it('clears the suggestion once the strip moves (happy)', () => {
    let s = reduce(state(), suggestSet({ stripId: 'p5', bay: 'TAXI' }));
    s = reduce(s, stripMoved({ stripId: 'p5', bayId: 'TAXI', source: 'auto' }));
    expect(findStrip(s, 'p5')?.suggest).toBeNull();
  });

  it('reorders a strip within its bay (happy)', () => {
    // PENDING renders p1, p2, p3; drop p3 before p1.
    const s = reduce(
      state(),
      stripMoved({ stripId: 'p3', bayId: 'PENDING', beforeStripId: 'p1', source: 'drag' }),
    );
    const pending = s.tabs.LPPT.strips.filter((x) => x.bay === 'PENDING').map((x) => x.id);
    expect(pending).toEqual(['p3', 'p1', 'p2']);
    // Cosmetic reorder: no feed entry, no toast.
    expect(s.tabs.LPPT.feed).toHaveLength(0);
    expect(s.toasts).toHaveLength(0);
  });

  it('drops into another bay at a specific position (happy)', () => {
    // p6 (TAXI, cleared) into PENDING? Not allowed (flow ok: DEP+cleared may go PENDING).
    const s = reduce(
      state(),
      stripMoved({ stripId: 'p6', bayId: 'PENDING', beforeStripId: 'p2', source: 'drag' }),
    );
    const pending = s.tabs.LPPT.strips.filter((x) => x.bay === 'PENDING').map((x) => x.id);
    expect(pending).toEqual(['p1', 'p6', 'p2', 'p3']);
  });

  it('appends at the end when dropped past the last strip (boundary)', () => {
    const s = reduce(
      state(),
      stripMoved({ stripId: 'p1', bayId: 'PENDING', beforeStripId: null, source: 'drag' }),
    );
    const pending = s.tabs.LPPT.strips.filter((x) => x.bay === 'PENDING').map((x) => x.id);
    expect(pending).toEqual(['p2', 'p3', 'p1']);
  });

  it('ignores a reorder targeting an unknown anchor (garbage)', () => {
    const s = reduce(
      state(),
      stripMoved({ stripId: 'p1', bayId: 'PENDING', beforeStripId: 'ghost', source: 'drag' }),
    );
    const pending = s.tabs.LPPT.strips.filter((x) => x.bay === 'PENDING').map((x) => x.id);
    // Unknown anchor degrades to append-at-end.
    expect(pending).toEqual(['p2', 'p3', 'p1']);
  });
});

describe('clearance and PDC', () => {
  it('issues clearance and promotes out of pending (happy)', () => {
    const s = reduce(state(), clearanceIssued('p1'));
    const p1 = findStrip(s, 'p1');
    expect(p1?.cleared).toBe(true);
    expect(p1?.bay).toBe('CLEARED');
  });

  it('sending a PDC clears the traffic outright — no ACK round-trip (happy)', () => {
    const s = reduce(state(), dclSent({ stripId: 'p1' }));
    const p1 = findStrip(s, 'p1');
    expect(p1?.dcl).toBe('ACK');
    expect(p1?.cleared).toBe(true);
    expect(p1?.bay).toBe('CLEARED');
  });

  it('dclAcked only upgrades a SENT state (invalid otherwise)', () => {
    const s = reduce(state(), dclAcked('p1'));
    expect(findStrip(s, 'p1')?.dcl).toBe('NONE');
  });
});

describe('archive, delete, transfer', () => {
  it('archives a strip into the archived list (happy)', () => {
    const s = reduce(state(), stripArchived({ stripId: 'p7' }));
    expect(findStrip(s, 'p7')).toBeUndefined();
    expect(s.tabs.LPPT.archived[0].cs).toBe('THY1756');
  });

  it('deletes a strip without archiving (happy)', () => {
    const s = reduce(state(), stripDeleted('p1'));
    expect(findStrip(s, 'p1')).toBeUndefined();
    expect(s.tabs.LPPT.archived).toHaveLength(0);
  });

  it('walks the transfer lifecycle (happy)', () => {
    let s = reduce(state(), transferOffered({ stripId: 'p6', to: 'LPPT_TWR' }));
    expect(findStrip(s, 'p6')?.xfr).toEqual({ to: 'LPPT_TWR', state: 'PENDING' });
    s = reduce(s, transferAccepted('p6'));
    expect(findStrip(s, 'p6')?.xfr?.state).toBe('ACCEPTED');
  });

  it('cancelling a transfer clears it (happy)', () => {
    let s = reduce(state(), transferOffered({ stripId: 'p6', to: 'LPPT_TWR' }));
    s = reduce(s, transferCancelled('p6'));
    expect(findStrip(s, 'p6')?.xfr).toBeNull();
  });

  it('does not accept a transfer that is not pending (invalid)', () => {
    const s = reduce(state(), transferAccepted('p6'));
    expect(findStrip(s, 'p6')?.xfr).toBeNull();
  });
});

describe('strip data updates', () => {
  it('stores free text (happy)', () => {
    const s = reduce(state(), freeTextSet({ stripId: 'p1', text: 'hold short' }));
    expect(findStrip(s, 'p1')?.freeText).toBe('hold short');
  });

  it('records an observed squawk (happy)', () => {
    const s = reduce(state(), squawkObserved({ stripId: 'p1', code: '2461' }));
    expect(findStrip(s, 'p1')?.sqkS).toBe('2461');
  });

  it('applies an FPL draft to the strip and keeps the ICAO data (happy)', () => {
    const s = reduce(
      state(),
      fplApplied({
        stripId: 'p1',
        draft: {
          ident: 'TAP751',
          rules: 'I',
          ftype: 'S',
          num: '1',
          actype: 'A21N',
          wake: 'M',
          equip: 'S/S',
          adep: 'LPPT',
          eobt: '0600',
          tas: 'N0450',
          rfl: 'F370',
          route: 'DCT',
          ades: 'LFPG',
          eet: '0200',
          altn: '',
          altn2: '',
          other: '',
          sqkA: '2462',
          proc: 'INBOM5S',
          rwy: '21',
          cfl: '070',
          gate: '500',
          freeText: 'amended',
        },
      }),
    );
    const p1 = findStrip(s, 'p1');
    expect(p1?.type).toBe('A21N');
    expect(p1?.ades).toBe('LFPG');
    expect(p1?.sqkA).toBe('2462');
    expect(p1?.fpl?.rfl).toBe('F370');
  });

  it('adds an incoming strip to a background tab and bumps unseen (happy)', () => {
    const s = reduce(
      state(),
      stripAdded({
        icao: 'LPPR',
        strip: {
          id: 'r9',
          cs: 'TVF77QG',
          airline: 'Transavia France',
          type: 'B738',
          wake: 'M',
          adep: 'LFPO',
          ades: 'LPPR',
          gate: '14',
          sqkA: '5533',
          proc: 'TURON1E',
          procKind: 'STAR',
          rwy: '35',
          cfl: '070',
          dir: 'ARR',
          bay: 'APPROACH',
        },
      }),
    );
    expect(s.tabs.LPPR.strips[0].cs).toBe('TVF77QG');
    expect(s.tabs.LPPR.unseen).toBeGreaterThan(0);
  });
});

describe('bays', () => {
  it('renames a bay, trimming to null for empty input (happy + invalid)', () => {
    let s = reduce(state(), bayRenamed({ bayId: 'TAXI', title: ' Taxi north ' }));
    expect(s.tabs.LPPT.bays.find((b) => b.id === 'TAXI')?.title).toBe('Taxi north');
    s = reduce(s, bayRenamed({ bayId: 'TAXI', title: '   ' }));
    expect(s.tabs.LPPT.bays.find((b) => b.id === 'TAXI')?.title).toBeNull();
  });

  it('splits a bay into a sibling of the same kind (happy)', () => {
    const s = reduce(
      state(),
      baySplit({ bayId: 'TAXI', newTitle: 'Taxi B', sourceTitle: 'Taxi A' }),
    );
    const taxis = s.tabs.LPPT.bays.filter((b) => b.kind === 'TAXI');
    expect(taxis).toHaveLength(2);
    expect(taxis[0].title).toBe('Taxi A');
    expect(taxis[1].title).toBe('Taxi B');
  });

  it('locks and unlocks a bay (happy)', () => {
    let s = reduce(state(), bayLockToggled('RUNWAY'));
    expect(s.tabs.LPPT.locks.RUNWAY).toBe(true);
    s = reduce(s, bayLockToggled('RUNWAY'));
    expect(s.tabs.LPPT.locks.RUNWAY).toBe(false);
  });

  it('refuses to remove a non-empty bay with a toast (invalid)', () => {
    let s = reduce(state(), baySplit({ bayId: 'TAXI', newTitle: 'Taxi B', sourceTitle: 'Taxi A' }));
    s = reduce(s, bayRemoved('TAXI'));
    expect(s.tabs.LPPT.bays.filter((b) => b.kind === 'TAXI')).toHaveLength(2);
    expect(s.toasts.at(-1)?.key).toBe('bayNotEmpty');
  });

  it('refuses to remove the last bay of a kind (invalid)', () => {
    const s = reduce(state(), bayRemoved('APPROACH'));
    expect(s.tabs.LPPT.bays.some((b) => b.kind === 'APPROACH')).toBe(true);
  });

  it('removes an empty duplicate bay (happy)', () => {
    let s = reduce(state(), baySplit({ bayId: 'TAXI', newTitle: 'Taxi B', sourceTitle: 'Taxi A' }));
    const newBay = s.tabs.LPPT.bays.filter((b) => b.kind === 'TAXI')[1];
    s = reduce(s, bayRemoved(newBay.id));
    expect(s.tabs.LPPT.bays.filter((b) => b.kind === 'TAXI')).toHaveLength(1);
  });
});

describe('feed and toasts', () => {
  it('logs an event to a tab feed, newest first, capped at 40 (happy)', () => {
    let s = state();
    for (let i = 0; i < 45; i++) {
      s = reduce(
        s,
        eventLogged({ icao: 'LPPT', kind: 'info', key: 'custom', params: { n: i }, src: 'auto' }),
      );
    }
    expect(s.tabs.LPPT.feed).toHaveLength(40);
    expect(s.tabs.LPPT.feed[0].params.n).toBe(44);
  });

  it('ignores logs for unknown tabs (garbage)', () => {
    const s = reduce(
      state(),
      eventLogged({ icao: 'ZZZZ', kind: 'info', key: 'custom', params: {}, src: 'auto' }),
    );
    expect(s.toasts).toHaveLength(0);
  });

  it('dismisses a toast by id (happy)', () => {
    let s = reduce(state(), stripMoved({ stripId: 'p6', bayId: 'RUNWAY', source: 'drag' }));
    const id = s.toasts[0].id;
    s = reduce(s, toastDismissed(id));
    expect(s.toasts).toHaveLength(0);
  });

  it('toggles the live feed flag (happy)', () => {
    const s = reduce(state(), feedToggled(false));
    expect(s.feedOn).toBe(false);
  });
});
