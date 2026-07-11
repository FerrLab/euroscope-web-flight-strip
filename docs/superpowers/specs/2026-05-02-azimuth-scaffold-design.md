# Azimuth — Scaffold Design

**Date:** 2026-05-02
**Status:** Approved (pending written-spec review)
**Author:** Brainstormed with Kewyn Ferreira

---

## 1. Purpose

Azimuth is a full PDCA application for general aviation. It will hold navigation data, flight planning, route parsing, and everything else needed to run a GA operation with one or more aircraft.

This document specifies the **initial scaffold** — the minimum set of code, configuration, and documentation that turns the empty repository into a working monorepo where the first real domain feature can be built without further infrastructure questions.

The scaffold deliberately ships a trivial `Ping` module as its end-to-end proof. The first real domain feature (a minimal Aircraft CRUD) will be specced and planned separately, after the scaffold lands.

---

## 2. Locked decisions (from brainstorming)

| #   | Decision                   | Choice                                                                                                                  |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | How Laravel sits inside Nx | **Nx wraps Laravel via custom executor** (`apps/web` Next.js + `apps/backend` Laravel + `libs/*`, run-commands targets) |
| 2   | Local dev runtime          | **Everything in `docker-compose`**, including Laravel on FrankenPHP/Octane with `OCTANE_WATCH=true` for hot reload      |
| 3   | Day-1 scaffold scope       | **Working skeleton** — every package configured and proven by a `Ping` module; no real domain features                  |
| 4   | Auth on day 1              | **Passport + Socialite** both wired, with a **stub Socialite driver** as the example provider                           |
| 5   | CQRS shape                 | **Three-layer: Command/Query → Handler → UseCase**, strict separation, applied to both write and read sides             |
| 6   | Spec/plan format           | **Single comprehensive design doc, four phased implementation plans**                                                   |
| –   | Backend code style         | **Laravel Pint runs after every backend task** before the task is considered done                                       |

---

## 3. Workspace layout

```text
azimuth/
├── apps/
│   ├── backend/                  # Laravel 13 (Nx project via run-commands)
│   │   ├── app/
│   │   │   ├── Cqrs/             # Command, Query, Handler, UseCase contracts + Bus
│   │   │   ├── Modules/<Bounded>/ # per-domain folders (Ping on day 1)
│   │   │   └── ...
│   │   ├── project.json          # nx targets: serve, test, lint, migrate, etc.
│   │   ├── composer.json
│   │   └── ...
│   └── web/                      # Next.js 15 (App Router) + Redux Toolkit
│       ├── project.json
│       └── src/
├── libs/
│   ├── design-tokens/            # Openbridge tokens (TS) — light/dark/HC palettes
│   ├── ui/                       # shared React components (squared, themed)
│   ├── api-client/               # generated TS client from Scramble OpenAPI
│   └── i18n/                     # shared message catalogs / locale registry
├── docs/                         # internal markdown (architecture, ADRs, runbooks, ERDs)
│   ├── architecture/
│   ├── adr/
│   ├── runbooks/
│   └── conventions/
├── docs/superpowers/specs/       # design specs (this file lives here)
├── docs/superpowers/plans/       # implementation plans (one per phase, then per feature)
├── infra/
│   ├── docker/
│   │   ├── frankenphp.Dockerfile
│   │   └── ...
│   ├── docker-compose.yml
│   └── docker-compose.ci.yml
├── .github/workflows/            # CI
├── nx.json
├── package.json                  # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── CLAUDE.md                     # repo-wide collaboration rules (TDD, SOLID, Pint, etc.)
└── README.md
```

### 3.1 Why this shape

- `apps/backend` is a real Laravel install, not a contortion. Nx sees it via `project.json` whose targets shell into the `backend` Docker container (`docker compose exec backend php artisan ...`).
- `libs/api-client` is generated from Scramble's OpenAPI; the frontend never hand-writes endpoint types.
- `libs/design-tokens` holds Openbridge-derived palettes as plain TS exports, consumed by both `libs/ui` and Tailwind config in `apps/web`. Reusable by a future React Native app.
- `docs/` (internal) is separate from `docs/superpowers/specs/` and `docs/superpowers/plans/` (process artifacts).
- `infra/` holds Dockerfiles + compose files so they are not buried inside an app.

---

## 4. Docker stack & service topology

Single `infra/docker-compose.yml` brings the whole environment up with `docker compose up`. CI uses `infra/docker-compose.ci.yml`, which strips bind-mounts and uses ephemeral volumes.

### 4.1 Services

