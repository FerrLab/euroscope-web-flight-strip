# Strip Companion — phase 1 (board UI + demo feed)

Spec: [2026-08-30-strip-companion-design.md](../specs/2026-08-30-strip-companion-design.md)

Scope: the full board surface at `/[locale]/strips`, driven by seeded
demo data and the simulated feed. No backend changes. Real gateway
envelope mapping is phase 2.

## Steps (TDD order — tests first per unit)

1. `features/strips/types.ts` + `airports.ts` — domain types, static
   config (bay kinds, airports, runways, stations).
2. `metar.ts` — flight category, wind parsing, rose geometry +
   head/crosswind math. Unit tests: happy / invalid / garbage.
3. `guards.ts` — `allowedBays`, `checkMove`. Unit tests: every guard
   branch.
4. `fpl.ts` — FPL draft builder, PDC text builder. Unit tests.
5. `seed.ts` — LPPT / LPPR / fresh-airport tabs (design fixture data).
6. `slice.ts` — board reducer: strip moves (guard-checked), clearance,
   PDC states, transfer lifecycle, archive/delete, bay
   rename/split/lock/remove, tab open/close/select, feed log with
   unseen counts, toasts. Unit tests: triads per action family.
7. `demoFeed.ts` — the design’s simulated schedule as timed dispatches
   honouring the Live toggle. Test with fake timers.
8. Components (`components/`): `WindRose`, `AwosPanel`,
   `ActivityFeed`, `StripCard`, `StripBoard`, `StripContextMenu`,
   `BayContextMenu`, modals (`FplModal`, `DclModal`, `ConfirmModal`,
   `TransferModal`, `AddAirportModal`), `ToastStack`, `StripsClient`.
   Component tests for chip logic, drop accept/reject rendering, AWOS
   category rendering, modal flows.
9. Route `app/[locale]/strips/page.tsx`; register `stripsSlice` in the
   store; `strips.{en,pt}.json` catalogs registered in
   `i18n/request.ts`.
10. `pnpm nx lint web` + vitest suite green; visual check in the
    running app; update `docs/architecture/frontend.md`.
