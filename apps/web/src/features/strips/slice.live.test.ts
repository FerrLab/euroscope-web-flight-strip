import { describe, it, expect } from 'vitest';
import { stripsSlice, stripsActions } from './slice';
import { initialStripsState } from './seed';
import type { StripPatch } from './euroscope';
import type { StripsState } from './types';

const reduce = stripsSlice.reducer;
const { flightUpserted, flightRemoved, positionUpdated, controllersUpdated } = stripsActions;

function patch(overrides: Partial<StripPatch> = {}): StripPatch {
  return {
    cs: 'BAW123',
    dir: 'DEP',
    type: 'A319',
    wake: 'M',
    adep: 'LPPT',
    ades: 'EGLL',
    proc: 'INBOM5S',
    procKind: 'SID',
    rwy: '21',
    sqkA: '2450',
    sqkS: '',
    cfl: '060',
    freeText: '',
    cleared: false,
    bay: 'PENDING',
    handoffTo: '',
    ...overrides,
  };
}

function state(): StripsState {
  return initialStripsState();
}

function stripOf(s: StripsState, icao: string, cs: string) {
  return s.tabs[icao].strips.find((x) => x.cs === cs);
}

describe('flightUpserted', () => {
  it('inserts a new live flight into its mapped bay with a feed log (happy)', () => {
    const s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    const strip = stripOf(s, 'LPPT', 'BAW123');
    expect(strip?.bay).toBe('PENDING');
    expect(strip?.id).toBe('es-BAW123');
    expect(s.tabs.LPPT.feed[0].key).toBe('fplReceived');
  });

  it('moves an existing strip into the bay EuroScope reports (happy)', () => {
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    s = reduce(
      s,
      flightUpserted({ icao: 'LPPT', patch: patch({ bay: 'TAXI', sqkS: '2450', cleared: true }) }),
    );
    const strip = stripOf(s, 'LPPT', 'BAW123');
    expect(strip?.bay).toBe('TAXI');
    // The pill exists to propose a move; once the board has made it there
    // is nothing left to propose.
    expect(strip?.suggest).toBeNull();
    expect(strip?.sqkS).toBe('2450');
    expect(strip?.cleared).toBe(true);
  });

  it('attributes the move to EuroScope, not the controller (happy)', () => {
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    s = reduce(s, flightUpserted({ icao: 'LPPT', patch: patch({ bay: 'CLEARED' }) }));
    const moved = s.tabs.LPPT.feed.find((e) => e.key === 'moved');
    expect(moved?.src).toBe('auto');
    expect(moved?.kind).toBe('info');
  });

  it('leaves a strip alone when it already sits in the reported bay (invalid)', () => {
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    const before = s.tabs.LPPT.feed.length;
    s = reduce(s, flightUpserted({ icao: 'LPPT', patch: patch() }));
    expect(stripOf(s, 'LPPT', 'BAW123')?.bay).toBe('PENDING');
    expect(s.tabs.LPPT.feed).toHaveLength(before);
  });

  /*
   * The board mirrors EuroScope rather than arbitrating it: a state the
   * controller set in the client is a position report, not a request, so
   * none of the four guard rails may veto it. Each case below would be
   * refused outright for a user-driven drag.
   */
  describe('guard rails do not apply to a EuroScope-reported position', () => {
    it('moves a DEP strip past CLEARED without a clearance (noClearance)', () => {
      let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
      s = reduce(s, flightUpserted({ icao: 'LPPT', patch: patch({ bay: 'PUSHBACK' }) }));
      expect(stripOf(s, 'LPPT', 'BAW123')?.bay).toBe('PUSHBACK');
    });

    it('moves into a locked bay (bayLocked)', () => {
      let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch({ cleared: true }) }));
      s = reduce(s, stripsActions.bayLockToggled('TAXI'));
      expect(s.tabs.LPPT.locks.TAXI).toBe(true);
      s = reduce(s, flightUpserted({ icao: 'LPPT', patch: patch({ bay: 'TAXI', cleared: true }) }));
      expect(stripOf(s, 'LPPT', 'BAW123')?.bay).toBe('TAXI');
    });

    it('moves into a bay already at capacity (occupancy)', () => {
      // RUNWAY has cap 1 and the seeded board already parks a strip there.
      let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch({ cleared: true }) }));
      const cap = s.tabs.LPPT.bays.find((b) => b.id === 'RUNWAY')?.cap;
      expect(cap).toBe(1);
      expect(s.tabs.LPPT.strips.filter((x) => x.bay === 'RUNWAY').length).toBeGreaterThanOrEqual(1);

      s = reduce(
        s,
        flightUpserted({ icao: 'LPPT', patch: patch({ bay: 'RUNWAY', cleared: true }) }),
      );

      expect(stripOf(s, 'LPPT', 'BAW123')?.bay).toBe('RUNWAY');
      expect(s.tabs.LPPT.strips.filter((x) => x.bay === 'RUNWAY').length).toBeGreaterThan(1);
    });

    it('moves an arrival into a departure-only bay (flowGuard)', () => {
      let s = reduce(
        state(),
        flightUpserted({
          icao: 'LPPT',
          patch: patch({ cs: 'ARR456', dir: 'ARR', bay: 'APPROACH' }),
        }),
      );
      s = reduce(
        s,
        flightUpserted({
          icao: 'LPPT',
          patch: patch({ cs: 'ARR456', dir: 'ARR', bay: 'PENDING' }),
        }),
      );
      expect(stripOf(s, 'LPPT', 'ARR456')?.bay).toBe('PENDING');
    });
  });

  it('marks a DEP strip cleared when EuroScope reports it in CLEARED (happy)', () => {
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    expect(stripOf(s, 'LPPT', 'BAW123')?.cleared).toBe(false);
    s = reduce(s, flightUpserted({ icao: 'LPPT', patch: patch({ bay: 'CLEARED' }) }));
    const strip = stripOf(s, 'LPPT', 'BAW123');
    expect(strip?.bay).toBe('CLEARED');
    expect(strip?.cleared).toBe(true);
  });

  it('falls back to a suggestion when the tab has no bay of that kind (garbage)', () => {
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch({ cleared: true }) }));
    // Built by hand rather than via bayRemoved, which refuses to delete the
    // last bay of a kind — so this state is unreachable through the UI and
    // the fallback is purely defensive (a restored older persisted board).
    s = {
      ...s,
      tabs: {
        ...s.tabs,
        LPPT: { ...s.tabs.LPPT, bays: s.tabs.LPPT.bays.filter((b) => b.kind !== 'TAXI') },
      },
    };

    s = reduce(s, flightUpserted({ icao: 'LPPT', patch: patch({ bay: 'TAXI', cleared: true }) }));

    const strip = stripOf(s, 'LPPT', 'BAW123');
    // Nothing to move into, so the pill is all that is left to say it.
    expect(strip?.bay).toBe('PENDING');
    expect(strip?.suggest).toEqual({ bay: 'TAXI' });
  });

  it('does not re-log or duplicate on repeated updates (invalid)', () => {
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    s = reduce(s, flightUpserted({ icao: 'LPPT', patch: patch() }));
    expect(s.tabs.LPPT.strips.filter((x) => x.cs === 'BAW123')).toHaveLength(1);
    expect(s.tabs.LPPT.feed.filter((e) => e.key === 'fplReceived')).toHaveLength(1);
  });

  it('tracks the handoff target as a pending transfer (happy)', () => {
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    s = reduce(s, flightUpserted({ icao: 'LPPT', patch: patch({ handoffTo: 'LPPC_APP' }) }));
    expect(stripOf(s, 'LPPT', 'BAW123')?.xfr).toEqual({ to: 'LPPC_APP', state: 'PENDING' });
    s = reduce(s, flightUpserted({ icao: 'LPPT', patch: patch({ handoffTo: '' }) }));
    expect(stripOf(s, 'LPPT', 'BAW123')?.xfr).toBeNull();
  });

  it('never resurrects a user-archived callsign (happy — refresh/scan safety)', () => {
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    const id = stripOf(s, 'LPPT', 'BAW123')!.id;
    s = reduce(s, stripsActions.stripArchived({ stripId: id }));
    s = reduce(s, flightUpserted({ icao: 'LPPT', patch: patch() }));
    expect(stripOf(s, 'LPPT', 'BAW123')).toBeUndefined();
    expect(s.tabs.LPPT.archived.filter((a) => a.cs === 'BAW123')).toHaveLength(1);
  });

  it('resurrects an auto-archived flight that reappears in the session (happy)', () => {
    // Transient disappearance: flight_removed auto-archives, then the
    // aircraft reconnects and the session shows it again.
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    s = reduce(s, flightRemoved('BAW123'));
    expect(stripOf(s, 'LPPT', 'BAW123')).toBeUndefined();
    expect(s.tabs.LPPT.archived[0]?.by).toBe('auto');
    s = reduce(s, flightUpserted({ icao: 'LPPT', patch: patch() }));
    expect(stripOf(s, 'LPPT', 'BAW123')).toBeDefined();
    expect(s.tabs.LPPT.archived.filter((a) => a.cs === 'BAW123')).toHaveLength(0);
  });

  it('restores a user-archived strip via stripUnarchived (happy)', () => {
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    const id = stripOf(s, 'LPPT', 'BAW123')!.id;
    s = reduce(s, stripsActions.stripArchived({ stripId: id }));
    s = reduce(s, stripsActions.stripUnarchived({ icao: 'LPPT', cs: 'BAW123' }));
    expect(s.tabs.LPPT.archived.filter((a) => a.cs === 'BAW123')).toHaveLength(0);
    // The strip itself returns via the next flight update / get_flight.
    s = reduce(s, flightUpserted({ icao: 'LPPT', patch: patch() }));
    expect(stripOf(s, 'LPPT', 'BAW123')).toBeDefined();
  });

  it('ignores unarchiving unknown entries (garbage)', () => {
    const s = reduce(state(), stripsActions.stripUnarchived({ icao: 'LPPT', cs: 'GHOST1' }));
    expect(s.tabs.LPPT.archived).toHaveLength(0);
  });

  it('ignores upserts for unopened tabs (garbage)', () => {
    const s = reduce(state(), flightUpserted({ icao: 'ZZZZ', patch: patch() }));
    expect(s.tabs.ZZZZ).toBeUndefined();
  });
});

