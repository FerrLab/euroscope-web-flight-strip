# Azimuth — Phase 2 Handoff

> Pickup point for another machine / another session continuing the scaffold.

**Date written:** 2026-05-05
**Author of this handoff:** previous Claude Code session

---

## ✅ Phase 2 status: COMPLETE (2026-05-06)

All 27 tasks of the Phase 2 plan are done. The Phase 2 gate from spec §13.2 is green:

- `nx test backend` — 59 passed (114 assertions)
- `nx analyze backend` — PHPStan level 8, no errors
- `nx deptrac backend` — 0 violations
- `POST /api/ping` (Passport token from stub login) — `201` with persisted ping
- `GET /api/ping` — array of length ≥ 1 containing the new ping
- `/admin` — Filament panel responds (302 → /admin/login serves Filament HTML)
- `/docs/api` — Scramble UI renders, `/docs/api.json` lists `/ping` (GET, POST) under server `http://localhost:8000/api`
- CI — see PR for the green run

Two small fixes were needed during the gate run and are part of the final commit:

1. **Passport personal-access client** — must be created in fresh environments via `php artisan passport:client --personal --provider=users` (one-off; persists in DB).
2. **Scout/Typesense schema for `PingModel`** — added `model-settings` for `PingModel` in `config/scout.php` so the Searchable observer can sync to Typesense. Cast `user_id`/`note_*` to `string` in `toSearchableArray()` to satisfy the schema.

Phase 3 picks up from here. A fresh `phase-3-handoff.md` will be written as Phase 3 work begins.

---

## TL;DR (historical — kept for context)

Phase 1 of the scaffold is **done and green**. The project was renamed mid-stream from **Vector** to **Azimuth** ("Your companion from A to Z"), including the on-disk directory and the Claude memory directory. The next session should pick up at **Phase 2** — backend core (CQRS contracts + every Laravel package configured + Filament + Scramble + Ping module), per `docs/superpowers/specs/2026-05-02-azimuth-scaffold-design.md` §13.2.

The Phase 2 implementation **plan has not been written yet**. The first action for the new session is to invoke `superpowers:writing-plans` against the existing spec section 13.2 to produce `docs/superpowers/plans/2026-05-05-azimuth-scaffold-phase-2.md`, then execute it via `superpowers:subagent-driven-development`.

---

## What's done (Phase 1 — all 15 tasks committed)

| Phase 1 task                                                       | Status | Commit (or contained within) |
| ------------------------------------------------------------------ | ------ | ---------------------------- |
| T1. Initialize repo root, pnpm + Nx workspace skeleton             | ✅     | `1ed3d70`                    |
| T2. Configure root TS strict, ESLint flat, Prettier, EditorConfig  | ✅     | `680dd63`, `c4f02da`         |
| T3. Scaffold four shared libs with stubs and project.json          | ✅     | `99c19f2`                    |
| T4. Scaffold apps/web (Next.js 15 + App Router + TS strict)        | ✅     | `4b5fc4d`                    |
| T5. Scaffold apps/backend (Laravel 13 via composer create-project) | ✅     | `a96bd6b`                    |
| T6. Wire Nx run-commands targets for apps/backend                  | ✅     | `5e882d7`                    |
| T7. Install + configure Laravel Pint                               | ✅     | `30eac6f`                    |
| T8. Author FrankenPHP Dockerfile + php.ini + entrypoint            | ✅     | `62ddc2de`, `bd69b02`        |
| T9. Author docker-compose.yml + init scripts + CI override         | ✅     | `dfc8c02`                    |
| T10. Author .env.example with safe local defaults                  | ✅     | `4d39f62`                    |
| T11. Install + configure Lefthook (format-on-staged)               | ✅     | `ca6e813`                    |
| T12. Author CI workflow (lint + typecheck + Pint)                  | ✅     | `0bda638`                    |
| T13. Seed /docs (README, local-dev runbook, ADR 0001)              | ✅     | `d319a12`                    |
| T14. Author root CLAUDE.md collaboration rules                     | ✅     | `c169156`                    |
| T15. Bring up the stack and verify the Phase 1 gate                | ✅     | `c190b1b` (gate fixes)       |