| Service     | Image                                                                                     | Purpose                                            | Host Ports                                    | Notes                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `backend`   | built from `infra/docker/frankenphp.Dockerfile` (FROM `dunglas/frankenphp:latest-php8.3`) | Laravel 13 + Octane on FrankenPHP                  | `8000` (HTTP), `8443` (HTTPS), `2019` (admin) | Bind-mounts `apps/backend`; `OCTANE_WATCH=true`; entrypoint runs migrations then `octane:frankenphp` |
| `horizon`   | same image as `backend`                                                                   | Queue worker / Horizon supervisor                  | –                                             | Runs `php artisan horizon`; shares volume + env with `backend`                                       |
| `scheduler` | same image as `backend`                                                                   | Laravel scheduler loop                             | –                                             | Runs `php artisan schedule:work`                                                                     |
| `web`       | `node:22-alpine`                                                                          | Next.js dev server                                 | `3000`                                        | Bind-mounts `apps/web` + workspace root for hoisted deps; runs `pnpm nx dev web`                     |
| `postgres`  | `postgis/postgis:16-3.4`                                                                  | Primary DB with PostGIS                            | `5432`                                        | Volume `pgdata`; init enables `postgis`, `postgis_topology`, `pgcrypto`, `uuid-ossp`                 |
| `dragonfly` | `docker.dragonflydb.io/dragonflydb/dragonfly:latest`                                      | Redis-compatible cache, queues, broadcasting state | `6379`                                        | `--cluster_mode=emulated`; Laravel sees `REDIS_HOST=dragonfly`                                       |
| `typesense` | `typesense/typesense:0.27.0`                                                              | Scout search backend                               | `8108`                                        | Volume `typesense-data`; bootstrap API key from `.env`                                               |
| `soketi`    | `quay.io/soketi/soketi:latest-16-alpine`                                                  | Pusher-compatible WS server for Echo               | `6001` (ws), `9601` (metrics)                 | App keys in `.env`; backend broadcasts via the Pusher driver                                         |
| `minio`     | `minio/minio:latest`                                                                      | S3-compatible local storage                        | `9000` (S3), `9001` (console)                 | Volume `minio-data`; bucket auto-created via a `mc` init container                                   |
| `mailpit`   | `axllent/mailpit:latest`                                                                  | Local SMTP catcher                                 | `1025` (smtp), `8025` (UI)                    | Captures all outbound mail in dev                                                                    |

### 4.2 Networking, volumes, healthchecks

- **Network:** one user-defined bridge `azimuth`; services reach each other by name.
- **Volumes:** named (`pgdata`, `typesense-data`, `minio-data`) for stateful services; bind-mounts for source.
- **Healthchecks:** every stateful service exposes one (`pg_isready`, `redis-cli ping`, `/health`, `/minio/health/live`). `backend` declares `depends_on` with `condition: service_healthy`.
- **Env:** `.env.example` committed with safe defaults pointing at service names; real `.env` git-ignored.

---

## 5. Backend architecture

### 5.1 CQRS three-layer contracts

Pure PHP interfaces in `app/Cqrs`, no framework coupling.

```php
namespace App\Cqrs;

interface Command {}                                   // marker; concretes are spatie/laravel-data objects
interface Query {}                                     // marker; concretes are also Data objects
interface CommandHandler { public function handle(Command $c): mixed; }
interface QueryHandler   { public function handle(Query   $q): mixed; }
interface CommandUseCase { public function execute(Command $c): mixed; }
interface QueryUseCase   { public function execute(Query   $q): mixed; }
interface CommandBus { public function dispatch(Command $c): mixed; }
interface QueryBus   { public function ask(Query     $q): mixed; }
```

### 5.2 Three-layer flow

```text
HTTP Controller / Filament action / Console command / Job
    │  builds Command/Query (spatie-data) from input
    ▼
CommandBus / QueryBus
    │  resolves handler from container, applies middleware
    ▼
Handler  (one per Command/Query) — framework-aware
    │  opens DB transaction, dispatches domain events, hydrates ACL/auth context
    │  delegates the actual work:
    ▼
UseCase  (pure business operation) — framework-free
    │  no Eloquent, no Request, no Auth facade — only repository/service interfaces
    │  returns a Result Data object (or throws a domain exception)
    ▼
Result  (spatie-data) → handler returns to bus → bus returns to caller
```

### 5.3 Bus middleware pipeline

Laravel `Pipeline`, applied outer-to-inner per dispatch:

1. `LoggingMiddleware` — structured log of command/query name + correlation id
2. `MetricsMiddleware` — timing histogram per command/query class
3. `AuthorizeMiddleware` — checks `$command->authorize($actor)` if implemented
4. `ValidateMiddleware` — re-validates the Data object (defense-in-depth; Precognition validates at HTTP boundary)
5. `TransactionMiddleware` — wraps command handlers in a DB transaction (queries skip)
6. `Handler::handle($command)` — innermost

Middleware registered in a single `BusServiceProvider` so adding cross-cutting concerns later is one line.

### 5.4 Module layout

