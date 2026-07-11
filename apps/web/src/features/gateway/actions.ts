/**
 * Structured-form registry for the gateway command protocol (see
 * PROTOCOL.md on the plugin side). Every action the plugin accepts is
 * described here once: whether it needs a `callsign`, and the shape of its
 * `payload` fields. Both `StructuredComposer` and `actions.test.ts` consume
 * this single source of truth — do not duplicate the field list elsewhere.
 */

export const GROUND_STATES = [
  'NSTS',
  'STUP',
  'PUSH',
  'TAXI',
  'DEPA',
  'TXIN',
  'PARK',
  'CLEA',
  'NOTC',
  'ARR',
] as const;

export type GroundState = (typeof GROUND_STATES)[number];

export const ALTITUDE_SPECIALS = ['ils', 'visual', 'clear'] as const;

export type AltitudeSpecial = (typeof ALTITUDE_SPECIALS)[number];

export type FieldKind = 'text' | 'number' | 'select' | 'altitude-mode';

export interface ActionFieldDef {
  /** Payload key this field maps to (e.g. `code`, `feet`, `state`). */
  name: string;
  kind: FieldKind;
  /** Enum values for `kind: 'select'`. */
  options?: readonly string[];
  /**
   * When true, an empty value is simply omitted from the payload instead
   * of being sent (e.g. `list_flights`' `filter`). Fields without this flag
   * are always sent when the action has no other fields to distinguish
   * "nothing to send" from "explicitly clear" (e.g. `set_scratchpad`'s
   * `text`, which the protocol clears with an empty string).
   */
  optional?: boolean;
}

export interface ActionDef {
  action: string;
  needsCallsign: boolean;
  fields: readonly ActionFieldDef[];
}

export const GATEWAY_ACTIONS: readonly ActionDef[] = [
  // Session-level.
  { action: 'ping', needsCallsign: false, fields: [] },
  {
    action: 'list_flights',
    needsCallsign: false,
    fields: [{ name: 'filter', kind: 'text', optional: true }],
  },

  // Flight-scoped read.
  { action: 'get_flight', needsCallsign: true, fields: [] },

  // Flight-scoped write.
  {
    action: 'set_cleared_altitude',
    needsCallsign: true,
    fields: [{ name: 'altitude', kind: 'altitude-mode' }],
  },
  {
    action: 'set_final_altitude',
    needsCallsign: true,
    fields: [{ name: 'feet', kind: 'number' }],
  },
  {
    action: 'set_heading',
    needsCallsign: true,
    fields: [{ name: 'degrees', kind: 'number' }],
  },
  {
    action: 'set_speed',
    needsCallsign: true,
    fields: [{ name: 'knots', kind: 'number' }],
  },
  {
    action: 'set_mach',
    needsCallsign: true,
    fields: [{ name: 'mach', kind: 'number' }],
  },
  {
    action: 'set_rate',
    needsCallsign: true,
    fields: [{ name: 'feetPerMinute', kind: 'number' }],
  },
  {
    action: 'set_squawk',
    needsCallsign: true,
    fields: [{ name: 'code', kind: 'text' }],
  },
  {
    action: 'set_direct',
    needsCallsign: true,
    fields: [{ name: 'point', kind: 'text' }],
  },
  {
    action: 'set_scratchpad',
    needsCallsign: true,
    fields: [{ name: 'text', kind: 'text' }],
  },
  {
    action: 'set_ground_state',
    needsCallsign: true,
    fields: [{ name: 'state', kind: 'select', options: GROUND_STATES }],
  },
  {
    action: 'set_sid',
    needsCallsign: true,
    fields: [{ name: 'sid', kind: 'text' }],
  },
  {
    action: 'set_star',
    needsCallsign: true,
    fields: [{ name: 'star', kind: 'text' }],
  },
  {
    action: 'send_private_message',
    needsCallsign: true,
    fields: [{ name: 'message', kind: 'text' }],
  },
  {
    // No `callsign` at all — this broadcasts on the current frequency.
    action: 'send_frequency_message',
    needsCallsign: false,
    fields: [{ name: 'message', kind: 'text' }],
  },
] as const;
