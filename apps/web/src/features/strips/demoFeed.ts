import { stripsActions } from './slice';
import type { StripsState } from './types';

interface FeedStore {
  getState(): { strips: StripsState };
  dispatch(action: unknown): unknown;
}

interface ScheduledEvent {
  at: number;
  run(store: FeedStore): void;
}

function strip(store: FeedStore, id: string) {
  for (const icao of store.getState().strips.tabsOrder) {
    const hit = store.getState().strips.tabs[icao].strips.find((s) => s.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * The Strip Companion design's simulated EuroScope session, verbatim:
 * timed events that exercise every board surface. Replaced by real
 * gateway envelope mapping in phase 2 — the dispatches below are the
 * exact seam that mapping will target.
 */
const SCHEDULE: ScheduledEvent[] = [
  {
    at: 8,
    run(store) {
      const p4 = strip(store, 'p4');
      if (p4 && !p4.sqkS) {
        store.dispatch(stripsActions.squawkObserved({ stripId: 'p4', code: p4.sqkA }));
        store.dispatch(
          stripsActions.eventLogged({
            icao: 'LPPT',
            kind: 'ok',
            key: 'squawkVerified',
            params: { cs: 'TAP1901', code: p4.sqkA },
            src: 'euroscope',
          }),
        );
      }
    },
  },
  {
    at: 20,
    run(store) {
      store.dispatch(
        stripsActions.stripAdded({
          icao: 'LPPT',
          strip: {
            id: 'p10',
            cs: 'IBE3117',
            airline: 'Iberia',
            type: 'A21N',
            wake: 'M',
            adep: 'LPPT',
            ades: 'LEMD',
            gate: '507',
            sqkA: '2470',
            proc: 'ODEMI4S',
            procKind: 'SID',
            rwy: '21',
            cfl: '060',
            dir: 'DEP',
            bay: 'PENDING',
          },
        }),
      );
    },
  },
  {
    at: 34,
    run(store) {
      const p5 = strip(store, 'p5');
      if (p5?.bay === 'PUSHBACK') {
        store.dispatch(stripsActions.suggestSet({ stripId: 'p5', bay: 'TAXI' }));
        store.dispatch(
          stripsActions.eventLogged({
            icao: 'LPPT',
            kind: 'info',
            key: 'apronMovement',
            params: { cs: 'SWR739' },
            src: 'auto',
          }),
        );
      }
    },
  },
  {
    at: 48,
    run(store) {
      const p7 = strip(store, 'p7');
      if (p7?.bay === 'RUNWAY') {
        store.dispatch(stripsActions.stripArchived({ stripId: 'p7', silent: true }));
        store.dispatch(
          stripsActions.eventLogged({
            icao: 'LPPT',
            kind: 'ok',
            key: 'airborne',
            params: { cs: 'THY1756', rwy: '21' },
            src: 'auto',
          }),
        );
        store.dispatch(
          stripsActions.toastPushed({ kind: 'ok', key: 'airborne', params: { cs: 'THY1756' } }),
        );
      }
    },
  },
  {
    at: 62,
    run(store) {
      const p6 = strip(store, 'p6');
      if (p6?.bay !== 'TAXI') return;
      store.dispatch(stripsActions.stripMoved({ stripId: 'p6', bayId: 'RUNWAY', source: 'auto' }));
      const after = strip(store, 'p6');
      if (after?.bay === 'RUNWAY') {
        store.dispatch(
          stripsActions.eventLogged({
            icao: 'LPPT',
            kind: 'info',
            key: 'towerHandoff',
            params: { cs: 'TAP081' },
            src: 'auto',
          }),
        );
      } else {
        store.dispatch(stripsActions.suggestSet({ stripId: 'p6', bay: 'RUNWAY' }));
        store.dispatch(
          stripsActions.toastPushed({
            kind: 'caution',
            key: 'handoffHeld',
            params: { cs: 'TAP081' },
          }),
        );
      }
    },
  },
  {
    at: 76,
    run(store) {
      const p2 = strip(store, 'p2');
      if (!p2) return;
      store.dispatch(stripsActions.squawkObserved({ stripId: 'p2', code: '2436' }));
      store.dispatch(
        stripsActions.eventLogged({
          icao: 'LPPT',
          kind: 'warn',
          key: 'squawkConflict',
          params: { cs: 'RYR2394', set: '2436', assigned: '2455', dupWith: 'SWR739' },
          src: 'euroscope',
        }),
      );
      store.dispatch(
        stripsActions.toastPushed({
          kind: 'caution',
          key: 'squawkConflict',
          params: { cs: 'RYR2394', set: '2436', assigned: '2455', dupWith: 'SWR739' },
        }),
      );
    },
  },
  {
    at: 90,
    run(store) {
      const p8 = strip(store, 'p8');
      if (p8?.bay === 'APPROACH') {
        store.dispatch(stripsActions.suggestSet({ stripId: 'p8', bay: 'RUNWAY' }));
        store.dispatch(
          stripsActions.eventLogged({
            icao: 'LPPT',
            kind: 'info',
            key: 'onFinal',
            params: { cs: 'VLG8460', dist: 4, rwy: '21' },
            src: 'auto',
          }),
        );
      }
    },
  },
  {
    at: 104,
    run(store) {
      store.dispatch(
        stripsActions.stripAdded({
          icao: 'LPPR',
          strip: {
            id: 'r5',
            cs: 'TVF77QG',
            airline: 'Transavia France',
            type: 'B738',
            wake: 'M',
            adep: 'LFPO',
            ades: 'LPPR',
            gate: '14',
            sqkA: '5533',
            sqkS: '5533',
            proc: 'TURON1E',
            procKind: 'STAR',
            rwy: '35',
            cfl: '070',
            dir: 'ARR',
            bay: 'APPROACH',
          },
        }),
      );
    },
  },
];

export interface DemoFeed {
  start(): void;
  stop(): void;
  /** Re-arm after the Live toggle flips back on. */
  resume(): void;
}

export function createDemoFeed(store: FeedStore): DemoFeed {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let index = 0;
  let stopped = false;

  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleNext(delayMs: number) {
    clear();
    if (stopped || index >= SCHEDULE.length) return;
    if (!store.getState().strips.feedOn) return;
    timer = setTimeout(() => {
      const event = SCHEDULE[index];
      index += 1;
      try {
        event.run(store);
      } catch {
        // A dead target must not kill the rest of the schedule.
      }
      const next = SCHEDULE[index];
      if (next) scheduleNext(Math.max(2000, (next.at - event.at) * 1000));
    }, delayMs);
  }

  return {
    start() {
      stopped = false;
      const first = SCHEDULE[index];
      scheduleNext(first ? first.at * 1000 : 8000);
    },
    resume() {
      scheduleNext(4000);
    },
    stop() {
      stopped = true;
      clear();
    },
  };
}