```text
Modules/<Bounded>/
├── Domain/                       # entities, value objects, domain services, events, repository interfaces (no framework imports)
├── Application/
│   ├── Commands/                 # *Command (Data), *Handler, *UseCase
│   └── Queries/                  # *Query (Data), *Handler, *UseCase
├── Infrastructure/               # Eloquent repositories, external API clients, Filament resources, framework adapters
└── Presentation/
    ├── Http/                     # controllers, request validators (Precognition-aware), API routes
    └── Console/                  # artisan commands
```

Day 1 ships exactly one module: `Modules/Ping`. It is the canonical reference every future module mimics.

### 5.5 SOLID enforcement

- **S** — UseCases do one thing; Handlers do bus-adapter concerns; Repositories do persistence
- **O** — Bus middleware is the extension point
- **L** — Repository interfaces in `Domain/`; Eloquent implementations in `Infrastructure/`; tests substitute in-memory repos
- **I** — Per-module repository interfaces, not a God repo
- **D** — UseCases depend on `Domain\*Repository` interfaces, never on `Eloquent\Model` directly

Enforced mechanically via **Deptrac** layer rules in CI (Phase 2).

### 5.6 Package wiring (day-1 baseline)

| Package                          | Day-1 wiring                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Octane / FrankenPHP**          | Installed; `octane.php` published; FrankenPHP server selected; `OCTANE_WATCH=true` in compose; entrypoint runs `octane:frankenphp`                                                                                                                                                                                                                                                                                                                                  |
| **Horizon**                      | Installed; `horizon.php` published; dashboard reachable at `/horizon` (gated to admin role); `horizon` container in compose                                                                                                                                                                                                                                                                                                                                         |
| **Passport**                     | Installed; `passport:install` run on first boot via entrypoint script (idempotent); personal-access + password clients created; `Passport::tokensExpireIn` set; keys stored on a Docker volume so they survive container restarts                                                                                                                                                                                                                                   |
| **Pennant**                      | Installed; `pennant.php` published; default driver `database`; example feature `ping-v2` registered                                                                                                                                                                                                                                                                                                                                                                 |
| **Precognition**                 | Installed; example controller demonstrates `HandlePrecognitiveRequests` middleware                                                                                                                                                                                                                                                                                                                                                                                  |
| **Cashier (Stripe)**             | Installed; migrations published (not run unless `STRIPE_KEY` set); webhook route registered behind a flag                                                                                                                                                                                                                                                                                                                                                           |
| **Echo + Soketi**                | `laravel/echo` + `pusher/pusher-php-server` installed; broadcasting driver `pusher`; Soketi credentials wired via env; example private channel `ping.{userId}` defined                                                                                                                                                                                                                                                                                              |
| **Scout + Typesense**            | `laravel/scout` + `typesense/typesense-php` installed; scout driver `typesense`; example searchable model in the Ping module                                                                                                                                                                                                                                                                                                                                        |
| **Socialite**                    | Installed; **stub driver** registered as `stub`; login route `/auth/socialite/stub` works end-to-end and mints a Passport token                                                                                                                                                                                                                                                                                                                                     |
| **Filament (latest)**            | Panel registered at `/admin`, gated to `is_admin` users; dashboard widget shows queue health (Horizon) + DB health; one resource exists for the `Ping` model                                                                                                                                                                                                                                                                                                        |
| **Scramble**                     | Installed; route mounted at `/docs/api`; regenerates OpenAPI on every boot; `libs/api-client` consumes the generated `openapi.json`                                                                                                                                                                                                                                                                                                                                 |
| **Spatie browsershot**           | Installed; example route renders a `Ping` PDF                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Spatie translatable**          | Installed; the `Ping` model has one translatable field (`note`)                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Spatie data**                  | Installed; **all Commands, Queries, and Results inherit from `Spatie\LaravelData\Data`** — primary use of the package                                                                                                                                                                                                                                                                                                                                               |
| **Spatie laravel-permission v7** | Installed; **permission identifiers MUST be PHP enums (string-backed)**, never raw strings; seeder iterates each module's `*Permission` enum cases and `firstOrCreate`s them; `AuthorizeMiddleware` accepts only `BackedEnum` (not strings); Filament gates use the enum cases; custom PHPStan rule forbids raw-string permission usage outside the seeder. Day-1 wiring registers a baseline `RolePermission` enum + `Role::Admin`/`Role::Pilot` enum-backed roles |

### 5.7 Auth flow (Passport + Socialite stub)

```text
Browser                   Next.js (apps/web)        Backend (Laravel)             Stub Socialite Driver
   │  click "Continue with Stub"     │                                                       │
   │ ──────────────────────────────► │  GET /auth/socialite/stub/redirect                    │
   │                                 │ ────────────────────────────────►                     │
   │                                 │                                  302 → /callback?...  │
   │                                 │ ◄────────────────────────────────                     │
   │                                 │  GET /auth/socialite/stub/callback                    │
   │                                 │ ────────────────────────────────►                     │
   │                                 │                          (resolves stub identity)     │
   │                                 │                          upsert User by email         │
   │                                 │                          issue Passport access token  │
   │                                 │ ◄────── { access_token, user } ──                     │
   │  set httpOnly cookie + redirect │                                                       │
```

