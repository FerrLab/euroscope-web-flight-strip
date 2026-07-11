# Local Development Runbook

This guide takes you from a fresh `git clone` to a fully running Azimuth stack in under five minutes.

## Prerequisites

| Tool   | Version                | Notes                                                   |
| ------ | ---------------------- | ------------------------------------------------------- |
| Node   | 22 LTS                 | `nvm install 22 && nvm use 22`                          |
| pnpm   | 9.x                    | `corepack enable && corepack prepare pnpm@9 --activate` |
| Docker | latest with Compose v2 | Docker Desktop, OrbStack, or Colima                     |

No host PHP/Composer needed — all backend tooling runs inside the `backend` container.

## First run

```bash
git clone <repo-url> azimuth
cd azimuth
cp .env.example .env

pnpm install
pnpm exec lefthook install

# Boots 8 backend services: backend, postgres, dragonfly, typesense,
# typesense-dashboard, soketi, minio, minio-init, mailpit, horizon.
# The compose `web` service is profile-gated; default `up -d` does NOT start it.
docker compose --env-file .env -f infra/docker-compose.yml up -d

# Generate a Laravel app key inside the backend container, then write to .env.
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan key:generate --show
# Copy the printed `base64:...` string into the root .env as APP_KEY=...
# Then re-create backend so it picks up the new key:
docker compose --env-file .env -f infra/docker-compose.yml up -d --force-recreate backend horizon
```

For frontend dev, run Next.js host-side rather than in the container (the `web` service exists for ergonomics; host-side gives faster reload + better debugging):

```bash
pnpm nx dev web
```

If you're on WSL2, copy `apps/web/.env.local.example` to `apps/web/.env.local` and set `AZIMUTH_BACKEND_URL=http://host.docker.internal:8000` so the Next.js route handlers can reach the backend container.

Wait until all healthchecks pass:

```bash
docker compose --env-file .env -f infra/docker-compose.yml ps
```

Every service should be `running (healthy)` (or `running` for services without a healthcheck like `backend` itself, `web`, `mailpit`).

## Smoke test

```bash
curl -fsS http://localhost:8000              # Laravel welcome
curl -fsS http://localhost:3000              # Next.js welcome (only if `pnpm nx dev web` is running)
curl -fsS http://localhost:8000/docs/api     # Scramble API docs
curl -fsS http://localhost:8108/health       # Typesense health
curl -fsS http://localhost:9601/usage        # Soketi metrics
```

## Service endpoints

| Service             | Host port   | URL / DSN                                                   | Notes                                                                                                          |
| ------------------- | ----------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Backend (Laravel)   | 8000 / 8443 | http://localhost:8000, https://localhost:8443               | Octane on FrankenPHP; admin at `/admin`, API docs at `/docs/api`                                               |
| Frontend (Next.js)  | 3000        | http://localhost:3000                                       | Run host-side via `pnpm nx dev web`; compose `web` service is profile-gated                                    |
| Postgres+PostGIS    | 5432        | `postgresql://azimuth:azimuth@localhost:5432/azimuth`       | PostGIS 3.4                                                                                                    |
| Dragonfly (Redis)   | 6379        | `redis://localhost:6379`                                    | Wire-compatible with `redis-cli`                                                                               |
| Typesense           | 8108        | http://localhost:8108                                       | API key in `.env`                                                                                              |
| Typesense Dashboard | 8109        | http://localhost:8109                                       | Browser UI; on first visit add server (Host: `localhost`, Port: `8108`, Protocol: `http`, API key from `.env`) |
| Soketi (WS)         | 6001 / 9601 | ws://localhost:6001, http://localhost:9601                  | Pusher protocol; see `docs/runbooks/inspecting-soketi.md`                                                      |
| MinIO (S3)          | 9100 / 9101 | http://localhost:9100 (S3), http://localhost:9101 (console) | Console: `minioadmin` / `minioadmin`                                                                           |
| Mailpit             | 1025 / 8025 | smtp://localhost:1025, http://localhost:8025                | Catches all outgoing dev mail                                                                                  |

## Common commands

```bash
# Tail backend logs
docker compose --env-file .env -f infra/docker-compose.yml logs -f backend

# Open a shell inside the backend container
docker compose --env-file .env -f infra/docker-compose.yml exec backend sh

# Run an artisan command
pnpm nx artisan backend -- migrate:status

# Run Pint on the backend
pnpm nx lint:fix backend

# Open Tinker
pnpm nx tinker backend

# Stop everything
docker compose --env-file .env -f infra/docker-compose.yml down

# Stop and wipe volumes (full reset — loses DB)
docker compose --env-file .env -f infra/docker-compose.yml down -v
```

## Troubleshooting

**Port already in use** — another process is bound to one of the host ports above. Stop it or change the host-side mapping in `infra/docker-compose.yml`.

**`pg_isready` loop in the backend logs** — Postgres container hasn't healthchecked yet. Wait a few seconds, or check `docker compose ps` to see if `postgres` is actually starting.

**Permission errors on `apps/backend/storage`** — the entrypoint runs `chmod -R 775 storage bootstrap/cache` on every boot. If the host owns these dirs as root, run `sudo chown -R $USER apps/backend/storage apps/backend/bootstrap/cache`.

**Pint disagrees with a teammate's formatting** — Pint is the source of truth. Run `pnpm nx lint:fix backend` to auto-format.
