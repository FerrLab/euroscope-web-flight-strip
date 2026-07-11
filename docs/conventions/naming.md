# Naming

A reference for the names used across the Azimuth codebase. The
discipline is consistency over cleverness — predictable names mean
files are findable by intuition.

This doc supersedes §11 of the original scaffold spec. The
`UseCase` row from that spec is intentionally gone — see
[ADR 0008](../adr/0008-pure-cqrs.md). In Azimuth's pure CQRS, the
**Handler is the business-logic locus**; there is no separate
UseCase class.

## Backend (PHP / Laravel)

Examples below are drawn from the canonical `Ping` module
(`apps/backend/app/Modules/Ping/`), which exists specifically to
exercise every layer at minimal cost.

| Concept                           | Convention                                   | Example                                        |
| --------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| Aggregate / Entity                | `<Noun>` (singular, PascalCase)              | `Ping`                                         |
| Value object                      | `<Noun>` (singular, PascalCase)              | `PingNote`                                     |
| Repository contract (Domain)      | `<Noun>Repository`                           | `PingRepository`                               |
| Eloquent adapter (Infrastructure) | `Eloquent<Noun>Repository`                   | `EloquentPingRepository`                       |
| Eloquent model (Infrastructure)   | `<Noun>Model`                                | `PingModel`                                    |
| Command (write DTO)               | `<Verb><Noun>Command`                        | `RecordPingCommand`                            |
| Query (read DTO)                  | `<Verb><Noun>Query`                          | `ListPingsQuery`                               |
| Command handler                   | `<Verb><Noun>Handler`                        | `RecordPingHandler`                            |
| Query handler                     | `<Verb><Noun>Handler`                        | `ListPingsHandler`                             |
| Result DTO (when needed)          | `<Verb><Noun>Result`                         | `RecordPingResult`                             |
| Permission enum                   | `<Module>Permission`                         | `PingPermission`                               |
| Permission case                   | `SCREAMING_SNAKE`                            | `RECORD_PING`                                  |
| Domain event                      | `<Noun><PastTenseVerb>`                      | `PingRecorded`                                 |
| HTTP controller                   | `<Noun>Controller`                           | `PingController`                               |
| FormRequest                       | `<Verb><Noun>Request`                        | `RecordPingRequest`                            |
| Resource (Spatie Data preferred)  | `<Noun>Resource`                             | `PingResource`                                 |
| Filament resource                 | `<Noun>Resource`                             | `PingResource`                                 |
| Filament page                     | `<Verb><Noun>` (matches ListRecords pattern) | `ListPings`                                    |
| Migration                         | `YYYY_MM_DD_HHMMSS_<verb>_<table>`           | `2026_03_01_120000_create_pings_table`         |
| Module service provider           | `<Module>ServiceProvider`                    | `PingServiceProvider`                          |
| Test file                         | `<Subject>Test`                              | `RecordPingHandlerTest`                        |
| Pest test name                    | `it('<verb-phrase>', ...)`                   | `it('records a ping for the given user', ...)` |

> **No UseCase class.** Per [ADR 0008](../adr/0008-pure-cqrs.md),
> the Handler holds the business logic directly. Do not create
> `*UseCase.php` files; if you find one in a refactor, fold it
> into its Handler.

### Module layout

Each module lives at `apps/backend/app/Modules/<Module>/` with
exactly four submodules:

```text
Modules/Ping/
├── Domain/          # Entities, value objects, repository contracts, permission enum
├── Application/     # Commands/, Queries/, Handlers (alongside their Command/Query)
├── Infrastructure/  # Eloquent adapters, models, ServiceProvider
└── Presentation/    # Http/ (Controller, Request), Filament/ (Resource, pages)
```

Handlers live next to the Command/Query they serve — i.e.
`Application/Commands/RecordPingCommand.php` and
`Application/Commands/RecordPingHandler.php` sit in the same
directory. This is intentional: command + handler are read
together more often than not.

## Frontend (TypeScript / React / Next.js)