The stub driver returns a deterministic identity (`stub-user@azimuth.local`) so integration tests can assert the full chain without external dependencies. Adding Google/Apple/etc. later is a registration change, not an architecture change.

### 5.8 Backend testing baseline

- Pest as the test runner
- Happy / invalid / garbage tests per CQRS contract (Bus dispatch, middleware ordering)
- Happy / invalid / garbage tests per layer of the Ping module (UseCase unit, Handler integration, HTTP feature)
- One end-to-end auth test that exercises the full Socialite-stub → Passport-token flow
- One smoke test that hits `/docs/api` and asserts the OpenAPI document is generated and well-formed
- CI runs `nx affected --target=test` against the backend on every PR

---

## 6. Frontend architecture

### 6.1 Stack inside `apps/web`

- **Next.js 15** with the **App Router**, TypeScript strict mode
- **Redux Toolkit** + **RTK Query** for state and server-cache
- **next-intl** for i18n (App Router-native, SSR-safe)
- **Tailwind CSS** consuming `libs/design-tokens` (no ad-hoc color literals)
- **`libs/ui`** — every primitive (Button, Input, Table, Card, Modal, etc.) lives there and renders **squared**
- **`libs/api-client`** — typed client RTK Query depends on, generated from Scramble's OpenAPI

### 6.2 Directory layout

```text
apps/web/
├── src/
│   ├── app/                        # App Router
│   │   ├── [locale]/               # next-intl locale segment
│   │   │   ├── (auth)/             # public routes (login, callback)
│   │   │   ├── (app)/              # authenticated shell
│   │   │   │   ├── layout.tsx      # nav, theme switcher, locale switcher
│   │   │   │   └── page.tsx        # dashboard (Ping demo)
│   │   │   └── layout.tsx          # <html data-theme>, providers
│   │   ├── api/auth/[...]/route.ts # cookie-issuing route handlers (Passport token in httpOnly cookie)
│   │   └── globals.css             # tailwind base + token CSS vars
│   ├── store/
│   │   ├── index.ts                # configureStore, typed hooks
│   │   ├── slices/                 # feature slices (auth, ui, etc.)
│   │   └── api/                    # RTK Query API definitions
│   ├── features/
│   │   └── ping/                   # day-1 example, mirrors backend Ping module
│   ├── lib/
│   │   ├── theme.ts                # 'light' | 'dark' | 'high-contrast' switcher
│   │   ├── i18n.ts                 # next-intl config, locale registry
│   │   └── auth.ts                 # token storage (httpOnly cookie via route handler), session hook
│   └── messages/                   # message catalogs (mirrors libs/i18n at build time)
│       ├── en.json
│       └── pt.json
├── next.config.mjs
├── tailwind.config.ts              # imports from libs/design-tokens
├── project.json                    # nx targets: dev, build, test, lint, e2e
└── ...
```

### 6.3 Redux Toolkit shape

- One store, configured in `src/store/index.ts`, providers wired in the root `layout.tsx`
- Typed hooks (`useAppDispatch`, `useAppSelector`) — never `useDispatch`/`useSelector` directly
- Feature slices in `features/<name>/slice.ts`, registered into the root reducer via a small barrel
- RTK Query is the only way the frontend talks to the backend; `baseApi` typed off `libs/api-client`; auth header injected from the cookie-backed session
- Local UI state in slices; server data in RTK Query cache — no overlap
- Day 1 ships an `auth` slice and a `pingApi` with `list` + `create` endpoints

### 6.4 Design tokens & theming (`libs/design-tokens`)

Tokens are plain TS exports.

```ts
// libs/design-tokens/src/palettes.ts
export const palettes = {
  light: { bg: '#fafafa', fg: '#0a0a0a', accent: '#0066cc' /* ... */ },
  dark: { bg: '#0a0a0a', fg: '#fafafa', accent: '#3399ff' /* ... */ },
  'high-contrast': { bg: '#000000', fg: '#ffffff', accent: '#ffff00' /* ... */ },
} as const;
```

Each palette is derived from the **Openbridge color system**; the high-contrast palette follows Openbridge's accessibility guidance (solid blacks/whites/yellows, no mid-greys). A build-time script writes each palette to `:root[data-theme="<name>"] { --bg: ...; --fg: ...; }` CSS variables in `globals.css`. Components reference `var(--bg)`, never literals. Switching themes is a single attribute swap on `<html>`.

**Squared rule enforced at the token level**: Tailwind `borderRadius: { none: '0', sm: '0', md: '0', lg: '0', full: '9999px' }`. The only corners that exist are `rounded-full` for avatars/pills (the one Openbridge exception).

