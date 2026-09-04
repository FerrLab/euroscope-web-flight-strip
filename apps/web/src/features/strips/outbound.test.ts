import { describe, it, expect } from 'vitest';
import { stripsSlice, stripsActions } from './slice';
import { initialStripsState } from './seed';
import { outboundEnvelopesFor } from './outbound';
import type { StripsState } from './types';

const reduce = stripsSlice.reducer;

function run(before: StripsState, action: Parameters<typeof reduce>[1]) {
  const after = reduce(before, action);
  return { after, envelopes: outboundEnvelopesFor(action, before, after) };
}

describe('outboundEnvelopesFor', () => {
  it('mirrors an accepted user move as set_ground_state (happy)', () => {
    const { envelopes } = run(
      initialStripsState(),
      stripsActions.stripMoved({ stripId: 'p6', bayId: 'PUSHBACK', source: 'drag' }),
    );
    expect(envelopes).toEqual([
      { action: 'set_ground_state', callsign: 'TAP081', payload: { state: 'PUSH' } },
    ]);
  });

  it('sends nothing for a rejected move (invalid)', () => {
    // Runway occupied (cap 1) — the reducer refuses, so no command.
    const { envelopes } = run(
      initialStripsState(),
      stripsActions.stripMoved({ stripId: 'p6', bayId: 'RUNWAY', source: 'drag' }),
    );
    expect(envelopes).toEqual([]);
  });

  it('sends nothing for a move into approach — no matching ground state (boundary)', () => {
    const before = initialStripsState();
    const { envelopes } = run(
      before,
      stripsActions.stripMoved({ stripId: 'p3', bayId: 'APPROACH', source: 'menu' }),
    );
    expect(envelopes).toEqual([]);
  });

  it('mirrors clearance as set_ground_state CLEA (happy)', () => {
    const { envelopes } = run(initialStripsState(), stripsActions.clearanceIssued('p1'));
    expect(envelopes).toEqual([
      { action: 'set_ground_state', callsign: 'TAP751', payload: { state: 'CLEA' } },
    ]);
  });

  it('sends the PDC as a private message with the remark (happy)', () => {
    const { envelopes } = run(
      initialStripsState(),
      stripsActions.dclSent({ stripId: 'p1', remark: 'expect delay' }),
    );
    expect(envelopes).toHaveLength(2);
    expect(envelopes[0].action).toBe('send_private_message');
    expect(envelopes[0].callsign).toBe('TAP751');
    expect(String(envelopes[0].payload?.message)).toContain('RMK EXPECT DELAY');
    // The PDC implies clearance — mirrored to EuroScope too.
    expect(envelopes[1]).toEqual({
      action: 'set_ground_state',
      callsign: 'TAP751',
      payload: { state: 'CLEA' },
    });
  });

  it('mirrors transfer offer and cancel (happy)', () => {
    const before = initialStripsState();
    const offered = run(before, stripsActions.transferOffered({ stripId: 'p6', to: 'LPPT_TWR' }));
    expect(offered.envelopes).toEqual([
      { action: 'transfer', callsign: 'TAP081', payload: { controller: 'LPPT_TWR' } },
    ]);
    const cancelled = run(offered.after, stripsActions.transferCancelled('p6'));
    expect(cancelled.envelopes).toEqual([{ action: 'assume', callsign: 'TAP081' }]);
  });

  it('mirrors free text as set_scratchpad (happy)', () => {
    const { envelopes } = run(
      initialStripsState(),
      stripsActions.freeTextSet({ stripId: 'p1', text: 'hold short' }),
    );
    expect(envelopes).toEqual([
      { action: 'set_scratchpad', callsign: 'TAP751', payload: { text: 'hold short' } },
    ]);
  });

  it('sends only the changed FPL fields (happy)', () => {
    const before = initialStripsState();
    const p1 = before.tabs.LPPT.strips.find((s) => s.id === 'p1')!;
    const action = stripsActions.fplApplied({
      stripId: 'p1',
      draft: {
        ident: p1.cs,
        rules: 'I',
        ftype: 'S',
        num: '1',
        actype: p1.type,
        wake: p1.wake,
        equip: 'S/S',
        adep: p1.adep,
        eobt: '0600',
        tas: 'N0450',
        rfl: 'F360',
        route: 'DCT',
        ades: p1.ades,
        eet: '0200',
        altn: '',
        altn2: '',
        other: '',
        sqkA: '2462',
        proc: p1.proc,
        rwy: p1.rwy,
        cfl: p1.cfl,
        gate: p1.gate,
        freeText: p1.freeText,
      },
    });
    const { envelopes } = run(before, action);
    expect(envelopes).toEqual([
      { action: 'set_squawk', callsign: 'TAP751', payload: { code: '2462' } },
    ]);
  });

  it('requests fresh flight data when a strip is restored from the archive (happy)', () => {
    const { envelopes } = run(
      initialStripsState(),
      stripsActions.stripUnarchived({ icao: 'LPPT', cs: 'JLY1656' }),
    );
    expect(envelopes).toEqual([{ action: 'get_flight', callsign: 'JLY1656' }]);
  });

  it('ignores actions that touch no strip (garbage)', () => {
    const { envelopes } = run(
      initialStripsState(),
      stripsActions.freeTextSet({ stripId: 'nope', text: 'x' }),
    );
    expect(envelopes).toEqual([]);
  });

  it('ignores unrelated actions (garbage)', () => {
    const before = initialStripsState();
    expect(outboundEnvelopesFor(stripsActions.feedToggled(false), before, before)).toEqual([]);
  });

  /*
   * The loop guard. flightUpserted now moves strips, and a move is exactly
   * what outbound mirrors back as set_ground_state — so if this action ever
   * produced an envelope, EuroScope's report would be echoed straight back
   * to EuroScope, which would report it again. Today the bridge's
   * USER_ACTIONS matcher simply does not list flightUpserted; that is load
   * bearing rather than incidental, and this is what says so.
   */
  it('sends nothing for a EuroScope-driven move (invalid — echoing it would loop)', () => {
    const before = initialStripsState();
    const strip = before.tabs.LPPT.strips[0];
    const { after, envelopes } = run(
      before,
      stripsActions.flightUpserted({
        icao: 'LPPT',
        patch: {
          cs: strip.cs,
          dir: strip.dir,
          type: strip.type,
          wake: strip.wake,
          adep: strip.adep,
          ades: strip.ades,
          proc: strip.proc,
          procKind: strip.procKind,
          rwy: strip.rwy,
          sqkA: strip.sqkA,
          sqkS: strip.sqkS,
          cfl: strip.cfl,
          freeText: strip.freeText,
          cleared: true,
          bay: 'TAXI',
          handoffTo: '',
        },
      }),
    );

    // The move really happened — this is not passing because nothing changed.
    expect(after.tabs.LPPT.strips.find((x) => x.cs === strip.cs)?.bay).toBe('TAXI');
    expect(envelopes).toEqual([]);
  });
});
