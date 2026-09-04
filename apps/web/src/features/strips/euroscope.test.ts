import { describe, it, expect } from 'vitest';
import {
  parseInboundEnvelope,
  directionFor,
  bayForGroundState,
  cflOf,
  stripPatchFromFlight,
  stationFromController,
  groundStateForBay,
  type FlightObject,
} from './euroscope';

function flight(overrides: Partial<FlightObject> = {}): FlightObject {
  return {
    callsign: 'TAP751',
    aircraftType: 'A320',
    wtc: 'M',
    origin: 'LPPT',
    destination: 'LFPO',
    departureRunway: '21',
    arrivalRunway: '',
    sid: 'INBOM5S',
    star: '',
    assignedSquawk: '2461',
    transponderSquawk: '2000',
    scratchPad: '',
    groundState: '',
    clearanceFlag: false,
    clearedAltitude: 6000,
    finalAltitude: 36000,
    handoffTargetController: '',
    trackedByMe: true,
    ...overrides,
  };
}

describe('parseInboundEnvelope', () => {
  it('accepts a well-formed event (happy)', () => {
    const parsed = parseInboundEnvelope({
      type: 'event',
      action: 'flight_updated',
      callsign: 'TAP751',
      payload: { callsign: 'TAP751', origin: 'LPPT' },
    });
    expect(parsed?.action).toBe('flight_updated');
  });

  it('rejects an envelope without an action (invalid)', () => {
    expect(parseInboundEnvelope({ type: 'event', payload: {} })).toBeNull();
  });

  it('rejects non-object garbage (garbage)', () => {
    expect(parseInboundEnvelope('lol')).toBeNull();
    expect(parseInboundEnvelope(null)).toBeNull();
    expect(parseInboundEnvelope(42)).toBeNull();
  });
});

describe('directionFor', () => {
  it('marks a flight departing the tab airport DEP (happy)', () => {
    expect(directionFor(flight(), 'LPPT')).toBe('DEP');
  });

  it('marks a flight arriving at the tab airport ARR (happy)', () => {
    expect(directionFor(flight({ origin: 'EGKK', destination: 'LPPT' }), 'LPPT')).toBe('ARR');
  });

  it('marks a local flight VFR (happy)', () => {
    expect(directionFor(flight({ destination: 'LPPT' }), 'LPPT')).toBe('VFR');
  });

  it('returns null when the flight does not touch the airport (invalid)', () => {
    expect(directionFor(flight({ origin: 'EGKK', destination: 'EGLL' }), 'LPPT')).toBeNull();
  });

  it('keeps a planless flight the controller is tracking as local VFR (happy)', () => {
    expect(directionFor(flight({ origin: '', destination: '', trackedByMe: true }), 'LPPT')).toBe(
      'VFR',
    );
  });

  it('drops planless flights nobody tracks (invalid)', () => {
    expect(
      directionFor(flight({ origin: '', destination: '', trackedByMe: false }), 'LPPT'),
    ).toBeNull();
  });
});

describe('bayForGroundState', () => {
  it('maps the departure flow (happy)', () => {
    expect(bayForGroundState('NSTS', 'DEP')).toBe('PENDING');
    expect(bayForGroundState('CLEA', 'DEP')).toBe('CLEARED');
    expect(bayForGroundState('PUSH', 'DEP')).toBe('PUSHBACK');
    expect(bayForGroundState('TAXI', 'DEP')).toBe('TAXI');
    expect(bayForGroundState('DEPA', 'DEP')).toBe('RUNWAY');
  });

  it('defaults arrivals to approach and taxi-in to taxi (happy)', () => {
    expect(bayForGroundState('', 'ARR')).toBe('APPROACH');
    expect(bayForGroundState('TXIN', 'ARR')).toBe('TAXI');
  });

  it('falls back to pending for unknown departure states (garbage)', () => {
    expect(bayForGroundState('WAT', 'DEP')).toBe('PENDING');
  });
});

describe('cflOf', () => {
  it('renders a flight level from feet (happy)', () => {
    expect(cflOf(6000)).toBe('060');
  });

  it('renders the ILS/visual specials (happy)', () => {
    expect(cflOf(1)).toBe('ILS');
    expect(cflOf(2)).toBe('VIS');
  });

  it('renders empty for none (invalid)', () => {
    expect(cflOf(0)).toBe('');
    expect(cflOf(undefined)).toBe('');
  });
});

describe('stripPatchFromFlight', () => {
  it('builds a departure patch with SID and runway (happy)', () => {
    const patch = stripPatchFromFlight(flight(), 'LPPT');
    expect(patch).toMatchObject({
      cs: 'TAP751',
      dir: 'DEP',
      type: 'A320',
      wake: 'M',
      proc: 'INBOM5S',
      procKind: 'SID',
      rwy: '21',
      sqkA: '2461',
      sqkS: '2000',
      cfl: '060',
      bay: 'PENDING',
      cleared: false,
    });
  });

  it('builds an arrival patch with STAR and arrival runway (happy)', () => {
    const patch = stripPatchFromFlight(
      flight({
        origin: 'EGKK',
        destination: 'LPPT',
        star: 'TROIA2B',
        arrivalRunway: '03',
        groundState: '',
      }),
      'LPPT',
    );
    expect(patch).toMatchObject({
      dir: 'ARR',
      proc: 'TROIA2B',
      procKind: 'STAR',
      rwy: '03',
      bay: 'APPROACH',
    });
  });

  it('carries the pending handoff target (happy)', () => {
    const patch = stripPatchFromFlight(flight({ handoffTargetController: 'LPPC_APP' }), 'LPPT');
    expect(patch?.handoffTo).toBe('LPPC_APP');
  });

  it('returns null for a flight not touching the airport (invalid)', () => {
    expect(
      stripPatchFromFlight(flight({ origin: 'EGKK', destination: 'EGLL' }), 'LPPT'),
    ).toBeNull();
  });

  it('survives a flight with almost no fields (garbage)', () => {
    const patch = stripPatchFromFlight({ callsign: 'X', origin: 'LPPT' } as FlightObject, 'LPPT');
    expect(patch?.cs).toBe('X');
    expect(patch?.bay).toBe('PENDING');
  });
});

describe('stationFromController / groundStateForBay', () => {
  it('maps a controller into a transfer station (happy)', () => {
    expect(
      stationFromController({
        callsign: 'LPPT_TWR',
        fullName: 'Lisboa Tower',
        frequency: '118.100',
      }),
    ).toEqual({ cs: 'LPPT_TWR', role: 'Lisboa Tower', freq: '118.100' });
  });

  it('maps bay kinds to ground states for outbound commands (happy)', () => {
    expect(groundStateForBay('CLEARED')).toBe('CLEA');
    expect(groundStateForBay('PUSHBACK')).toBe('PUSH');
    expect(groundStateForBay('RUNWAY')).toBe('DEPA');
    expect(groundStateForBay('APPROACH')).toBeNull();
  });
});