**Theme switcher** persists choice to `localStorage`, defaults to `prefers-color-scheme`, sets `data-theme` pre-paint via an injected `<head>` script to avoid flash.

### 6.5 i18n bootstrap

- next-intl for routing (`/[locale]/...`) and message resolution
- Locale registry in `libs/i18n/src/locales.ts`: `['en', 'pt']` on day 1, English default
- Backend localization via Laravel's `lang/` mechanism + `spatie/laravel-translatable` for translatable model fields
- Shared strings (validation, error names, common UI labels) in `libs/i18n` JSON catalogs, copied to both `apps/web/src/messages/` and `apps/backend/lang/` at build time
- ESLint rule `react/jsx-no-literals` configured for user-facing JSX, enforcing the "no hardcoded strings" rule
- Locale switcher in app shell, persists choice, updates URL segment

### 6.6 Auth handoff with the backend

- Login flow returns a Passport access token from the backend (per §5.7)
- Token stored in an **httpOnly, SameSite=Lax cookie** issued by a Next.js route handler — React side never touches the raw token
- `useSession()` reads `/api/auth/session` (a Next.js route handler that proxies `GET /me` with the cookie) — populates the `auth` slice, drives RTK Query header injection
- Logout posts to `/api/auth/logout`, which clears the cookie and revokes the Passport token

### 6.7 Frontend testing baseline

- **Vitest** for unit tests (slices, reducers, utils)
- **React Testing Library** for component tests (every `libs/ui` primitive gets happy/invalid/garbage)
- **Playwright** for E2E — one test runs the full Socialite-stub → cookie set → dashboard renders Ping list → theme switch → locale switch flow
- CI runs `nx affected --target=test,e2e` on every PR

---

## 7. Tooling, linters, type-checkers

| Tool                                                                         | Scope                                             | Run by                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| pnpm                                                                         | Workspace root                                    | Locked via `packageManager` + Corepack                      |
| Node 22 LTS                                                                  | All TS code                                       | Pinned in CI + container images                             |
| PHP 8.3 / Composer 2.7+                                                      | Backend                                           | Pinned in CI + container images                             |
| Nx 19+ with `@nx/next`, `@nx/js`, `@nx/eslint`, `@nx/playwright`, `@nx/vite` | All projects                                      | Workspace                                                   |
| Lefthook                                                                     | Git hooks: lint + format on staged files          | Pre-commit                                                  |
| ESLint (flat config)                                                         | TS/TSX in `apps/web`, `libs/*`                    | `nx lint`, pre-commit                                       |
| Prettier                                                                     | All TS/TSX/JSON/MD                                | Pre-commit, `nx format:write`                               |
| TypeScript strict                                                            | All TS code                                       | `nx typecheck`                                              |
| Pint                                                                         | Laravel PHP style (PSR-12 + Laravel preset)       | `nx lint backend`, pre-commit, **after every backend task** |
| PHPStan / Larastan level 8                                                   | `apps/backend`                                    | `nx analyze backend`, CI                                    |
| Rector (dry-run in CI, manual locally)                                       | `apps/backend`                                    | `nx rector backend`                                         |
| Deptrac                                                                      | `apps/backend` — enforces module/layer boundaries | `nx deptrac backend`, CI                                    |

---

## 8. Nx target matrix (unified command surface)

| Target                | `web`             | `backend`                                                      | `libs/*`                                                                           |
| --------------------- | ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `serve`               | `next dev`        | `docker compose exec backend php artisan octane:start --watch` | –                                                                                  |
| `build`               | `next build`      | `composer install --no-dev && php artisan optimize`            | `tsc -b`                                                                           |
| `test`                | `vitest run`      | `php artisan test --parallel`                                  | `vitest run`                                                                       |
| `test:watch`          | `vitest`          | `php artisan test --parallel --watch`                          | `vitest`                                                                           |
| `lint`                | `eslint`          | `pint --test`                                                  | `eslint`                                                                           |
| `lint:fix`            | `eslint --fix`    | `pint`                                                         | `eslint --fix`                                                                     |
| `typecheck`           | `tsc --noEmit`    | `phpstan analyse`                                              | `tsc --noEmit`                                                                     |
| `e2e`                 | `playwright test` | –                                                              | –                                                                                  |
| `migrate`             | –                 | `php artisan migrate`                                          | –                                                                                  |
| `seed`                | –                 | `php artisan db:seed`                                          | –                                                                                  |
| `tinker`              | –                 | `php artisan tinker`                                           | –                                                                                  |
| `openapi:generate`    | –                 | `php artisan scramble:export`                                  | –                                                                                  |
| `api-client:generate` | –                 | –                                                              | (in `libs/api-client`) consumes `apps/backend` openapi.json, regenerates TS client |