Plus the rename to Azimuth: `78fc4e2`.

### Phase 1 gate (functionally verified at handoff time)

- Backend at `http://localhost:8000` — serves Laravel welcome (HTTP 200)
- Frontend at `http://localhost:3000` — serves "Azimuth — Frontend scaffold is alive" (HTTP 200)
- Postgres has `postgis`, `postgis_topology`, `pgcrypto`, `uuid-ossp` extensions enabled
- Dragonfly responds to `redis-cli ping` with `PONG`
- Typesense `/health` returns `{"ok":true}`
- MinIO bucket `azimuth-dev` exists
- All 8 services come up under `azimuth-*` container names; stateful ones report `healthy`
- `pnpm nx run-many --target=typecheck --all` succeeds for all 6 projects (api-client, design-tokens, i18n, ui, web, backend)

---

## Important Phase 1 deviations from the original plan (worth knowing)

The new session should be aware of these — they're already committed but might surprise you if you're reading the spec/plan cold:

1. **`docker compose` requires `--env-file .env`.** Compose looks for `.env` adjacent to the compose file (`infra/.env`), not at the repo root. All Nx backend targets and the local-dev runbook were updated to pass `--env-file .env` explicitly. **Always include it** when running compose commands.

2. **Typesense pinned to `29.1`, not `0.27.0`.** The plan-spec'd tag doesn't exist on Docker Hub anymore; Typesense moved to integer-based versioning. The `infra/docker-compose.yml` reflects this.

3. **MinIO host ports remapped to `9100`/`9101`** (from `9000`/`9001`) because the original developer machine had another MinIO bound to `9000`. If you're on a clean machine, you can change this back, but the runbook + .env reference the current mappings.

4. **Backend has `healthcheck: { disable: true }`** to override the upstream FrankenPHP image's HEALTHCHECK directive (which probes a TLS endpoint we don't terminate in dev). Functional smoke tests cover backend readiness.

5. **Soketi healthcheck targets `127.0.0.1:9601`** (not `localhost:6001`). `localhost` resolves to `::1` inside the Soketi alpine image, but Soketi only binds IPv4; port 6001 is WebSocket-only (refuses HTTP probes), so we probe the metrics port (9601) instead.

6. **Typesense has no in-container healthcheck.** The `typesense:29.1` image ships without `wget`/`curl`/`nc` and its `sh` lacks `/dev/tcp` support, so an in-container HTTP probe isn't possible. The host-side smoke test (`curl http://localhost:8108/health`) is the readiness signal.

7. **Composer's `config.platform.php` is pinned to `8.3`** in `apps/backend/composer.json`. Without this, running `composer install` on a host with a newer PHP (e.g., 8.5 via Herd) generates a lock file with Symfony 8.x packages that require PHP 8.4+, which then fails inside the container (PHP 8.3). Keep this pin.

8. **Laravel Pint is already in `require-dev`** (Laravel 13 ships it by default). Task 7's `composer require` was a no-op; we just authored `apps/backend/pint.json` with our preferred ruleset (preset: `laravel`, plus `declare_strict_types: true`).

9. **The `# syntax=docker/dockerfile:1.7` directive was removed** from `infra/docker/frankenphp.Dockerfile` for broader BuildKit compatibility.

10. **Storage `.gitignore` files have mode 100755** (not 100644) on disk because the entrypoint runs `chmod -R 775 storage bootstrap/cache` on every boot. This is normal; don't revert to 644.

11. **An untracked `lefthook.yml` may have been auto-generated** by Lefthook's postinstall. The committed one at the repo root is the real config; if you see modification noise around it, just `git checkout -- lefthook.yml` to discard.

---

## Current local state