describe('flightRemoved / positionUpdated / controllersUpdated', () => {
  it('archives a removed flight silently with its own feed entry (happy)', () => {
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    s = reduce(s, flightRemoved('BAW123'));
    expect(stripOf(s, 'LPPT', 'BAW123')).toBeUndefined();
    expect(s.tabs.LPPT.archived[0].cs).toBe('BAW123');
    expect(s.tabs.LPPT.feed[0].key).toBe('flightRemoved');
  });

  it('ignores removal of unknown callsigns (invalid)', () => {
    const before = state();
    const s = reduce(before, flightRemoved('NOPE99'));
    expect(s.tabs.LPPT.archived).toHaveLength(0);
  });

  it('updates the live squawk from a position event (happy)', () => {
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    s = reduce(s, positionUpdated({ cs: 'BAW123', squawk: '2450' }));
    expect(stripOf(s, 'LPPT', 'BAW123')?.sqkS).toBe('2450');
  });

  it('accumulates session airports, validated and deduped (happy + garbage)', () => {
    let s = reduce(state(), stripsActions.airportsSeen(['SBGR', 'SBCT']));
    s = reduce(s, stripsActions.airportsSeen(['SBGR', 'x!', '', 'LFPG']));
    expect(s.seenAirports).toEqual(['LFPG', 'SBCT', 'SBGR']);
  });

  it('replaces the live controller list (happy)', () => {
    const s = reduce(
      state(),
      controllersUpdated([{ cs: 'LPPT_TWR', role: 'Lisboa Tower', freq: '118.100' }]),
    );
    expect(s.controllers).toHaveLength(1);
    expect(s.controllers[0].cs).toBe('LPPT_TWR');
  });
});
