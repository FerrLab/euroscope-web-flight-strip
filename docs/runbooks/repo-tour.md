# Repo tour

> Welcome to Azimuth. Read this top-to-bottom — it's a 10-minute
> tour of the repo, designed to give you the mental map before you
> do anything else.

## What this repo is

Azimuth is a general-aviation PDCA companion: pilots and small ops
teams record observations, run checklists, review what happened, and
refine. It's an Nx 20 monorepo with two deployable apps (Laravel 13
backend, Next.js 15 frontend) and four shared libraries.

If you only read one other doc, read [`../architecture/overview.md`](../architecture/overview.md).
It has the system diagram and ERD.

## The 60-second skim

```text
azimuth/
├── apps/
│   ├── backend/        ← Laravel 13 + Octane/FrankenPHP
│   └── web/            ← Next.js 15 (App Router)
├── libs/
│   ├── api-client/     ← RTK Query slice generated from openapi.json
│   ├── design-tokens/  ← 4-theme palette + squared-UI tokens
│   ├── i18n/           ← LOCALES + helpers
│   └── ui/             ← squared-UI primitives over Radix
├── infra/              ← docker-compose + Dockerfiles + init scripts
├── docs/               ← /architecture, /adr, /conventions, /runbooks, /superpowers
├── scripts/            ← repo automation (route-coverage, etc.)
└── CLAUDE.md           ← collaboration rules; loaded by Claude Code on session start
```

## The 10-minute tour

### Minute 1: Read CLAUDE.md

Eight hard rules: TDD always, SOLID at every layer, no raw permission
strings (PHP-enum `Permission` cases only), Pint after every backend
task, no hardcoded user-facing strings (Laravel `lang/` + next-intl),
API docs MUST work (Scramble at `/docs/api`), `/docs` is evergreen,
squared UI (`rounded-full` only for avatars/pills).

If you internalize one rule first, make it #1: every UseCase, Handler,
and HTTP feature gets at minimum three Pest tests covering happy,
invalid, and garbage paths.

### Minute 2: Skim the architecture overview

[`../architecture/overview.md`](../architecture/overview.md) has the
system diagram + ERD. Look at the diagram. Identify the boxes you'll
work in. Then glance at [`../architecture/monorepo-layout.md`](../architecture/monorepo-layout.md)
to see how `apps/` and `libs/` relate under Nx.

### Minute 3: Bring up the stack

```bash
git clone <repo-url> azimuth
cd azimuth
cp .env.example .env

# Generate a Laravel app key into .env (the placeholder is not valid)
cd apps/backend && php artisan key:generate --show
# Copy the printed `base64:...` string into the root .env as APP_KEY=...
cd ../..

pnpm install
pnpm exec lefthook install

docker compose --env-file .env -f infra/docker-compose.yml up -d
```

Then check [`local-dev.md`](./local-dev.md) for the readiness probes
and the smoke-test curls. On Windows, mind the `.gitattributes` LF
rules and use `--force-recreate` after rotating `APP_KEY`.

### Minute 4: Run the test suites

```bash
# Backend (Pest, inside the container)
docker compose --env-file .env -f infra/docker-compose.yml \
  exec -T backend ./vendor/bin/pest

# Frontend (Vitest)
pnpm nx test web

# Whole repo lint + typecheck
pnpm lint
pnpm typecheck
```

Backend Pest is split into `tests/Unit`, `tests/Feature`, and
`tests/Static` (PHPStan); the static suite enforces the
no-raw-permission-strings rule.

### Minute 5: Visit the running services

| URL                              | What                                        |
| -------------------------------- | ------------------------------------------- |
| <http://localhost:3000>          | Next.js app                                 |
| <http://localhost:8000>          | Laravel backend                             |
| <http://localhost:8000/admin>    | Filament admin                              |
| <http://localhost:8000/docs/api> | Scramble API docs                           |
| <http://localhost:8025>          | Mailpit (mail UI)                           |
| <http://localhost:8108>          | Typesense (API)                             |
| <http://localhost:9001>          | MinIO console (`minioadmin` / `minioadmin`) |
| <http://localhost:9601/usage>    | Soketi metrics                              |

Full port table lives in [`local-dev.md`](./local-dev.md).

### Minute 6: Read the worked Ping example

```bash
ls apps/backend/app/Modules/Ping/
ls apps/backend/tests/Unit/Modules/Ping/
```

This is the canonical "what does a feature look like end-to-end"
example. Pure CQRS: Command (DTO) + Handler (logic + repository) +
no UseCase layer. Module is split into `Application/`, `Domain/`,
`Infrastructure/`, `Presentation/` — the hexagonal layout every
module follows. See [`../adr/0008-pure-cqrs.md`](../adr/0008-pure-cqrs.md)
for why the UseCase layer was collapsed (and [`../adr/0002-cqrs-three-layer.md`](../adr/0002-cqrs-three-layer.md)
for the original decision it supersedes).

### Minute 7: Read the bus pipeline

```bash
ls apps/backend/app/Cqrs/
ls apps/backend/app/Cqrs/Bus/Middleware/
```

