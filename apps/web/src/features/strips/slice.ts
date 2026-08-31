import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { KINDS } from './airports';
import { checkMove } from './guards';
import { makeStrip, makeTab, initialStripsState } from './seed';
import { fplDraftOf, type FplDraft } from './fpl';
import type { SavedLayout } from './persistence';
import type { StripPatch } from './euroscope';
import type {
  BayKind,
  FeedKind,
  FeedSource,
  LiveStation,
  Strip,
  StripsState,
  StripsTab,
  ToastKind,
} from './types';

export type MoveSource = 'drag' | 'menu' | 'auto';

function utcNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

interface StripHit {
  strip: Strip;
  tab: StripsTab;
  icao: string;
}

function findStrip(state: StripsState, stripId: string): StripHit | null {
  for (const icao of state.tabsOrder) {
    const tab = state.tabs[icao];
    const strip = tab.strips.find((s) => s.id === stripId);
    if (strip) return { strip, tab, icao };
  }
  return null;
}

const FEED_CAP = 40;

function log(
  state: StripsState,
  icao: string,
  kind: FeedKind,
  key: string,
  params: Record<string, string | number>,
  src: FeedSource,
): void {
  const tab = state.tabs[icao];
  if (!tab) return;
  tab.feed.unshift({ time: utcNow(), kind, key, params, src });
  if (tab.feed.length > FEED_CAP) tab.feed.pop();
  if (icao !== state.activeTab) tab.unseen += 1;
}

function toast(
  state: StripsState,
  kind: ToastKind,
  key: string,
  params: Record<string, string | number> = {},
): void {
  state.seq += 1;
  state.toasts.push({ id: `t${state.seq}`, kind, key, params });
}

/**
 * Repositions `strip` inside its tab's array so it renders just
 * before `beforeStripId` (or last, when null/unknown). Render order
 * within a bay is array order, so this is the whole reorder story.
 */
function repositionStrip(tab: StripsTab, strip: Strip, beforeStripId: string | null): void {
  const without = tab.strips.filter((s) => s.id !== strip.id);
  const index = beforeStripId ? without.findIndex((s) => s.id === beforeStripId) : -1;
  if (index >= 0) without.splice(index, 0, strip);
  else without.push(strip);
  tab.strips = without;
}

/** Shared by stripMoved / suggestion acceptance; returns success. */
function applyMove(
  state: StripsState,
  stripId: string,
  bayId: string,
  source: MoveSource,
  beforeStripId?: string | null,
): boolean {
  const hit = findStrip(state, stripId);
  if (!hit) return false;
  const { strip, tab, icao } = hit;
  const bay = tab.bays.find((b) => b.id === bayId) ?? tab.bays.find((b) => b.kind === bayId);
  if (!bay) return false;
  if (strip.bay === bay.id && beforeStripId !== undefined) {
    // Same-bay drop with an anchor is a cosmetic reorder — no guard
    // rails, no feed noise, no gateway command.
    repositionStrip(tab, strip, beforeStripId);
    return true;
  }
  const verdict = checkMove(strip, tab, bay.id);
  if (!verdict.ok) {
    if (!verdict.silent && verdict.title) {
      toast(state, 'alarm', verdict.title, {
        cs: strip.cs,
        bay: bay.id,
        cap: bay.cap ?? 0,
        dir: strip.dir,
      });
      log(
        state,
        icao,
        'alarm',
        'moveRejected',
        { cs: strip.cs, bay: bay.id, guard: verdict.title },
        'guard',
      );
    }
    return false;
  }
  if (bay.kind === 'CLEARED' && !strip.cleared && strip.dir === 'DEP') {
    strip.cleared = true;
    log(state, icao, 'ok', 'clearedByMove', { cs: strip.cs }, 'you');
  }
  strip.bay = bay.id;
  strip.suggest = null;
  strip.anim = true;
  if (beforeStripId !== undefined) repositionStrip(tab, strip, beforeStripId);
  log(
    state,
    icao,
    source === 'auto' ? 'info' : 'ok',
    'moved',
    { cs: strip.cs, bay: bay.id },
    source === 'auto' ? 'auto' : 'you',
  );
  return true;
}

