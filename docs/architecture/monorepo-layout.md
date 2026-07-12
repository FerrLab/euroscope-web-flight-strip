# EuroStrip — Monorepo layout

EuroStrip is an [Nx 20](https://nx.dev) monorepo with [pnpm](https://pnpm.io)
workspaces. There are two deployable apps and a small set of shared
libraries; everything else (infra, docs, scripts) lives at the repo root.

This doc is the map. For _why_ the topology looks this way, see
[`overview.md`](./overview.md).

## Directory map

```text
eurostrip/
├── apps/
│   ├── backend/        # Laravel 13 + Octane/FrankenPHP, Filament, Scramble
│   └── web/            # Next.js 15 (App Router) + Redux Toolkit
├── libs/
│   ├── api-client/     # RTK Query slice generated from openapi.json
│   ├── design-tokens/  # 4-theme palette + Tailwind tokens (squared UI)
│   └── i18n/           # next-intl LOCALES + message-catalog helpers
├── infra/              # docker-compose stacks + Dockerfiles + init scripts
│   ├── docker/         # frankenphp.Dockerfile, postgres-init.sql, etc.
│   ├── docker-compose.yml      # local dev stack
│   └── docker-compose.ci.yml   # CI stack (image-pinned, host-network probes)
├── docs/               # /architecture/, /adr/, /runbooks/, /superpowers/
├── scripts/            # repo automation (route-coverage check, etc.)
├── .github/workflows/  # CI pipeline
├── nx.json
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

`pnpm-workspace.yaml` declares only `apps/*` and `libs/*`. Anything outside
those globs is repo plumbing, not a workspace package.

## Apps

### `apps/backend` — Laravel 13 + Octane

Tags: `scope:backend`, `type:app`. Source root: `apps/backend/`.

The backend is a Laravel 13 monolith running on Octane + FrankenPHP. CQRS
three-layer (Command/Query → Handler → UseCase) with a bus pipeline
(Logging → Metrics → Authorize → Validate → Transaction). Filament admin
at `/admin`, Scramble OpenAPI at `/docs/api`. See
[`cqrs.md`](./cqrs.md) for the application-layer shape.

All backend Nx targets shell into the dev container (`docker compose
exec backend …`) — there is no host PHP requirement. Available targets:

| Target      | What it runs                                              |
| ----------- | --------------------------------------------------------- |
| `serve`     | `docker compose up backend` (foregrounded)                |
| `artisan`   | `docker compose exec backend php artisan`                 |
| `migrate`   | `php artisan migrate` inside the container                |
| `tinker`    | `php artisan tinker` inside the container                 |
| `test`      | `./vendor/bin/pest --parallel`                            |
| `lint`      | `./vendor/bin/pint --test` (read-only check)              |
| `lint:fix`  | `./vendor/bin/pint` (write fixes)                         |
| `analyze`   | `./vendor/bin/phpstan analyze --memory-limit=2G`          |
| `deptrac`   | `./vendor/bin/deptrac analyse --report-uncovered`         |
| `typecheck` | No-op stub (PHPStan covers static analysis via `analyze`) |

Run any of them with `pnpm nx run backend:<target>`.

### `apps/web` — Next.js 15

Tags: `scope:web`, `type:app`. Source root: `apps/web/src/`.

Next.js 15 App Router, Redux Toolkit + RTK Query, next-intl for i18n,
Tailwind v4. The cookie-bearing `/api/proxy/*` route forwards
authenticated requests to the backend (see [`auth.md`](./auth.md)).

Available targets:

| Target       | What it runs                                        |
| ------------ | --------------------------------------------------- |
| `dev`        | `next dev -p 3000`                                  |
| `build`      | `next build`                                        |
| `start`      | `next start -p 3000`                                |
| `test`       | `vitest run`                                        |
| `test:watch` | `vitest`                                            |
| `lint`       | `eslint src --max-warnings=0`                       |
| `typecheck`  | `tsc --noEmit -p apps/web/tsconfig.json`            |
| `e2e`        | `playwright test --config=e2e/playwright.config.ts` |

## Libs

All libs are buildless TypeScript consumed via tsconfig path aliases (see
`tsconfig.base.json`). Two of them have a `build` target — those produce
generated artefacts, not bundles.

### `libs/api-client`

Tags: `scope:shared`, `type:lib`. Path alias: `@eurostrip/api-client`.

RTK Query slice auto-generated from `apps/backend/openapi.json`. The
`build` target invokes `rtk-query-codegen-openapi`; the `refresh` target
re-pulls the OpenAPI snapshot from a running backend and rebuilds.
Consumed by `apps/web` and (eventually) any other client.

| Target      | What it runs                                      |
| ----------- | ------------------------------------------------- |
| `build`     | `rtk-query-codegen-openapi codegen.config.ts`     |
| `refresh`   | `curl … openapi.json && pnpm nx build api-client` |
| `test`      | `vitest run`                                      |
| `lint`      | `eslint src --max-warnings=0`                     |
| `typecheck` | `tsc --noEmit -p libs/api-client/tsconfig.json`   |

### `libs/design-tokens`

Tags: `scope:shared`, `type:lib`. Path alias: `@eurostrip/design-tokens`.

Source-of-truth palette + Tailwind tokens for the 4 themes. The `build`
target (`tsx src/build.ts`) emits CSS variable files consumed by
`apps/web` Tailwind config. Encodes the squared-UI rule (no
`border-radius` except `rounded-full`).

| Target      | What it runs                                       |
| ----------- | -------------------------------------------------- |
| `build`     | `tsx src/build.ts`                                 |
| `test`      | `vitest run`                                       |
| `lint`      | `eslint src --max-warnings=0`                      |
| `typecheck` | `tsc --noEmit -p libs/design-tokens/tsconfig.json` |

### `libs/i18n`

Tags: `scope:shared`, `type:lib`. Path alias: `@eurostrip/i18n`.

`LOCALES` registry plus message-catalog loaders for next-intl. The
single source of truth for "what locales does EuroStrip ship?". No build
step; consumed via path alias.

| Target      | What it runs                              |
| ----------- | ----------------------------------------- |
| `test`      | `vitest run`                              |
| `lint`      | `eslint src --max-warnings=0`             |
| `typecheck` | `tsc --noEmit -p libs/i18n/tsconfig.json` |

## Project graph

The dependency direction is one-way: apps depend on libs; libs may
depend on other libs; nothing depends on an app.

```text
apps/web ──┬──► libs/api-client ──► (apps/backend openapi.json snapshot)
           ├──► libs/i18n
           └──► libs/design-tokens

apps/backend  (no workspace deps — composer/vendor only)
```

`apps/backend` is a Laravel app and consumes nothing from `libs/*`; its
boundary with the rest of the repo is the OpenAPI snapshot at
`apps/backend/openapi.json`, which is the input to `libs/api-client`.

The graph is reproducible locally:

```bash
pnpm nx graph                                # opens the interactive viewer
pnpm nx graph --file=tmp/graph.json          # dumps machine-readable JSON
```

## Tags + boundary rules

Each `project.json` declares Nx tags so module-boundary rules can apply:

| Project         | Tags                        |
| --------------- | --------------------------- |
| `backend`       | `scope:backend`, `type:app` |
| `web`           | `scope:web`, `type:app`     |
| `api-client`    | `scope:shared`, `type:lib`  |
| `design-tokens` | `scope:shared`, `type:lib`  |
| `i18n`          | `scope:shared`, `type:lib`  |

The `@nx/enforce-module-boundaries` ESLint rule is **not yet configured**
in `eslint.config.mjs` — tags exist but nothing currently fails a build
if `apps/web` reaches into a future `scope:backend` lib. Wiring this up
is a Phase 5 TODO. The intended rules:

- `type:app` projects can depend on `type:lib`; never the reverse.
- `scope:web` and `scope:backend` projects may not depend on each other.
- `scope:shared` libs may be consumed by anything.
- `scope:ui` libs may only depend on `scope:shared`.

## Adding a new lib

1. Generate with the Nx generator that matches the consumer:

   ```bash
   pnpm nx g @nx/js:library <name> --directory=libs/<name> --importPath=@eurostrip/<name>
   # or @nx/next:library / @nx/react:library if you need framework presets
   ```

2. Set `tags` in `libs/<name>/project.json` so the boundary rules can
   apply once they land. Pick from the table above (`scope:shared`,
   `scope:ui`, …).

3. Verify `pnpm-workspace.yaml` already covers the package via
   `libs/*` — Nx generators don't need to touch this file.

4. Add the path alias to `tsconfig.base.json` under `compilerOptions.paths`:

   ```json
   "@eurostrip/<name>": ["libs/<name>/src/index.ts"]
   ```

5. Reference the lib from a consumer (`import { … } from '@eurostrip/<name>'`)
   and verify the new edge appears in `pnpm nx graph`.

## CI shape

`.github/workflows/ci.yml` runs five jobs on every PR and `main` push:

- **lint-and-typecheck** — installs Node + PHP, runs `pnpm nx affected
--target=lint` and `--target=typecheck` (excluding `backend:lint`,
  which needs the dev container; Pint runs natively in the same job).
- **test-backend** — boots `infra/docker-compose.ci.yml`, then runs
  Pest, PHPStan, and Deptrac inside the backend container.
- **test-frontend** — builds `design-tokens` and `api-client`, then
  `nx run-many --target=test` across all frontend projects.
- **e2e** — boots the CI stack, builds `api-client`, installs
  Playwright Chromium, runs `pnpm nx e2e web`.
- **docs-build** — `markdownlint-cli2`, Redocly OpenAPI lint, the
  route-coverage script, and an OpenAPI snapshot drift check.

`nx affected` uses `nrwl/nx-set-shas@v4` to compute the diff base, so
PR runs only touch projects whose inputs actually changed; `main`
pushes effectively run the full graph because every project is
"affected" relative to the previous commit.

## See also

- [`overview.md`](./overview.md) — system topology and the PDCA loop
- [`cqrs.md`](./cqrs.md) — backend application layer
- [`frontend.md`](./frontend.md) — Next.js + Redux Toolkit shape
- [Nx mental model](https://nx.dev/concepts/mental-model)
- [pnpm workspaces](https://pnpm.io/workspaces)