- **Branch:** `main` (no feature branches in flight)
- **Working tree:** clean except `.env` (git-ignored, contains a real `APP_KEY=base64:...`)
- **Docker:** stack is up; `docker compose --env-file .env -f infra/docker-compose.yml ps` shows all 8 services
- **Memory:** at `~/.claude/projects/-Users-kewyn-Herd-azimuth/memory/` (renamed from `-vector` after the directory move)
- **GitHub remote:** still `https://github.com/FerrLab/vector.git`. The remote repo has not been renamed — that's a manual step on GitHub (Settings → Repository name → vector → azimuth) and then `git remote set-url origin https://github.com/FerrLab/azimuth.git`. Optional but recommended.

---

## What's next — Phase 2

**Spec source:** `docs/superpowers/specs/2026-05-02-azimuth-scaffold-design.md` §13.2.

**Goal:** Backend fully wired with every Laravel package configured; canonical CQRS pattern proven by a real (trivial) Ping module.

**Phase 2 deliverables (verbatim from spec):**

- All Laravel packages from §5.6 installed and configured: Octane (FrankenPHP active), Horizon, Passport (with `passport:install` in entrypoint, idempotent), Pennant, Precognition, Cashier (migrations published only), Echo + pusher-php-server, Scout + Typesense, Socialite + **stub driver**, Filament panel at `/admin`, Scramble at `/docs/api`, Spatie browsershot/translatable/data, **spatie/laravel-permission v7 with PHP-enum permission identifiers (never raw strings)**.
- `app/Cqrs` namespace with all six contracts (`Command`, `Query`, `CommandHandler`, `QueryHandler`, `CommandUseCase`, `QueryUseCase`) + `CommandBus`/`QueryBus` implementations + the five-step middleware pipeline (Logging → Metrics → Authorize → Validate → Transaction).
- `app/Modules/Ping` module with full Domain/Application/Infrastructure/Presentation tree:
  - `PingCommand` / `PingQuery` (extending `Spatie\LaravelData\Data`)
  - `PingHandler` / `PingQueryHandler` (framework-aware)
  - `RecordPingUseCase` / `ListPingsUseCase` (framework-free)
  - `EloquentPingRepository` (Infrastructure)
  - `PingResource` (Filament admin)
  - HTTP controller with Scramble OpenAPI annotations
- Stub Socialite driver registered as `stub`; login route `/auth/socialite/stub` works end-to-end and mints a Passport access token (deterministic identity `stub-user@azimuth.local`).
- PHPStan/Larastan level 8 + Deptrac with the four-layer ruleset (Domain / Application / Infrastructure / Presentation) added; **a custom PHPStan rule forbidding raw-string permission usage** outside the seeder.
- Pest test suite: happy/invalid/garbage for `RecordPingUseCase`, `PingHandler`, `PingController`; bus dispatch tests; Socialite-stub → Passport-token integration test.
- CI extended with a `test-backend` job (in `.github/workflows/ci.yml`) that boots `infra/docker-compose.ci.yml`, runs `nx test backend`, `nx analyze backend`, `nx deptrac backend`.
- `docs/architecture/cqrs.md`, `docs/architecture/auth.md`, `docs/architecture/data-stores.md` written; ADRs 0002, 0003, 0004, 0005, 0007 written.

**Phase 2 gate:**

- `nx test backend && nx analyze backend && nx deptrac backend` all green
- `POST /api/ping` (with a Passport token from the stub login flow) records a ping
- `GET /api/ping` returns it
- `/admin` shows the Ping Filament resource
- `/docs/api` renders OpenAPI with the Ping endpoints listed

---

## How to pick up — first actions for the new session

1. **Confirm prerequisites:**
   - `node --version` → 22.x
   - `pnpm --version` → 9.x (`corepack enable` if needed)
   - `php --version` → 8.3 or higher (the host-side install in T5 is already done, but you may need PHP for Pint and PHPStan locally)
   - `composer --version` → 2.7+
   - Docker Compose v2

2. **Bring the stack up (if not already running):**

   ```bash
   cd /Users/kewyn/Herd/azimuth   # or wherever you cloned
   pnpm install
   docker compose --env-file .env -f infra/docker-compose.yml up -d
   curl -fsS http://localhost:8000 | head -c 100   # should mention Laravel
   curl -fsS http://localhost:3000 | head -c 100   # should mention Azimuth
   ```