/** Departure strips promoted out of Pending once clearance exists. */
function promoteToCleared(hit: StripHit): void {
  const current = hit.tab.bays.find((b) => b.id === hit.strip.bay);
  if (current?.kind === 'PENDING') {
    const target = hit.tab.bays.find((b) => b.kind === 'CLEARED');
    if (target) hit.strip.bay = target.id;
  }
}

export const stripsSlice = createSlice({
  name: 'strips',
  initialState: initialStripsState,
  reducers: {
    tabSelected(state, action: PayloadAction<string>) {
      const tab = state.tabs[action.payload];
      if (!tab || !state.tabsOrder.includes(action.payload)) return;
      tab.unseen = 0;
      state.activeTab = action.payload;
    },
    tabClosed(state, action: PayloadAction<string>) {
      if (state.tabsOrder.length <= 1) return;
      const order = state.tabsOrder.filter((icao) => icao !== action.payload);
      if (order.length === state.tabsOrder.length) return;
      state.tabsOrder = order;
      if (state.activeTab === action.payload) state.activeTab = order[0];
    },
    /** Restores the persisted board layout (open tabs, bays, locks). */
    layoutRestored(state, action: PayloadAction<SavedLayout>) {
      const validKinds = new Set(KINDS.map((k) => k.kind));
      const order = action.payload.tabsOrder.filter(
        (icao) => typeof icao === 'string' && /^[A-Z]{4}$/.test(icao),
      );
      if (order.length === 0) return;
      for (const icao of order) {
        if (!state.tabs[icao]) state.tabs[icao] = makeTab(icao);
      }
      state.tabsOrder = order;
      state.activeTab = order.includes(action.payload.activeTab)
        ? action.payload.activeTab
        : order[0];
      for (const [icao, layout] of Object.entries(action.payload.tabs ?? {})) {
        const tab = state.tabs[icao];
        if (!tab || !layout) continue;
        if (Array.isArray(layout.bays)) {
          const bays = layout.bays.filter(
            (b) => b && typeof b.id === 'string' && validKinds.has(b.kind),
          );
          if (bays.length > 0) tab.bays = bays;
        }
        if (layout.locks && typeof layout.locks === 'object') {
          tab.locks = Object.fromEntries(
            Object.entries(layout.locks).filter(([, v]) => typeof v === 'boolean'),
          );
        }
        if (Array.isArray(layout.archived)) {
          tab.archived = layout.archived.filter(
            (a) => a && typeof a.cs === 'string' && typeof a.time === 'string',
          );
        }
      }
    },
    airportOpened(state, action: PayloadAction<string>) {
      const icao = action.payload;
      if (!state.tabs[icao]) state.tabs[icao] = makeTab(icao);
      if (!state.tabsOrder.includes(icao)) state.tabsOrder.push(icao);
      state.activeTab = icao;
      state.tabs[icao].unseen = 0;
      log(state, icao, 'info', 'sessionOpened', { icao }, 'you');
    },

    stripMoved(
      state,
      action: PayloadAction<{
        stripId: string;
        bayId: string;
        source: MoveSource;
        /** Insertion anchor: render before this strip (null = end). */
        beforeStripId?: string | null;
      }>,
    ) {
      const { stripId, bayId, source, beforeStripId } = action.payload;
      applyMove(state, stripId, bayId, source, beforeStripId);
    },
    clearanceIssued(state, action: PayloadAction<string>) {
      const hit = findStrip(state, action.payload);
      if (!hit || hit.strip.cleared) return;
      hit.strip.cleared = true;
      hit.strip.anim = true;
      log(state, hit.icao, 'ok', 'clearanceIssued', { cs: hit.strip.cs }, 'you');
      promoteToCleared(hit);
    },
    stripArchived(state, action: PayloadAction<{ stripId: string; silent?: boolean }>) {
      const hit = findStrip(state, action.payload.stripId);
      if (!hit) return;
      hit.tab.strips = hit.tab.strips.filter((s) => s.id !== hit.strip.id);
      hit.tab.archived.unshift({ cs: hit.strip.cs, time: utcNow(), by: 'user' });
      if (!action.payload.silent) {
        log(state, hit.icao, 'info', 'archived', { cs: hit.strip.cs }, 'you');
      }
    },
    stripUnarchived(state, action: PayloadAction<{ icao: string; cs: string }>) {
      const tab = state.tabs[action.payload.icao];
      if (!tab) return;
      tab.archived = tab.archived.filter((a) => a.cs !== action.payload.cs);
    },
    stripDeleted(state, action: PayloadAction<string>) {
      const hit = findStrip(state, action.payload);
      if (!hit) return;
      hit.tab.strips = hit.tab.strips.filter((s) => s.id !== hit.strip.id);
      log(state, hit.icao, 'warn', 'deleted', { cs: hit.strip.cs }, 'you');
    },

    transferOffered(state, action: PayloadAction<{ stripId: string; to: string }>) {
      const hit = findStrip(state, action.payload.stripId);
      if (!hit) return;
      hit.strip.xfr = { to: action.payload.to, state: 'PENDING' };
      log(
        state,
        hit.icao,
        'info',
        'handoffOffered',
        { cs: hit.strip.cs, to: action.payload.to },
        'you',
      );
      toast(state, 'info', 'handoffOffered', { cs: hit.strip.cs, to: action.payload.to });
    },
    transferAccepted(state, action: PayloadAction<string>) {
      const hit = findStrip(state, action.payload);
      if (!hit || hit.strip.xfr?.state !== 'PENDING') return;
      hit.strip.xfr.state = 'ACCEPTED';
      log(
        state,
        hit.icao,
        'ok',
        'handoffAccepted',
        { cs: hit.strip.cs, to: hit.strip.xfr.to },
        'euroscope',
      );
      toast(state, 'ok', 'handoffAccepted', { cs: hit.strip.cs, to: hit.strip.xfr.to });
    },
    transferCancelled(state, action: PayloadAction<string>) {
      const hit = findStrip(state, action.payload);
      if (!hit || !hit.strip.xfr) return;
      const to = hit.strip.xfr.to;
      hit.strip.xfr = null;
      log(state, hit.icao, 'warn', 'handoffCancelled', { cs: hit.strip.cs, to }, 'you');
    },

    freeTextSet(state, action: PayloadAction<{ stripId: string; text: string }>) {
      const hit = findStrip(state, action.payload.stripId);
      if (!hit) return;
      hit.strip.freeText = action.payload.text;
    },
    squawkObserved(state, action: PayloadAction<{ stripId: string; code: string }>) {
      const hit = findStrip(state, action.payload.stripId);
      if (!hit) return;
      hit.strip.sqkS = action.payload.code;
    },
    suggestSet(state, action: PayloadAction<{ stripId: string; bay: BayKind }>) {
      const hit = findStrip(state, action.payload.stripId);
      if (!hit) return;
      hit.strip.suggest = { bay: action.payload.bay };
    },

    dclSent(state, action: PayloadAction<{ stripId: string; remark?: string }>) {
      const hit = findStrip(state, action.payload.stripId);
      if (!hit) return;
      // A PDC delivered by private message needs no acknowledgement —
      // the traffic counts as fully cleared the moment it is sent.
      hit.strip.dcl = 'ACK';
      hit.strip.cleared = true;
      promoteToCleared(hit);
      log(state, hit.icao, 'ok', 'pdcSent', { cs: hit.strip.cs }, 'you');
      toast(state, 'info', 'pdcSent', { cs: hit.strip.cs });
    },
    dclAcked(state, action: PayloadAction<string>) {
      const hit = findStrip(state, action.payload);
      if (!hit || hit.strip.dcl !== 'SENT') return;
      hit.strip.dcl = 'ACK';
      log(state, hit.icao, 'ok', 'pdcAcked', { cs: hit.strip.cs }, 'euroscope');
      toast(state, 'ok', 'pdcAcked', { cs: hit.strip.cs });
    },

    fplApplied(state, action: PayloadAction<{ stripId: string; draft: FplDraft }>) {
      const hit = findStrip(state, action.payload.stripId);
      if (!hit) return;
      const d = action.payload.draft;
      Object.assign(hit.strip, {
        type: d.actype,
        wake: d.wake,
        adep: d.adep,
        ades: d.ades,
        gate: d.gate,
        rwy: d.rwy,
        proc: d.proc,
        sqkA: d.sqkA,
        cfl: d.cfl,
        freeText: d.freeText,
        fpl: {
          rules: d.rules,
          ftype: d.ftype,
          num: d.num,
          equip: d.equip,
          eobt: d.eobt,
          tas: d.tas,
          rfl: d.rfl,
          route: d.route,
          eet: d.eet,
          altn: d.altn,
          altn2: d.altn2,
          other: d.other,
        },
      });
      log(state, hit.icao, 'ok', 'fplAmended', { cs: hit.strip.cs }, 'you');
    },

    stripAdded(
      state,
      action: PayloadAction<{ icao: string; strip: Parameters<typeof makeStrip>[0] }>,
    ) {
      const tab = state.tabs[action.payload.icao];
      if (!tab) return;
      const strip = makeStrip({ ...action.payload.strip, anim: true });
      tab.strips.unshift(strip);
      log(
        state,
        action.payload.icao,
        'info',
        strip.dir === 'ARR' ? 'inbound' : 'fplReceived',
        { cs: strip.cs, ades: strip.ades },
        'euroscope',
      );
      toast(state, 'info', strip.dir === 'ARR' ? 'inbound' : 'fplReceived', {
        cs: strip.cs,
        ades: strip.ades,
        icao: action.payload.icao,
      });
    },

    bayRenamed(state, action: PayloadAction<{ bayId: string; title: string }>) {
      const tab = state.tabs[state.activeTab];
      const bay = tab.bays.find((b) => b.id === action.payload.bayId);
      if (!bay) return;
      bay.title = action.payload.title.trim() || null;
    },
    baySplit(
      state,
      action: PayloadAction<{ bayId: string; newTitle: string; sourceTitle?: string }>,
    ) {
      const tab = state.tabs[state.activeTab];
      const index = tab.bays.findIndex((b) => b.id === action.payload.bayId);
      if (index < 0) return;
      const source = tab.bays[index];
      if (action.payload.sourceTitle && source.title === null) {
        source.title = action.payload.sourceTitle;
      }
      state.seq += 1;
      const id = `${source.kind}-${state.seq}`;
      tab.bays.splice(index + 1, 0, {
        id,
        kind: source.kind,
        title: action.payload.newTitle,
        ...(source.cap !== undefined ? { cap: source.cap } : {}),
      });
      log(
        state,
        state.activeTab,
        'info',
        'baySplit',
        { bay: source.id, title: action.payload.newTitle },
        'you',
      );
    },
    bayLockToggled(state, action: PayloadAction<string>) {
      const tab = state.tabs[state.activeTab];
      const bay = tab.bays.find((b) => b.id === action.payload);
      if (!bay) return;
      const locked = !tab.locks[bay.id];
      tab.locks[bay.id] = locked;
      log(
        state,
        state.activeTab,
        locked ? 'warn' : 'info',
        locked ? 'bayLockedLog' : 'bayUnlockedLog',
        { bay: bay.id },
        'you',
      );
    },
    bayRemoved(state, action: PayloadAction<string>) {
      const tab = state.tabs[state.activeTab];
      const bay = tab.bays.find((b) => b.id === action.payload);
      if (!bay) return;
      if (tab.bays.filter((b) => b.kind === bay.kind).length < 2) return;
      const occupants = tab.strips.filter((s) => s.bay === bay.id).length;
      if (occupants > 0) {
        toast(state, 'alarm', 'bayNotEmpty', { bay: bay.id, count: occupants });
        return;
      }
      tab.bays = tab.bays.filter((b) => b.id !== bay.id);
      delete tab.locks[bay.id];
      log(state, state.activeTab, 'info', 'bayRemoved', { bay: bay.id }, 'you');
    },

    /**
     * Live EuroScope flight state (flight_updated / session_snapshot).
     * Inserts land directly in the mapped bay; on an existing strip the
     * mapped bay only becomes a suggestion — the controller moves strips,
     * EuroScope proposes.
     */
    flightUpserted(state, action: PayloadAction<{ icao: string; patch: StripPatch }>) {
      const { icao, patch } = action.payload;
      const tab = state.tabs[icao];
      if (!tab) return;
      const existing = tab.strips.find((s) => s.cs === patch.cs);
      const archivedEntry = tab.archived.find((a) => a.cs === patch.cs);
      if (!existing && archivedEntry) {
        if (archivedEntry.by !== 'auto') {
          // User archives are final for the session — the scan must
          // not resurrect strips the controller already put away.
          return;
        }
        // Auto-archived (transient flight_removed): the flight is
        // back in the session, so it returns to the board.
        tab.archived = tab.archived.filter((a) => a.cs !== patch.cs);
      }
      if (!existing) {
        tab.strips.unshift(
          makeStrip({
            id: `es-${patch.cs}`,
            cs: patch.cs,
            airline: '',
            type: patch.type,
            wake: patch.wake,
            adep: patch.adep,
            ades: patch.ades,
            gate: '',
            sqkA: patch.sqkA,
            sqkS: patch.sqkS,
            proc: patch.proc,
            procKind: patch.procKind,
            rwy: patch.rwy,
            cfl: patch.cfl,
            dir: patch.dir,
            bay: patch.bay,
            cleared: patch.cleared,
            freeText: patch.freeText,
            anim: true,
            ...(patch.handoffTo ? { xfr: { to: patch.handoffTo, state: 'PENDING' as const } } : {}),
          }),
        );
        const key = patch.dir === 'ARR' ? 'inbound' : 'fplReceived';
        log(state, icao, 'info', key, { cs: patch.cs, ades: patch.ades }, 'euroscope');
        return;
      }
      Object.assign(existing, {
        type: patch.type || existing.type,
        wake: patch.wake || existing.wake,
        adep: patch.adep || existing.adep,
        ades: patch.ades || existing.ades,
        proc: patch.proc || existing.proc,
        procKind: patch.procKind,
        rwy: patch.rwy || existing.rwy,
        sqkA: patch.sqkA || existing.sqkA,
        sqkS: patch.sqkS,
        cfl: patch.cfl || existing.cfl,
        freeText: patch.freeText,
        cleared: existing.cleared || patch.cleared,
      });
      if (patch.handoffTo) {
        if (existing.xfr?.to !== patch.handoffTo || existing.xfr.state !== 'ACCEPTED') {
          existing.xfr = { to: patch.handoffTo, state: 'PENDING' };
        }
      } else if (existing.xfr?.state === 'PENDING') {
        existing.xfr = null;
      }
      const currentBay = tab.bays.find((b) => b.id === existing.bay);
      if (currentBay && currentBay.kind !== patch.bay) {
        existing.suggest = { bay: patch.bay };
      } else if (existing.suggest?.bay === currentBay?.kind) {
        existing.suggest = null;
      }
    },
    flightRemoved(state, action: PayloadAction<string>) {
      const hit = [...state.tabsOrder]
        .map((icao) => ({
          icao,
          strip: state.tabs[icao].strips.find((s) => s.cs === action.payload),
        }))
        .find((x) => x.strip);
      if (!hit?.strip) return;
      const tab = state.tabs[hit.icao];
      tab.strips = tab.strips.filter((s) => s.cs !== action.payload);
      tab.archived.unshift({ cs: action.payload, time: utcNow(), by: 'auto' });
      log(state, hit.icao, 'info', 'flightRemoved', { cs: action.payload }, 'euroscope');
    },
    positionUpdated(state, action: PayloadAction<{ cs: string; squawk: string }>) {
      for (const icao of state.tabsOrder) {
        const strip = state.tabs[icao].strips.find((s) => s.cs === action.payload.cs);
        if (strip) strip.sqkS = action.payload.squawk;
      }
    },
    controllersUpdated(state, action: PayloadAction<LiveStation[]>) {
      state.controllers = action.payload;
    },
    airportsSeen(state, action: PayloadAction<string[]>) {
      const valid = action.payload.filter((icao) => /^[A-Z]{4}$/.test(icao));
      state.seenAirports = [...new Set([...state.seenAirports, ...valid])].sort();
    },

    feedToggled(state, action: PayloadAction<boolean>) {
      state.feedOn = action.payload;
    },
    toastPushed(
      state,
      action: PayloadAction<{
        kind: ToastKind;
        key: string;
        params?: Record<string, string | number>;
      }>,
    ) {
      toast(state, action.payload.kind, action.payload.key, action.payload.params ?? {});
    },
    toastDismissed(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    eventLogged(
      state,
      action: PayloadAction<{
        icao: string;
        kind: FeedKind;
        key: string;
        params: Record<string, string | number>;
        src: FeedSource;
      }>,
    ) {
      const { icao, kind, key, params, src } = action.payload;
      log(state, icao, kind, key, params, src);
    },
  },
});

export const stripsActions = stripsSlice.actions;
export { fplDraftOf };