`libs/api-client` declares `apps/backend:openapi:generate` as a dependency in `project.json`, so `nx build api-client` always rebuilds against the freshest OpenAPI.

---

## 9. CI pipeline (`.github/workflows/ci.yml`)

Single workflow, jobs in parallel where possible:

```yaml
on: pull_request, push to main

jobs:
  lint-and-typecheck:
    - checkout (fetch-depth: 0 for nx affected)
    - setup pnpm + node 22 + php 8.3 + composer cache
    - pnpm install --frozen-lockfile
    - composer install (in apps/backend) --prefer-dist --no-progress
    - nx affected --targets=lint,typecheck --parallel=4

  test-frontend:
    - same setup
    - nx affected --target=test --projects=tag:scope:frontend --parallel=4

  test-backend:
    - same setup
    - docker compose -f infra/docker-compose.ci.yml up -d postgres dragonfly typesense minio soketi
    - wait for healthchecks
    - nx affected --target=test --projects=apps/backend
    - nx affected --target=analyze --projects=apps/backend # phpstan
    - nx affected --target=deptrac --projects=apps/backend # layer enforcement

  e2e:
    - same setup + full docker-compose.ci.yml up
    - nx affected --target=e2e
    - upload Playwright report on failure

  docs-build:
    - markdownlint on docs/
    - assert /docs/api OpenAPI is generated and validates against OpenAPI 3.1 schema
    - assert every public route in apps/backend appears in the generated OpenAPI
```

CI uses `nx affected` on the merge-base.

---

## 10. `/docs` seed (day 1)

```text
docs/
├── README.md                          # index, navigation
├── architecture/
│   ├── overview.md                    # 30-line summary + system diagram (Mermaid)
│   ├── monorepo-layout.md             # what each app/lib does, who depends on whom
│   ├── cqrs.md                        # the three-layer flow, with sequence diagram
│   ├── auth.md                        # Passport + Socialite stub flow, with sequence diagram
│   ├── data-stores.md                 # Postgres/PostGIS + Dragonfly + Typesense + S3/MinIO purpose & schema conventions
│   └── frontend.md                    # RTK Query, theming, i18n
├── adr/
│   ├── 0001-nx-with-laravel-via-run-commands.md
│   ├── 0002-three-layer-cqrs.md
│   ├── 0003-dragonfly-as-redis.md
│   ├── 0004-postgis-for-spatial.md
│   ├── 0005-passport-plus-socialite-stub.md
│   ├── 0006-openbridge-design-tokens.md
│   └── 0007-scramble-for-api-docs.md
├── runbooks/
│   ├── local-dev.md                   # docker compose up, troubleshooting, ports, mailpit, MinIO console
│   ├── adding-a-feature.md            # the canonical 12-step workflow (§12)
│   ├── adding-a-locale.md
│   ├── adding-a-socialite-provider.md
│   └── rotating-passport-keys.md
└── conventions/
    ├── tdd.md                         # happy/invalid/garbage rule, examples
    ├── solid.md                       # how each principle shows up here
    ├── naming.md                      # naming rules (§11)
    └── i18n.md                        # message catalog rules, "no hardcoded strings" enforcement
```

Diagrams in **Mermaid** (renders inline in GitHub). ERDs also Mermaid (`erDiagram` blocks). Every ADR follows: **Context / Decision / Consequences / Alternatives Considered**.

---

## 11. Naming conventions

- Commands: `<Verb><Noun>Command` (`RegisterAircraftCommand`)
- Queries: `<Verb><Noun>Query` (`ListAircraftQuery`)
- Handlers: same name + `Handler` (`RegisterAircraftHandler`)
- UseCases: same name + `UseCase` (`RegisterAircraftUseCase`)
- Result Data: `<Verb><Noun>Result` (`RegisterAircraftResult`)
- Repository interfaces (Domain): `AircraftRepository`
- Eloquent implementations (Infrastructure): `EloquentAircraftRepository`
- Frontend feature folders: kebab-case (`features/aircraft-list/`)
- RTK Query endpoints: `<noun>Api` (`aircraftApi`); endpoints `list`, `get`, `create`, `update`, `delete`

---

## 12. Canonical "how a feature gets built" workflow

Lives in `docs/runbooks/adding-a-feature.md`:

1. Brainstorm the feature with the user (`superpowers:brainstorming`)
2. Write the spec to `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md`
3. Write the plan (`superpowers:writing-plans`) to `docs/superpowers/plans/YYYY-MM-DD-<feature>-plan.md`
4. TDD the UseCase first — failing happy/invalid/garbage tests against the UseCase with in-memory repos, then implement
5. TDD the Handler — failing tests asserting transaction wrapping, event dispatch, error mapping, then implement
6. Wire bus registration in the module's service provider
7. Add the controller / Filament action / console command that builds the Command/Query and dispatches via the bus
8. Annotate the route for Scramble; run `nx openapi:generate backend && nx api-client:generate libs/api-client`
9. Build the frontend feature — RTK Query endpoint, slice, component, page, all token-driven and translated
10. Add the Playwright E2E for the happy path
11. Update `/docs` — at minimum the relevant `architecture/*.md`; new ADR if any architectural decision was made
12. Open PR — CI runs `nx affected` with all gates; review; merge; **run Pint as part of "done"**

