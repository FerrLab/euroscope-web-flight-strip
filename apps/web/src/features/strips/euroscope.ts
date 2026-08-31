import { z } from 'zod';
import type { GroundState } from '@/features/gateway/actions';
import type { BayKind, StripDirection } from './types';

/**
 * JSON Contract Protocol v1 (euroscope-longpolling-connector) — the
 * inbound slice the strips board consumes. The plugin sends more
 * fields than these; unknown keys pass through untouched.
 */
export const inboundEnvelopeSchema = z.object({
  type: z.string().optional(),
  action: z.string().min(1),
  callsign: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  ok: z.boolean().optional(),
  id: z.union([z.string(), z.number()]).optional(),
});

export type InboundEnvelope = z.infer<typeof inboundEnvelopeSchema>;

export function parseInboundEnvelope(raw: unknown): InboundEnvelope | null {
  const result = inboundEnvelopeSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** FlightObject as PROTOCOL.md defines it; everything but the callsign is optional in practice. */
export interface FlightObject {
  callsign: string;
  planType?: string;
  aircraftType?: string;
  wtc?: string;
  origin?: string;
  destination?: string;
  departureRunway?: string;
  arrivalRunway?: string;
  sid?: string;
  star?: string;
  route?: string;
  remarks?: string;
  finalAltitude?: number;
  clearedAltitude?: number;
  assignedSquawk?: string;
  transponderSquawk?: string;
  scratchPad?: string;
  groundState?: string;
  clearanceFlag?: boolean;
  trackingController?: string;
  trackedByMe?: boolean;
  handoffTargetController?: string;
}

export interface ControllerObject {
  callsign: string;
  fullName?: string;
  frequency?: string;
  facility?: number;
  isController?: boolean;
}

export function directionFor(flight: FlightObject, icao: string): StripDirection | null {
  const dep = flight.origin === icao;
  const arr = flight.destination === icao;
  if (dep && arr) return 'VFR';
  if (dep) return 'DEP';
  if (arr) return 'ARR';
  // No flight plan filed (blank airports) but actively tracked by this
  // controller — local traffic that belongs on the board.
  if (!flight.origin && !flight.destination && flight.trackedByMe === true) return 'VFR';
  return null;
}

/**
 * EuroScope ground state → board bay kind. Arrivals default to
 * Approach; PARK'd arrivals stay in Taxi until removed/archived.
 */
export function bayForGroundState(state: string | undefined, dir: StripDirection): BayKind {
  switch (state) {
    case 'CLEA':
      return 'CLEARED';
    case 'STUP':
    case 'PUSH':
      return 'PUSHBACK';
    case 'TAXI':
      return 'TAXI';
    case 'TXIN':
    case 'PARK':
      return 'TAXI';
    case 'DEPA':
      return 'RUNWAY';
    default:
      return dir === 'ARR' ? 'APPROACH' : 'PENDING';
  }
}

/** clearedAltitude: 0 = none, 1 = ILS, 2 = visual, else feet → FL string. */
export function cflOf(clearedAltitude: number | undefined): string {
  if (!clearedAltitude) return '';
  if (clearedAltitude === 1) return 'ILS';
  if (clearedAltitude === 2) return 'VIS';
  return String(Math.round(clearedAltitude / 100)).padStart(3, '0');
}

export interface StripPatch {
  cs: string;
  dir: StripDirection;
  type: string;
  wake: string;
  adep: string;
  ades: string;
  proc: string;
  procKind: string;
  rwy: string;
  sqkA: string;
  sqkS: string;
  cfl: string;
  freeText: string;
  cleared: boolean;
  /** Mapped bay for this flight's current EuroScope ground state. */
  bay: BayKind;
  /** Pending handoff target ('' = none). */
  handoffTo: string;
}

export function stripPatchFromFlight(flight: FlightObject, icao: string): StripPatch | null {
  if (!flight.callsign) return null;
  const dir = directionFor(flight, icao);
  if (!dir) return null;
  const arriving = dir === 'ARR';
  const proc = (arriving ? flight.star : flight.sid) ?? '';
  return {
    cs: flight.callsign,
    dir,
    type: flight.aircraftType ?? '',
    wake: flight.wtc ?? '',
    adep: flight.origin ?? '',
    ades: flight.destination ?? '',
    proc,
    procKind: arriving ? 'STAR' : dir === 'VFR' ? 'VFR' : 'SID',
    rwy: (arriving ? flight.arrivalRunway : flight.departureRunway) ?? '',
    sqkA: flight.assignedSquawk ?? '',
    sqkS: flight.transponderSquawk ?? '',
    cfl: cflOf(flight.clearedAltitude),
    freeText: flight.scratchPad ?? '',
    cleared: flight.clearanceFlag === true || flight.groundState === 'CLEA',
    bay: bayForGroundState(flight.groundState, dir),
    handoffTo: flight.handoffTargetController ?? '',
  };
}

export interface Station {
  cs: string;
  role: string;
  freq: string;
  facility?: number;
}

export function stationFromController(ctrl: ControllerObject): Station {
  return {
    cs: ctrl.callsign,
    role: ctrl.fullName ?? '',
    freq: ctrl.frequency ?? '',
    ...(ctrl.facility !== undefined ? { facility: ctrl.facility } : {}),
  };
}

/** Deterministic roster order: facility (DEL → CTR), then callsign. */
export function sortStations<T extends Station>(stations: T[]): T[] {
  return [...stations].sort(
    (a, b) => (a.facility ?? 99) - (b.facility ?? 99) || a.cs.localeCompare(b.cs),
  );
}

/** Outbound: the ground state a user-driven bay move should set. */
export function groundStateForBay(kind: BayKind): GroundState | null {
  switch (kind) {
    case 'PENDING':
      return 'NSTS';
    case 'CLEARED':
      return 'CLEA';
    case 'PUSHBACK':
      return 'PUSH';
    case 'TAXI':
      return 'TAXI';
    case 'RUNWAY':
      return 'DEPA';
    default:
      return null;
  }
}
