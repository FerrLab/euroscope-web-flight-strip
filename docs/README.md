# Azimuth — Internal Documentation

Evergreen reference material for the Azimuth codebase.

## Sections

- **architecture/** — system design, sequence diagrams, ERDs
- **adr/** — Architecture Decision Records (Context / Decision / Consequences / Alternatives Considered)
- **runbooks/** — task-oriented guides (local dev, adding a feature, rotating keys, etc.)
- **conventions/** — TDD rules, SOLID expression, naming, i18n

For per-feature design specs and implementation plans, see `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Architecture

- [`architecture/cqrs.md`](architecture/cqrs.md) — pure CQRS contracts, the bus pipeline, and how to add a new command/query.
- [`architecture/auth.md`](architecture/auth.md) — Passport, the stub Socialite driver, the permission marker interface, and the Filament/Horizon gates.
- [`architecture/data-stores.md`](architecture/data-stores.md) — Postgres+PostGIS, Dragonfly, Typesense, MinIO, Soketi, Mailpit — images, ports, and what each one is used for.
- [`architecture/frontend.md`](architecture/frontend.md) — Next.js 15 App Router, the four `libs/*`, the four-theme system, cookie auth + the Next.js proxy, and how to add a new feature module.

## Architecture Decision Records

- [`adr/0001-nx-with-laravel-via-run-commands.md`](adr/0001-nx-with-laravel-via-run-commands.md) — Nx as the monorepo orchestrator with Laravel exposed via `nx:run-commands`.
- [`adr/0002-cqrs-three-layer.md`](adr/0002-cqrs-three-layer.md) — three-layer CQRS (Command/Query → Handler → UseCase). _(Superseded by 0008.)_
- [`adr/0003-permission-marker-interface.md`](adr/0003-permission-marker-interface.md) — `Permission` marker interface; no raw permission strings.
- [`adr/0004-stub-socialite-per-request-fixture.md`](adr/0004-stub-socialite-per-request-fixture.md) — stub Socialite driver with `?identity=<email>` for multi-role tests.
- [`adr/0005-filament-for-admin.md`](adr/0005-filament-for-admin.md) — Filament v4.x at `/admin`, gated by `Role::Admin`.
- [`adr/0006-frontend-stack-and-cookie-auth.md`](adr/0006-frontend-stack-and-cookie-auth.md) — Next.js 15 + Redux Toolkit + RTK Query, Openbridge four-theme tokens, in-house `libs/ui` over Radix, and httpOnly-cookie auth via the Next.js proxy.
- [`adr/0007-bus-middleware-order.md`](adr/0007-bus-middleware-order.md) — bus middleware order: Authorize before Validate.
- [`adr/0008-pure-cqrs.md`](adr/0008-pure-cqrs.md) — pure CQRS (Command/Query → Handler); supersedes 0002.

## Runbooks

- [`runbooks/local-dev.md`](runbooks/local-dev.md) — first-run setup, smoke tests, common commands.
- [`runbooks/phase-2-handoff.md`](runbooks/phase-2-handoff.md) — Phase 2 implementation handoff.

## Phase status

- **Phase 1** — workspace + Docker bring-up. Complete.
- **Phase 2** — backend core (Pest, Octane, Passport, Horizon, Scout/Typesense, Filament, Scramble, Spatie permission marker interface, CQRS bus + Ping module, PHPStan + Deptrac + the raw-permission-string rule, ADRs and architecture docs, CI `test-backend` job). In progress on `feat/phase-2-backend-core`.
- **Phase 3** — frontend (Next.js 15, Redux Toolkit, design tokens, i18n). Not yet started.
- **Phase 4** — convention docs (TDD, SOLID, runbooks for adding-a-feature and rotating-keys). Not yet started.