---

## 13. Phased implementation plan

Four phases, mostly sequential. Each phase ships green CI before the next starts.

### 13.1 Phase 1 — Workspace + Docker bring-up

**Goal:** `git clone && docker compose up` lands a running, empty, but correctly-wired stack.

**Deliverables:**

- Nx workspace initialized at repo root
- Empty `apps/backend` (fresh Laravel 13, core only), `apps/web` (fresh Next.js 15 + App Router + TS strict), `libs/{design-tokens,ui,api-client,i18n}` with stub `index.ts`
- `apps/backend/project.json` and `apps/web/project.json` with `serve`/`build`/`test`/`lint`/`typecheck` targets
- `infra/docker/frankenphp.Dockerfile` and `infra/docker-compose.yml` with all 10 services + healthchecks + named volumes
- `.env.example` committed; `.env` gitignored
- Lefthook installed with format-on-staged hook
- ESLint + Prettier + TS strict + Pint configured (PHPStan/Deptrac come in Phase 2)
- `CLAUDE.md` at repo root summarizing collab rules
- `docs/README.md` + `docs/runbooks/local-dev.md` seeded
- CI workflow with `lint-and-typecheck` job
- ADR `0001-nx-with-laravel-via-run-commands.md`

**Gate:** `docker compose up -d && pnpm nx lint && pnpm nx typecheck` all green; `curl http://localhost:8000` returns Laravel welcome; `curl http://localhost:3000` returns Next.js welcome.

**Phase 1 implementation notes** (added 2026-05-05 after the cross-platform bring-up):

- Compose lives in `infra/docker-compose.yml`; commands invoked from the repo root must pass `--env-file .env` (Compose looks adjacent to the compose file otherwise).
- Typesense pinned to `29.1` (the `0.27.0` tag is no longer published; Typesense moved to integer-based versioning).
- MinIO host ports remapped to `9100`/`9101` (avoid conflict with other local MinIO instances on `9000`).
- Backend service uses `healthcheck: { disable: true }` to override the upstream FrankenPHP HEALTHCHECK that probes a TLS endpoint we don't terminate in dev. Functional smoke tests cover readiness.
- Soketi healthcheck targets `127.0.0.1:9601` (Soketi binds IPv4; `localhost` resolves to `::1` inside its alpine image, and port 6001 is WebSocket-only).
- Typesense has no in-container healthcheck — the `typesense:29.1` image ships without `wget`/`curl`/`nc` and its `sh` lacks `/dev/tcp` support. Host-side `curl http://localhost:8108/health` is the readiness signal.
- Composer's `config.platform.php` is pinned to `8.3` in `apps/backend/composer.json` so a newer host PHP doesn't generate a lock file with packages that fail inside the container.
- Cross-platform: `.gitattributes` forces LF on `*.sh`, `*Dockerfile`, `docker-compose*.yml`, `*.bash` so Windows checkouts don't break the Linux entrypoint via CRLF endings.
- The `web` service masks every `node_modules` path with anonymous volumes so the host's `node_modules` layout doesn't bleed into the container; pnpm runs with `CI=true` to stay non-interactive.
- Changing `APP_KEY` in `.env` requires `docker compose up -d --force-recreate backend` — `restart` does not re-read the `--env-file`.

### 13.2 Phase 2 — Backend core: CQRS + auth + Filament + Scramble + Ping module

**Goal:** Backend fully wired with every package configured; canonical CQRS pattern proven by a real (trivial) feature.

**Deliverables:**

- All Laravel packages from §5.6 installed and configured
- `app/Cqrs` namespace with all six contracts + `CommandBus`/`QueryBus` implementations + the five-step middleware pipeline
- `app/Modules/Ping` with full Domain/Application/Infrastructure/Presentation tree
- `PingCommand`/`PingQuery` (spatie-data), `PingHandler`/`PingQueryHandler`, `RecordPingUseCase`/`ListPingsUseCase`, `EloquentPingRepository`, `PingResource` (Filament), HTTP controller, OpenAPI annotations
- Stub Socialite driver registered; login route `/auth/socialite/stub` works end-to-end and mints a Passport token
- PHPStan/Larastan level 8 + Deptrac added; CI extended with `test-backend` job
- Pest suite: happy/invalid/garbage for `RecordPingUseCase`, `PingHandler`, `PingController`; bus dispatch tests; Socialite-stub→Passport integration test
- `docs/architecture/{cqrs,auth,data-stores}.md` written; ADRs 0002, 0003, 0004, 0005, 0007 written

