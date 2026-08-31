import { describe, it, expect } from 'vitest';
import { inboundUpdatesFor } from './inbound';
import { stripsActions } from './slice';

const OPEN_TABS = ['LPPT', 'LPPR'];

describe('inboundUpdatesFor', () => {
  it('maps flight_updated onto every matching open tab (happy)', () => {
    const result = inboundUpdatesFor(
      {
        type: 'event',
        action: 'flight_updated',
        callsign: 'TAP751',
        payload: {
          callsign: 'TAP751',
          origin: 'LPPT',
          destination: 'LPPR',
          aircraftType: 'A320',
          wtc: 'M',
        },
      },
      OPEN_TABS,
      [],
    );
    // Departs LPPT, arrives LPPR — both tabs get an upsert.
    const upserts = result.actions.filter((a) => a.type === stripsActions.flightUpserted.type);
    expect(upserts).toHaveLength(2);
  });

  it('creates no strips for flights touching no open tab, but still reports their airports (invalid)', () => {
    const result = inboundUpdatesFor(
      {
        type: 'event',
        action: 'flight_updated',
        payload: { callsign: 'X', origin: 'EGLL', destination: 'EGKK' },
      },
      OPEN_TABS,
      [],
    );
    expect(result.actions.filter((a) => a.type === stripsActions.flightUpserted.type)).toHaveLength(
      0,
    );
    const seen = result.actions.find((a) => a.type === stripsActions.airportsSeen.type);
    expect((seen as ReturnType<typeof stripsActions.airportsSeen> | undefined)?.payload).toEqual(
      expect.arrayContaining(['EGLL', 'EGKK']),
    );
  });

  it('maps flight_removed and position_updated (happy)', () => {
    const removed = inboundUpdatesFor(
      { type: 'event', action: 'flight_removed', callsign: 'TAP751', payload: {} },
      OPEN_TABS,
      [],
    );
    expect(removed.actions[0]).toEqual(stripsActions.flightRemoved('TAP751'));

    const pos = inboundUpdatesFor(
      {
        type: 'event',
        action: 'position_updated',
        callsign: 'TAP751',
        payload: { squawk: '2461' },
      },
      OPEN_TABS,
      [],
    );
    expect(pos.actions[0]).toEqual(stripsActions.positionUpdated({ cs: 'TAP751', squawk: '2461' }));
  });

  it('accumulates and removes controllers (happy)', () => {
    const added = inboundUpdatesFor(
      {
        type: 'event',
        action: 'controller_updated',
        callsign: 'LPPT_TWR',
        payload: {
          callsign: 'LPPT_TWR',
          fullName: 'Lisboa Tower',
          frequency: '118.100',
          isController: true,
        },
      },
      OPEN_TABS,
      [],
    );
    expect(added.controllers).toEqual([{ cs: 'LPPT_TWR', role: 'Lisboa Tower', freq: '118.100' }]);
    expect(added.actions[0].type).toBe(stripsActions.controllersUpdated.type);

    const removed = inboundUpdatesFor(
      { type: 'event', action: 'controller_removed', callsign: 'LPPT_TWR', payload: {} },
      OPEN_TABS,
      added.controllers,
    );
    expect(removed.controllers).toEqual([]);
  });

  it('expands a session_snapshot into flights and controllers (happy)', () => {
    const result = inboundUpdatesFor(
      {
        type: 'event',
        action: 'session_snapshot',
        payload: {
          flights: [
            { callsign: 'TAP751', origin: 'LPPT', destination: 'LFPO' },
            { callsign: 'EZY123', origin: 'EGKK', destination: 'LPPR' },
          ],
          controllers: [
            {
              callsign: 'LPPC_CTR',
              fullName: 'Lisboa Control',
              frequency: '125.550',
              isController: true,
            },
          ],
        },
      },
      OPEN_TABS,
      [],
    );
    const upserts = result.actions.filter((a) => a.type === stripsActions.flightUpserted.type);
    expect(upserts).toHaveLength(2);
    expect(result.controllers).toHaveLength(1);
  });

  it('keeps a stable operational order across repeated controller updates (happy)', () => {
    let roster: ReturnType<typeof inboundUpdatesFor>['controllers'] = [];
    const push = (callsign: string, facility: number) => {
      roster = inboundUpdatesFor(
        {
          type: 'event',
          action: 'controller_updated',
          callsign,
          payload: { callsign, facility, isController: true },
        },
        OPEN_TABS,
        roster,
      ).controllers;
    };
    push('LPPT_TWR', 4);
    push('LPPT_DEL', 2);
    push('LPPC_CTR', 6);
    const before = roster.map((c) => c.cs);
    expect(before).toEqual(['LPPT_DEL', 'LPPT_TWR', 'LPPC_CTR']);
    // A repeated update for an existing station must not reshuffle.
    push('LPPT_TWR', 4);
    push('LPPT_DEL', 2);
    expect(roster.map((c) => c.cs)).toEqual(before);
  });

  it('ignores non-controller observers (invalid)', () => {
    const result = inboundUpdatesFor(
      {
        type: 'event',
        action: 'controller_updated',
        callsign: 'OBS123',
        payload: { callsign: 'OBS123', isController: false },
      },
      OPEN_TABS,
      [],
    );
    expect(result.controllers).toEqual([]);
  });

  it('expands list_flights and list_controllers responses like a snapshot (happy)', () => {
    const flights = inboundUpdatesFor(
      {
        type: 'response',
        action: 'list_flights',
        ok: true,
        payload: {
          count: 1,
          flights: [{ callsign: 'TAP751', origin: 'LPPT', destination: 'LFPO' }],
        },
      },
      OPEN_TABS,
      [],
    );
    expect(
      flights.actions.filter((a) => a.type === stripsActions.flightUpserted.type),
    ).toHaveLength(1);

    const ctrls = inboundUpdatesFor(
      {
        type: 'response',
        action: 'list_controllers',
        ok: true,
        payload: {
          count: 1,
          controllers: [
            { callsign: 'SBGR_TWR', fullName: 'Guarulhos Tower', frequency: '118.400' },
          ],
        },
      },
      OPEN_TABS,
      [],
    );
    expect(ctrls.controllers).toEqual([
      { cs: 'SBGR_TWR', role: 'Guarulhos Tower', freq: '118.400' },
    ]);
  });

  it('maps a get_flight response with a bare FlightObject payload (happy)', () => {
    const result = inboundUpdatesFor(
      {
        type: 'response',
        action: 'get_flight',
        ok: true,
        callsign: 'TAP751',
        payload: { callsign: 'TAP751', origin: 'LPPT', destination: 'LFPO' },
      },
      OPEN_TABS,
      [],
    );
    expect(result.actions[0].type).toBe(stripsActions.flightUpserted.type);
  });

  it('ignores failed responses (invalid)', () => {
    const result = inboundUpdatesFor(
      { type: 'response', action: 'list_flights', ok: false, payload: {} },
      OPEN_TABS,
      [],
    );
    expect(result.actions).toHaveLength(0);
  });

  it('reports session airports from flights even when no tab matches (happy)', () => {
    const result = inboundUpdatesFor(
      {
        type: 'event',
        action: 'flight_updated',
        payload: { callsign: 'X', origin: 'SBGR', destination: 'SBCT' },
      },
      OPEN_TABS,
      [],
    );
    const seen = result.actions.find((a) => a.type === stripsActions.airportsSeen.type);
    expect(seen).toBeDefined();
    expect((seen as ReturnType<typeof stripsActions.airportsSeen>).payload).toEqual(
      expect.arrayContaining(['SBGR', 'SBCT']),
    );
  });

  it('reports session airports from controller callsigns (happy)', () => {
    const result = inboundUpdatesFor(
      {
        type: 'event',
        action: 'controller_updated',
        callsign: 'SBGR_TWR',
        payload: { callsign: 'SBGR_TWR', isController: true },
      },
      OPEN_TABS,
      [],
    );
    const seen = result.actions.find((a) => a.type === stripsActions.airportsSeen.type);
    expect((seen as ReturnType<typeof stripsActions.airportsSeen>).payload).toContain('SBGR');
  });

  it('ignores unknown actions and garbage payloads (garbage)', () => {
    expect(
      inboundUpdatesFor({ type: 'event', action: 'wat', payload: {} }, OPEN_TABS, []).actions,
    ).toHaveLength(0);
    expect(
      inboundUpdatesFor(
        { type: 'event', action: 'flight_updated', payload: undefined },
        OPEN_TABS,
        [],
      ).actions,
    ).toHaveLength(0);
  });
});