Order: Logging → Metrics → Authorize → Validate → Transaction.
Transaction is skipped on queries. `Permission` marker interface
gates Authorize; raw strings are forbidden by PHPStan. See
[`../architecture/cqrs.md`](../architecture/cqrs.md) and
[`../adr/0007-bus-middleware-order.md`](../adr/0007-bus-middleware-order.md).

### Minute 8: Frontend mental model

```bash
ls apps/web/src/app/        # App Router; [locale] segment makes locale explicit
ls apps/web/src/features/   # feature slices (RTK + UI composition)
ls apps/web/src/shared/     # cross-feature primitives + middleware glue
```

The `[locale]` segment makes locale explicit in every URL. The proxy
at `/api/proxy/*` puts the httpOnly cookie's Bearer token on every
backend call (so the browser never sees it). RTK Query slices live in
`libs/api-client/`, generated from the backend's `openapi.json`. UI
primitives — squared, no `border-radius` except `rounded-full` —
live in `libs/ui/`. See [`../architecture/frontend.md`](../architecture/frontend.md).

### Minute 9: How to add a feature

Read [`adding-a-feature.md`](./adding-a-feature.md). It has the
12-step playbook with the Ping module as the worked example: spec →
plan → TDD UseCase-equivalent (the Handler) → Controller → Filament
→ frontend slice → docs → Pint → PR. Conventions referenced from
that playbook live in [`../conventions/tdd.md`](../conventions/tdd.md),
[`../conventions/solid.md`](../conventions/solid.md),
[`../conventions/naming.md`](../conventions/naming.md), and
[`../conventions/i18n.md`](../conventions/i18n.md).

### Minute 10: Where to look when something breaks

| Symptom                                          | Where                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack won't come up                              | [`local-dev.md`](./local-dev.md)                                                                                                                 |
| 401s after auth                                  | [`../architecture/auth.md`](../architecture/auth.md)                                                                                             |
| Soketi WebSocket dropping                        | [`local-dev.md`](./local-dev.md) Soketi section, plus `:9601/usage`                                                                              |
| Typesense returning 404 on a collection          | [`local-dev.md`](./local-dev.md) Typesense section                                                                                               |
| `pnpm nx ...` fails to find a project            | [`../architecture/monorepo-layout.md`](../architecture/monorepo-layout.md)                                                                       |
| Permission denied when calling an authorized API | [`../architecture/auth.md`](../architecture/auth.md), [`../adr/0003-permission-marker-interface.md`](../adr/0003-permission-marker-interface.md) |
| PHPStan complains about a permission string      | [`../adr/0003-permission-marker-interface.md`](../adr/0003-permission-marker-interface.md)                                                       |
| Scramble missing a route in `/docs/api`          | `pnpm check:route-coverage` and [`scripts/check-route-coverage.mjs`](../../scripts/check-route-coverage.mjs)                                     |

## Where to file what

| Want to                     | Path                                                    |
| --------------------------- | ------------------------------------------------------- |
| Add a feature               | [`adding-a-feature.md`](./adding-a-feature.md)          |
| Add a locale                | [`adding-a-locale.md`](./adding-a-locale.md)            |
| Make a significant decision | `docs/adr/NNNN-<title>.md` (next number)                |
| Update an architecture rule | `docs/architecture/<topic>.md`                          |
| Add a coding convention     | `docs/conventions/<topic>.md`                           |
| Brainstorm a feature        | `superpowers:brainstorming` → `docs/superpowers/specs/` |
| Plan a multi-step task      | `superpowers:writing-plans` → `docs/superpowers/plans/` |

## A few things that will save you an hour

- **Pint after every backend change.** `pnpm nx lint:fix backend && pnpm nx lint backend`
  before commit — lefthook will yell at you otherwise.
- **No raw permission strings.** Always reference
  `App\Modules\<Module>\<Module>Permission::Some_Case` (a
  `BackedEnum` implementing the `Permission` marker interface).
  PHPStan catches the rest.
- **No hardcoded user-facing strings.** Backend strings go through
  Laravel `lang/`; frontend strings through next-intl catalogs in
  `apps/web/src/i18n/`.
- **APP_KEY changes need `--force-recreate`.** The backend container
  bakes the key into Octane's worker; restarting isn't enough.
- **Anonymous `node_modules` volumes.** On Windows, host
  `node_modules/` won't satisfy the container — that's by design;
  don't bind-mount over it.

## See also

- [`../architecture/overview.md`](../architecture/overview.md)
- [`../architecture/monorepo-layout.md`](../architecture/monorepo-layout.md)
- [`../architecture/cqrs.md`](../architecture/cqrs.md)
- [`../architecture/auth.md`](../architecture/auth.md)
- [`../architecture/frontend.md`](../architecture/frontend.md)
- [`local-dev.md`](./local-dev.md)
- [`adding-a-feature.md`](./adding-a-feature.md)
- [`../adr/0007-bus-middleware-order.md`](../adr/0007-bus-middleware-order.md)
- [`../adr/0008-pure-cqrs.md`](../adr/0008-pure-cqrs.md)
- [CLAUDE.md](../../CLAUDE.md)
