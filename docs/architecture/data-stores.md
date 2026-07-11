# Data Stores

Azimuth runs six data-plane services in development, defined in
[`infra/docker-compose.yml`](../../infra/docker-compose.yml) and a slimmer set
of three in CI ([`infra/docker-compose.ci.yml`](../../infra/docker-compose.ci.yml)).
This document is the canonical reference for which store does what, the exact
images and ports, and how the application reaches them.

## 1. Postgres + PostGIS

- **Image:** `postgis/postgis:16-3.4`
- **Container:** `azimuth-postgres`
- **Port (host → container):** `5432 → 5432`
- **Volume:** `pgdata` (persisted across `compose down`)
- **Init script:** [`infra/docker/postgres-init.sql`](../../infra/docker/postgres-init.sql) (runs once on first boot)

Extensions enabled by the init script (in addition to PostGIS defaults
`postgis` and `postgis_topology` shipped in the base image):

- `postgis` — geospatial primitives.
- `postgis_topology` — topology layer.
- `pgcrypto` — UUID and crypto helpers used by application columns.
- `uuid-ossp` — additional UUID generators.

**Used by:** every Eloquent model in the codebase. Migrations live at
[`apps/backend/database/migrations/`](../../apps/backend/database/migrations/).
Tests using `RefreshDatabase` truncate and re-migrate against this same
container both in dev (against `pgdata`) and in CI (against an ephemeral
volume).

**Healthcheck:** `pg_isready -U <user> -d <db>` every 5s; backend depends on
`postgres: { condition: service_healthy }` so application boot blocks until
the database is ready.

## 2. Dragonfly (Redis-compatible)

- **Image:** `docker.dragonflydb.io/dragonflydb/dragonfly:latest`
- **Container:** `azimuth-dragonfly`
- **Port:** `6379 → 6379`
- **Command flags:** `--logtostderr --cluster_mode=emulated`
- **Healthcheck:** `redis-cli ping`

Dragonfly is wire-compatible with Redis 6 and is used by Laravel as a
drop-in. The application uses it for:

- **Cache** — `CACHE_DRIVER=redis`. Anything that goes through `Cache::*` or
  the cache facade lives here.
- **Sessions** — `SESSION_DRIVER=redis`.
- **Queue** — `QUEUE_CONNECTION=redis`. All queued jobs (Horizon supervisors,
  scheduled jobs invoked via `schedule:work`) flow through Dragonfly.
- **Horizon** — Horizon's own state (job metadata, supervisors, metrics) is
  stored here.
- **Broadcasting fan-out** — when broadcasting through the Pusher driver
  against Soketi, the queue dispatch that hands off to the broadcaster still
  runs through Dragonfly.

**Note on Redis vs Dragonfly:** we use Dragonfly because it has a more
permissive license and better single-node performance characteristics; the
Laravel side cannot tell the difference. If a Redis-only feature ever bites
us, swapping the image to `redis:7-alpine` is a one-line change.

## 3. Typesense

- **Image:** `typesense/typesense:29.1`
- **Container:** `azimuth-typesense`
- **Port:** `8108 → 8108`
- **Volume:** `typesense-data`
- **Driver:** Laravel Scout (`SCOUT_DRIVER=typesense`)

**Searchable models:** Eloquent models opt in by adding the `Searchable` trait
and defining a `toSearchableArray()` method. Currently:

- `PingModel` — registered in Phase 2 Task 19. Indexes on `id`, `user_id`, `note` (the translatable map flattened), and `created_at`.

Future modules join the index by adding the trait to their model. Index
creation is handled by `php artisan scout:import` per model class; we do not
maintain index schemas in code (Typesense auto-detects).

**Healthcheck:** intentionally absent. The `typesense:29.1` image ships
without `wget`, `curl`, `nc`, or `/dev/tcp` support, so an in-container probe
is impossible. The host smoke-test (`curl http://localhost:8108/health`)
covers readiness from the developer side; CI uses a wait loop in the test
setup. See the comment in `docker-compose.yml`.

Coverage:
[`tests/Feature/Packages/TypesenseSmokeTest.php`](../../apps/backend/tests/Feature/Packages/TypesenseSmokeTest.php).

## 4. MinIO (S3-compatible)

- **Image:** `minio/minio:latest`
- **Container:** `azimuth-minio`
- **Companion init container:** `azimuth-minio-init` (image `minio/mc:latest`,
  runs the bucket-bootstrap script and exits)
- **Ports:** `9100 → 9000` (S3 API), `9101 → 9001` (web console)
- **Volume:** `minio-data`
- **Healthcheck:** `curl -fsS http://localhost:9000/minio/health/live`

