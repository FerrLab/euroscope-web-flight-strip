import { describe, it, expect } from 'vitest';
import { catOf, windOf, roseOf } from './metar';
import type { Metar } from './types';

function metar(overrides: Partial<Metar> = {}): Metar {
  return {
    station: 'LPPT',
    obsTime: '05:00',
    raw: 'LPPT 120500Z 21008KT 9999 FEW025 22/14 Q1017',
    wind: '210°/08',
    windNote: 'steady',
    qnh: '1017',
    qnhAlt: '30.03 inHg',
    temp: '22 / 14',
    hum: 'RH 61%',
    vis: '10+',
    visUnit: 'km',
    ceil: 'FEW 025',
    ceilUnit: 'no ceiling',
    visM: 10000,
    ceilFt: 99999,
    rwys: ['21'],
    atis: 'K',
    depFreq: '121.750',
    clrNote: 'GND 121.750',
    ...overrides,
  };
}

describe('catOf', () => {
  it('classifies clear conditions as VFR (happy)', () => {
    expect(catOf(metar()).cat).toBe('VFR');
  });

  it('classifies marginal visibility as MVFR (happy)', () => {
    expect(catOf(metar({ visM: 7000 })).cat).toBe('MVFR');
  });

  it('classifies low ceiling as IFR (happy)', () => {
    expect(catOf(metar({ ceilFt: 800 })).cat).toBe('IFR');
  });

  it('classifies very low visibility as LIFR (happy)', () => {
    expect(catOf(metar({ visM: 1200 })).cat).toBe('LIFR');
  });

  it('takes the worse of visibility and ceiling (boundary)', () => {
    // VFR visibility but LIFR ceiling → LIFR wins.
    expect(catOf(metar({ visM: 10000, ceilFt: 400 })).cat).toBe('LIFR');
  });
});

describe('windOf', () => {
  it('parses direction, speed and gust (happy)', () => {
    const w = windOf(metar({ wind: '050°/16', windNote: 'G 28 kt' }));
    expect(w).toEqual({ dir: 50, spd: 16, gust: 28 });
  });

  it('returns null gust when the note has none (happy)', () => {
    expect(windOf(metar({ wind: '310°/09', windNote: 'steady' })).gust).toBeNull();
  });

  it('falls back to calm on an unparsable wind string (invalid)', () => {
    const w = windOf(metar({ wind: 'CALM' }));
    expect(w).toEqual({ dir: 0, spd: 0, gust: null });
  });

  it('tolerates empty strings (garbage)', () => {
    const w = windOf(metar({ wind: '', windNote: '' }));
    expect(w).toEqual({ dir: 0, spd: 0, gust: null });
  });
});

describe('roseOf', () => {
  it('decomposes a headwind aligned with the runway (happy)', () => {
    // LPPT RWY 21 hdg 206; wind straight down the runway.
    const rose = roseOf(metar({ wind: '206°/10', windNote: 'steady' }), 'LPPT');
    expect(rose.rwyId).toBe('21');
    expect(rose.hwLabel).toBe('HEADWIND');
    expect(rose.hwVal).toBe('10');
    expect(rose.xwVal).toBe('0');
  });

  it('flags a strong crosswind with the alarm color (happy)', () => {
    // Wind perpendicular to RWY 21 (296°) at 25 kt → 25 kt crosswind.
    const rose = roseOf(metar({ wind: '296°/25', windNote: 'steady' }), 'LPPT');
    expect(Number(rose.xwVal)).toBeGreaterThanOrEqual(20);
    expect(rose.xwColor).toBe('var(--alert-alarm-color)');
  });

  it('labels a tailwind and colors it caution (happy)', () => {
    // Wind from the opposite end (026°).
    const rose = roseOf(metar({ wind: '026°/10', windNote: 'steady' }), 'LPPT');
    expect(rose.hwLabel).toBe('TAILWIND');
    expect(rose.hwColor).toBe('var(--alert-caution-color)');
  });

  it('includes gust components when gusting (happy)', () => {
    const rose = roseOf(metar({ wind: '206°/10', windNote: 'G 20 kt' }), 'LPPT');
    expect(rose.hwGust).toBe('G 20');
  });

  it('derives a heading from the runway number for unknown airports (invalid)', () => {
    const rose = roseOf(metar({ rwys: ['09'], wind: '090°/10', windNote: '' }), 'ZZZZ');
    expect(rose.rwyId).toBe('09');
    expect(rose.hwLabel).toBe('HEADWIND');
  });

  it('survives an airport with no runway data at all (garbage)', () => {
    const rose = roseOf(metar({ rwys: [], wind: '', windNote: '' }), 'ZZZZ');
    expect(rose.rwyId).toBe('—');
    expect(rose.ticks).toHaveLength(12);
  });
});
