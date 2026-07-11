# ADR 0006 — Frontend Stack and Cookie-Based Auth

**Date:** 2026-05-06
**Status:** Accepted

## Context

Phase 3 of the Azimuth scaffold delivers the frontend skeleton. The backend
landed in Phase 2 with Passport-issued Bearer tokens minted through the stub
Socialite driver ([ADR 0004](0004-stub-socialite-per-request-fixture.md)). The
frontend now has to make a series of cross-cutting choices that, taken
together, define the shape of every feature module added afterwards:

- A way to carry authenticated state between the browser and the backend that
  is **safe** (resists XSS exfiltration of the Bearer), **simple to use** from
  Client Components, and **future-proof** for SSR-of-authed-pages later.
- A theming system that supports the **four Openbridge native modes**
  (day / dusk / night / bright) without a flash on first paint and without
  layering JavaScript theme objects on top of CSS.
- A test stack that is **fast** (so TDD per CLAUDE.md hard rule #1 stays
  cheap) and matches Pest 4's parallel/terse ethos on the backend.
- A way to **enforce no-hardcoded-strings** on user-facing JSX so i18n
  catalogs stay authoritative (CLAUDE.md hard rule #5).
- A way to **type HTTP calls from the Phase 2 OpenAPI spec** so backend
  changes surface at compile time instead of in production.

Decisions had to be locked before plan-writing because the eight choices
together fix the shape of every `features/<module>/` directory and the four
`libs/*` packages.

## Decision

The eight choices below are taken verbatim from rows 1–8 of the
[Phase 3 decision log](../superpowers/specs/2026-05-06-azimuth-scaffold-phase-3-decisions.md)
§3.

1. **Branch strategy.** Phase 2 PR #1 is merged (commit `99bac88`); Phase 3
   branches off updated `main`. Clean history; no rebase complexity; Phase 2
   code immediately available.
2. **"Openbridge" interpretation.** Adopt the real Kongsberg/MMC design
   system from Ocean Industries Concept Lab (Apache 2.0 after the 6-month
   AGPL window). Take **tokens and icons**; build React primitives styled
   with Openbridge tokens. Web components in React carry friction (events,
   refs, SSR); tokens are the high-leverage adoption that's framework-
   agnostic.
3. **Theme palette.** **Day / Dusk / Night / Bright** (Openbridge native,
   four modes); replaces the original spec's loose "light/dark/HC" listing.
   Maps directly to general-aviation cockpit lighting conditions; Openbridge
   already designed and tuned for these four environments.
4. **Component library approach.** Build in-house in `libs/ui`, styled with
   Openbridge tokens. Use **Radix Primitives** for headless behavior on
   `Modal`, `Select`, and `Toast` (focus traps, keyboard nav, ARIA). Plain
   HTML for `Button`, `Input`, `Card`, `Spinner`, `Table`. shadcn/ui or
   Mantine would fight Openbridge's design language; Radix is headless so it
   composes cleanly without imposing visual style.
5. **OpenAPI → RTK Query codegen.** Use **`@rtk-query/codegen-openapi`**
   (the official package). Canonical RTK Query path; turns Phase 2's
   `openapi.json` snapshot into typed `injectedEndpoints` automatically; no
   hand-written endpoint boilerplate.
6. **Auth token transport.** **httpOnly cookie + full Next.js proxy.** The
   Bearer token never reaches browser JavaScript. RTK Query talks only to
   `/api/*` on the Next.js origin; Next.js route handlers under
   `app/api/proxy/[...path]/` and `app/api/auth/*/` forward to the backend
   with the `Authorization: Bearer <cookie>` header. Most secure (XSS cannot
   exfiltrate the token); avoids CORS dance; future-proof for SSR-of-authed-
   pages in Phase 4+. The ~5 ms Next.js hop per call is negligible.
7. **Form library.** **React Hook Form + Zod**. Dominant React form pattern;
   Zod schemas double-duty for form validation and RTK Query payload typing;
   team familiarity.
8. **Component test runner.** **Vitest**. Vite-native, fast cold start,
   first-class Next.js 15 support, Jest-compatible API; aligns with Pest 4's
   parallel/terse ethos on the backend.

## Consequences

**Positive:**

- The Bearer token never reaches browser JS. XSS-resistant by construction;
  no localStorage/JS-readable-cookie attack surface to audit.
- Vitest + React Testing Library is fast enough that test-first feels free,
  not expensive; the test discipline mandated by CLAUDE.md hard rule #1
  stays cheap to follow.
- `@rtk-query/codegen-openapi` keeps frontend types in lockstep with the
  backend automatically. A backend route change that breaks the contract
  surfaces at frontend build time, not in production.
- Openbridge tokens give us a four-theme palette tuned for cockpit
  conditions. The day/dusk/night/bright switch is a single attribute swap
  on `<html>`; no JS theme provider re-renders the world.
- React Hook Form + Zod gives one schema that drives both UI validation and
  the network payload type. No duplicated validation rules.
- Radix-under-the-hood for `Modal`, `Select`, and `Toast` means we get
  accessibility (focus traps, escape keys, ARIA) for free without inheriting
  a visual design language we'd then have to fight.

**Negative:**

- Every API call adds a Next.js proxy hop (~5 ms locally; similar in
  deployed environments). Negligible in practice but real.
- Openbridge tokens are hand-extracted from
  `@oicl/openbridge-webcomponents` rather than imported as a runtime
  dependency. Token refreshes require manual extraction once per Openbridge
  release, traded against not pulling Lit into the runtime.
- The eight `libs/ui` primitives are ours to maintain. Filament-equivalent
  admin bulk operations don't exist on the frontend — those flows stay in
  Filament at `/admin` ([ADR 0005](0005-filament-for-admin.md)).
- We still have a small in-house design language to evolve as features
  push on it. No external library will absorb that load.

**Neutral:**

- The eight squared-UI primitives in `libs/ui` are ours to maintain — we
  trade external dependency surface for full control over the design
  language and its evolution.
- The codegen output (`libs/api-client/src/generated.ts`) is committed.
  Diffs in pull requests show contract changes explicitly, which is good
  for review and bad for line counts. We accept the trade.

## Alternatives Considered

1. **Server-Components-only — no Redux, just RSC + Server Actions.**
   Rejected. The mental model split between RSC (no state, no events) and
   Client Components (state, events) imposes a tax every time a feature
   needs an interactive form or optimistic update. Phase 3's Ping module is
   a worked counter-example — it needs RTK Query's cache invalidation and
   optimistic updates, both of which are awkward through Server Actions.
   We adopt Client Components for the authed shell and revisit RSC for
   read-mostly pages in Phase 4+.
2. **shadcn/ui or Mantine instead of in-house `libs/ui`.** Rejected. Both
   ship a strong opinionated visual default that fights Openbridge's
   token-based palette. We'd spend the time we saved on installation
   re-skinning components. Composing Radix headless primitives ourselves
   is the cheaper long-term path given Openbridge as the design north star.
3. **localStorage Bearer instead of httpOnly cookie.** Rejected outright.
   localStorage tokens are readable by any script that runs on the page
   (including via XSS, including via a dependency compromise). The
   ~5 ms Next.js hop is a small price for closing that attack surface
   completely.

## References

- Phase 3 decision log:
  [`docs/superpowers/specs/2026-05-06-azimuth-scaffold-phase-3-decisions.md`](../superpowers/specs/2026-05-06-azimuth-scaffold-phase-3-decisions.md)
  rows 1–8.
- Frontend architecture: [`architecture/frontend.md`](../architecture/frontend.md).
- [ADR 0005 — Filament for admin](0005-filament-for-admin.md), which
  complements this for backend-side admin UX.
- [ADR 0004 — Stub Socialite per-request fixture](0004-stub-socialite-per-request-fixture.md)
  for the backend half of the cookie-auth flow.
- Openbridge: GitHub `Ocean-Industries-Concept-Lab/openbridge-webcomponents`,
  npm `@oicl/openbridge-webcomponents-react`.
