import { describe, it, expect } from 'vitest';
import { fplDraftOf, dclTextFor } from './fpl';
import type { Metar, Strip } from './types';

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

const metar = {
  qnh: '1017',
  atis: 'K',
  clrNote: 'GND 121.750',
} as Metar;

describe('fplDraftOf', () => {
  it('uses the seeded route data for a known callsign (happy)', () => {
    const d = fplDraftOf(strip());
    expect(d.ident).toBe('TAP751');
    expect(d.route).toContain('UN873');
    expect(d.rules).toBe('I');
  });

  it('derives VFR defaults for a VFR strip without a seed (happy)', () => {
    const d = fplDraftOf(strip({ cs: 'XXVFR', dir: 'VFR' }));
    expect(d.rules).toBe('V');
    expect(d.rfl).toBe('VFR');
  });

  it('prefers amendments already applied to the strip (invalid seed vs live data)', () => {
    const d = fplDraftOf(
      strip({
        fpl: {
          rules: 'Y',
          ftype: 'S',
          num: '1',
          equip: 'SDFG/S',
          eobt: '0700',
          tas: 'N0400',
          rfl: 'F300',
          route: 'DCT',
          eet: '0100',
          altn: '',
          altn2: '',
          other: '',
        },
      }),
    );
    expect(d.rules).toBe('Y');
    expect(d.eobt).toBe('0700');
  });

  it('fills every field for a wholly unknown IFR callsign (garbage-ish)', () => {
    const d = fplDraftOf(strip({ cs: 'ZZZ999' }));
    expect(d.route).toBe('DCT');
    expect(d.tas).toBe('N0450');
    expect(d.other).toContain('VATSIM');
  });
});

describe('dclTextFor', () => {
  it('renders the full PDC with squawk, runway and ATIS (happy)', () => {
    const text = dclTextFor(strip(), metar, '', '05:31');
    expect(text).toContain('PDC TAP751 — 05:31Z');
    expect(text).toContain('VIA INBOM5S DEPARTURE, RUNWAY 21.');
    expect(text).toContain('INITIAL CLIMB 6000 FT. SQUAWK 2461.');
    expect(text).toContain('QNH 1017. ATIS K.');
  });

  it('appends an uppercased remark when given (happy)', () => {
    const text = dclTextFor(strip(), metar, 'expect delay 5 min', '05:31');
    expect(text.endsWith('RMK EXPECT DELAY 5 MIN')).toBe(true);
  });

  it('omits the remark line for a blank remark (invalid)', () => {
    const text = dclTextFor(strip(), metar, '', '05:31');
    expect(text).not.toContain('RMK');
  });

  it('tolerates a non-numeric CFL (garbage)', () => {
    const text = dclTextFor(strip({ cfl: 'abc' }), metar, '', '05:31');
    expect(text).toContain('INITIAL CLIMB');
  });

  it('omits unavailable QNH/ATIS/contact segments (invalid metar — placeholder airport)', () => {
    const placeholder = { qnh: '—', atis: '—', clrNote: '' } as Metar;
    const text = dclTextFor(strip(), placeholder, '', '05:31');
    expect(text).not.toContain('QNH');
    expect(text).not.toContain('ATIS');
    expect(text).not.toContain('WHEN READY CONTACT');
    expect(text).toContain('SQUAWK 2461');
  });
});

describe('dclWireText', () => {
  it('flattens the PDC to one ASCII-only line for EuroScope (happy)', async () => {
    const { dclWireText } = await import('./fpl');
    const wire = dclWireText(dclTextFor(strip(), metar, 'expect delay', '05:31'));
    expect(wire).not.toContain('\n');
    expect(wire).not.toContain('—');
    // Every byte must survive EuroScope's non-UTF-8 chat.
    expect(/^[\x20-\x7e]*$/.test(wire)).toBe(true);
    expect(wire).toContain('CLEARED TO LFPO');
    expect(wire).toContain('RMK EXPECT DELAY');
  });
});