**Bucket:** `azimuth-dev` (configurable via `AZIMUTH_S3_BUCKET`). Created on
first boot by `infra/docker/minio-init.sh` running inside the init container.

**Used by:** any `Storage::disk('s3')->put(...)` call. The S3 driver is
configured against the MinIO endpoint via `.env`. The first concrete
consumer will be Browsershot's PDF/screenshot output (Phase 4 features), but
the disk is wired today so any feature can write to it.

The console at `http://localhost:9101` (default credentials in `.env`) gives
a UI for inspecting objects. CI does **not** start MinIO — file storage is
exercised against the local driver only.

## 5. Soketi

- **Image:** `quay.io/soketi/soketi:latest-16-alpine`
- **Container:** `azimuth-soketi`
- **Ports:** `6001 → 6001` (WebSocket), `9601 → 9601` (Prometheus metrics)
- **Healthcheck:** `wget -qO- http://127.0.0.1:9601/usage`

**Used by:** Laravel broadcasting via the Pusher driver. Soketi implements
the Pusher protocol, so `BROADCAST_DRIVER=pusher` against the Soketi host
reaches a fully Pusher-compatible WebSocket server with no Pusher account.

**Channel definitions** live at
[`apps/backend/routes/channels.php`](../../apps/backend/routes/channels.php).
Authorization for private/presence channels routes through Laravel's standard
broadcasting auth — same `Gate`/permission stack as everything else.

The healthcheck deliberately uses `127.0.0.1` rather than `localhost` because
inside the Soketi alpine image `localhost` resolves to `::1` (IPv6) but
Soketi only binds IPv4. It also probes the metrics port (9601, plain HTTP)
because port 6001 is WebSocket-only and won't answer a plain HTTP request.

Coverage:
[`tests/Feature/Packages/BroadcastingSmokeTest.php`](../../apps/backend/tests/Feature/Packages/BroadcastingSmokeTest.php).

## 6. Mailpit

- **Image:** `axllent/mailpit:latest`
- **Container:** `azimuth-mailpit`
- **Ports:** `1025 → 1025` (SMTP), `8025 → 8025` (web UI)
- **Volumes:** none (in-memory, capped at `MP_MAX_MESSAGES=5000`)

**Used by:** every dev mail. `MAIL_MAILER=smtp`, host `mailpit`, port `1025`.
Every queued email sent from the application is captured here and viewable
at `http://localhost:8025`. CI uses `MAIL_MAILER=array` instead (in-process
collector, no container needed).

`MP_SMTP_AUTH_ACCEPT_ANY` and `MP_SMTP_AUTH_ALLOW_INSECURE` are set so the
mailer can authenticate with any credentials; this is a dev-only convenience.

## 7. Cross-cutting health checks

After bringing the stack up, verify each store from the host:

```bash
# Postgres
docker compose --env-file .env -f infra/docker-compose.yml exec postgres \
  pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# Dragonfly (Redis-compatible)
docker compose --env-file .env -f infra/docker-compose.yml exec dragonfly \
  redis-cli ping       # → PONG

# Typesense (no in-container probe; hit it from the host)
curl -fsS http://localhost:8108/health

# MinIO
curl -fsS http://localhost:9100/minio/health/live

# Soketi metrics
curl -fsS http://127.0.0.1:9601/usage

# Mailpit UI
curl -fsSI http://localhost:8025
```

`docker compose ps` should show every service as `running (healthy)` (or
plain `running` for services without a healthcheck — `backend`, `web`,
`mailpit`, `typesense`). The ones intentionally without an in-container
healthcheck are documented in `docker-compose.yml` with a comment explaining
why.

For one-shot top-to-bottom validation, see
[`docs/runbooks/local-dev.md`](../runbooks/local-dev.md) §Smoke test.

## 8. References

- [`infra/docker-compose.yml`](../../infra/docker-compose.yml) — full dev stack.
- [`infra/docker-compose.ci.yml`](../../infra/docker-compose.ci.yml) — slim CI
  stack (Postgres + Dragonfly + Typesense + backend; no MinIO, Soketi, or
  Mailpit).
- [`docs/superpowers/specs/2026-05-02-azimuth-scaffold-design.md`](../superpowers/specs/2026-05-02-azimuth-scaffold-design.md)
  §13.1 — Phase 1 deviation notes (e.g. why the `backend` and `horizon`
  services disable the upstream FrankenPHP HEALTHCHECK; why Typesense lacks
  one entirely).
- [`docs/runbooks/local-dev.md`](../runbooks/local-dev.md) — first-run setup
  and smoke-test procedure.
