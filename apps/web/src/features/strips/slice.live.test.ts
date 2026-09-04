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

  it('patches an existing strip without moving it, suggesting the new bay instead (happy)', () => {
    let s = reduce(state(), flightUpserted({ icao: 'LPPT', patch: patch() }));
    s = reduce(
      s,
      flightUpserted({ icao: 'LPPT', patch: patch({ bay: 'TAXI', sqkS: '2450', cleared: true }) }),
    );
    const strip = stripOf(s, 'LPPT', 'BAW123');
    expect(strip?.bay).toBe('PENDING');
    expect(strip?.suggest).toEqual({ bay: 'TAXI' });
    expect(strip?.sqkS).toBe('2450');
    expect(strip?.cleared).toBe(true);
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
