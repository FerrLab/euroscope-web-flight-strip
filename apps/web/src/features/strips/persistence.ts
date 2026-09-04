import type { ArchivedStrip, Bay, StripsState } from './types';

export const LAYOUT_KEY = 'eurostrip.strips.layout.v1';

export interface SavedTabLayout {
  bays: Bay[];
  locks: Record<string, boolean>;
  /**
   * Archived callsigns must survive refresh or the session scan
   * resurrects them. Optional: pre-existing saves lack it.
   */
  archived?: ArchivedStrip[];
}

/**
 * What survives a refresh: the board layout — open airports, active
 * tab, bay arrangement, locks, archived callsigns. Strips are
 * deliberately ephemeral; the live session (or the demo feed)
 * repopulates them.
 */
export interface SavedLayout {
  tabsOrder: string[];
  activeTab: string;
  tabs: Record<string, SavedTabLayout>;
}

export function extractLayout(state: StripsState): SavedLayout {
  const tabs: Record<string, SavedTabLayout> = {};
  for (const icao of state.tabsOrder) {
    const tab = state.tabs[icao];
    if (tab) tabs[icao] = { bays: tab.bays, locks: tab.locks, archived: tab.archived };
  }
  return { tabsOrder: state.tabsOrder, activeTab: state.activeTab, tabs };
}

export function saveLayout(state: StripsState): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(extractLayout(state)));
  } catch {
    // Storage unavailable (private mode, quota) — layout just won't persist.
  }
}

export function loadLayout(): SavedLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as SavedLayout).tabsOrder) ||
      typeof (parsed as SavedLayout).activeTab !== 'string'
    ) {
      return null;
    }
    return parsed as SavedLayout;
  } catch {
    return null;
  }
}
