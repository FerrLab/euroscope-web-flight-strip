import { describe, it, expect } from 'vitest';
import { GATEWAY_ACTIONS, GROUND_STATES, ALTITUDE_SPECIALS } from './actions';

const ALL_ACTIONS = [
  'ping',
  'list_flights',
  'get_flight',
  'set_cleared_altitude',
  'set_final_altitude',
  'set_heading',
  'set_speed',
  'set_mach',
  'set_rate',
  'set_squawk',
  'set_direct',
  'set_scratchpad',
  'set_ground_state',
  'set_sid',
  'set_star',
  'send_private_message',
  'send_frequency_message',
];

const FLIGHT_SCOPED_WITH_CALLSIGN = ALL_ACTIONS.filter(
  (a) => a !== 'ping' && a !== 'list_flights' && a !== 'send_frequency_message',
);

function find(action: string) {
  const def = GATEWAY_ACTIONS.find((a) => a.action === action);
  if (!def) throw new Error(`missing action definition for ${action}`);
  return def;
}

describe('GATEWAY_ACTIONS registry', () => {
  it('contains every action from the protocol table (happy)', () => {
    for (const action of ALL_ACTIONS) {
      expect(GATEWAY_ACTIONS.some((a) => a.action === action)).toBe(true);
    }
    expect(GATEWAY_ACTIONS).toHaveLength(ALL_ACTIONS.length);
  });

  it('marks send_frequency_message as not needing a callsign (garbage — the one exception)', () => {
    expect(find('send_frequency_message').needsCallsign).toBe(false);
  });

  it('marks ping and list_flights as session-level (no callsign)', () => {
    expect(find('ping').needsCallsign).toBe(false);
    expect(find('list_flights').needsCallsign).toBe(false);
  });

  it('marks every other flight-scoped action as needing a callsign (happy)', () => {
    for (const action of FLIGHT_SCOPED_WITH_CALLSIGN) {
      expect(find(action).needsCallsign).toBe(true);
    }
  });

  it('gives set_cleared_altitude the special altitude-mode field kind', () => {
    const def = find('set_cleared_altitude');
    expect(def.fields).toHaveLength(1);
    expect(def.fields[0].kind).toBe('altitude-mode');
  });

  it('gives ping and get_flight no fields at all (no payload)', () => {
    expect(find('ping').fields).toHaveLength(0);
    expect(find('get_flight').fields).toHaveLength(0);
  });

  it('gives set_ground_state a select field with all 10 ground states', () => {
    const def = find('set_ground_state');
    expect(def.fields).toHaveLength(1);
    expect(def.fields[0].kind).toBe('select');
    expect(def.fields[0].options).toEqual(GROUND_STATES);
    expect(GROUND_STATES).toHaveLength(10);
  });

  it('exposes exactly the three altitude special values', () => {
    expect(ALTITUDE_SPECIALS).toEqual(['ils', 'visual', 'clear']);
  });

  it('marks numeric fields with kind "number" (invalid input guard belongs to the form, not the registry)', () => {
    const numericByAction: Record<string, string> = {
      set_final_altitude: 'feet',
      set_heading: 'degrees',
      set_speed: 'knots',
      set_mach: 'mach',
      set_rate: 'feetPerMinute',
    };
    for (const [action, fieldName] of Object.entries(numericByAction)) {
      const def = find(action);
      expect(def.fields).toHaveLength(1);
      expect(def.fields[0].name).toBe(fieldName);
      expect(def.fields[0].kind).toBe('number');
    }
  });

  it('marks list_flights filter as optional so an empty value sends no payload', () => {
    const def = find('list_flights');
    expect(def.fields[0].optional).toBe(true);
  });
});
