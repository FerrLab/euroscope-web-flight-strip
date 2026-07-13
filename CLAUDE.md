# EuroStrip — Collaboration Rules

> Web flight strips for EuroScope.

This file is loaded into every Claude Code session in this repo. It
encodes the non-negotiables; details live in `docs/`. If a rule
conflicts with anything else, the rule wins.

## What EuroStrip is

EuroStrip is a web companion for EuroScope: controllers point the
euroscope-websocket-connector plugin at this backend (JSON Contract
Protocol v1 over HTTPS long-poll) and interact with their session from
the browser — live flight data, protocol commands, and eventually
flight strips.

## Stack at a glance

- **Monorepo:** Nx 20, pnpm workspaces.
- **Backend:** Laravel 13 + Octane/FrankenPHP at `apps/backend/`.
  Pure CQRS (Command/Query DTO → Handler). Spatie packages: data,
  browsershot, translatable, laravel-permission v7.
- **Frontend:** Next.js 15 (App Router) + Redux Toolkit at `apps/web/`.
- **Data:** Postgres+PostGIS, Dragonfly (Redis-compatible), Typesense,
  Soketi, MinIO.
- **Surfaces:** Filament admin at `/admin`, Scramble docs at `/docs/api`.

## Hard rules

1. **TDD always.** Every feature is test-first. Each suite covers
   happy, invalid, and garbage paths at minimum. See
   [`docs/conventions/tdd.md`](./docs/conventions/tdd.md).
2. **SOLID at every layer.** Handlers do one thing; Repositories
   handle persistence; Domain depends on no framework. See
   [`docs/conventions/solid.md`](./docs/conventions/solid.md).
3. **No raw permission strings.** Authorization uses `BackedEnum`
   cases from each module's `*Permission` enum. PHPStan + Deptrac
   enforce this. See [ADR 0003](./docs/adr/0003-permission-marker-interface.md).
4. **Pure CQRS.** Application layer is Command/Query DTO + Handler.
   No UseCase indirection. See
   [ADR 0008](./docs/adr/0008-pure-cqrs.md) and
   [`docs/architecture/cqrs.md`](./docs/architecture/cqrs.md).
5. **Pint runs after every backend task.** `pnpm nx lint:fix backend`
   is part of "done" for any backend change. Follow with
   `pnpm nx lint backend` before committing.
6. **No hardcoded user-facing strings.** All user-facing text passes
   through i18n catalogs (next-intl on the frontend, Laravel `lang/`
   on the backend). ESLint enforces this on JSX. See
   [`docs/conventions/i18n.md`](./docs/conventions/i18n.md).
7. **API docs MUST work.** Scramble (`/docs/api`) regenerates on
   every boot; CI fails if any public route is missing. The
   generated `openapi.json` is the input to `libs/api-client`.
8. **`/docs` is evergreen.** Every architectural change updates the
   relevant `docs/architecture/*.md`. Significant decisions get an
   ADR.
9. **Squared UI.** No `border-radius` except `rounded-full` for
   avatars/pills (Openbridge convention). Tokens enforce this at the
   Tailwind config level.

## Workflow

The canonical workflow is in
[`docs/runbooks/adding-a-feature.md`](./docs/runbooks/adding-a-feature.md).
Short version:

1. `superpowers:brainstorming` to design → spec at
   `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md`.
2. `superpowers:writing-plans` to plan → plan at
   `docs/superpowers/plans/YYYY-MM-DD-<feature>-<phase>.md`.
3. `superpowers:subagent-driven-development` (preferred) or
   `superpowers:executing-plans` to execute.
4. TDD order: Handler test → Handler → Controller test → Controller
   → Filament resource → Frontend slice.
5. Update `/docs`, run Pint, open PR.

## Local dev

See [`docs/runbooks/local-dev.md`](./docs/runbooks/local-dev.md) —
10 minutes, cold start, full stack up.

If you've never touched the repo, read
[`docs/runbooks/repo-tour.md`](./docs/runbooks/repo-tour.md) first.

## What lives where

- **Architecture:** [`docs/architecture/`](./docs/architecture/) —
  [overview](./docs/architecture/overview.md),
  [monorepo-layout](./docs/architecture/monorepo-layout.md),
  [cqrs](./docs/architecture/cqrs.md),
  [auth](./docs/architecture/auth.md),
  [data-stores](./docs/architecture/data-stores.md),
  [frontend](./docs/architecture/frontend.md).
- **Conventions:** [`docs/conventions/`](./docs/conventions/) —
  [tdd](./docs/conventions/tdd.md),
  [solid](./docs/conventions/solid.md),
  [naming](./docs/conventions/naming.md),
  [i18n](./docs/conventions/i18n.md).
- **Runbooks:** [`docs/runbooks/`](./docs/runbooks/) —
  [local-dev](./docs/runbooks/local-dev.md),
  [adding-a-feature](./docs/runbooks/adding-a-feature.md),
  [adding-a-locale](./docs/runbooks/adding-a-locale.md),
  [adding-a-socialite-provider](./docs/runbooks/adding-a-socialite-provider.md),
  [rotating-passport-keys](./docs/runbooks/rotating-passport-keys.md),
  [inspecting-soketi](./docs/runbooks/inspecting-soketi.md),
  [repo-tour](./docs/runbooks/repo-tour.md).
- **ADRs:** [`docs/adr/`](./docs/adr/) — significant decisions
  (0001 Nx + Laravel, 0002 CQRS three-layer (superseded by 0008),
  0003 permission marker interface, 0004 stub Socialite,
  0005 Filament for admin, 0006 frontend stack & cookie auth,
  0007 bus middleware order, 0008 pure CQRS).
- **Specs + plans:** [`docs/superpowers/`](./docs/superpowers/) —
  brainstorming output and execution plans.

## Conventions worth knowing on day one

- Backend commands run inside Docker:
  `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend <cmd>`.
  Nx targets wrap this for the common cases.
- Frontend commands run host-side: `pnpm nx <target> web` (or `<lib>`).
- The `web` compose service is profile-gated
  (`--profile compose-web`); default `docker compose up -d` only
  starts the 8 backend services.
- Pre-existing untracked `apps/web/test-results/` is Playwright
  artifact output — gitignore it locally if it bothers you.

## Pull requests

- Conventional commits: `feat(scope):`, `fix(scope):`,
  `docs(scope):`, `chore(scope):`, `refactor(scope):`,
  `test(scope):`. Squash-merge to `main`.
- Every PR must pass: `pnpm lint`, `pnpm test`, the four backend
  gates (Pint, Pest, PHPStan, Deptrac), `pnpm lint:docs`, and the
  docs-build check (markdownlint + Redocly + route-coverage).
