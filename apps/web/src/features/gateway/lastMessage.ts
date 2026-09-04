import type { ConsoleMessage } from './slice';

const p = (n: number) => String(n).padStart(2, '0');

/**
 * The wall-clock time of the newest console message, as Zulu `HH:MM:SS`.
 *
 * Console ids are minted as `<epoch-ms>-<seq>` by the gateway ring buffer,
 * so the timestamp travels with the message and survives a backfill poll —
 * reading the client clock on arrival would misdate replayed history.
 * Returns null when the feed is empty or the id carries no usable epoch.
 */
export function lastMessageAt(messages: readonly ConsoleMessage[]): string | null {
  const newest = messages.at(-1);
  if (!newest) return null;

  const ms = Number(newest.id.split('-')[0]);
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const d = new Date(ms);
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
