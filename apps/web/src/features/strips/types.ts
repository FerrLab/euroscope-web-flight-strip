export type BayKind = 'PENDING' | 'CLEARED' | 'PUSHBACK' | 'TAXI' | 'RUNWAY' | 'APPROACH';

export type StripDirection = 'DEP' | 'ARR' | 'VFR';

export type DclState = 'NONE' | 'SENT' | 'ACK';

export type TransferState = 'PENDING' | 'ACCEPTED';

export interface Transfer {
  to: string;
  state: TransferState;
}

/** Auto-suggested next bay; the pill label is derived from the kind. */
export interface Suggestion {
  bay: BayKind;
}

export interface FplData {
  rules: string;
  ftype: string;
  num: string;
  equip: string;
  eobt: string;
  tas: string;
  rfl: string;
  route: string;
  eet: string;
  altn: string;
  altn2: string;
  other: string;
}

export interface Strip {
  id: string;
  cs: string;
  airline: string;
  type: string;
  wake: string;
  adep: string;
  ades: string;
  gate: string;
  sqkA: string;
  /** Squawk currently set on the transponder; empty until observed. */
  sqkS: string;
  proc: string;
  procKind: string;
  rwy: string;
  cfl: string;
  dir: StripDirection;
  /** Id of the bay the strip sits in (bay ids, not kinds). */
  bay: string;
  cleared: boolean;
  dcl: DclState;
  freeText: string;
  suggest: Suggestion | null;
  /** Slide-in animation flag for freshly moved/added strips. */
  anim: boolean;
  xfr: Transfer | null;
  fpl: FplData | null;
}

export interface Bay {
  id: string;
  kind: BayKind;
  /** Custom title (renamed/split bays); null renders the localized kind label. */
  title: string | null;
  cap?: number;
}

export interface Metar {
  station: string;
  obsTime: string;
  raw: string;
  wind: string;
  windNote: string;
  qnh: string;
  qnhAlt: string;
  temp: string;
  hum: string;
  vis: string;
  visUnit: string;
  ceil: string;
  ceilUnit: string;
  visM: number;
  ceilFt: number;
  rwys: string[];
  atis: string;
  depFreq: string;
  clrNote: string;
}

export type FeedKind = 'info' | 'ok' | 'warn' | 'alarm';

export type FeedSource = 'you' | 'euroscope' | 'auto' | 'guard';

/**
 * Feed entries carry a message key + params, not rendered copy —
 * translation happens at render time (docs/conventions/i18n.md).
 */
export interface FeedEvent {
  time: string;
  kind: FeedKind;
  key: string;
  params: Record<string, string | number>;
  src: FeedSource;
}

export interface ArchivedStrip {
  cs: string;
  time: string;
  /**
   * Who archived it: 'user' archives are final for the session;
   * 'auto' archives (flight_removed) resurrect if the flight
   * reappears. Missing (old saves) counts as 'user'.
   */
  by?: 'user' | 'auto';
}

export interface StripsTab {
  icao: string;
  metar: Metar;
  strips: Strip[];
  bays: Bay[];
  locks: Record<string, boolean>;
  feed: FeedEvent[];
  archived: ArchivedStrip[];
  unseen: number;
}

export type ToastKind = 'info' | 'ok' | 'caution' | 'alarm';

/** Toasts are keyed like feed entries; `strips.toasts.<key>.{title,text}`. */
export interface Toast {
  id: string;
  kind: ToastKind;
  key: string;
  params: Record<string, string | number>;
}

export interface LiveStation {
  cs: string;
  role: string;
  freq: string;
  /** VATSIM facility (2 DEL … 6 CTR); orders the transfer list. */
  facility?: number;
}

export interface StripsState {
  tabs: Record<string, StripsTab>;
  tabsOrder: string[];
  activeTab: string;
  toasts: Toast[];
  /** Monotonic id source for generated bays/toasts/strips. */
  seq: number;
  feedOn: boolean;
  /** Stations online in the live EuroScope session (empty = none seen). */
  controllers: LiveStation[];
  /** Airport ICAOs the live session has mentioned (flights + stations). */
  seenAirports: string[];
}

export type MoveRejection = 'unknownBay' | 'bayLocked' | 'flowGuard' | 'occupancy' | 'noClearance';

export interface MoveVerdict {
  ok: boolean;
  /** True when the rejection needs no user feedback (same-bay drop). */
  silent?: boolean;
  /** Stable rejection key; the UI maps it to localized toast copy. */
  title?: MoveRejection;
}
