# EuroStrip — Phase 3 Handoff

> Pickup point for another machine / another session continuing the scaffold.

**Date written:** 2026-05-06
**Branch:** `feat/phase-3-frontend-skeleton`
**Author of this handoff:** Phase 3 gate session (Task 26)

---

## Phase 3 status: GATE GREEN locally — PR open (CI partially blocked by pre-existing infra)

All 26 tasks of the Phase 3 plan are complete. The Phase 3 gate from spec §13.3 is green on the local machine, and CI Lint+Typecheck + test-frontend are both green. The remaining CI jobs are blocked on a pre-existing Typesense bring-up failure that also fails on `main`.

### Local gate (all green)

- `nx run-many --target=test --projects=design-tokens,i18n,ui,api-client,web` — 5 projects, all suites pass (Vitest)
- `nx run-many --target=typecheck --projects=design-tokens,i18n,ui,api-client,web` — 5 projects, all green
- `nx lint web` — clean (0 warnings, `--max-warnings=0` enforced)
- `nx build design-tokens` — regenerates `tokens.css` (cosmetic quote-style drift only)
- `nx build api-client` — regenerates `generated.ts` cleanly from Phase 2 OpenAPI snapshot
- Live HTTP gate (cookie session via stub-redirect → Next.js proxy):
  - `POST /api/proxy/api/ping` → **201** with persisted ULID + translatable note
  - `GET /api/proxy/api/ping` → **200** with array containing the new ping
- `nx e2e web` — Playwright suite **1/1 passed** (`login → dashboard → create ping → list → theme + locale switch`)
- Backend Pest (59 passed, 114 assertions) + Pint (131 files clean) re-verified locally

### Fixes shipped during the gate

The CI typecheck job is run by the workflow but was not part of the local triple-gate command. It surfaced a batch of real Phase 3 regressions that all needed cleanup:

1. **Test idempotency.** The single Playwright spec used `getByText('e2e-flow')` and asserted visibility, which violated strict-mode whenever a previous run left `e2e-flow` rows in the database. Fixed by using a per-run unique tag (`e2e-flow-${Date.now()}`) and a `getByRole('cell', { name: tag })` locator.
2. **React types collision.** `apps/web/package.json` pinned `@types/react@^18.3.12` while every other workspace uses `^19.2.14`. Two type copies turned every Radix call site into a `ReactNode`/`ReactPortal` incompatibility error under `tsc`. Bumped apps/web to `^19.2.14`.
3. **Missing test-types.** `libs/ui/tsconfig.json` and `apps/web/tsconfig.json` listed `types: ["node"]` only, so `toBeInTheDocument`/`toHaveAttribute` failed `tsc` even though Vitest passed at runtime. Added `vitest/globals` and `@testing-library/jest-dom`.
4. **`exactOptionalPropertyTypes` violations.** `libs/ui/Select.tsx` was passing `disabled: undefined` straight through to `RadixSelect.Root`; rewrote to spread only the defined props. The proxy route did the same with `body: undefined`; restructured to attach the body conditionally.
5. **Stale `@ts-expect-error` directives.** Several were sitting one expression away from the JSX they were meant to silence (so `tsc` reported them unused). Moved them inline next to the offending prop, or removed where the prop is now genuinely optional (Toast description, Button children, Input value).
6. **Stub login role assignment.** Fresh stub identities created during e2e didn't have the `member` role and got 401/403 from `/api/ping`. Extended `SocialiteStubController::callback` to auto-assign the seeded `member` role on user creation. (Stub login is a dev-only convenience; production OAuth has its own provisioning rules.)
7. **Proxy content-encoding bug.** Node's `fetch` decodes upstream `content-encoding` (gzip/br/zstd) before handing us the body, but the proxy was forwarding the original `content-encoding` header — which made the browser try to re-decode the already-decoded payload, surfacing as `ERR_CONTENT_DECODING_FAILED`. Strip `content-encoding` and `content-length` so Next.js sets fresh ones.
8. **CI `nx affected --target=lint` regression.** `backend:lint` shells out to docker compose with the (gitignored) `.env` file, which CI doesn't have. Pint runs natively in a separate workflow step, so excluded backend from the affected-lint sweep.

### CI status as of the last push

- Lint + Typecheck — SUCCESS
- test-frontend — SUCCESS
- Test Backend — FAILURE (Typesense container exits with code 1 during `docker compose up --wait`). Same failure exists on `main` (sha `8659dcf`), so this is a pre-existing CI infrastructure issue, not a Phase 3 regression.
- e2e — SKIPPED (`needs: test-backend`). Verified locally instead.

Phase 4 should add a Typesense bring-up fix (or scope the backend stack down for CI) as one of its first hygiene tasks, otherwise it'll continue blocking the e2e job.

---

## What's in Phase 3 (high level)

Per ADR 0006 and `docs/architecture/frontend.md`:

- `libs/design-tokens` — Openbridge-derived 4-theme palette (day/dusk/night/bright); Tailwind preset enforces the squared-UI rule (no border-radius except `rounded-full`).
- `libs/ui` — eight squared primitives: Button, Input, Select, Card, Table, Modal, Toast, Spinner. Radix Primitives underneath Modal/Select/Toast.
- `libs/api-client` — typed RTK Query endpoints generated from Phase 2's `openapi.json` snapshot.
- `libs/i18n` — locale registry (`en`, `pt`) and shared catalogs.
- `apps/web` — App Router with `[locale]` segment, Redux + RTK Query store, theme + locale switchers, cookie-only auth via Next.js proxy route handlers (`/api/auth/stub-redirect`, `/api/proxy/[...path]`).
- `apps/web/features/ping` — list + create UI mirroring the Phase 2 backend module; RHF + Zod; happy/invalid/garbage tests.
- ESLint `react/jsx-no-literals` enforces the no-hardcoded-strings rule.
- Playwright E2E covers the full happy path on top of `next dev` bound to localhost.
- CI extended with `test-frontend` and `e2e` jobs.
- `docs/architecture/frontend.md` and `docs/adr/0006-frontend-stack.md` document the eight Phase 3 decisions.

---

## Pickup notes for Phase 4

- Branch `feat/phase-3-frontend-skeleton` will land via the PR opened from this gate (commit at gate close: see `git log feat/phase-3-frontend-skeleton`).
- Before starting Phase 4, run `pnpm nx run-many --target=test --projects=design-tokens,i18n,ui,api-client,web` and `pnpm nx e2e web` once on the new machine to confirm parity.
- Phase 4 (per spec §13.4) introduces `docs/conventions/tdd.md`, `docs/conventions/solid.md`, and `docs/runbooks/adding-a-feature.md`. Write the Phase 4 plan with `superpowers:writing-plans` against spec §13.4 before touching code.
- Pre-existing untracked path: `apps/backend/storage/passport/` (Passport keypair generated locally; do not commit).

---

## Known minor items (non-blocking)

- `libs/design-tokens/src/tokens.css` rebuild emits double-quoted font-family strings vs the committed single-quoted version. Behavior identical; commit policy for the generated file is "regenerate-on-build, don't fight quote style".
- pnpm warns about Node 24 vs the engines field (`>=22 <23`). Tests are green on Node 24; tighten or relax the engines field as a Phase 4 hygiene task if desired.
