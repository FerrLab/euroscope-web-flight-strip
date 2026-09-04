import type { UnknownAction } from '@reduxjs/toolkit';
import type { CommandEnvelope } from '@/features/gateway/schema';
import { groundStateForBay } from './euroscope';
import { dclTextFor, dclWireText } from './fpl';
import { stripsActions } from './slice';
import type { Strip, StripsState, StripsTab } from './types';

interface Hit {
  strip: Strip;
  tab: StripsTab;
}

function findStrip(state: StripsState, stripId: string): Hit | null {
  for (const icao of state.tabsOrder) {
    const tab = state.tabs[icao];
    const strip = tab.strips.find((s) => s.id === stripId);
    if (strip) return { strip, tab };
  }
  return null;
}

function utcNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/**
 * The gateway commands a user-driven board action implies — computed
 * AFTER the reducer ran, so a guard-rejected move emits nothing. The
 * bridge sends these only while the plugin is connected.
 */
export function outboundEnvelopesFor(
  action: UnknownAction,
  before: StripsState,
  after: StripsState,
): CommandEnvelope[] {
  if (stripsActions.stripMoved.match(action)) {
    const hit = findStrip(after, action.payload.stripId);
    if (!hit) return [];
    const prev = findStrip(before, action.payload.stripId);
    if (prev && prev.strip.bay === hit.strip.bay) return []; // rejected or same-bay
    const bay = hit.tab.bays.find((b) => b.id === hit.strip.bay);
    const state = bay ? groundStateForBay(bay.kind) : null;
    if (!state) return [];
    return [{ action: 'set_ground_state', callsign: hit.strip.cs, payload: { state } }];
  }

  if (stripsActions.clearanceIssued.match(action)) {
    const hit = findStrip(after, action.payload);
    const prev = findStrip(before, action.payload);
    if (!hit || !prev || prev.strip.cleared === hit.strip.cleared) return [];
    return [{ action: 'set_ground_state', callsign: hit.strip.cs, payload: { state: 'CLEA' } }];
  }

  if (stripsActions.dclSent.match(action)) {
    const hit = findStrip(after, action.payload.stripId);
    if (!hit) return [];
    const message = dclWireText(
      dclTextFor(hit.strip, hit.tab.metar, action.payload.remark ?? '', utcNow()),
    );
    return [
      { action: 'send_private_message', callsign: hit.strip.cs, payload: { message } },
      { action: 'set_ground_state', callsign: hit.strip.cs, payload: { state: 'CLEA' } },
    ];
  }

  if (stripsActions.stripUnarchived.match(action)) {
    // Restored strips return via live data — ask for it right away.
    return [{ action: 'get_flight', callsign: action.payload.cs }];
  }

  if (stripsActions.transferOffered.match(action)) {
    const hit = findStrip(after, action.payload.stripId);
    if (!hit) return [];
    return [
      { action: 'transfer', callsign: hit.strip.cs, payload: { controller: action.payload.to } },
    ];
  }

  if (stripsActions.transferCancelled.match(action)) {
    const hit = findStrip(after, action.payload);
    const prev = findStrip(before, action.payload);
    if (!hit || !prev?.strip.xfr) return [];
    return [{ action: 'assume', callsign: hit.strip.cs }];
  }

  if (stripsActions.freeTextSet.match(action)) {
    const hit = findStrip(after, action.payload.stripId);
    if (!hit) return [];
    return [
      { action: 'set_scratchpad', callsign: hit.strip.cs, payload: { text: action.payload.text } },
    ];
  }

  if (stripsActions.fplApplied.match(action)) {
    const hit = findStrip(after, action.payload.stripId);
    const prev = findStrip(before, action.payload.stripId);
    if (!hit || !prev) return [];
    const envelopes: CommandEnvelope[] = [];
    const cs = hit.strip.cs;
    if (hit.strip.sqkA !== prev.strip.sqkA) {
      envelopes.push({ action: 'set_squawk', callsign: cs, payload: { code: hit.strip.sqkA } });
    }
    if (hit.strip.proc !== prev.strip.proc) {
      envelopes.push(
        hit.strip.procKind === 'STAR'
          ? { action: 'set_star', callsign: cs, payload: { star: hit.strip.proc } }
          : { action: 'set_sid', callsign: cs, payload: { sid: hit.strip.proc } },
      );
    }
    if (hit.strip.freeText !== prev.strip.freeText) {
      envelopes.push({
        action: 'set_scratchpad',
        callsign: cs,
        payload: { text: hit.strip.freeText },
      });
    }
    return envelopes;
  }

  return [];
}
