import type { Bay, BayKind } from './types';

export interface KindDef {
  kind: BayKind;
  cap?: number;
}

/** Column order is operational flow order; Runway holds one aircraft. */
export const KINDS: readonly KindDef[] = [
  { kind: 'PENDING' },
  { kind: 'CLEARED' },
  { kind: 'PUSHBACK' },
  { kind: 'TAXI' },
  { kind: 'RUNWAY', cap: 1 },
  { kind: 'APPROACH' },
];

export function kindMeta(kind: BayKind): KindDef {
  return KINDS.find((k) => k.kind === kind) ?? KINDS[0];
}

export function kindOrder(kind: BayKind): number {
  return KINDS.findIndex((k) => k.kind === kind);
}

export interface AirportDef {
  name: string;
  pos: string;
}

export const AIRPORTS: Record<string, AirportDef> = {
  LPPT: { name: 'Lisboa', pos: 'DEL·GND·TWR' },
  LPPR: { name: 'Porto', pos: 'TWR' },
  LPFR: { name: 'Faro', pos: 'TWR' },
  LPMA: { name: 'Madeira', pos: 'TWR' },
  LPBJ: { name: 'Beja', pos: 'TWR' },
};

export interface RunwayInfo {
  id: string;
  hdg: number;
  opp: string;
}

export const RWYINFO: Record<string, RunwayInfo> = {
  LPPT: { id: '21', hdg: 206, opp: '03' },
  LPPR: { id: '35', hdg: 347, opp: '17' },
  LPFR: { id: '10', hdg: 99, opp: '28' },
  LPMA: { id: '05', hdg: 48, opp: '23' },
  LPBJ: { id: '19R', hdg: 195, opp: '01L' },
};

export interface Station {
  cs: string;
  role: string;
  freq: string;
}

const STATIONS: Record<string, Station[]> = {
  LPPT: [
    { cs: 'LPPT_DEL', role: 'Lisboa clearance delivery', freq: '118.950' },
    { cs: 'LPPT_GND', role: 'Lisboa ground', freq: '121.750' },
    { cs: 'LPPT_TWR', role: 'Lisboa tower', freq: '118.100' },
    { cs: 'LPPC_APP', role: 'Lisboa approach', freq: '119.100' },
    { cs: 'LPPC_CTR', role: 'Lisboa control', freq: '125.550' },
  ],
  LPPR: [
    { cs: 'LPPR_GND', role: 'Porto ground', freq: '121.600' },
    { cs: 'LPPR_TWR', role: 'Porto tower', freq: '118.000' },
    { cs: 'LPPR_APP', role: 'Porto approach', freq: '120.950' },
    { cs: 'LPPC_CTR', role: 'Lisboa control', freq: '125.550' },
  ],
  LPFR: [
    { cs: 'LPFR_TWR', role: 'Faro tower', freq: '120.750' },
    { cs: 'LPFR_APP', role: 'Faro approach', freq: '119.400' },
    { cs: 'LPPC_CTR', role: 'Lisboa control', freq: '125.550' },
  ],
  LPMA: [
    { cs: 'LPMA_TWR', role: 'Madeira tower', freq: '118.350' },
    { cs: 'LPPO_CTR', role: 'Santa Maria radio', freq: '132.150' },
  ],
  LPBJ: [
    { cs: 'LPBJ_TWR', role: 'Beja tower', freq: '122.100' },
    { cs: 'LPPC_CTR', role: 'Lisboa control', freq: '125.550' },
  ],
};

export function stationsFor(icao: string): Station[] {
  return STATIONS[icao] ?? [{ cs: 'LPPC_CTR', role: 'Lisboa control', freq: '125.550' }];
}

/**
 * One bay per kind. Titles stay null (localized kind label at render;
 * the runway bay renders "<label> <active rwy>" until renamed).
 */
export function defaultBays(): Bay[] {
  return KINDS.map((k) => ({
    id: k.kind,
    kind: k.kind,
    title: null,
    ...(k.cap !== undefined ? { cap: k.cap } : {}),
  }));
}
