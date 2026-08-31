import { kindOrder } from './airports';
import type { BayKind, MoveVerdict, Strip, StripDirection, StripsTab } from './types';

/** Bays a strip of the given direction may occupy. */
export function allowedBays(dir: StripDirection): BayKind[] {
  if (dir === 'ARR') return ['APPROACH', 'RUNWAY', 'TAXI'];
  if (dir === 'DEP') return ['PENDING', 'CLEARED', 'PUSHBACK', 'TAXI', 'RUNWAY'];
  return ['PENDING', 'CLEARED', 'PUSHBACK', 'TAXI', 'RUNWAY', 'APPROACH'];
}

/**
 * Guard rails for moving a strip into a bay (by id, falling back to
 * kind). `title` values are stable keys the UI maps to toast copy:
 * unknownBay | bayLocked | flowGuard | occupancy | noClearance.
 */
export function checkMove(strip: Strip, tab: StripsTab, bayId: string): MoveVerdict {
  const bay = tab.bays.find((b) => b.id === bayId) ?? tab.bays.find((b) => b.kind === bayId);
  if (!bay) return { ok: false, title: 'unknownBay' };
  if (strip.bay === bay.id) return { ok: false, silent: true };
  if (tab.locks[bay.id]) return { ok: false, title: 'bayLocked' };
  if (!allowedBays(strip.dir).includes(bay.kind)) return { ok: false, title: 'flowGuard' };
  if (bay.cap !== undefined) {
    const occupancy = tab.strips.filter((s) => s.bay === bay.id).length;
    if (occupancy >= bay.cap) return { ok: false, title: 'occupancy' };
  }
  if (strip.dir === 'DEP' && !strip.cleared && kindOrder(bay.kind) > 1) {
    return { ok: false, title: 'noClearance' };
  }
  return { ok: true };
}
