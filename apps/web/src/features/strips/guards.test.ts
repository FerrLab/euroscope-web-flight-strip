import { describe, it, expect } from 'vitest';
import { allowedBays, checkMove } from './guards';
import { defaultBays } from './airports';
import type { Strip, StripsTab } from './types';

function strip(overrides: Partial<Strip> = {}): Strip {
  return {
    id: 's1',
    cs: 'TAP751',
    airline: 'TAP Air Portugal',
    type: 'A320',
    wake: 'M',
    adep: 'LPPT',
    ades: 'LFPO',
    gate: '512',
    sqkA: '2461',
    sqkS: '',
    proc: 'INBOM5S',
    procKind: 'SID',
    rwy: '21',
    cfl: '060',
    dir: 'DEP',
    bay: 'PENDING',
    cleared: false,
    dcl: 'NONE',
    freeText: '',
    suggest: null,
    anim: false,
    xfr: null,
    fpl: null,
    ...overrides,
  };
}

function tab(overrides: Partial<StripsTab> = {}): StripsTab {
  return {
    icao: 'LPPT',
    metar: {} as StripsTab['metar'],
    strips: [],
    bays: defaultBays(),
    locks: {},
    feed: [],
    archived: [],
    unseen: 0,
    ...overrides,
  };
}

describe('allowedBays', () => {
  it('lets arrivals into approach, runway and taxi only (happy)', () => {
    expect(allowedBays('ARR')).toEqual(['APPROACH', 'RUNWAY', 'TAXI']);
  });

  it('lets departures flow pending through runway (happy)', () => {
    expect(allowedBays('DEP')).toEqual(['PENDING', 'CLEARED', 'PUSHBACK', 'TAXI', 'RUNWAY']);
  });

  it('lets VFR go anywhere (happy)', () => {
    expect(allowedBays('VFR')).toHaveLength(6);
  });
});

describe('checkMove', () => {
  it('allows a cleared departure into taxi (happy)', () => {
    const s = strip({ cleared: true, bay: 'CLEARED' });
    expect(checkMove(s, tab({ strips: [s] }), 'TAXI').ok).toBe(true);
  });

  it('rejects a same-bay drop silently (invalid)', () => {
    const s = strip();
    const v = checkMove(s, tab({ strips: [s] }), 'PENDING');
    expect(v.ok).toBe(false);
    expect(v.silent).toBe(true);
  });

  it('rejects drops into a locked bay (invalid)', () => {
    const s = strip({ cleared: true });
    const v = checkMove(s, tab({ strips: [s], locks: { TAXI: true } }), 'TAXI');
    expect(v.ok).toBe(false);
    expect(v.title).toBe('bayLocked');
  });

  it('rejects an arrival dropped into pending (invalid — flow guard)', () => {
    const s = strip({ dir: 'ARR', bay: 'APPROACH' });
    const v = checkMove(s, tab({ strips: [s] }), 'PENDING');
    expect(v.ok).toBe(false);
    expect(v.title).toBe('flowGuard');
  });

  it('rejects an over-capacity runway drop (invalid)', () => {
    const occupant = strip({ id: 'x', cs: 'OTHER1', bay: 'RUNWAY', cleared: true });
    const mover = strip({ cleared: true, bay: 'TAXI' });
    const v = checkMove(mover, tab({ strips: [occupant, mover] }), 'RUNWAY');
    expect(v.ok).toBe(false);
    expect(v.title).toBe('occupancy');
  });

  it('rejects an uncleared departure moving past cleared (invalid)', () => {
    const s = strip({ cleared: false });
    const v = checkMove(s, tab({ strips: [s] }), 'PUSHBACK');
    expect(v.ok).toBe(false);
    expect(v.title).toBe('noClearance');
  });

  it('allows an uncleared departure into cleared itself (boundary)', () => {
    const s = strip({ cleared: false });
    expect(checkMove(s, tab({ strips: [s] }), 'CLEARED').ok).toBe(true);
  });

  it('rejects a move to a bay id that does not exist (garbage)', () => {
    const s = strip();
    const v = checkMove(s, tab({ strips: [s] }), 'NOPE');
    expect(v.ok).toBe(false);
    expect(v.title).toBe('unknownBay');
  });
});
