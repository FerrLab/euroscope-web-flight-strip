import type { Bay, BayKind, StripsTab } from '../types';

/**
 * A bay's display title: custom title if renamed, else the localized
 * kind label — the runway bay appends the active runway ident.
 */
export function bayDisplayTitle(
  bay: Bay,
  tab: StripsTab,
  kindLabel: (kind: BayKind) => string,
): string {
  if (bay.title) return bay.title;
  if (bay.kind === 'RUNWAY' && tab.metar.rwys[0]) {
    return `${kindLabel('RUNWAY')} ${tab.metar.rwys[0]}`;
  }
  return kindLabel(bay.kind);
}