3. **Re-establish the Phase 1 gate (sanity check):**

   ```bash
   pnpm nx run-many --target=typecheck --all
   docker compose --env-file .env -f infra/docker-compose.yml ps --format 'table {{.Name}}\t{{.Status}}'
   ```

4. **Read the design spec** at `docs/superpowers/specs/2026-05-02-azimuth-scaffold-design.md`, paying particular attention to:
   - §5 (Backend architecture — CQRS three-layer flow, bus middleware pipeline, module layout, package wiring table, auth flow, testing baseline)
   - §13.2 (Phase 2 scope and gate)
   - §11 (naming conventions — Commands, Queries, Handlers, UseCases, Results, repository interfaces)

5. **Read the project memory** in `~/.claude/projects/-Users-kewyn-Herd-azimuth/memory/`:
   - `MEMORY.md` (index)
   - `project_azimuth_overview.md` (full stack and conventions)
   - `project_permissions_with_enums.md` (the PHP-enum permission rule, important for Phase 2)
   - `feedback_tdd.md` (TDD rule with happy/invalid/garbage paths)
   - `feedback_run_pint.md` (run Pint after every backend task)
   - `project_first_feature.md` (post-Phase-2 Aircraft CRUD context)

6. **Invoke the brainstorming skill** to confirm the Phase 2 scope is still right (the user may have evolved their thinking since 2026-05-02), or skip directly to writing-plans if the spec stands.

7. **Invoke `superpowers:writing-plans`** to produce `docs/superpowers/plans/2026-05-05-azimuth-scaffold-phase-2.md`. Suggested task decomposition (about 22–25 bite-sized tasks):
   1. Replace PHPUnit with Pest as the test runner; baseline Pest config + test directory layout; verify `php artisan test` works inside the container
   2. Install spatie/laravel-data + spatie/browsershot + spatie/laravel-translatable + register service providers
   3. Install spatie/laravel-permission v7; author the `Permission` (string-backed enum) contract + `Role` enum; author the seeder that reconciles enum cases to DB rows; document the convention
   4. Install + configure Octane on FrankenPHP; remove the entrypoint's `artisan serve` fallback; verify Octane responds to HTTP
   5. Install + configure Horizon; publish config, gate `/horizon` to admin role, flip the `horizon` service in `docker-compose.yml` out of `profiles: ["queue"]`
   6. Install + configure Passport; make the entrypoint run `passport:install` idempotently; persist keys via the `passport-keys` named volume; tune token expiration
   7. Install + configure Pennant + Precognition + Cashier (migrations only)
   8. Install + configure Echo + Soketi (broadcasting driver `pusher`, channel `ping.{userId}`)
   9. Install + configure Scout + Typesense (driver, host, API key from .env)
   10. Install Filament; register the `/admin` panel gated to admin role; placeholder dashboard widget
   11. Install Scramble; mount `/docs/api`; verify OpenAPI doc renders
   12. Install Socialite + register the `stub` provider driver (deterministic identity); add `/auth/socialite/stub/redirect` and `/auth/socialite/stub/callback` routes that mint a Passport token
   13. Author `app/Cqrs` contracts (interfaces) — TDD with simple unit tests proving the contracts compile and resolve from the container
   14. TDD CommandBus implementation + middleware pipeline (Logging → Metrics → Authorize → Validate → Transaction); register in `BusServiceProvider`
   15. TDD QueryBus implementation + middleware (no Transaction)
   16. Author `app/Modules/Ping/Domain/` — `Ping` entity, `PingNote` value object (translatable), `PingRepository` interface; TDD all
   17. TDD `app/Modules/Ping/Application/Commands/` — `RecordPingCommand` (Data), `RecordPingHandler`, `RecordPingUseCase`; happy/invalid/garbage tests
   18. TDD `app/Modules/Ping/Application/Queries/` — `ListPingsQuery` (Data), `ListPingsHandler`, `ListPingsUseCase`; happy/invalid/garbage tests
   19. TDD `app/Modules/Ping/Infrastructure/` — `EloquentPingRepository`, migration with translatable note, factory, Scout searchability
   20. Author `app/Modules/Ping/Presentation/Http/` — controller, routes, Scramble docblocks, request validation via Precognition
   21. Author `PingResource` Filament resource (admin-side CRUD over all pings)
   22. End-to-end Socialite-stub → Passport-token integration test (Pest feature test)
   23. Install + configure PHPStan (Larastan) at level 8; author the custom PHPStan rule forbidding raw-string permission usage; resolve all level-8 violations in the existing code
   24. Install + configure Deptrac with the four-layer ruleset (Domain → no framework; Application → Domain only; Infrastructure → all; Presentation → Application only)
   25. Extend CI: add `test-backend` job that boots `docker-compose.ci.yml` and runs `nx test/analyze/deptrac backend`
   26. Author `docs/architecture/cqrs.md`, `docs/architecture/auth.md`, `docs/architecture/data-stores.md`; author ADRs 0002–0007 (per spec §10)
   27. Phase 2 gate verification