**Gate:** `nx test backend && nx analyze backend && nx deptrac backend` all green; `POST /api/ping` (with a Passport token from stub login) records a ping; `GET /api/ping` returns it; `/admin` shows the Ping Filament resource; `/docs/api` renders OpenAPI with the Ping endpoints.

### 13.3 Phase 3 — Frontend skeleton: Next.js shell, Redux, design tokens, theming, i18n

**Goal:** Frontend renders a themed, localized authenticated shell that talks to the backend through a typed RTK Query client.

**Deliverables:**

- `libs/design-tokens` published with light/dark/HC palettes from Openbridge; build script writes CSS vars to `globals.css`
- `libs/ui` with squared primitives (Button, Input, Select, Card, Table, Modal, Toast, Spinner) — each with happy/invalid/garbage RTL tests
- `libs/api-client` generation script consuming `apps/backend`'s `openapi.json`
- `libs/i18n` with locale registry (`en`, `pt`) and shared catalog
- `apps/web` App Router with `[locale]` segment, root `layout.tsx` setting `data-theme` pre-paint, theme + locale switchers
- Redux store, typed hooks, `auth` slice, RTK Query `baseApi` with cookie-aware header injection
- Auth flow: `/login` → "Continue with Stub" → backend Socialite-stub → cookie set by Next.js route handler → `/dashboard`
- `features/ping` mirrors backend Ping module: list and create UI, RTK Query `pingApi`, happy/invalid/garbage component tests
- ESLint rule `react/jsx-no-literals` configured for user-facing JSX
- Playwright E2E: login → dashboard → create ping → see listed → switch theme → switch locale
- CI extended with `test-frontend` and `e2e` jobs
- `docs/architecture/frontend.md`; ADR 0006

**Gate:** `nx test web && nx e2e web` green; manual smoke confirms theme switcher (light/dark/HC), locale switcher (en/pt), and full Ping create/list cycle work end-to-end.

### 13.4 Phase 4 — Polish, /docs completion, conventions documentation, runbooks

**Goal:** Scaffold reviewable as a finished artifact; anyone can land cold and know how to add a feature.

**Deliverables:**

- All `/docs` pages from §10 completed
- `docs/runbooks/adding-a-feature.md` written as the canonical 12-step workflow (§12)
- `docs/conventions/{tdd,solid,naming,i18n}.md` written
- `docs/architecture/overview.md` with Mermaid system diagram + ERD of the day-1 schema
- `CLAUDE.md` finalized with cross-references to relevant docs
- `docs/runbooks/repo-tour.md` — 10-minute walkthrough for a new contributor (or new Claude session)
- CI extended with `docs-build` job (markdownlint + OpenAPI validation + route-coverage assertion)
- One green CI run on `main` after all phases land

**Gate:** Open the repo cold, follow `docs/runbooks/local-dev.md`, get a running stack and a passing test suite without asking a single question.

### 13.5 Phase ordering & parallelism

Phases 1 → 2 → 3 → 4 are mostly sequential. Phase 3 may begin in parallel with the tail of Phase 2 once the CQRS contracts and Ping endpoints exist (so `libs/api-client` has an OpenAPI doc to consume). The Phase 3 plan will note where it can dispatch concurrently with Phase 2.

---

## 14. Post-scaffold first feature (planned separately)

After the four phases land and show green CI, the **first real feature** is a minimal **Aircraft CRUD** intended purely for testing/validating the architecture end-to-end. It will be specced and planned in its own brainstorm → spec → plan → implementation cycle.

**Scope (locked):**

- Fields: `registration` (string, unique), `make` (string), `model` (string), `user_id` (FK → users)
- Authenticated users can register, list, update, delete their own aircraft
- Filament admin resource for `Aircraft` works for admin-side CRUD over all aircraft
- Full TDD per §11 / `docs/conventions/tdd.md`: happy/invalid/garbage at every layer (UseCase, Handler, HTTP, Filament)
- Follows the canonical 12-step workflow (§12)

**Why deliberately separate:** the scaffold's success should not be coupled to a domain choice. The Aircraft fields above are placeholders for testing — real GA aircraft modeling (regs by jurisdiction, certifications, maintenance state, currencies) will be its own design exercise later.

---

## 15. Open questions

None. All major decisions locked during brainstorming.

---

## 16. Appendix — Memory entries this spec relies on

- `project_azimuth_overview.md` — full Azimuth spec (stack, UI, docs, packages)
- `feedback_tdd.md` — TDD always with happy/invalid/garbage paths
- `feedback_run_pint.md` — Pint after every backend task
- `project_first_feature.md` — Aircraft CRUD as the first post-scaffold feature
- `project_permissions_with_enums.md` — spatie/laravel-permission v7 with PHP-enum permission identifiers (no raw strings)