| Concept                      | Convention                                       | Example                                                                |
| ---------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| Component                    | `PascalCase.tsx`                                 | `Button.tsx`, `Modal.tsx`                                              |
| Hook                         | `useCamelCase.ts`                                | `usePings.ts`                                                          |
| RTK Query API slice          | `<noun>Api.ts`                                   | `pingsApi.ts` (endpoints: `list`, `get`, `create`, `update`, `delete`) |
| Redux slice                  | `<noun>Slice.ts`                                 | `authSlice.ts`                                                         |
| Feature folder               | `kebab-case/` under `apps/web/src/features/`     | `features/ping/`                                                       |
| Route segment                | `kebab-case/` under `apps/web/src/app/[locale]/` | `app/[locale]/dashboard/page.tsx`                                      |
| Server action                | `<verb><Noun>.ts` exporting `async function`     | `recordPing.ts`                                                        |
| Zod schema                   | `<Noun>Schema`                                   | `RecordPingSchema`                                                     |
| Test file                    | `<Subject>.test.ts(x)`                           | `Button.test.tsx`                                                      |
| Storybook story (when added) | `<Subject>.stories.tsx`                          | `Button.stories.tsx`                                                   |
| E2E spec                     | `<feature>.spec.ts`                              | `record-ping.spec.ts`                                                  |
| Translation key              | `<scope>.<key>` in next-intl catalogs            | `auth.loginTitle`                                                      |

### Shared libs

| Lib                | Purpose                              | Example exports                                                           |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------- |
| `libs/ui/`         | Shared design-system components      | `Button`, `Card`, `Input`, `Modal`, `Select`, `Spinner`, `Table`, `Toast` |
| `libs/api-client/` | Generated RTK Query base + endpoints | `baseApi`, `generated.ts`                                                 |

`libs/api-client/src/generated.ts` is regenerated from Scramble's
`openapi.json` — do not hand-edit it.

## Files & paths

| What                      | Convention                                                |
| ------------------------- | --------------------------------------------------------- |
| Backend module dir        | `apps/backend/app/Modules/<Module>/`                      |
| Backend module submodules | `Domain`, `Application`, `Infrastructure`, `Presentation` |
| Frontend feature dir      | `apps/web/src/features/<feature>/` (kebab-case)           |
| Shared lib                | `libs/<name>/`                                            |
| ADR                       | `docs/adr/NNNN-<kebab-title>.md`                          |
| Runbook                   | `docs/runbooks/<kebab-title>.md`                          |
| Convention doc            | `docs/conventions/<kebab-title>.md`                       |
| Architecture doc          | `docs/architecture/<kebab-title>.md`                      |
| Spec                      | `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`     |
| Plan                      | `docs/superpowers/plans/YYYY-MM-DD-<topic>-phase-N.md`    |

## Database

Snake*case for everything: `pings`, `users`, `aircraft_movements`.
Tables are **plural for entities** (`pings`, `users`) and
**singular for pivots** (`role_user`, `permission_role`). FK
columns: `<entity>_id` (e.g. `user_id`, `aircraft_id`). Standard
timestamps are `created_at` and `updated_at`; soft-delete adds
`deleted_at`. PostGIS columns spell out type and SRID:
`location geometry(Point,4326)`. Index names follow Laravel's
default (`<table>*<column>\_index`); only override when an index
spans multiple columns or partials warrant a hand-picked name.

## Branches & commits

Branches: `feat/<description>`, `fix/<description>`,
`docs/<description>`, `chore/<description>` — kebab-case after the
prefix (e.g. `feat/phase-4-polish-and-docs`). Commit messages
follow [Conventional Commits](https://www.conventionalcommits.org/);
the prefix is required for backend changes that affect public API
or migrations, and encouraged everywhere else. PR titles MUST
follow conventional commits so squash-merge yields a clean log
suitable for changelogs. Scope is the module or area
(`feat(ping):`, `docs(conventions):`, `chore(ci):`).

## See also

- [`tdd.md`](./tdd.md)
- [`solid.md`](./solid.md)
- [`i18n.md`](./i18n.md)
- [`../architecture/cqrs.md`](../architecture/cqrs.md)
- [`../architecture/monorepo-layout.md`](../architecture/monorepo-layout.md)
- [ADR 0002 — CQRS three-layer (superseded)](../adr/0002-cqrs-three-layer.md)
- [ADR 0008 — Pure CQRS](../adr/0008-pure-cqrs.md)
