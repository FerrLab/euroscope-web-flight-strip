# Rotating Passport keys

This runbook walks through rotating Laravel Passport's RSA encryption keys
safely. Use it when:

- A key is suspected compromised.
- Compliance requires periodic rotation (e.g., PCI 90-day cycle).
- You're migrating between environments and want a clean key.

> **Warning:** Rotating keys invalidates every issued access token. Every user
> must re-authenticate. Plan accordingly — schedule for low-traffic windows in
> production.

## Background

Laravel Passport uses RSA keypairs to sign OAuth2 tokens via the
`league/oauth2-server` library. Keys live at:

- `apps/backend/storage/passport/oauth-private.key` (mode `600`)
- `apps/backend/storage/passport/oauth-public.key` (mode `660`)

In our stack:

- Keys persist via the named Docker volume `passport-keys`, mounted at
  `/app/storage/passport` (see `infra/docker-compose.yml`).
- `App\Providers\AppServiceProvider::boot()` calls `Passport::loadKeysFrom()`
  pointed at `storage/passport/`, then re-applies `0600`/`0660` permissions
  on every Octane worker boot — Docker Desktop on Windows occasionally
  fails to preserve Linux perms across volume restores.
- `apps/backend/storage/passport/` is gitignored (`/storage/passport/` in
  `apps/backend/.gitignore`) to prevent accidental key commits. **Never
  commit these files.**

Token lifetimes (configured in `AppServiceProvider::boot()`) determine how
long stale tokens linger after rotation:

| Token kind             | Default TTL |
| ---------------------- | ----------- |
| Access tokens          | 15 days     |
| Refresh tokens         | 30 days     |
| Personal access tokens | 6 months    |

After rotation, every existing token of every kind fails signature
verification on the next request and the holder must re-authenticate.

## Pre-flight

- [ ] Confirm you have a maintenance window (or accept that all users will be
      logged out simultaneously).