8. **Execute the plan** via `superpowers:subagent-driven-development` (recommended — same pattern as Phase 1) or `superpowers:executing-plans`.

---

## Key conventions to remember (already in `CLAUDE.md`, repeated here)

- **TDD always.** Test-first, with happy / invalid / garbage paths at minimum on every UseCase, Handler, and HTTP feature test.
- **SOLID at every layer.** UseCases pure; Handlers framework-aware bus adapters; Repositories own persistence. Domain depends on no framework.
- **No raw permission strings.** Authorization uses `BackedEnum` cases from each module's `*Permission` enum. The PHPStan rule (Phase 2 task 23) enforces this.
- **Pint runs after every backend task.** `pnpm nx lint:fix backend` is part of "done" for any backend change.
- **No hardcoded user-facing strings.** All user-facing text passes through i18n catalogs. Frontend ESLint rule enforces this on JSX.
- **Squared UI.** No `border-radius` except `rounded-full` for avatars/pills (Openbridge convention). Tailwind tokens enforce this. (Frontend concern — Phase 3.)

---

## Useful commands cheat sheet

```bash
# Stack control
docker compose --env-file .env -f infra/docker-compose.yml up -d
docker compose --env-file .env -f infra/docker-compose.yml down
docker compose --env-file .env -f infra/docker-compose.yml logs -f backend

# Backend (Nx targets — all shell into Docker)
pnpm nx artisan backend -- migrate:status
pnpm nx test backend
pnpm nx lint backend          # Pint --test (fails on style issues)
pnpm nx lint:fix backend      # Pint (auto-fix)
pnpm nx tinker backend
pnpm nx migrate backend

# Workspace
pnpm nx run-many --target=typecheck --all
pnpm nx run-many --target=lint --all
pnpm nx show projects

# Open shells/UIs
docker compose --env-file .env -f infra/docker-compose.yml exec backend sh
open http://localhost:8025      # Mailpit UI
open http://localhost:9101      # MinIO console (minioadmin / minioadmin)
```

---

## Open questions for the next session

1. **GitHub remote rename:** the remote is still `FerrLab/vector`. Decide whether to rename it on GitHub and update `git remote set-url origin`.
2. **Spec amendments:** the spec was written before discovering the Phase 1 deviations listed above (Typesense version, MinIO ports, env-file flag). Decide whether to amend the spec to reflect those, or leave them as Phase 1 implementation notes only.
3. **Pest vs PHPUnit:** the spec calls for Pest. Laravel 13 ships PHPUnit 12. The migration is straightforward (`composer require pestphp/pest --dev` and convert tests) but it's a Phase 2 task that the new session should confirm with the user.
4. **Phase 3 parallelism:** §13.5 of the spec notes that Phase 3 can begin in parallel with the tail of Phase 2 once `libs/api-client`'s OpenAPI source is generated. Decide whether to dispatch Phase 3 concurrently or strictly serially.

---

That's the handoff. Good luck.
