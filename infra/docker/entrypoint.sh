#!/usr/bin/env bash
set -euo pipefail

cd /app

# Install composer deps if vendor is missing or stale
if [ ! -d vendor ] || [ ! -f vendor/autoload.php ] || [ composer.lock -nt vendor/autoload.php ]; then
  composer install --no-interaction --prefer-dist --optimize-autoloader
fi

# Ensure storage dirs exist with correct perms
mkdir -p storage/framework/{cache/data,sessions,testing,views} storage/logs bootstrap/cache
chmod -R 775 storage bootstrap/cache

# Wait for Postgres
echo "Waiting for postgres..."
until pg_isready -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USERNAME:-azimuth}" >/dev/null 2>&1; do
  sleep 1
done
echo "Postgres is ready"

# Run migrations (idempotent)
php artisan migrate --force --no-interaction || true

# Seed permissions + baseline roles. PermissionsSeeder uses firstOrCreate;
# RolesSeeder uses syncPermissions; Test User uses firstOrCreate. All three
# are idempotent so this runs safely on every boot. Without this, fresh
# stub-login users land without the `member` role and hit 403 on /api/ping.
php artisan db:seed --force --no-interaction || true

# Ensure Passport encryption keys exist; idempotent.
# Keys persist across container recreates via the passport-keys named volume
# mounted at /app/storage/passport. AppServiceProvider::boot() calls
# Passport::loadKeysFrom(storage_path('passport')) so they are loaded from here.
if [ ! -f storage/passport/oauth-private.key ] || [ ! -f storage/passport/oauth-public.key ]; then
  mkdir -p storage/passport
  php artisan passport:keys --force --no-interaction || true
fi
# League\OAuth2\Server requires private key perms in {400,440,600,640,660}; the
# earlier chmod 775 on storage/ leaves them at 0775 which trips the validator.
chmod 600 storage/passport/oauth-private.key 2>/dev/null || true
chmod 660 storage/passport/oauth-public.key 2>/dev/null || true

# Ensure a personal-access Passport client exists. Passport 13's
# `passport:install` re-publishes migrations on every run (creating duplicate
# files), and `passport:client --personal` always inserts a new row, so we
# gate on a direct count of personal-access clients for true idempotency.
# In Passport 13 the grant type is encoded in the JSON `grant_types` column.
PERSONAL_CLIENT_COUNT=$(PGPASSWORD="${DB_PASSWORD:-azimuth}" psql \
  -h "${DB_HOST:-postgres}" \
  -p "${DB_PORT:-5432}" \
  -U "${DB_USERNAME:-azimuth}" \
  -d "${DB_DATABASE:-azimuth}" \
  -tAc "SELECT COUNT(*) FROM oauth_clients WHERE grant_types::text LIKE '%personal_access%' AND revoked = false" 2>/dev/null || echo 0)

if [ "${PERSONAL_CLIENT_COUNT:-0}" = "0" ]; then
  php artisan passport:client --personal --no-interaction --name="${APP_NAME:-Azimuth} Personal Access Client" || true
fi

OCTANE_ARGS=(--server=frankenphp --host=0.0.0.0 --port=8000 --workers=auto --max-requests=1000)
if [ "${OCTANE_WATCH:-false}" = "true" ]; then
  OCTANE_ARGS+=(--watch)
fi

exec php artisan octane:start "${OCTANE_ARGS[@]}"
