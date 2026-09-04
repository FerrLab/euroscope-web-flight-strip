# Strip Companion — design spec

- **Date:** 2026-08-30
- **Source of truth:** Claude Design project “VATSIM Flight Strip
  Companion” (`9b397e3e-0265-4285-84f2-21d664000bab`), artboard
  `Strip Companion.dc.html`. The artboard is a working prototype: its
  markup carries the exact Openbridge token bindings and its logic
  class carries the exact board rules. This spec summarizes; the
  design file decides ties.
- **Surface:** new frontend route `/[locale]/strips` in `apps/web`.

## What it is

A controller-facing flight-strip board that sits on top of the
EuroScope gateway session:

- **Airport tabs** (Openbridge tab row): LPPT and LPPR seeded; LPFR /
  LPMA / LPBJ openable via an “Open airport” modal. Per-tab unseen
  badge counts, closable tabs.
- **AWOS sidebar**: ATIS letter, flight category (VFR / MVFR / IFR /
  LIFR from visibility + ceiling), active runways, wind / QNH / T·DP /
  VIS / CEILING grid, a wind-rose SVG with runway alignment and
  head/cross-wind decomposition (gusts included, caution ≥ 12 kt,
  alarm ≥ 20 kt crosswind), raw METAR line, activity feed with a Live
  toggle, archived-strip counter.
- **Strip bays**: six kinds — Pending, Cleared, Pushback, Taxi,
  Runway (capacity 1), Approach — one column each. Bays can be
  renamed (double-click), split vertically, locked (rejects drops),
  and removed (only when empty and not the last of their kind).
- **Strips**: callsign, type/wake, direction edge color (DEP
  starboard-green, ARR port-red, VFR enhanced-cyan), route line,
  SID/STAR + runway, assigned vs squawked code (mismatch caution,
  duplicate alarm), CFL, stand + airline, inline-editable free text,
  status chips (max 2: DUP, handoff pending/accepted, RDY, PDC,
  PDC OK, NO CLR), suggestion pill (accept auto-move).
- **Drag & drop with guard rails** (`checkMove`): same-bay no-op,
  locked bay, direction flow guard (ARR only Approach/Runway/Taxi;
  DEP only Pending→Runway), capacity, and no-clearance guard (DEP
  without CLR cannot pass Cleared). Rejections shake the bay, toast,
  and log to the feed.
- **Strip context menu** (right-click / long-press): issue clearance,
  PDC modal, transfer to station, edit flight plan, archive, delete
  (confirm modal), plus a move-to grid of all bays.
- **Modals**: ICAO flight-plan editor (items 7–18 + ATC assignment
  section), datalink clearance (generated PDC text + optional remark,
  send → SENT → ACK simulation), transfer (stations for the active
  airport, pending-handoff cancel), delete confirm, open airport.
- **Toasts**: bottom-right, auto-dismiss ~5.6 s, info/ok/caution/alarm.
- **Theming**: the four Openbridge palettes via the top-bar dimming
  button (brilliance menu). Uses the app’s existing `ThemeProvider`
  (`data-obc-theme`).

## Decisions (where the design and repo rules meet)

1. **Squared corners.** The artboard uses 3–8 px radii; CLAUDE.md
   hard rule 9 (no `border-radius` except `rounded-full`) wins.
   Everything renders square except round status dots. Recorded as a
   deliberate deviation from the artboard.
2. **State split.** Durable board state (tabs, strips, bays, locks,
   feed, archived, toasts) lives in a Redux slice
   (`features/strips/slice.ts`); ephemeral UI (context menus, modals,
   drag hover, rename/free-text editing) stays in component state.
   Guard rails are pure functions shared by the drag-over preview and
   the reducer.
3. **Demo feed, real seam.** The design’s simulated EuroScope
   schedule ships as `demoFeed.ts` behind the sidebar Live toggle so
   the surface behaves exactly like the prototype. Real gateway
   wiring (mapping JSON Contract envelopes onto the same slice
   actions) is a follow-up phase; the slice’s action surface is the
   integration seam.
4. **Openbridge components.** The artboard imports a React port of
   Openbridge; the app uses the real
   `@oicl/openbridge-webcomponents(-react)` package. Mapping: TopBar →
   `ObcTopBar`, TabRow → `ObcTabRow`, ToggleSwitch →
   `ObcToggleSwitch`, Clock → `ObcClock`, StatusIndicator →
   `ObcStatusIndicator`, Button → `ObcButton`, Icon “x” → `<obi-x>`
   element.
5. **Copy.** All user-facing strings go through `strips.{en,pt}.json`.
   Operational vocabulary (RWY, QNH, ATIS, SID/STAR, callsigns, METAR
   raw text, PDC body) is identical in both catalogs — identifiers,
   not prose (see i18n conventions). The surface wordmark stays the
   design’s “Azimuth”.