- [ ] Backup the current keys somewhere offline (in case rollback is needed
      within a token's lifetime).
- [ ] Communicate the rotation in `#ops` or the equivalent channel and post
      the planned start/finish time.
- [ ] Verify the `passport-keys` volume name in compose matches your target
      environment (`docker volume ls | grep passport`).
- [ ] Have a known-good user credential ready for the post-rotation smoke
      test.
- [ ] Confirm `php artisan passport:keys --help` runs cleanly inside the
      target container — surfaces missing dependencies before you've already
      deleted the old keys.

## The procedure

### Local development

```bash
# 1. Stop the backend and horizon containers (they hold open file handles
#    on the keys).
docker compose --env-file .env -f infra/docker-compose.yml stop backend horizon

# 2. Snapshot existing keys to a host-side backup directory. NEVER commit
#    this directory.
mkdir -p .keys-backup/$(date +%Y%m%d-%H%M)
docker compose --env-file .env -f infra/docker-compose.yml run --rm \
  -v "$(pwd)/.keys-backup/$(date +%Y%m%d-%H%M):/backup" backend \
  sh -c 'cp /app/storage/passport/oauth-*.key /backup/'

# 3. Remove the existing keys from the named volume.
docker compose --env-file .env -f infra/docker-compose.yml run --rm backend \
  rm -f /app/storage/passport/oauth-private.key \
        /app/storage/passport/oauth-public.key

# 4. Regenerate.
docker compose --env-file .env -f infra/docker-compose.yml run --rm backend \
  php artisan passport:keys --force

# 5. Verify perms (private should be -rw-------, public -rw-rw----).
docker compose --env-file .env -f infra/docker-compose.yml run --rm backend \
  ls -la /app/storage/passport/

# 6. Start everything back up. AppServiceProvider::boot() re-chmods on
#    worker startup as a belt-and-braces measure.
docker compose --env-file .env -f infra/docker-compose.yml up -d backend horizon
```

### Production (general approach)

Production rotation is the same artifact-level operation but wrapped in
deploy-pipeline guardrails. Until the dedicated deploy runbook lands,
follow this skeleton:

1. **Snapshot.** Pull the current `oauth-private.key` / `oauth-public.key`
   from the production volume and store them in your encrypted-at-rest
   backup bucket (KMS-encrypted S3 or equivalent). Tag with the rotation
   timestamp.
2. **Drain.** Briefly drain inbound requests (load balancer, or the
   project-standard request-draining hook) so in-flight token validations
   complete cleanly.
3. **Rotate.** Run the same `passport:keys --force` against the production
   container. The named volume preserves the new keys across restarts.
4. **Smoke test.** Issue a fresh login against the canary host and confirm
   the returned access token validates against `/api/ping`.
5. **Monitor.** Watch the auth error rate (401 spikes) for at least one
   hour. A small uptick from previously-issued tokens is expected and
   healthy; a sustained spike means clients aren't refreshing.

## Verifying after rotation

```bash
# 1. Confirm a new login issues a token. The stub socialite callback only
#    works in non-production environments; substitute your real auth flow
#    in production.
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  curl -sX POST 'http://127.0.0.1:8000/auth/socialite/stub/callback?identity=test@local' \
  | jq .access_token

# 2. Confirm the OLD token (if you saved one) is now invalid.
curl -H 'Authorization: Bearer <old-token>' http://localhost:8000/api/ping
# Expected: 401 Unauthenticated
```

## Rollback

If rotation broke something and you're inside the old token's lifetime,
restore the snapshot from step 2 of the local procedure (or the production
backup bucket):

```bash
docker compose --env-file .env -f infra/docker-compose.yml stop backend horizon
docker compose --env-file .env -f infra/docker-compose.yml run --rm \
  -v "$(pwd)/.keys-backup/<timestamp>:/backup" backend \
  sh -c 'cp /backup/oauth-private.key /backup/oauth-public.key /app/storage/passport/'
docker compose --env-file .env -f infra/docker-compose.yml up -d backend horizon
```

(Replace `$(pwd)/.keys-backup/<timestamp>` with the encrypted backup
location for the production environment.)

## Why we re-chmod on every Octane worker boot

`league/oauth2-server` enforces private-key permissions in
`{400, 440, 600, 640, 660}` and refuses to load the key otherwise — it
raises `RuntimeException: Key file permissions are too open`. Our
`App\Providers\AppServiceProvider::boot()` re-applies `0600` to the
private key and `0660` to the public key on every Octane worker boot.
This is robustness, not paranoia: Docker Desktop on Windows has been
observed to drop Linux file modes across volume restores, and the boot-
time chmod papers over that without forcing developers to debug a
mysterious 500.

## What about personal access tokens?

Personal access _clients_ (registered via `php artisan passport:client
--personal`) live in the `oauth_personal_access_clients` table, not in
the key files. Rotating RSA keys does **not** clear that table. If you
also want to rotate the personal-access client secret, run
`php artisan passport:client --personal` again to mint a new client and
update the env vars `PASSPORT_PERSONAL_ACCESS_CLIENT_ID` and
`PASSPORT_PERSONAL_ACCESS_CLIENT_SECRET` accordingly.

## Common gotchas

- Forgetting `--force` on `passport:keys` results in `Encryption keys
already exist. Use the --force option to overwrite them.`
- Running `passport:install` instead of `passport:keys` will _also_
  recreate clients in the database — destructive, do not use unless
  that's what you want.
- Permission drift: if `oauth-private.key` ends up at `644`, the League
  server raises `RuntimeException: Key file permissions are too open`.
  Restart the backend container so `AppServiceProvider::boot()` re-runs
  the chmod, or apply it manually inside the container.
- The `passport-keys` named volume persists across `docker compose
down`; only `docker compose down -v` deletes it. Don't lose keys to a
  stray `-v` — that's the most common foot-gun in local dev.
- Rotating keys does not invalidate refresh tokens stored in
  `oauth_refresh_tokens`; the next refresh attempt will fail signature
  verification and surface as a 401, which is the desired outcome.

## Cross-environment notes

- **Sharing keys across replicas.** In a multi-node production deployment,
  every backend replica must read the _same_ keypair, otherwise tokens
  signed on one node will fail validation on another. The named Docker
  volume only solves this on a single host; for multi-host deployments,
  either bind-mount the keys from a shared secret store (Vault, AWS
  Secrets Manager, GCP Secret Manager) or push the keys via your config
  management of choice. Rotation in that world is a two-step: write new
  keys to the secret store, then trigger a rolling restart.
- **CI / ephemeral environments.** Each ephemeral test environment should
  generate its own keys in its bring-up step (`passport:keys --force`)
  rather than reusing keys from another environment. The keys never need
  to leave the ephemeral container's lifetime.
- **Key length.** `passport:keys` defaults to 4096-bit RSA, which is fine
  for our threat model. Pass `--length=2048` only if a downstream client
  specifically requires it.

## See also

- [`../architecture/auth.md`](../architecture/auth.md)
- [Laravel Passport docs](https://laravel.com/docs/13.x/passport)
- [league/oauth2-server](https://oauth2.thephpleague.com)
