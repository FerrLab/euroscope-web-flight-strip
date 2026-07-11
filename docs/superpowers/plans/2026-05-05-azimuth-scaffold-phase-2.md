# Azimuth — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire every Laravel package from §5.6 into `apps/backend`, prove the canonical CQRS pattern end-to-end via the `Ping` module, and add static analysis + CI so the next developer (or session) can extend the scaffold without re-discovering conventions.

**Architecture:** Three-layer CQRS (Command/Query → Handler → UseCase) with a Laravel-native bus that runs every dispatch through a five-middleware pipeline (Logging → Metrics → Authorize → Validate → Transaction). Permissions are PHP-enum cases that implement a marker `Permission` interface; raw permission strings are forbidden by a custom PHPStan rule. Auth is Passport access tokens minted by a stub Socialite driver that accepts `?identity=<email>` for fixture flexibility. Static analysis runs PHPStan/Larastan level 8 and Deptrac with a four-layer ruleset.

**Tech Stack:** Laravel 13, PHP 8.3 (FrankenPHP/Octane), Pest 3, Spatie laravel-data / laravel-permission v7 / laravel-translatable / browsershot, Filament 3 (panel at `/admin`), Scramble (OpenAPI at `/docs/api`), Passport, Socialite, Pennant, Precognition, Cashier (migrations only), Echo + pusher-php-server (Soketi target), Scout + Typesense, Horizon (Dragonfly/Redis target), PHPStan/Larastan + Deptrac, GitHub Actions.

**Source documents (read both before starting):**

- `docs/superpowers/specs/2026-05-02-azimuth-scaffold-design.md` — §5 (backend architecture detail), §11 (naming), §13.2 (Phase 2 scope)
- `docs/superpowers/specs/2026-05-05-azimuth-scaffold-phase-2-decisions.md` — seven locked decisions + canonical Ping module shape

**Hard rules from `/CLAUDE.md` (apply to every task):**

1. TDD — every UseCase, Handler, and HTTP feature test gets at minimum **happy / invalid / garbage** Pest cases.
2. SOLID — UseCases pure (no framework imports), Handlers framework-aware bus adapters, Repositories own persistence.
3. No raw permission strings — `BackedEnum` cases that `implements Permission` only.
4. Pint runs after every backend task — `pnpm nx lint:fix backend && pnpm nx lint backend` (the latter must exit 0).
5. No hardcoded user-facing strings — Laravel `lang/` catalogs.

**Conventions used throughout this plan:**

- All `composer`, `artisan`, and `php` commands run **inside the backend container**: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend <cmd>`. The Nx targets shorten this — `pnpm nx artisan backend -- <args>` and friends. Both forms are used in steps; pick whichever is shorter.
- All commits use the existing conventional-commit style (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `ci:`) with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` footer.
- Every backend task ends with `pnpm nx lint:fix backend && pnpm nx lint backend` then `git commit`. Lefthook runs Prettier on staged files automatically — don't repeat that step.
- Tests live at `apps/backend/tests/`. Pest discovers under `Unit/` (pure tests, no DB) and `Feature/` (with database, HTTP, Filament).

**Out of scope (do not let any task drift into these):** real domain features (Aircraft CRUD), frontend work, real OAuth providers beyond stub, Cashier billing flows beyond migrations, Browsershot rendering pipelines beyond install/registration.

---

## Task 0: Pre-flight — confirm Phase 1 still green

**Files:** none (sanity check only)

- [ ] **Step 1: Confirm stack is up and gate-green**

Run:

```bash
docker compose --env-file .env -f infra/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}"
curl -fsS -o /dev/null -w "backend %{http_code}\n" http://localhost:8000/
curl -fsS -o /dev/null -w "web %{http_code}\n" http://localhost:3000/
curl -fsS http://localhost:8108/health
docker compose --env-file .env -f infra/docker-compose.yml exec -T dragonfly redis-cli ping
pnpm nx run-many --target=typecheck --all
```

Expected: 7 long-running services up; backend 200; web 200; typesense `{"ok":true}`; dragonfly `PONG`; nx prints `Successfully ran target typecheck for 6 projects`.

If any of those fails, fix before continuing — Phase 2 assumes a green Phase 1 baseline.

- [ ] **Step 2: Create the Phase 2 working branch**

```bash
git checkout -b feat/phase-2-backend-core
git push -u origin feat/phase-2-backend-core
```

The remote is still `FerrLab/vector` (decision #2 deferred); a push will create the branch upstream. The branch name uses `feat/` because Phase 2 ships new functionality, not a fix.

- [ ] **Step 3: Confirm clean working tree**

Run: `git status`
Expected: `On branch feat/phase-2-backend-core` and `nothing to commit, working tree clean`.

---

## Task 1: Migrate test runner from PHPUnit to Pest

**Files:**

- Create: `apps/backend/tests/Pest.php`
- Modify: `apps/backend/tests/TestCase.php` (Laravel ships this)
- Modify: `apps/backend/tests/Feature/ExampleTest.php` → convert to Pest syntax
- Modify: `apps/backend/tests/Unit/ExampleTest.php` → convert to Pest syntax
- Modify: `apps/backend/composer.json` (add pestphp/pest as dev dep)
- Modify: `apps/backend/phpunit.xml` (Pest's installer reuses it)

- [ ] **Step 1: Install Pest**

Run:

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require pestphp/pest pestphp/pest-plugin-laravel --dev --with-all-dependencies
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  ./vendor/bin/pest --init
```

Expected: `pest --init` creates `tests/Pest.php` and updates `phpunit.xml` to use Pest's loader. Composer reports added packages.

- [ ] **Step 2: Convert default tests to Pest syntax**

Replace `apps/backend/tests/Feature/ExampleTest.php` with:

```php
<?php

declare(strict_types=1);

it('returns the application root', function (): void {
    $response = $this->get('/');

    $response->assertStatus(200);
});
```

Replace `apps/backend/tests/Unit/ExampleTest.php` with:

```php
<?php

declare(strict_types=1);

it('passes a trivial truth check', function (): void {
    expect(true)->toBeTrue();
});
```

- [ ] **Step 3: Run the suite to confirm Pest is wired**

Run: `pnpm nx test backend`
Expected: Two passing tests, output mentions `Tests:    2 passed` and `(Pest`. If you see `PHPUnit` in the output, Pest's `--init` didn't take — re-run it.

- [ ] **Step 4: Update Nx test target**

Open `apps/backend/project.json`. Replace the `test` target's command with:

```json
"test": {
  "executor": "nx:run-commands",
  "options": {
    "command": "docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest --parallel",
    "cwd": "{workspaceRoot}"
  }
}
```

Run `pnpm nx test backend` again. Expected: same 2 passing tests but now via `pest --parallel`.

- [ ] **Step 5: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend/composer.json apps/backend/composer.lock apps/backend/tests apps/backend/phpunit.xml apps/backend/project.json
git commit -m "$(cat <<'EOF'
test: migrate from PHPUnit to Pest as the test runner

Phase 2 task #1 (decision #1 in the Phase 2 decision log). Pest's
plugin-laravel adds first-class Laravel helpers; pest --parallel
becomes the default Nx test target.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Install spatie/laravel-data + browsershot + translatable

**Files:**

- Modify: `apps/backend/composer.json` + `composer.lock`
- Modify: `apps/backend/config/data.php` (published)
- Modify: `apps/backend/bootstrap/providers.php` (auto-discovery handles registration; verify)

- [ ] **Step 1: Install all three packages**

Run:

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require spatie/laravel-data spatie/browsershot spatie/laravel-translatable
```

Expected: Composer adds three packages. Auto-discovery registers their service providers without any code changes.

- [ ] **Step 2: Publish laravel-data config**

Run:

```bash
pnpm nx artisan backend -- vendor:publish --provider="Spatie\\LaravelData\\LaravelDataServiceProvider" --tag=data-config
```

Expected: `apps/backend/config/data.php` is created.

- [ ] **Step 3: Smoke-test laravel-data with a one-off Pest test**

Create `apps/backend/tests/Unit/Packages/LaravelDataSmokeTest.php`:

```php
<?php

declare(strict_types=1);

use Spatie\LaravelData\Data;

class SmokePingData extends Data
{
    public function __construct(public string $note) {}
}

it('round-trips a Spatie Data object', function (): void {
    $data = SmokePingData::from(['note' => 'hello']);

    expect($data->note)->toBe('hello');
    expect($data->toArray())->toBe(['note' => 'hello']);
});
```

Run: `pnpm nx test backend`
Expected: 3 passing tests.

- [ ] **Step 4: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend/composer.json apps/backend/composer.lock apps/backend/config/data.php apps/backend/tests/Unit/Packages/LaravelDataSmokeTest.php
git commit -m "$(cat <<'EOF'
feat(backend): install spatie laravel-data, browsershot, and translatable

Auto-discovery registers all three; only laravel-data has config worth
publishing. Smoke test confirms the Data DTO round-trips.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Install spatie/laravel-permission v7 + Permission marker interface + Role enum + reconciler seeder

**Files:**

- Create: `apps/backend/app/Authorization/Contracts/Permission.php`
- Create: `apps/backend/app/Authorization/Roles/Role.php`
- Create: `apps/backend/database/seeders/PermissionsSeeder.php`
- Modify: `apps/backend/database/seeders/DatabaseSeeder.php`
- Modify: `apps/backend/app/Models/User.php` (add `HasRoles` trait)
- Create: `apps/backend/tests/Feature/Authorization/PermissionsSeederTest.php`
- Modify: `apps/backend/composer.json` + `composer.lock`
- Modify: `apps/backend/config/permission.php` (published)

- [ ] **Step 1: Install spatie/laravel-permission v7**

Run:

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require "spatie/laravel-permission:^7.0"
pnpm nx artisan backend -- vendor:publish --provider="Spatie\\Permission\\PermissionServiceProvider"
pnpm nx artisan backend -- migrate
```

Expected: composer adds the package; vendor:publish writes `config/permission.php` and the migration files; migrate creates `permissions`, `roles`, `model_has_permissions`, `model_has_roles`, `role_has_permissions`.

- [ ] **Step 2: Create the marker interface**

Create `apps/backend/app/Authorization/Contracts/Permission.php`:

```php
<?php

declare(strict_types=1);

namespace App\Authorization\Contracts;

use BackedEnum;

/**
 * Marker interface for module permission enums.
 *
 * Every module declares its permissions as a string-backed PHP enum
 * that implements this interface. Authorization helpers, the seeder,
 * and the custom PHPStan rule (Task 23) rely on this marker.
 *
 * Example:
 *
 *     enum PingPermission: string implements Permission
 *     {
 *         case View   = 'ping.view';
 *         case Create = 'ping.create';
 *     }
 *
 * The interface extends BackedEnum to guarantee `->value` is a string
 * and that cases() is callable for the seeder reconciliation.
 */
interface Permission extends BackedEnum
{
}
```

- [ ] **Step 3: Create the Role enum**

Create `apps/backend/app/Authorization/Roles/Role.php`:

```php
<?php

declare(strict_types=1);

namespace App\Authorization\Roles;

enum Role: string
{
    case Admin  = 'admin';
    case Member = 'member';
}
```

Note: `Role` is **not** a `Permission` — it's a separate concept. spatie/laravel-permission models roles and permissions as different DB tables; we keep them distinct in PHP too.

- [ ] **Step 4: Add `HasRoles` to User**

In `apps/backend/app/Models/User.php`, add the trait:

```php
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasFactory, Notifiable, HasRoles;
    // …rest of class unchanged
}
```

- [ ] **Step 5: Write the seeder reconciliation test (TDD — happy path)**

Create `apps/backend/tests/Feature/Authorization/PermissionsSeederTest.php`:

```php
<?php

declare(strict_types=1);

use App\Authorization\Contracts\Permission;
use Database\Seeders\PermissionsSeeder;
use Spatie\Permission\Models\Permission as PermissionModel;

enum FixtureAlphaPermission: string implements Permission
{
    case View   = 'alpha.view';
    case Create = 'alpha.create';
}

enum FixtureBetaPermission: string implements Permission
{
    case Manage = 'beta.manage';
}

beforeEach(function (): void {
    PermissionModel::query()->delete();
});

it('upserts every enum case as a permission row (happy path)', function (): void {
    $seeder = new PermissionsSeeder([
        FixtureAlphaPermission::class,
        FixtureBetaPermission::class,
    ]);

    $seeder->run();

    expect(PermissionModel::pluck('name')->sort()->values()->all())
        ->toEqual(['alpha.create', 'alpha.view', 'beta.manage']);
});

it('removes orphan rows whose name is no longer in any enum (garbage path)', function (): void {
    PermissionModel::create(['name' => 'orphan.permission', 'guard_name' => 'web']);

    $seeder = new PermissionsSeeder([FixtureAlphaPermission::class]);
    $seeder->run();

    expect(PermissionModel::pluck('name')->sort()->values()->all())
        ->toEqual(['alpha.create', 'alpha.view']);
});

it('rejects classes that are not BackedEnum implements Permission (invalid path)', function (): void {
    $seeder = new PermissionsSeeder([\stdClass::class]);

    expect(fn () => $seeder->run())->toThrow(InvalidArgumentException::class);
});
```

Run: `pnpm nx test backend --testsuite=Feature -- --filter=PermissionsSeederTest`
Expected: All 3 tests **fail** with `Class "Database\Seeders\PermissionsSeeder" not found`.

- [ ] **Step 6: Implement the seeder**

Create `apps/backend/database/seeders/PermissionsSeeder.php`:

```php
<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Authorization\Contracts\Permission;
use BackedEnum;
use Illuminate\Database\Seeder;
use InvalidArgumentException;
use ReflectionClass;
use Spatie\Permission\Models\Permission as PermissionModel;
use Spatie\Permission\PermissionRegistrar;

class PermissionsSeeder extends Seeder
{
    /**
     * @param array<int, class-string> $permissionEnums
     *   Defaults to all enums under app/Modules/<Bounded>/Domain that
     *   implement Permission. Tests inject a fixture list.
     */
    public function __construct(private array $permissionEnums = [])
    {
        if ($permissionEnums === []) {
            $this->permissionEnums = $this->discoverPermissionEnums();
        }
    }

    public function run(): void
    {
        $expected = $this->collectExpectedNames();

        foreach ($expected as $name) {
            PermissionModel::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }

        PermissionModel::query()
            ->whereNotIn('name', $expected)
            ->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    /**
     * @return array<int, string>
     */
    private function collectExpectedNames(): array
    {
        $names = [];
        foreach ($this->permissionEnums as $enumClass) {
            $reflection = new ReflectionClass($enumClass);
            if (! $reflection->implementsInterface(Permission::class)
                || ! $reflection->implementsInterface(BackedEnum::class)) {
                throw new InvalidArgumentException(
                    "{$enumClass} must be a BackedEnum implementing ".Permission::class
                );
            }
            foreach ($enumClass::cases() as $case) {
                $names[] = $case->value;
            }
        }
        return $names;
    }

    /**
     * @return array<int, class-string>
     */
    private function discoverPermissionEnums(): array
    {
        $found = [];
        $modulesDir = app_path('Modules');
        if (! is_dir($modulesDir)) {
            return $found;
        }

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($modulesDir, \RecursiveDirectoryIterator::SKIP_DOTS)
        );

        foreach ($iterator as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }
            $relative = str_replace([$modulesDir, '/', '.php'], ['', '\\', ''], $file->getPathname());
            $fqcn = 'App\\Modules'.$relative;
            if (! class_exists($fqcn) && ! enum_exists($fqcn)) {
                continue;
            }
            $reflection = new ReflectionClass($fqcn);
            if ($reflection->isEnum()
                && $reflection->implementsInterface(Permission::class)) {
                $found[] = $fqcn;
            }
        }
        return $found;
    }
}
```

- [ ] **Step 7: Verify tests pass**

Run: `pnpm nx test backend --testsuite=Feature -- --filter=PermissionsSeederTest`
Expected: 3 passing tests.

- [ ] **Step 8: Wire into DatabaseSeeder**

In `apps/backend/database/seeders/DatabaseSeeder.php`, add:

```php
public function run(): void
{
    $this->call(PermissionsSeeder::class);
    // …existing seeders unchanged
}
```

- [ ] **Step 9: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): install spatie/laravel-permission v7 with marker-interface contract

Decision #5: every module declares permissions as a string-backed PHP
enum that implements App\Authorization\Contracts\Permission. The
PermissionsSeeder reflects across enums under app/Modules and reconciles
upserts + orphan deletes. Tests cover happy/invalid/garbage paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Install Laravel Octane on FrankenPHP

**Files:**

- Modify: `apps/backend/composer.json` + `composer.lock`
- Modify: `apps/backend/config/octane.php` (published)
- Modify: `infra/docker/entrypoint.sh` (remove `artisan serve` fallback; run `octane:start`)

- [ ] **Step 1: Install Octane**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require laravel/octane
pnpm nx artisan backend -- octane:install --server=frankenphp
```

Expected: `--server=frankenphp` is non-interactive when passed; `config/octane.php` is created.

- [ ] **Step 2: Update entrypoint to launch Octane**

Replace the bottom of `infra/docker/entrypoint.sh` (the `Octane is not installed in Phase 1` block) with:

```bash
exec php artisan octane:start \
  --server=frankenphp \
  --host=0.0.0.0 \
  --port=8000 \
  --workers=auto \
  --max-requests=1000 \
  --watch="${OCTANE_WATCH:-false}"
```

Remove the `if ! php artisan list 2>/dev/null | grep -q "octane:start"; then ... fi` fallback entirely. Octane is now required.

- [ ] **Step 3: Restart backend and verify HTTP 200**

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d --force-recreate backend
until curl -fsS -o /dev/null -m 30 http://localhost:8000/; do sleep 2; done
curl -fsS -o /dev/null -w "HTTP %{http_code} time=%{time_total}s\n" http://localhost:8000/
```

Expected: After warm-up, HTTP 200 in **well under 1s** (Octane keeps the bootstrap warm). If the first request is still slow that's fine; subsequent ones must be fast.

- [ ] **Step 4: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend infra/docker/entrypoint.sh
git commit -m "$(cat <<'EOF'
feat(backend): wire Laravel Octane on FrankenPHP

Replaces the artisan serve fallback in the entrypoint; OCTANE_WATCH=true
in dev triggers file-change reload. Workers=auto picks one per CPU.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Install Horizon and gate `/horizon` to Admin role

**Files:**

- Modify: `apps/backend/composer.json` + `composer.lock`
- Modify: `apps/backend/config/horizon.php` (published)
- Create: `apps/backend/app/Providers/HorizonServiceProvider.php` (or modify if Laravel created it)
- Modify: `infra/docker-compose.yml` — flip `horizon` service out of `profiles: ["queue"]`
- Modify: `apps/backend/.env` derivation: `QUEUE_CONNECTION=redis` (the env var is already in compose)

- [ ] **Step 1: Install Horizon**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require laravel/horizon
pnpm nx artisan backend -- horizon:install
pnpm nx artisan backend -- migrate
```

Expected: `vendor:publish` writes `config/horizon.php` and the assets/views; `migrate` is a no-op (Horizon uses Redis, not DB).

- [ ] **Step 2: Set queue connection to redis**

Edit `apps/backend/config/queue.php` (or set via env): `'default' => env('QUEUE_CONNECTION', 'redis')`. Then add `QUEUE_CONNECTION=redis` to `.env.example` and `.env`.

- [ ] **Step 3: Gate the `/horizon` UI to Admin role**

In `apps/backend/app/Providers/HorizonServiceProvider.php` (Horizon's installer creates this), replace the `gate()` method:

```php
protected function gate(): void
{
    Gate::define('viewHorizon', function ($user = null): bool {
        return $user !== null && $user->hasRole(\App\Authorization\Roles\Role::Admin->value);
    });
}
```

- [ ] **Step 4: Activate the Horizon docker service**

In `infra/docker-compose.yml`, find the `horizon:` block and **remove** the `profiles: ['queue']` line. Horizon is now part of the default `up` set.

- [ ] **Step 5: Restart and verify Horizon worker connects to Dragonfly**

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d horizon
docker compose --env-file .env -f infra/docker-compose.yml logs --tail=20 horizon
```

Expected: log lines mention `Horizon started successfully` (or equivalent). No connection errors to redis.

- [ ] **Step 6: Smoke-test gate (Pest feature test)**

Create `apps/backend/tests/Feature/Horizon/HorizonGateTest.php`:

```php
<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use Spatie\Permission\Models\Role as RoleModel;

beforeEach(function (): void {
    RoleModel::firstOrCreate(['name' => Role::Admin->value, 'guard_name' => 'web']);
    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web']);
});

it('forbids unauthenticated access to /horizon (happy)', function (): void {
    $this->get('/horizon')->assertRedirect();
});

it('forbids a member-role user (invalid)', function (): void {
    $member = User::factory()->create();
    $member->assignRole(Role::Member->value);

    $this->actingAs($member)->get('/horizon')->assertForbidden();
});

it('allows an admin-role user (happy)', function (): void {
    $admin = User::factory()->create();
    $admin->assignRole(Role::Admin->value);

    $response = $this->actingAs($admin)->get('/horizon');
    expect($response->status())->toBeIn([200, 302]); // Horizon UI returns 200 in dev
});
```

Run: `pnpm nx test backend -- --filter=HorizonGateTest`
Expected: 3 passing tests.

- [ ] **Step 7: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend infra/docker-compose.yml
git commit -m "$(cat <<'EOF'
feat(backend): install Horizon and gate /horizon to Admin role

Activates the horizon container (no longer behind the queue profile);
QUEUE_CONNECTION=redis points at Dragonfly. Gate test covers
unauthenticated/member/admin paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Install Passport with idempotent `passport:install` in entrypoint

**Files:**

- Modify: `apps/backend/composer.json` + `composer.lock`
- Modify: `apps/backend/config/auth.php` (api guard → passport)
- Modify: `apps/backend/app/Models/User.php` (add `HasApiTokens`)
- Modify: `apps/backend/config/passport.php` (published; tune token expiration)
- Modify: `infra/docker/entrypoint.sh` (call `passport:install --no-interaction` after migrate)

- [ ] **Step 1: Install Passport and migrate**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require laravel/passport
pnpm nx artisan backend -- migrate
pnpm nx artisan backend -- vendor:publish --tag=passport-config
```

- [ ] **Step 2: Wire Passport to the api guard**

In `apps/backend/config/auth.php`, set:

```php
'guards' => [
    'web' => ['driver' => 'session', 'provider' => 'users'],
    'api' => ['driver' => 'passport', 'provider' => 'users'],
],
```

- [ ] **Step 3: Add `HasApiTokens` to User**

In `apps/backend/app/Models/User.php`:

```php
use Laravel\Passport\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasRoles;
    // …
}
```

- [ ] **Step 4: Tune token expiration**

In `apps/backend/app/Providers/AppServiceProvider.php` (or a dedicated `PassportServiceProvider`), add to `boot()`:

```php
\Laravel\Passport\Passport::tokensExpireIn(now()->addDays(15));
\Laravel\Passport\Passport::refreshTokensExpireIn(now()->addDays(30));
\Laravel\Passport\Passport::personalAccessTokensExpireIn(now()->addMonths(6));
```

- [ ] **Step 5: Make `passport:install` idempotent in the entrypoint**

In `infra/docker/entrypoint.sh`, after the `php artisan migrate` line, add:

```bash
# Ensure Passport encryption keys exist; idempotent.
if [ ! -f storage/passport/oauth-private.key ] || [ ! -f storage/passport/oauth-public.key ]; then
  mkdir -p storage/passport
  php artisan passport:keys --force
fi

# Ensure default Passport clients exist; passport:install does nothing on
# subsequent runs because the personal-access and password-grant clients
# are upserted by their well-known IDs.
php artisan passport:install --no-interaction || true
```

The `passport-keys` named volume in `infra/docker-compose.yml` already mounts `storage/passport`, so keys persist across container recreates.

- [ ] **Step 6: Restart backend and verify Passport works**

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d --force-recreate backend
docker compose --env-file .env -f infra/docker-compose.yml logs --tail=20 backend | grep -E "passport|key"
```

Expected: log lines show keys exist or were generated; no crash.

- [ ] **Step 7: Pest token-mint smoke test**

Create `apps/backend/tests/Feature/Auth/PassportTokenSmokeTest.php`:

```php
<?php

declare(strict_types=1);

use App\Models\User;

it('mints a personal-access token for a user', function (): void {
    $user = User::factory()->create();

    $token = $user->createToken('smoke')->accessToken;

    expect($token)->toBeString()->and(strlen($token))->toBeGreaterThan(40);
});
```

Run: `pnpm nx test backend -- --filter=PassportTokenSmokeTest`
Expected: 1 passing test.

- [ ] **Step 8: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend infra/docker/entrypoint.sh
git commit -m "$(cat <<'EOF'
feat(backend): install Passport with idempotent key+client provisioning

Entrypoint generates Passport keys if missing (persisted via the
passport-keys named volume) and runs passport:install on every boot
(no-op when clients already exist). Token-mint smoke test passes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Install Pennant + Precognition + Cashier (migrations only)

**Files:**

- Modify: `apps/backend/composer.json` + `composer.lock`
- Modify: `apps/backend/config/pennant.php` (published)
- Modify: `apps/backend/database/migrations/*_create_*_subscriptions_*.php` (Cashier — **published, not run**)

- [ ] **Step 1: Install Pennant**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require laravel/pennant
pnpm nx artisan backend -- vendor:publish --provider="Laravel\\Pennant\\PennantServiceProvider"
pnpm nx artisan backend -- migrate
```

Expected: Pennant config + migration published; migrate creates `features` table.

- [ ] **Step 2: Install Precognition**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require laravel/precognition
```

No vendor:publish or migration needed; Precognition adds middleware and a Vite plugin (frontend concern, deferred to Phase 3).

- [ ] **Step 3: Install Cashier — migrations only, do NOT run them**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require laravel/cashier
pnpm nx artisan backend -- vendor:publish --tag=cashier-migrations
pnpm nx artisan backend -- vendor:publish --tag=cashier-config
```

Critical: **do not run `migrate`**. Phase 2's deliverable is "Cashier migrations published only" — billing tables stay opt-in for the first feature that needs them. Verify with:

```bash
ls apps/backend/database/migrations | grep -i cashier   # should list 1 or more files
pnpm nx artisan backend -- migrate:status | grep -i cashier   # should show Pending
```

- [ ] **Step 4: Pennant smoke test**

Create `apps/backend/tests/Feature/Packages/PennantSmokeTest.php`:

```php
<?php

declare(strict_types=1);

use App\Models\User;
use Laravel\Pennant\Feature;

it('toggles a feature flag for a user', function (): void {
    Feature::define('smoke-flag', fn (User $user) => $user->id === 1);

    $u1 = User::factory()->create(['id' => 1]);
    $u2 = User::factory()->create(['id' => 2]);

    expect(Feature::for($u1)->active('smoke-flag'))->toBeTrue();
    expect(Feature::for($u2)->active('smoke-flag'))->toBeFalse();
});
```

Run: `pnpm nx test backend -- --filter=PennantSmokeTest`
Expected: 1 passing test.

- [ ] **Step 5: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): install Pennant, Precognition, and Cashier

Pennant is migrated and ready for use. Precognition is wired but its
frontend half lands in Phase 3. Cashier migrations are published but
unmigrated by design — billing tables stay opt-in for the first feature
that needs them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Install Echo + pusher-php-server and configure broadcasting against Soketi

**Files:**

- Modify: `apps/backend/composer.json` + `composer.lock`
- Modify: `apps/backend/config/broadcasting.php` (verify pusher driver wired to Soketi)
- Create: `apps/backend/routes/channels.php` content for `ping.{userId}` channel

- [ ] **Step 1: Install pusher-php-server**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require pusher/pusher-php-server
```

(Echo is a JS package — installed in Phase 3 with the frontend.)

- [ ] **Step 2: Set BROADCAST_DRIVER**

Add to `apps/backend/.env.example` and `.env`: `BROADCAST_DRIVER=pusher`. The Soketi env vars (`PUSHER_APP_ID`, `PUSHER_APP_KEY`, `PUSHER_APP_SECRET`, `PUSHER_HOST=soketi`, `PUSHER_PORT=6001`, `PUSHER_SCHEME=http`) are already in `.env.example`.

- [ ] **Step 3: Verify broadcasting config points at Soketi**

In `apps/backend/config/broadcasting.php`, the `pusher` driver should already read the env vars. Confirm `host`, `port`, and `scheme` are pulled from env (Laravel 13's default config does this).

- [ ] **Step 4: Author the placeholder `ping.{userId}` channel**

In `apps/backend/routes/channels.php`, add:

```php
Broadcast::channel('ping.{userId}', function ($user, int $userId) {
    return (int) $user->id === $userId;
});
```

- [ ] **Step 5: Smoke-test broadcasting can serialize an event**

Create `apps/backend/tests/Feature/Packages/BroadcastingSmokeTest.php`:

```php
<?php

declare(strict_types=1);

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SmokeBroadcastEvent implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function broadcastOn(): array
    {
        return [new Channel('smoke')];
    }
}

it('broadcasts an event without throwing', function (): void {
    \Illuminate\Support\Facades\Event::fake();

    event(new SmokeBroadcastEvent());

    \Illuminate\Support\Facades\Event::assertDispatched(SmokeBroadcastEvent::class);
});
```

Run: `pnpm nx test backend -- --filter=BroadcastingSmokeTest`
Expected: 1 passing test.

- [ ] **Step 6: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): wire broadcasting against Soketi via pusher driver

Channel ping.{userId} authorizes a user's own private channel. Soketi
env vars were already in .env.example from Phase 1; this only flips the
driver and adds the channel definition.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Install Laravel Scout + Typesense driver

**Files:**

- Modify: `apps/backend/composer.json` + `composer.lock`
- Modify: `apps/backend/config/scout.php` (published; driver=typesense)

- [ ] **Step 1: Install Scout and typesense-php**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require laravel/scout typesense/typesense-php
pnpm nx artisan backend -- vendor:publish --provider="Laravel\\Scout\\ScoutServiceProvider"
```

- [ ] **Step 2: Set Scout driver**

In `apps/backend/.env.example` and `.env`, add `SCOUT_DRIVER=typesense`. The `TYPESENSE_*` env vars are already present from Phase 1.

In `apps/backend/config/scout.php`, ensure the `typesense` block reads `TYPESENSE_API_KEY`, `TYPESENSE_HOST`, `TYPESENSE_PORT`, `TYPESENSE_PROTOCOL` from env. The default Scout 10 config does this; verify rather than rewrite.

- [ ] **Step 3: Smoke-test the Typesense client connects**

Create `apps/backend/tests/Feature/Packages/TypesenseSmokeTest.php`:

```php
<?php

declare(strict_types=1);

it('connects to Typesense health endpoint', function (): void {
    $config = config('scout.typesense');
    $url = sprintf(
        '%s://%s:%s/health',
        $config['client-settings']['nodes'][0]['protocol'],
        $config['client-settings']['nodes'][0]['host'],
        $config['client-settings']['nodes'][0]['port'],
    );

    $response = \Illuminate\Support\Facades\Http::get($url);

    expect($response->ok())->toBeTrue();
    expect($response->json('ok'))->toBeTrue();
});
```

Run: `pnpm nx test backend -- --filter=TypesenseSmokeTest`
Expected: 1 passing test.

- [ ] **Step 4: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): install Scout + Typesense driver

PingModel becomes Searchable in Task 19; this task only wires the
package-level config. Smoke test confirms the client reaches the
typesense container's /health endpoint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Install Filament + register `/admin` panel gated to Admin role

**Files:**

- Modify: `apps/backend/composer.json` + `composer.lock`
- Create: `apps/backend/app/Providers/Filament/AdminPanelProvider.php`
- Modify: `apps/backend/bootstrap/providers.php` (auto-discovery handles registration; verify)
- Modify: `apps/backend/app/Models/User.php` (`canAccessPanel`)

- [ ] **Step 1: Install Filament**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require filament/filament:"^3.0" -W
pnpm nx artisan backend -- filament:install --panels
```

When prompted (artisan filament:install is interactive), answer `admin` for the panel ID; this scaffolds `AdminPanelProvider` automatically.

- [ ] **Step 2: Make User implement `FilamentUser`**

In `apps/backend/app/Models/User.php`:

```php
use Filament\Models\Contracts\FilamentUser;
use Filament\Panel;

class User extends Authenticatable implements FilamentUser
{
    // …existing traits/use…

    public function canAccessPanel(Panel $panel): bool
    {
        return $this->hasRole(\App\Authorization\Roles\Role::Admin->value);
    }
}
```

- [ ] **Step 3: Smoke-test the panel gate**

Create `apps/backend/tests/Feature/Filament/AdminPanelGateTest.php`:

```php
<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use Spatie\Permission\Models\Role as RoleModel;

beforeEach(function (): void {
    RoleModel::firstOrCreate(['name' => Role::Admin->value, 'guard_name' => 'web']);
    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web']);
});

it('redirects unauthenticated /admin to login', function (): void {
    $this->get('/admin')->assertRedirect();
});

it('forbids a member from /admin', function (): void {
    $member = User::factory()->create();
    $member->assignRole(Role::Member->value);

    $this->actingAs($member)->get('/admin')->assertForbidden();
});

it('allows an admin to /admin', function (): void {
    $admin = User::factory()->create();
    $admin->assignRole(Role::Admin->value);

    $this->actingAs($admin)->get('/admin')->assertSuccessful();
});
```

Run: `pnpm nx test backend -- --filter=AdminPanelGateTest`
Expected: 3 passing tests.

- [ ] **Step 4: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): install Filament panel at /admin gated to Admin role

User::canAccessPanel() checks the Admin role. The PingResource
(Task 21) is the first resource registered in this panel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Install Scramble and mount `/docs/api`

**Files:**

- Modify: `apps/backend/composer.json` + `composer.lock`
- Modify: `apps/backend/config/scramble.php` (published)

- [ ] **Step 1: Install Scramble**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require dedoc/scramble
pnpm nx artisan backend -- vendor:publish --provider="Dedoc\\Scramble\\ScrambleServiceProvider"
```

- [ ] **Step 2: Configure Scramble's API path**

In `apps/backend/config/scramble.php`, set:

```php
return [
    'api_path' => 'api',
    'api_domain' => null,
    'export_path' => 'api.json', // generated openapi.json for libs/api-client (Phase 3)
    'info' => [
        'version' => '0.1.0',
        'description' => 'Azimuth backend API',
    ],
    'ui' => [
        'title' => 'Azimuth API',
    ],
];
```

- [ ] **Step 3: Smoke-test the docs page renders**

Create `apps/backend/tests/Feature/Docs/ScrambleDocsTest.php`:

```php
<?php

declare(strict_types=1);

it('renders the Scramble docs UI at /docs/api', function (): void {
    $response = $this->get('/docs/api');

    $response->assertStatus(200);
    expect($response->content())->toContain('Azimuth API');
});

it('serves openapi.json describing the API', function (): void {
    $response = $this->get('/docs/api.json');

    $response->assertStatus(200);
    $body = $response->json();
    expect($body)->toHaveKey('openapi');
    expect($body)->toHaveKey('info.title', 'Azimuth API');
});
```

Run: `pnpm nx test backend -- --filter=ScrambleDocsTest`
Expected: 2 passing tests.

- [ ] **Step 4: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): mount Scramble OpenAPI docs at /docs/api

The PingController (Task 20) annotations populate the spec; libs/api-client
in Phase 3 will consume /docs/api.json as its source of truth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Install Socialite + register the stub driver (per-request fixture identity)

**Files:**

- Modify: `apps/backend/composer.json` + `composer.lock`
- Create: `apps/backend/app/Authentication/Socialite/StubProvider.php`
- Create: `apps/backend/app/Providers/SocialiteStubServiceProvider.php`
- Modify: `apps/backend/bootstrap/providers.php` (register the new provider)
- Modify: `apps/backend/config/services.php` (add `'stub' => [...]` block)
- Create: `apps/backend/routes/auth.php` (or modify existing)
- Modify: `apps/backend/routes/web.php` (or `api.php`) — wire `/auth/socialite/stub/{redirect,callback}`
- Create: `apps/backend/app/Http/Controllers/Auth/SocialiteStubController.php`

- [ ] **Step 1: Install Socialite**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require laravel/socialite
```

- [ ] **Step 2: Author the StubProvider**

Create `apps/backend/app/Authentication/Socialite/StubProvider.php`:

```php
<?php

declare(strict_types=1);

namespace App\Authentication\Socialite;

use Laravel\Socialite\Two\AbstractProvider;
use Laravel\Socialite\Two\ProviderInterface;
use Laravel\Socialite\Two\User as SocialiteUser;

/**
 * Stub Socialite driver — decision #7 (per-request fixture identity).
 *
 * Accepts ?identity=<email> query param; defaults to stub-user@azimuth.local.
 * The "OAuth flow" is a no-op redirect (back to callback) and a deterministic
 * user payload. Used for dev and integration tests without a real IdP.
 */
class StubProvider extends AbstractProvider implements ProviderInterface
{
    protected $scopes = [];

    private const DEFAULT_IDENTITY = 'stub-user@azimuth.local';

    protected function getAuthUrl($state): string
    {
        return route('auth.socialite.stub.callback', [
            'identity' => request()->query('identity', self::DEFAULT_IDENTITY),
        ]);
    }

    protected function getTokenUrl(): string
    {
        return 'http://stub.invalid/token'; // never called
    }

    public function user(): SocialiteUser
    {
        $email = request()->query('identity', self::DEFAULT_IDENTITY);

        return tap(new SocialiteUser(), function (SocialiteUser $u) use ($email): void {
            $u->id    = $email;
            $u->email = $email;
            $u->name  = explode('@', $email)[0];
            $u->setToken('stub-access-token');
            $u->setRefreshToken('stub-refresh-token');
            $u->setExpiresIn(3600);
        });
    }

    protected function getUserByToken($token): array
    {
        return [];
    }

    protected function mapUserToObject(array $user): SocialiteUser
    {
        return $this->user();
    }
}
```

- [ ] **Step 3: Author the service provider that registers `stub` with Socialite**

Create `apps/backend/app/Providers/SocialiteStubServiceProvider.php`:

```php
<?php

declare(strict_types=1);

namespace App\Providers;

use App\Authentication\Socialite\StubProvider;
use Illuminate\Support\ServiceProvider;
use Laravel\Socialite\Contracts\Factory as SocialiteFactory;

class SocialiteStubServiceProvider extends ServiceProvider
{
    public function boot(SocialiteFactory $factory): void
    {
        $factory->extend('stub', function ($app) {
            return new StubProvider($app['request'], 'stub', 'stub-secret', '/auth/socialite/stub/callback');
        });
    }
}
```

Register it in `apps/backend/bootstrap/providers.php`:

```php
return [
    App\Providers\AppServiceProvider::class,
    App\Providers\SocialiteStubServiceProvider::class,
    // …existing
];
```

- [ ] **Step 4: Author the controller**

Create `apps/backend/app/Http/Controllers/Auth/SocialiteStubController.php`:

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Laravel\Socialite\Facades\Socialite;

class SocialiteStubController
{
    public function redirect(Request $request): RedirectResponse
    {
        return Socialite::driver('stub')->redirect();
    }

    public function callback(Request $request): JsonResponse
    {
        $stubUser = Socialite::driver('stub')->user();

        $user = User::firstOrCreate(
            ['email' => $stubUser->getEmail()],
            ['name' => $stubUser->getName(), 'password' => bcrypt(str()->random(32))],
        );

        $token = $user->createToken('stub-login')->accessToken;

        return response()->json([
            'access_token' => $token,
            'token_type'   => 'Bearer',
            'user'         => ['id' => $user->id, 'email' => $user->email],
        ]);
    }
}
```

- [ ] **Step 5: Wire the routes**

In `apps/backend/routes/web.php`, add:

```php
use App\Http\Controllers\Auth\SocialiteStubController;

Route::get('/auth/socialite/stub/redirect', [SocialiteStubController::class, 'redirect'])
    ->name('auth.socialite.stub.redirect');
Route::get('/auth/socialite/stub/callback', [SocialiteStubController::class, 'callback'])
    ->name('auth.socialite.stub.callback');
```

- [ ] **Step 6: Pest feature test (default identity + custom identity)**

Create `apps/backend/tests/Feature/Auth/SocialiteStubTest.php`:

```php
<?php

declare(strict_types=1);

use App\Models\User;

it('mints a Passport token for the default stub identity (happy)', function (): void {
    $response = $this->get('/auth/socialite/stub/callback');

    $response->assertStatus(200);
    $response->assertJsonStructure(['access_token', 'token_type', 'user' => ['id', 'email']]);
    expect($response->json('user.email'))->toBe('stub-user@azimuth.local');
    expect($response->json('access_token'))->toBeString();

    $this->assertDatabaseHas('users', ['email' => 'stub-user@azimuth.local']);
});

it('honors ?identity=<email> for fixture identities (happy)', function (): void {
    $response = $this->get('/auth/socialite/stub/callback?identity=alice@local');

    $response->assertStatus(200);
    expect($response->json('user.email'))->toBe('alice@local');

    $this->assertDatabaseHas('users', ['email' => 'alice@local']);
});

it('mints valid tokens that authenticate against api guard (happy)', function (): void {
    $login = $this->getJson('/auth/socialite/stub/callback')->json();

    $userId = User::query()->where('email', 'stub-user@azimuth.local')->value('id');

    $auth = $this
        ->withToken($login['access_token'])
        ->getJson('/api/user');

    $auth->assertStatus(200);
    expect($auth->json('id'))->toBe($userId);
});
```

(The `/api/user` route is added in Step 7.)

- [ ] **Step 7: Add a minimal `/api/user` route to confirm Passport-token auth works**

In `apps/backend/routes/api.php`:

```php
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:api')->get('/user', function (Request $request) {
    return $request->user();
});
```

- [ ] **Step 8: Run feature tests**

Run: `pnpm nx test backend -- --filter=SocialiteStubTest`
Expected: 3 passing tests.

- [ ] **Step 9: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): install Socialite and register stub driver

Decision #7: stub driver accepts ?identity=<email>; defaults to
stub-user@azimuth.local. Callback upserts the User and mints a Passport
access token. Three feature tests cover default identity, fixture
identity, and end-to-end token validation against the api guard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Author `app/Cqrs` contracts (the six interfaces)

**Files:**

- Create: `apps/backend/app/Cqrs/Command.php`
- Create: `apps/backend/app/Cqrs/Query.php`
- Create: `apps/backend/app/Cqrs/CommandHandler.php`
- Create: `apps/backend/app/Cqrs/QueryHandler.php`
- Create: `apps/backend/app/Cqrs/CommandUseCase.php`
- Create: `apps/backend/app/Cqrs/QueryUseCase.php`
- Create: `apps/backend/tests/Unit/Cqrs/ContractsTest.php`

- [ ] **Step 1: Write the contract test (TDD — happy path)**

Create `apps/backend/tests/Unit/Cqrs/ContractsTest.php`:

```php
<?php

declare(strict_types=1);

use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use App\Cqrs\CommandUseCase;
use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use App\Cqrs\QueryUseCase;
use Spatie\LaravelData\Data;

it('Command is a marker interface implemented by a Spatie Data subclass', function (): void {
    $cmd = new class('hello') extends Data implements Command {
        public function __construct(public string $note) {}
    };

    expect($cmd)->toBeInstanceOf(Command::class)->and($cmd)->toBeInstanceOf(Data::class);
});

it('Query is a marker interface', function (): void {
    $q = new class extends Data implements Query {};
    expect($q)->toBeInstanceOf(Query::class);
});

it('CommandHandler and QueryHandler require a handle() method', function (): void {
    expect(method_exists(CommandHandler::class, 'handle'))->toBeTrue();
    expect(method_exists(QueryHandler::class, 'handle'))->toBeTrue();
});

it('UseCase markers exist for both sides', function (): void {
    expect(interface_exists(CommandUseCase::class))->toBeTrue();
    expect(interface_exists(QueryUseCase::class))->toBeTrue();
});
```

Run: `pnpm nx test backend -- --filter=ContractsTest`
Expected: 4 tests **fail** with `Class/Interface "App\Cqrs\..." not found`.

- [ ] **Step 2: Implement the six interfaces**

Create `apps/backend/app/Cqrs/Command.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs;

/** Marker interface — every command extends Spatie\LaravelData\Data and implements Command. */
interface Command {}
```

Create `apps/backend/app/Cqrs/Query.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs;

/** Marker interface — every query extends Spatie\LaravelData\Data and implements Query. */
interface Query {}
```

Create `apps/backend/app/Cqrs/CommandHandler.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs;

interface CommandHandler
{
    public function handle(Command $command): mixed;
}
```

Create `apps/backend/app/Cqrs/QueryHandler.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs;

interface QueryHandler
{
    public function handle(Query $query): mixed;
}
```

Create `apps/backend/app/Cqrs/CommandUseCase.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs;

/**
 * Marker interface for framework-free use cases on the write side.
 *
 * UseCases hold pure business logic; they do not import Laravel facades,
 * Eloquent, or any framework symbol. Persistence is reached through a
 * domain repository interface injected via the constructor.
 */
interface CommandUseCase {}
```

Create `apps/backend/app/Cqrs/QueryUseCase.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs;

interface QueryUseCase {}
```

- [ ] **Step 3: Run tests to verify pass**

Run: `pnpm nx test backend -- --filter=ContractsTest`
Expected: 4 passing tests.

- [ ] **Step 4: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend/app/Cqrs apps/backend/tests/Unit/Cqrs
git commit -m "$(cat <<'EOF'
feat(backend): author CQRS marker contracts

Six interfaces under app/Cqrs: Command, Query, CommandHandler,
QueryHandler, CommandUseCase, QueryUseCase. Every command extends
Spatie\LaravelData\Data and implements Command (same for queries);
handlers expose a handle() method; use cases are framework-free.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: CommandBus implementation + five-step middleware pipeline

**Files:**

- Create: `apps/backend/app/Cqrs/Bus/CommandBus.php` (interface)
- Create: `apps/backend/app/Cqrs/Bus/LaravelCommandBus.php` (impl)
- Create: `apps/backend/app/Cqrs/Bus/Middleware/Middleware.php` (contract)
- Create: `apps/backend/app/Cqrs/Bus/Middleware/LoggingMiddleware.php`
- Create: `apps/backend/app/Cqrs/Bus/Middleware/MetricsMiddleware.php`
- Create: `apps/backend/app/Cqrs/Bus/Middleware/AuthorizeMiddleware.php`
- Create: `apps/backend/app/Cqrs/Bus/Middleware/ValidateMiddleware.php`
- Create: `apps/backend/app/Cqrs/Bus/Middleware/TransactionMiddleware.php`
- Create: `apps/backend/app/Cqrs/Bus/HandlerRegistry.php`
- Create: `apps/backend/app/Providers/BusServiceProvider.php`
- Modify: `apps/backend/bootstrap/providers.php`
- Create: `apps/backend/tests/Unit/Cqrs/Bus/CommandBusTest.php`

- [ ] **Step 1: Write the bus pipeline test (TDD — order + dispatch)**

Create `apps/backend/tests/Unit/Cqrs/Bus/CommandBusTest.php`:

```php
<?php

declare(strict_types=1);

use App\Cqrs\Bus\CommandBus;
use App\Cqrs\Bus\HandlerRegistry;
use App\Cqrs\Bus\LaravelCommandBus;
use App\Cqrs\Bus\Middleware\Middleware;
use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use Spatie\LaravelData\Data;

class TestSpyMiddleware implements Middleware
{
    public function __construct(public string $name, public array &$trace) {}
    public function handle(object $message, \Closure $next): mixed
    {
        $this->trace[] = "before:{$this->name}";
        $result = $next($message);
        $this->trace[] = "after:{$this->name}";
        return $result;
    }
}

class TestRecordCmd extends Data implements Command
{
    public function __construct(public string $note) {}
}

class TestRecordHandler implements CommandHandler
{
    public function handle(Command $command): string
    {
        /** @var TestRecordCmd $command */
        return strtoupper($command->note);
    }
}

it('runs middleware in registered order then handles the command (happy)', function (): void {
    $trace = [];

    $registry = new HandlerRegistry();
    $registry->register(TestRecordCmd::class, TestRecordHandler::class);

    $bus = new LaravelCommandBus(
        $registry,
        app(),
        [
            new TestSpyMiddleware('logging',     $trace),
            new TestSpyMiddleware('metrics',     $trace),
            new TestSpyMiddleware('authorize',   $trace),
            new TestSpyMiddleware('validate',    $trace),
            new TestSpyMiddleware('transaction', $trace),
        ],
    );

    $result = $bus->dispatch(new TestRecordCmd('hello'));

    expect($result)->toBe('HELLO');
    expect($trace)->toBe([
        'before:logging','before:metrics','before:authorize','before:validate','before:transaction',
        'after:transaction','after:validate','after:authorize','after:metrics','after:logging',
    ]);
});

it('throws when no handler is registered (invalid)', function (): void {
    $registry = new HandlerRegistry();
    $bus = new LaravelCommandBus($registry, app(), []);

    expect(fn () => $bus->dispatch(new TestRecordCmd('x')))
        ->toThrow(\App\Cqrs\Bus\Exceptions\NoHandlerForCommand::class);
});

it('throws when dispatched with a non-Command (garbage)', function (): void {
    $bus = new LaravelCommandBus(new HandlerRegistry(), app(), []);

    expect(fn () => $bus->dispatch(new \stdClass()))
        ->toThrow(\TypeError::class);
});
```

Run: `pnpm nx test backend -- --filter=CommandBusTest`
Expected: 3 tests **fail** with class-not-found errors.

- [ ] **Step 2: Implement the contracts and registry**

Create `apps/backend/app/Cqrs/Bus/CommandBus.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus;

use App\Cqrs\Command;

interface CommandBus
{
    public function dispatch(Command $command): mixed;
}
```

Create `apps/backend/app/Cqrs/Bus/Middleware/Middleware.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Middleware;

use Closure;

interface Middleware
{
    public function handle(object $message, Closure $next): mixed;
}
```

Create `apps/backend/app/Cqrs/Bus/HandlerRegistry.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus;

class HandlerRegistry
{
    /** @var array<class-string, class-string> */
    private array $map = [];

    /** @param class-string $messageClass @param class-string $handlerClass */
    public function register(string $messageClass, string $handlerClass): void
    {
        $this->map[$messageClass] = $handlerClass;
    }

    /** @return class-string|null */
    public function handlerFor(string $messageClass): ?string
    {
        return $this->map[$messageClass] ?? null;
    }
}
```

Create `apps/backend/app/Cqrs/Bus/Exceptions/NoHandlerForCommand.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Exceptions;

use RuntimeException;

class NoHandlerForCommand extends RuntimeException
{
    public static function for(string $commandClass): self
    {
        return new self("No handler registered for command [{$commandClass}].");
    }
}
```

Create `apps/backend/app/Cqrs/Bus/LaravelCommandBus.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus;

use App\Cqrs\Bus\Exceptions\NoHandlerForCommand;
use App\Cqrs\Bus\Middleware\Middleware;
use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use Illuminate\Contracts\Container\Container;

class LaravelCommandBus implements CommandBus
{
    /** @param array<int, Middleware> $middleware */
    public function __construct(
        private HandlerRegistry $registry,
        private Container $container,
        private array $middleware,
    ) {}

    public function dispatch(Command $command): mixed
    {
        $handlerClass = $this->registry->handlerFor($command::class)
            ?? throw NoHandlerForCommand::for($command::class);

        $finalHandler = function (object $message) use ($handlerClass): mixed {
            /** @var CommandHandler $handler */
            $handler = $this->container->make($handlerClass);
            return $handler->handle($message);
        };

        $pipeline = array_reduce(
            array_reverse($this->middleware),
            fn (\Closure $next, Middleware $mw): \Closure
                => fn (object $msg): mixed => $mw->handle($msg, $next),
            $finalHandler,
        );

        return $pipeline($command);
    }
}
```

- [ ] **Step 3: Implement the five middleware**

Create `apps/backend/app/Cqrs/Bus/Middleware/LoggingMiddleware.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Middleware;

use Closure;
use Illuminate\Support\Facades\Log;

class LoggingMiddleware implements Middleware
{
    public function handle(object $message, Closure $next): mixed
    {
        Log::debug('cqrs.dispatch.start', ['message' => $message::class]);
        try {
            $result = $next($message);
            Log::debug('cqrs.dispatch.end', ['message' => $message::class, 'ok' => true]);
            return $result;
        } catch (\Throwable $e) {
            Log::warning('cqrs.dispatch.error', [
                'message' => $message::class,
                'error'   => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
```

Create `apps/backend/app/Cqrs/Bus/Middleware/MetricsMiddleware.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Middleware;

use Closure;
use Illuminate\Support\Facades\Log;

class MetricsMiddleware implements Middleware
{
    public function handle(object $message, Closure $next): mixed
    {
        $start = microtime(true);
        try {
            return $next($message);
        } finally {
            $elapsed = (microtime(true) - $start) * 1000;
            Log::info('cqrs.dispatch.duration_ms', [
                'message' => $message::class,
                'ms'      => round($elapsed, 2),
            ]);
        }
    }
}
```

Create `apps/backend/app/Cqrs/Bus/Middleware/AuthorizeMiddleware.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Middleware;

use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\Gate;

/**
 * If the dispatched message exposes `permission(): \App\Authorization\Contracts\Permission`,
 * the current user must be allowed by Gate::authorize. Messages without the method are
 * unauthorized — every command/query must declare its permission explicitly.
 */
class AuthorizeMiddleware implements Middleware
{
    public function handle(object $message, Closure $next): mixed
    {
        if (! method_exists($message, 'permission')) {
            throw new AuthorizationException(
                "Message [".$message::class."] must declare permission(): Permission",
            );
        }
        Gate::authorize($message->permission()->value);
        return $next($message);
    }
}
```

Create `apps/backend/app/Cqrs/Bus/Middleware/ValidateMiddleware.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Middleware;

use Closure;
use Illuminate\Support\Facades\Validator;

/**
 * If the dispatched message exposes `rules(): array`, the message's array
 * representation is validated against those rules. Spatie Data subclasses
 * already validate themselves on construction; this middleware is for
 * additional cross-field rules expressed Laravel-style.
 */
class ValidateMiddleware implements Middleware
{
    public function handle(object $message, Closure $next): mixed
    {
        if (method_exists($message, 'rules')) {
            $payload = method_exists($message, 'toArray') ? $message->toArray() : (array) $message;
            Validator::make($payload, $message->rules())->validate();
        }
        return $next($message);
    }
}
```

Create `apps/backend/app/Cqrs/Bus/Middleware/TransactionMiddleware.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Middleware;

use Closure;
use Illuminate\Support\Facades\DB;

/** Wraps command dispatch in a DB transaction. Not used by the QueryBus. */
class TransactionMiddleware implements Middleware
{
    public function handle(object $message, Closure $next): mixed
    {
        return DB::transaction(fn () => $next($message));
    }
}
```

- [ ] **Step 4: Author BusServiceProvider**

Create `apps/backend/app/Providers/BusServiceProvider.php`:

```php
<?php

declare(strict_types=1);

namespace App\Providers;

use App\Cqrs\Bus\CommandBus;
use App\Cqrs\Bus\HandlerRegistry;
use App\Cqrs\Bus\LaravelCommandBus;
use App\Cqrs\Bus\Middleware\AuthorizeMiddleware;
use App\Cqrs\Bus\Middleware\LoggingMiddleware;
use App\Cqrs\Bus\Middleware\MetricsMiddleware;
use App\Cqrs\Bus\Middleware\TransactionMiddleware;
use App\Cqrs\Bus\Middleware\ValidateMiddleware;
use Illuminate\Support\ServiceProvider;

class BusServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(HandlerRegistry::class);

        $this->app->singleton(CommandBus::class, function ($app) {
            return new LaravelCommandBus(
                $app->make(HandlerRegistry::class),
                $app,
                [
                    $app->make(LoggingMiddleware::class),
                    $app->make(MetricsMiddleware::class),
                    $app->make(AuthorizeMiddleware::class),
                    $app->make(ValidateMiddleware::class),
                    $app->make(TransactionMiddleware::class),
                ],
            );
        });
    }
}
```

Register in `apps/backend/bootstrap/providers.php`:

```php
return [
    App\Providers\AppServiceProvider::class,
    App\Providers\BusServiceProvider::class,
    App\Providers\SocialiteStubServiceProvider::class,
    // …
];
```

- [ ] **Step 5: Verify tests pass**

Run: `pnpm nx test backend -- --filter=CommandBusTest`
Expected: 3 passing tests.

- [ ] **Step 6: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): CommandBus with five-step middleware pipeline

Decision #6 order: Logging → Metrics → Authorize → Validate → Transaction.
Authorize is before Validate by design — never reveal schema knowledge to
unauthorized callers. AuthorizeMiddleware requires every Command to
declare permission() returning a Permission enum case (no raw strings).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: QueryBus implementation + four-step middleware pipeline (no Transaction)

**Files:**

- Create: `apps/backend/app/Cqrs/Bus/QueryBus.php` (interface)
- Create: `apps/backend/app/Cqrs/Bus/LaravelQueryBus.php`
- Create: `apps/backend/app/Cqrs/Bus/Exceptions/NoHandlerForQuery.php`
- Modify: `apps/backend/app/Providers/BusServiceProvider.php` (register QueryBus too)
- Create: `apps/backend/tests/Unit/Cqrs/Bus/QueryBusTest.php`

- [ ] **Step 1: Write the QueryBus test (TDD)**

Create `apps/backend/tests/Unit/Cqrs/Bus/QueryBusTest.php`:

```php
<?php

declare(strict_types=1);

use App\Cqrs\Bus\HandlerRegistry;
use App\Cqrs\Bus\LaravelQueryBus;
use App\Cqrs\Bus\Middleware\Middleware;
use App\Cqrs\Bus\QueryBus;
use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use Spatie\LaravelData\Data;

class TestListSpy implements Middleware
{
    public function __construct(public string $name, public array &$trace) {}
    public function handle(object $msg, \Closure $next): mixed
    {
        $this->trace[] = $this->name;
        return $next($msg);
    }
}

class TestListQuery extends Data implements Query {}

class TestListHandler implements QueryHandler
{
    public function handle(Query $query): array { return ['ok']; }
}

it('runs the query pipeline (no Transaction)', function (): void {
    $trace = [];
    $registry = new HandlerRegistry();
    $registry->register(TestListQuery::class, TestListHandler::class);

    $bus = new LaravelQueryBus($registry, app(), [
        new TestListSpy('logging',   $trace),
        new TestListSpy('metrics',   $trace),
        new TestListSpy('authorize', $trace),
        new TestListSpy('validate',  $trace),
    ]);

    expect($bus->dispatch(new TestListQuery()))->toBe(['ok']);
    expect($trace)->toBe(['logging', 'metrics', 'authorize', 'validate']);
});

it('throws when no handler is registered (invalid)', function (): void {
    $bus = new LaravelQueryBus(new HandlerRegistry(), app(), []);
    expect(fn () => $bus->dispatch(new TestListQuery()))
        ->toThrow(\App\Cqrs\Bus\Exceptions\NoHandlerForQuery::class);
});
```

Run: `pnpm nx test backend -- --filter=QueryBusTest`
Expected: 2 tests fail with class-not-found.

- [ ] **Step 2: Implement QueryBus + exception**

Create `apps/backend/app/Cqrs/Bus/QueryBus.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus;

use App\Cqrs\Query;

interface QueryBus
{
    public function dispatch(Query $query): mixed;
}
```

Create `apps/backend/app/Cqrs/Bus/Exceptions/NoHandlerForQuery.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Exceptions;

use RuntimeException;

class NoHandlerForQuery extends RuntimeException
{
    public static function for(string $queryClass): self
    {
        return new self("No handler registered for query [{$queryClass}].");
    }
}
```

Create `apps/backend/app/Cqrs/Bus/LaravelQueryBus.php`:

```php
<?php

declare(strict_types=1);

namespace App\Cqrs\Bus;

use App\Cqrs\Bus\Exceptions\NoHandlerForQuery;
use App\Cqrs\Bus\Middleware\Middleware;
use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use Illuminate\Contracts\Container\Container;

class LaravelQueryBus implements QueryBus
{
    /** @param array<int, Middleware> $middleware */
    public function __construct(
        private HandlerRegistry $registry,
        private Container $container,
        private array $middleware,
    ) {}

    public function dispatch(Query $query): mixed
    {
        $handlerClass = $this->registry->handlerFor($query::class)
            ?? throw NoHandlerForQuery::for($query::class);

        $finalHandler = function (object $message) use ($handlerClass): mixed {
            /** @var QueryHandler $handler */
            $handler = $this->container->make($handlerClass);
            return $handler->handle($message);
        };

        $pipeline = array_reduce(
            array_reverse($this->middleware),
            fn (\Closure $next, Middleware $mw): \Closure
                => fn (object $msg): mixed => $mw->handle($msg, $next),
            $finalHandler,
        );

        return $pipeline($query);
    }
}
```

- [ ] **Step 3: Register the QueryBus in BusServiceProvider**

In `apps/backend/app/Providers/BusServiceProvider.php`, append inside `register()`:

```php
$this->app->singleton(QueryBus::class, function ($app) {
    return new LaravelQueryBus(
        $app->make(HandlerRegistry::class),
        $app,
        [
            $app->make(LoggingMiddleware::class),
            $app->make(MetricsMiddleware::class),
            $app->make(AuthorizeMiddleware::class),
            $app->make(ValidateMiddleware::class),
        ],
    );
});
```

Add `use App\Cqrs\Bus\QueryBus;` and `use App\Cqrs\Bus\LaravelQueryBus;` at the top.

- [ ] **Step 4: Verify tests pass**

Run: `pnpm nx test backend -- --filter=QueryBusTest`
Expected: 2 passing tests.

- [ ] **Step 5: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): QueryBus with four-step pipeline (no Transaction)

QueryBus reuses HandlerRegistry and the same middleware as CommandBus
minus TransactionMiddleware — queries are read-only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Ping Domain layer

**Files:**

- Create: `apps/backend/app/Modules/Ping/Domain/Ping.php`
- Create: `apps/backend/app/Modules/Ping/Domain/PingNote.php`
- Create: `apps/backend/app/Modules/Ping/Domain/PingRepository.php`
- Create: `apps/backend/app/Modules/Ping/Domain/PingPermission.php`
- Create: `apps/backend/tests/Unit/Modules/Ping/Domain/PingTest.php`
- Create: `apps/backend/tests/Unit/Modules/Ping/Domain/PingNoteTest.php`

- [ ] **Step 1: Write Ping entity + PingNote VO tests (TDD)**

Create `apps/backend/tests/Unit/Modules/Ping/Domain/PingNoteTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Ping\Domain\PingNote;

it('constructs with at least one locale (happy)', function (): void {
    $note = new PingNote(['en' => 'hello', 'pt' => 'olá']);
    expect($note->forLocale('en'))->toBe('hello');
    expect($note->forLocale('pt'))->toBe('olá');
});

it('rejects empty locale map (invalid)', function (): void {
    expect(fn () => new PingNote([]))->toThrow(InvalidArgumentException::class);
});

it('rejects non-string values (garbage)', function (): void {
    expect(fn () => new PingNote(['en' => 123]))->toThrow(InvalidArgumentException::class);
});

it('falls back to first available locale when requested locale missing', function (): void {
    $note = new PingNote(['pt' => 'olá']);
    expect($note->forLocale('en'))->toBe('olá'); // fallback
});
```

Create `apps/backend/tests/Unit/Modules/Ping/Domain/PingTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;

it('records who pinged and when (happy)', function (): void {
    $ping = new Ping(
        id: 'p-1',
        userId: 7,
        note: new PingNote(['en' => 'hello']),
        createdAt: new DateTimeImmutable('2026-05-05T12:00:00Z'),
    );

    expect($ping->id)->toBe('p-1');
    expect($ping->userId)->toBe(7);
    expect($ping->note->forLocale('en'))->toBe('hello');
});

it('rejects empty id (invalid)', function (): void {
    expect(fn () => new Ping(
        id: '',
        userId: 1,
        note: new PingNote(['en' => 'x']),
        createdAt: new DateTimeImmutable(),
    ))->toThrow(InvalidArgumentException::class);
});

it('rejects negative userId (garbage)', function (): void {
    expect(fn () => new Ping(
        id: 'p-1',
        userId: -1,
        note: new PingNote(['en' => 'x']),
        createdAt: new DateTimeImmutable(),
    ))->toThrow(InvalidArgumentException::class);
});
```

Run: `pnpm nx test backend -- --filter='Ping(Note)?Test'`
Expected: 7 tests fail with class-not-found.

- [ ] **Step 2: Implement PingNote VO**

Create `apps/backend/app/Modules/Ping/Domain/PingNote.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Domain;

use InvalidArgumentException;

/**
 * Translatable string value object — one map of locale-code => text.
 *
 * Pure-domain; no Laravel/Spatie imports. The Eloquent model in
 * Infrastructure converts to/from JSONB when persisting.
 */
final readonly class PingNote
{
    /** @param array<string, string> $translations */
    public function __construct(public array $translations)
    {
        if ($translations === []) {
            throw new InvalidArgumentException('PingNote requires at least one translation.');
        }
        foreach ($translations as $locale => $text) {
            if (! is_string($locale) || $locale === '') {
                throw new InvalidArgumentException('PingNote locale keys must be non-empty strings.');
            }
            if (! is_string($text)) {
                throw new InvalidArgumentException('PingNote values must be strings.');
            }
        }
    }

    public function forLocale(string $locale): string
    {
        return $this->translations[$locale] ?? array_values($this->translations)[0];
    }
}
```

- [ ] **Step 3: Implement Ping entity**

Create `apps/backend/app/Modules/Ping/Domain/Ping.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Domain;

use DateTimeImmutable;
use InvalidArgumentException;

final readonly class Ping
{
    public function __construct(
        public string $id,
        public int $userId,
        public PingNote $note,
        public DateTimeImmutable $createdAt,
    ) {
        if ($id === '') {
            throw new InvalidArgumentException('Ping id cannot be empty.');
        }
        if ($userId < 1) {
            throw new InvalidArgumentException('Ping userId must be a positive integer.');
        }
    }
}
```

- [ ] **Step 4: Implement PingRepository interface**

Create `apps/backend/app/Modules/Ping/Domain/PingRepository.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Domain;

interface PingRepository
{
    public function save(Ping $ping): void;

    public function findById(string $id): ?Ping;

    /** @return array<int, Ping> */
    public function recentForUser(int $userId, int $limit = 50): array;
}
```

- [ ] **Step 5: Implement PingPermission enum**

Create `apps/backend/app/Modules/Ping/Domain/PingPermission.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Domain;

use App\Authorization\Contracts\Permission;

enum PingPermission: string implements Permission
{
    case View   = 'ping.view';
    case Create = 'ping.create';
}
```

- [ ] **Step 6: Verify tests pass**

Run: `pnpm nx test backend -- --filter='Ping(Note)?Test'`
Expected: 7 passing tests.

- [ ] **Step 7: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): Ping Domain layer (entity, VO, repository, permission)

Pure domain — no framework imports. PingNote is the canonical
translatable VO. PingPermission is the first concrete enum implementing
the Permission marker interface (decision #5).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Ping Application/Commands — RecordPingCommand + RecordPingHandler + RecordPingUseCase

**Files:**

- Create: `apps/backend/app/Modules/Ping/Application/Commands/RecordPingCommand.php`
- Create: `apps/backend/app/Modules/Ping/Application/Commands/RecordPingUseCase.php`
- Create: `apps/backend/app/Modules/Ping/Application/Commands/RecordPingHandler.php`
- Create: `apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingUseCaseTest.php`
- Create: `apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingHandlerTest.php`

- [ ] **Step 1: Write UseCase tests (happy / invalid / garbage)**

Create `apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingUseCaseTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Ping\Application\Commands\RecordPingUseCase;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use App\Modules\Ping\Domain\PingRepository;

class InMemoryPingRepository implements PingRepository
{
    public array $saved = [];
    public function save(Ping $ping): void { $this->saved[$ping->id] = $ping; }
    public function findById(string $id): ?Ping { return $this->saved[$id] ?? null; }
    public function recentForUser(int $userId, int $limit = 50): array
    { return array_values(array_filter($this->saved, fn ($p) => $p->userId === $userId)); }
}

it('records a ping for a user (happy)', function (): void {
    $repo = new InMemoryPingRepository();
    $useCase = new RecordPingUseCase($repo);

    $ping = $useCase->execute(userId: 7, note: new PingNote(['en' => 'hi']));

    expect($ping->userId)->toBe(7);
    expect($repo->saved)->toHaveCount(1);
    expect($repo->saved[$ping->id]->note->forLocale('en'))->toBe('hi');
});

it('rejects userId < 1 (invalid)', function (): void {
    $useCase = new RecordPingUseCase(new InMemoryPingRepository());
    expect(fn () => $useCase->execute(userId: 0, note: new PingNote(['en' => 'x'])))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects garbage userId types via PHP type system (garbage)', function (): void {
    $useCase = new RecordPingUseCase(new InMemoryPingRepository());
    expect(fn () => $useCase->execute(userId: 'not-an-int', note: new PingNote(['en' => 'x'])))
        ->toThrow(TypeError::class);
});
```

Run: `pnpm nx test backend -- --filter=RecordPingUseCaseTest`
Expected: 3 tests fail.

- [ ] **Step 2: Implement RecordPingCommand**

Create `apps/backend/app/Modules/Ping/Application/Commands/RecordPingCommand.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Commands;

use App\Cqrs\Command;
use App\Modules\Ping\Domain\PingPermission;
use Spatie\LaravelData\Data;

class RecordPingCommand extends Data implements Command
{
    /** @param array<string, string> $note */
    public function __construct(
        public int $userId,
        public array $note,
    ) {}

    public function permission(): PingPermission
    {
        return PingPermission::Create;
    }
}
```

- [ ] **Step 3: Implement RecordPingUseCase**

Create `apps/backend/app/Modules/Ping/Application/Commands/RecordPingUseCase.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Commands;

use App\Cqrs\CommandUseCase;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use App\Modules\Ping\Domain\PingRepository;
use DateTimeImmutable;
use Symfony\Component\Uid\Ulid;

class RecordPingUseCase implements CommandUseCase
{
    public function __construct(private PingRepository $repository) {}

    public function execute(int $userId, PingNote $note): Ping
    {
        $ping = new Ping(
            id: (string) new Ulid(),
            userId: $userId,
            note: $note,
            createdAt: new DateTimeImmutable(),
        );
        $this->repository->save($ping);
        return $ping;
    }
}
```

- [ ] **Step 4: Implement RecordPingHandler**

Create `apps/backend/app/Modules/Ping/Application/Commands/RecordPingHandler.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Commands;

use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;

class RecordPingHandler implements CommandHandler
{
    public function __construct(private RecordPingUseCase $useCase) {}

    public function handle(Command $command): Ping
    {
        /** @var RecordPingCommand $command */
        return $this->useCase->execute(
            userId: $command->userId,
            note: new PingNote($command->note),
        );
    }
}
```

- [ ] **Step 5: Write Handler test**

Create `apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingHandlerTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Ping\Application\Commands\RecordPingCommand;
use App\Modules\Ping\Application\Commands\RecordPingHandler;
use App\Modules\Ping\Application\Commands\RecordPingUseCase;
use App\Modules\Ping\Domain\PingRepository;

it('translates a Command into a UseCase call (happy)', function (): void {
    $repo = new InMemoryPingRepository(); // class declared in UseCase test file
    $handler = new RecordPingHandler(new RecordPingUseCase($repo));

    $cmd = new RecordPingCommand(userId: 3, note: ['en' => 'hi']);

    $ping = $handler->handle($cmd);
    expect($ping->userId)->toBe(3);
});
```

Run: `pnpm nx test backend -- --filter='RecordPing(UseCase|Handler)Test'`
Expected: 4 passing tests.

- [ ] **Step 6: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): Ping Application/Commands (Record)

RecordPingCommand declares permission() returning PingPermission::Create
so AuthorizeMiddleware can gate it. UseCase is framework-free; Handler is
a one-method bus adapter that calls UseCase. Tests cover happy/invalid/
garbage paths plus the Command→UseCase translation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Ping Application/Queries — ListPingsQuery + ListPingsHandler + ListPingsUseCase

**Files:**

- Create: `apps/backend/app/Modules/Ping/Application/Queries/ListPingsQuery.php`
- Create: `apps/backend/app/Modules/Ping/Application/Queries/ListPingsUseCase.php`
- Create: `apps/backend/app/Modules/Ping/Application/Queries/ListPingsHandler.php`
- Create: `apps/backend/tests/Unit/Modules/Ping/Application/Queries/ListPingsUseCaseTest.php`

- [ ] **Step 1: Write the test (happy / invalid / garbage)**

Create `apps/backend/tests/Unit/Modules/Ping/Application/Queries/ListPingsUseCaseTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Ping\Application\Queries\ListPingsUseCase;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use App\Modules\Ping\Domain\PingRepository;

beforeEach(function (): void {
    $this->repo = new class implements PingRepository {
        public array $store = [];
        public function save(Ping $p): void { $this->store[$p->id] = $p; }
        public function findById(string $id): ?Ping { return $this->store[$id] ?? null; }
        public function recentForUser(int $userId, int $limit = 50): array
        {
            return array_slice(
                array_values(array_filter($this->store, fn ($p) => $p->userId === $userId)),
                0,
                $limit,
            );
        }
    };
});

it('returns recent pings for a user (happy)', function (): void {
    $this->repo->save(new Ping('a', 1, new PingNote(['en' => 'one']),   new DateTimeImmutable()));
    $this->repo->save(new Ping('b', 1, new PingNote(['en' => 'two']),   new DateTimeImmutable()));
    $this->repo->save(new Ping('c', 2, new PingNote(['en' => 'three']), new DateTimeImmutable()));

    $useCase = new ListPingsUseCase($this->repo);
    $result = $useCase->execute(userId: 1, limit: 50);

    expect($result)->toHaveCount(2);
});

it('rejects negative limit (invalid)', function (): void {
    $useCase = new ListPingsUseCase($this->repo);
    expect(fn () => $useCase->execute(userId: 1, limit: -1))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects huge limit beyond ceiling (garbage)', function (): void {
    $useCase = new ListPingsUseCase($this->repo);
    expect(fn () => $useCase->execute(userId: 1, limit: 99999))
        ->toThrow(InvalidArgumentException::class);
});
```

Run: `pnpm nx test backend -- --filter=ListPingsUseCaseTest`
Expected: 3 tests fail.

- [ ] **Step 2: Implement ListPingsQuery**

Create `apps/backend/app/Modules/Ping/Application/Queries/ListPingsQuery.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Queries;

use App\Cqrs\Query;
use App\Modules\Ping\Domain\PingPermission;
use Spatie\LaravelData\Data;

class ListPingsQuery extends Data implements Query
{
    public function __construct(
        public int $userId,
        public int $limit = 50,
    ) {}

    public function permission(): PingPermission
    {
        return PingPermission::View;
    }
}
```

- [ ] **Step 3: Implement ListPingsUseCase**

Create `apps/backend/app/Modules/Ping/Application/Queries/ListPingsUseCase.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Queries;

use App\Cqrs\QueryUseCase;
use App\Modules\Ping\Domain\PingRepository;
use InvalidArgumentException;

class ListPingsUseCase implements QueryUseCase
{
    private const MAX_LIMIT = 500;

    public function __construct(private PingRepository $repository) {}

    /** @return array<int, \App\Modules\Ping\Domain\Ping> */
    public function execute(int $userId, int $limit = 50): array
    {
        if ($limit < 1) {
            throw new InvalidArgumentException('limit must be >= 1');
        }
        if ($limit > self::MAX_LIMIT) {
            throw new InvalidArgumentException('limit exceeds MAX_LIMIT='.self::MAX_LIMIT);
        }
        return $this->repository->recentForUser($userId, $limit);
    }
}
```

- [ ] **Step 4: Implement ListPingsHandler**

Create `apps/backend/app/Modules/Ping/Application/Queries/ListPingsHandler.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Queries;

use App\Cqrs\Query;
use App\Cqrs\QueryHandler;

class ListPingsHandler implements QueryHandler
{
    public function __construct(private ListPingsUseCase $useCase) {}

    public function handle(Query $query): array
    {
        /** @var ListPingsQuery $query */
        return $this->useCase->execute(userId: $query->userId, limit: $query->limit);
    }
}
```

- [ ] **Step 5: Verify tests pass**

Run: `pnpm nx test backend -- --filter=ListPingsUseCaseTest`
Expected: 3 passing tests.

- [ ] **Step 6: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): Ping Application/Queries (List)

ListPingsQuery declares permission() = PingPermission::View. UseCase
caps limit at MAX_LIMIT=500 to avoid unbounded reads.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Ping Infrastructure — migration, model, factory, repository

**Files:**

- Create: `apps/backend/database/migrations/2026_05_05_120000_create_pings_table.php`
- Create: `apps/backend/app/Modules/Ping/Infrastructure/PingModel.php`
- Create: `apps/backend/database/factories/PingFactory.php`
- Create: `apps/backend/app/Modules/Ping/Infrastructure/EloquentPingRepository.php`
- Create: `apps/backend/app/Modules/Ping/Infrastructure/PingServiceProvider.php`
- Modify: `apps/backend/bootstrap/providers.php`
- Create: `apps/backend/tests/Feature/Modules/Ping/EloquentPingRepositoryTest.php`

- [ ] **Step 1: Author the migration**

Create `apps/backend/database/migrations/2026_05_05_120000_create_pings_table.php`:

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('pings', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->jsonb('note'); // translatable map: { "en": "...", "pt": "..." }
            $table->timestampTz('created_at');
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pings');
    }
};
```

Run the migration:

```bash
pnpm nx migrate backend
```

- [ ] **Step 2: Author PingModel**

Create `apps/backend/app/Modules/Ping/Infrastructure/PingModel.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Infrastructure;

use Database\Factories\PingFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Laravel\Scout\Searchable;
use Spatie\Translatable\HasTranslations;

class PingModel extends Model
{
    use HasFactory, HasTranslations, HasUlids, Searchable;

    public const UPDATED_AT = null; // pings are append-only
    protected $table = 'pings';
    protected $fillable = ['id', 'user_id', 'note', 'created_at'];
    protected $casts = ['created_at' => 'immutable_datetime'];

    public array $translatable = ['note'];

    public function toSearchableArray(): array
    {
        return [
            'id'      => (string) $this->id,
            'user_id' => $this->user_id,
            'note_en' => $this->getTranslation('note', 'en', false),
            'note_pt' => $this->getTranslation('note', 'pt', false),
        ];
    }

    protected static function newFactory(): PingFactory
    {
        return PingFactory::new();
    }
}
```

- [ ] **Step 3: Author PingFactory**

Create `apps/backend/database/factories/PingFactory.php`:

```php
<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\User;
use App\Modules\Ping\Infrastructure\PingModel;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<PingModel> */
class PingFactory extends Factory
{
    protected $model = PingModel::class;

    public function definition(): array
    {
        return [
            'user_id'    => User::factory(),
            'note'       => ['en' => $this->faker->sentence(), 'pt' => $this->faker->sentence()],
            'created_at' => now(),
        ];
    }
}
```

- [ ] **Step 4: Author EloquentPingRepository (with TDD)**

Create `apps/backend/tests/Feature/Modules/Ping/EloquentPingRepositoryTest.php`:

```php
<?php

declare(strict_types=1);

use App\Models\User;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use App\Modules\Ping\Infrastructure\EloquentPingRepository;
use App\Modules\Ping\Infrastructure\PingModel;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('persists and retrieves a ping (happy)', function (): void {
    $user = User::factory()->create();
    $repo = new EloquentPingRepository();

    $ping = new Ping(
        id: '01HABCD',
        userId: $user->id,
        note: new PingNote(['en' => 'hello', 'pt' => 'olá']),
        createdAt: new DateTimeImmutable('2026-05-05T12:00:00Z'),
    );
    $repo->save($ping);

    $found = $repo->findById('01HABCD');
    expect($found)->not->toBeNull();
    expect($found->note->forLocale('pt'))->toBe('olá');
});

it('returns null for unknown id (invalid)', function (): void {
    $repo = new EloquentPingRepository();
    expect($repo->findById('does-not-exist'))->toBeNull();
});

it('lists recent pings ordered desc by created_at (happy)', function (): void {
    $user = User::factory()->create();
    PingModel::factory()->count(3)->create(['user_id' => $user->id]);

    $repo = new EloquentPingRepository();
    $list = $repo->recentForUser($user->id, 50);

    expect($list)->toHaveCount(3);
    foreach ($list as $p) {
        expect($p)->toBeInstanceOf(Ping::class);
    }
});
```

Run: `pnpm nx test backend -- --filter=EloquentPingRepositoryTest`
Expected: 3 tests fail (class not found).

Create `apps/backend/app/Modules/Ping/Infrastructure/EloquentPingRepository.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Infrastructure;

use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use App\Modules\Ping\Domain\PingRepository;

class EloquentPingRepository implements PingRepository
{
    public function save(Ping $ping): void
    {
        PingModel::query()->updateOrCreate(
            ['id' => $ping->id],
            [
                'user_id'    => $ping->userId,
                'note'       => $ping->note->translations,
                'created_at' => $ping->createdAt,
            ],
        );
    }

    public function findById(string $id): ?Ping
    {
        $row = PingModel::query()->find($id);
        return $row ? $this->toDomain($row) : null;
    }

    public function recentForUser(int $userId, int $limit = 50): array
    {
        return PingModel::query()
            ->where('user_id', $userId)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->map(fn (PingModel $m) => $this->toDomain($m))
            ->all();
    }

    private function toDomain(PingModel $row): Ping
    {
        return new Ping(
            id: (string) $row->id,
            userId: (int) $row->user_id,
            note: new PingNote($row->getTranslations('note')),
            createdAt: \DateTimeImmutable::createFromInterface($row->created_at),
        );
    }
}
```

- [ ] **Step 5: Bind PingRepository in a module service provider**

Create `apps/backend/app/Modules/Ping/Infrastructure/PingServiceProvider.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Infrastructure;

use App\Cqrs\Bus\HandlerRegistry;
use App\Modules\Ping\Application\Commands\RecordPingCommand;
use App\Modules\Ping\Application\Commands\RecordPingHandler;
use App\Modules\Ping\Application\Queries\ListPingsHandler;
use App\Modules\Ping\Application\Queries\ListPingsQuery;
use App\Modules\Ping\Domain\PingRepository;
use Illuminate\Support\ServiceProvider;

class PingServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(PingRepository::class, EloquentPingRepository::class);
    }

    public function boot(HandlerRegistry $registry): void
    {
        $registry->register(RecordPingCommand::class, RecordPingHandler::class);
        $registry->register(ListPingsQuery::class, ListPingsHandler::class);
    }
}
```

Register in `apps/backend/bootstrap/providers.php`:

```php
return [
    App\Providers\AppServiceProvider::class,
    App\Providers\BusServiceProvider::class,
    App\Providers\SocialiteStubServiceProvider::class,
    App\Modules\Ping\Infrastructure\PingServiceProvider::class,
];
```

- [ ] **Step 6: Verify tests pass**

Run: `pnpm nx test backend -- --filter=EloquentPingRepositoryTest`
Expected: 3 passing tests.

- [ ] **Step 7: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): Ping Infrastructure (model, factory, repository, migration)

Pings table uses ULID primary keys, jsonb note column for translatable
content, and append-only semantics (no updated_at). PingServiceProvider
binds PingRepository → EloquentPingRepository and registers the two
handlers in the CQRS HandlerRegistry.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Ping Presentation/Http — controller, routes, Scramble, Precognition validation

**Files:**

- Create: `apps/backend/app/Modules/Ping/Presentation/Http/PingController.php`
- Create: `apps/backend/app/Modules/Ping/Presentation/Http/Requests/RecordPingRequest.php`
- Create: `apps/backend/app/Modules/Ping/Presentation/Http/routes.php`
- Modify: `apps/backend/routes/api.php` (load module routes)
- Create: `apps/backend/tests/Feature/Modules/Ping/PingControllerTest.php`

- [ ] **Step 1: Write the controller test (happy / invalid / garbage)**

Create `apps/backend/tests/Feature/Modules/Ping/PingControllerTest.php`:

```php
<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use App\Modules\Ping\Domain\PingPermission;
use App\Modules\Ping\Infrastructure\PingModel;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    (new PermissionsSeeder([
        \App\Modules\Ping\Domain\PingPermission::class,
    ]))->run();

    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web'])
        ->givePermissionTo(
            Permission::findByName(PingPermission::View->value),
            Permission::findByName(PingPermission::Create->value),
        );
});

function authenticatedAs(): array
{
    $user = User::factory()->create();
    $user->assignRole(Role::Member->value);
    $token = $user->createToken('test')->accessToken;
    return [$user, $token];
}

it('records a ping with a valid payload (happy)', function (): void {
    [$user, $token] = authenticatedAs();

    $response = $this
        ->withToken($token)
        ->postJson('/api/ping', ['note' => ['en' => 'hello', 'pt' => 'olá']]);

    $response->assertCreated();
    $response->assertJsonStructure(['id', 'note' => ['en', 'pt'], 'created_at']);

    expect(PingModel::count())->toBe(1);
});

it('rejects an empty body (invalid)', function (): void {
    [$user, $token] = authenticatedAs();

    $this->withToken($token)
        ->postJson('/api/ping', [])
        ->assertStatus(422);
});

it('rejects garbage payloads (garbage)', function (): void {
    [$user, $token] = authenticatedAs();

    $this->withToken($token)
        ->postJson('/api/ping', ['note' => 'not-an-array'])
        ->assertStatus(422);
});

it('lists pings for the authenticated user (happy)', function (): void {
    [$user, $token] = authenticatedAs();
    PingModel::factory()->count(2)->create(['user_id' => $user->id]);

    $response = $this->withToken($token)->getJson('/api/ping');

    $response->assertOk();
    expect($response->json())->toHaveCount(2);
});

it('rejects unauthenticated requests (invalid)', function (): void {
    $this->getJson('/api/ping')->assertStatus(401);
});
```

Run: `pnpm nx test backend -- --filter=PingControllerTest`
Expected: 5 tests fail.

- [ ] **Step 2: Author RecordPingRequest with Precognition validation**

Create `apps/backend/app/Modules/Ping/Presentation/Http/Requests/RecordPingRequest.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RecordPingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'note'      => ['required', 'array', 'min:1'],
            'note.*'    => ['required', 'string', 'min:1', 'max:500'],
        ];
    }
}
```

- [ ] **Step 3: Author PingController**

Create `apps/backend/app/Modules/Ping/Presentation/Http/PingController.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Presentation\Http;

use App\Cqrs\Bus\CommandBus;
use App\Cqrs\Bus\QueryBus;
use App\Modules\Ping\Application\Commands\RecordPingCommand;
use App\Modules\Ping\Application\Queries\ListPingsQuery;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Presentation\Http\Requests\RecordPingRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PingController
{
    public function __construct(
        private CommandBus $commandBus,
        private QueryBus $queryBus,
    ) {}

    /**
     * List recent pings for the authenticated user.
     *
     * @response array{0: array{id: string, note: array<string, string>, created_at: string}}
     */
    public function index(Request $request): JsonResponse
    {
        $pings = $this->queryBus->dispatch(new ListPingsQuery(
            userId: $request->user()->id,
            limit: 50,
        ));

        return response()->json(
            collect($pings)->map(fn (Ping $p) => [
                'id'         => $p->id,
                'note'       => $p->note->translations,
                'created_at' => $p->createdAt->format(DATE_ATOM),
            ])->all(),
        );
    }

    /**
     * Record a new ping.
     *
     * @bodyParam note object required Translatable note map (locale → text). Example: {"en":"hello","pt":"olá"}
     */
    public function store(RecordPingRequest $request): JsonResponse
    {
        $ping = $this->commandBus->dispatch(new RecordPingCommand(
            userId: $request->user()->id,
            note: $request->validated('note'),
        ));

        return response()->json([
            'id'         => $ping->id,
            'note'       => $ping->note->translations,
            'created_at' => $ping->createdAt->format(DATE_ATOM),
        ], 201);
    }
}
```

- [ ] **Step 4: Author module routes**

Create `apps/backend/app/Modules/Ping/Presentation/Http/routes.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Ping\Presentation\Http\PingController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:api')->prefix('ping')->group(function () {
    Route::get('/',  [PingController::class, 'index'])->name('api.ping.index');
    Route::post('/', [PingController::class, 'store'])->name('api.ping.store');
});
```

In `apps/backend/routes/api.php`, append:

```php
require app_path('Modules/Ping/Presentation/Http/routes.php');
```

- [ ] **Step 5: Verify tests pass**

Run: `pnpm nx test backend -- --filter=PingControllerTest`
Expected: 5 passing tests.

- [ ] **Step 6: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): Ping Presentation/Http — controller, routes, validation

POST /api/ping records via CommandBus; GET /api/ping lists via QueryBus.
Both authenticated by Passport (auth:api). RecordPingRequest enforces
note shape; AuthorizeMiddleware enforces ping.create / ping.view
permissions via the Command/Query.permission() methods.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: Ping Filament resource (admin CRUD)

**Files:**

- Create: `apps/backend/app/Modules/Ping/Presentation/Filament/PingResource.php`
- Create: `apps/backend/app/Modules/Ping/Presentation/Filament/Pages/ListPings.php`
- Modify: `apps/backend/app/Providers/Filament/AdminPanelProvider.php` (auto-discover module resources)
- Create: `apps/backend/tests/Feature/Modules/Ping/Filament/PingResourceTest.php`

- [ ] **Step 1: Author PingResource**

Create `apps/backend/app/Modules/Ping/Presentation/Filament/PingResource.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Presentation\Filament;

use App\Modules\Ping\Domain\PingPermission;
use App\Modules\Ping\Infrastructure\PingModel;
use Filament\Forms\Components\KeyValue;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class PingResource extends Resource
{
    protected static ?string $model = PingModel::class;
    protected static ?string $navigationIcon = 'heroicon-o-bell';
    protected static ?string $navigationGroup = 'Modules';

    public static function form(Form $form): Form
    {
        return $form->schema([
            KeyValue::make('note')
                ->keyLabel(__('ping.note.locale_label'))
                ->valueLabel(__('ping.note.value_label'))
                ->required(),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('id')->limit(8)->toggleable(),
                TextColumn::make('user.email')->label(__('ping.fields.user'))->sortable(),
                TextColumn::make('note.en')->label(__('ping.fields.note_en'))->limit(60),
                TextColumn::make('created_at')->dateTime()->sortable(),
            ])
            ->defaultSort('created_at', 'desc');
    }

    public static function canViewAny(): bool
    {
        return auth()->user()?->can(PingPermission::View->value) ?? false;
    }

    public static function canCreate(): bool
    {
        return auth()->user()?->can(PingPermission::Create->value) ?? false;
    }

    public static function getEloquentQuery(): Builder
    {
        return parent::getEloquentQuery();
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListPings::route('/'),
        ];
    }
}
```

Create `apps/backend/app/Modules/Ping/Presentation/Filament/Pages/ListPings.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Presentation\Filament\Pages;

use App\Modules\Ping\Presentation\Filament\PingResource;
use Filament\Resources\Pages\ListRecords;

class ListPings extends ListRecords
{
    protected static string $resource = PingResource::class;
}
```

- [ ] **Step 2: Add lang strings**

Create `apps/backend/lang/en/ping.php`:

```php
<?php

declare(strict_types=1);

return [
    'note' => [
        'locale_label' => 'Locale',
        'value_label'  => 'Note',
    ],
    'fields' => [
        'user'    => 'User',
        'note_en' => 'Note (en)',
    ],
];
```

Create `apps/backend/lang/pt/ping.php`:

```php
<?php

declare(strict_types=1);

return [
    'note' => [
        'locale_label' => 'Idioma',
        'value_label'  => 'Nota',
    ],
    'fields' => [
        'user'    => 'Usuário',
        'note_en' => 'Nota (en)',
    ],
];
```

- [ ] **Step 3: Auto-discover module resources from AdminPanelProvider**

In `apps/backend/app/Providers/Filament/AdminPanelProvider.php`, ensure the panel discovery includes module resources. Add:

```php
->discoverResources(in: app_path('Modules'), for: 'App\\Modules')
```

(in addition to the default discovery for `app/Filament`).

- [ ] **Step 4: Smoke-test the resource is registered + admin can list**

Create `apps/backend/tests/Feature/Modules/Ping/Filament/PingResourceTest.php`:

```php
<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use App\Modules\Ping\Domain\PingPermission;
use App\Modules\Ping\Infrastructure\PingModel;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    (new PermissionsSeeder([PingPermission::class]))->run();
    RoleModel::firstOrCreate(['name' => Role::Admin->value, 'guard_name' => 'web'])
        ->givePermissionTo(Permission::all());
});

it('renders the Ping list page for an admin (happy)', function (): void {
    $admin = User::factory()->create();
    $admin->assignRole(Role::Admin->value);
    PingModel::factory()->count(2)->create(['user_id' => $admin->id]);

    $this->actingAs($admin)
        ->get('/admin/pings')
        ->assertSuccessful();
});
```

Run: `pnpm nx test backend -- --filter=PingResourceTest`
Expected: 1 passing test.

- [ ] **Step 5: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
feat(backend): PingResource Filament admin (list + create)

Resource gates canViewAny / canCreate via PingPermission enum cases. The
KeyValue field edits the translatable note map; locale labels load from
lang/{en,pt}/ping.php (no hardcoded user-facing strings, per CLAUDE.md
rule #5).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: Socialite-stub → Passport-token end-to-end Pest feature test

**Files:**

- Create: `apps/backend/tests/Feature/Auth/SocialiteStubToPingFlowTest.php`

This test exercises the full happy-path flow that the gate requires:
login via stub → mint Passport token → POST /api/ping → GET /api/ping.

- [ ] **Step 1: Author the integration test**

Create `apps/backend/tests/Feature/Auth/SocialiteStubToPingFlowTest.php`:

```php
<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use App\Modules\Ping\Domain\PingPermission;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    (new PermissionsSeeder([PingPermission::class]))->run();
    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web'])
        ->givePermissionTo(
            Permission::findByName(PingPermission::View->value),
            Permission::findByName(PingPermission::Create->value),
        );
});

it('flows: stub login → mint token → POST /api/ping → GET /api/ping (happy)', function (): void {
    // 1. Stub login mints a Passport token
    $login = $this->getJson('/auth/socialite/stub/callback?identity=member@local')->json();
    expect($login['access_token'])->toBeString();

    $user = User::query()->where('email', 'member@local')->firstOrFail();
    $user->assignRole(Role::Member->value);

    $token = $login['access_token'];

    // 2. POST a ping
    $created = $this->withToken($token)
        ->postJson('/api/ping', ['note' => ['en' => 'flow', 'pt' => 'fluxo']])
        ->assertCreated()
        ->json();

    // 3. GET pings — the new one shows up
    $list = $this->withToken($token)->getJson('/api/ping')->assertOk()->json();

    expect($list)->toHaveCount(1);
    expect($list[0]['id'])->toBe($created['id']);
    expect($list[0]['note']['en'])->toBe('flow');
});
```

Run: `pnpm nx test backend -- --filter=SocialiteStubToPingFlowTest`
Expected: 1 passing test.

- [ ] **Step 2: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend/tests/Feature/Auth/SocialiteStubToPingFlowTest.php
git commit -m "$(cat <<'EOF'
test(backend): end-to-end Socialite-stub → Passport-token → Ping flow

Single Pest test asserts the Phase 2 gate's runtime behavior: stub login
mints a token; the token authenticates POST and GET /api/ping; the
created ping is round-tripped through the bus, repository, and HTTP
layer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: PHPStan/Larastan level 8 + custom raw-permission-string rule

**Files:**

- Modify: `apps/backend/composer.json` + `composer.lock`
- Create: `apps/backend/phpstan.neon`
- Create: `apps/backend/phpstan-rules/PreventRawPermissionStrings.php`
- Modify: `apps/backend/project.json` (add `analyze` target)
- Create: `apps/backend/tests/Static/PreventRawPermissionStringsRuleTest.php`

- [ ] **Step 1: Install PHPStan + Larastan**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require --dev "phpstan/phpstan:^2.0" "larastan/larastan:^3.0"
```

- [ ] **Step 2: Author phpstan.neon**

Create `apps/backend/phpstan.neon`:

```neon
includes:
  - vendor/larastan/larastan/extension.neon

parameters:
  paths:
    - app
    - database
    - tests

  level: 8

  ignoreErrors:
    # Spatie Data magic property access in handlers — accept inline
    - '#Property [^ ]+RecordPingCommand::\$(userId|note) might not be defined#'

  excludePaths:
    - tests/Feature/Modules/Ping/Filament/*  # Filament generates dynamic property access

services:
  - class: App\Static\PreventRawPermissionStrings
    tags:
      - phpstan.rules.rule
```

- [ ] **Step 3: Author the custom rule**

Create `apps/backend/phpstan-rules/PreventRawPermissionStrings.php`:

```php
<?php

declare(strict_types=1);

namespace App\Static;

use PhpParser\Node;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Scalar\String_;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;

/**
 * Forbids raw string arguments to Gate::allows / Gate::denies / etc.
 * Any argument must be either a Permission enum case (resolves to BackedEnum->value)
 * or a property access on such an enum.
 *
 * @implements Rule<Node\Expr>
 */
class PreventRawPermissionStrings implements Rule
{
    private const GATE_METHODS = ['allows', 'denies', 'check', 'authorize', 'forUser'];

    public function getNodeType(): string
    {
        return Node\Expr::class;
    }

    public function processNode(Node $node, Scope $scope): array
    {
        if (! ($node instanceof StaticCall) && ! ($node instanceof MethodCall)) {
            return [];
        }

        $methodName = $node->name->toString();
        if (! in_array($methodName, self::GATE_METHODS, true)) {
            return [];
        }

        $callee = $node instanceof StaticCall ? $node->class : $node->var;
        $calleeType = $node instanceof StaticCall
            ? $callee->toString()
            : (string) $scope->getType($callee)->describe(\PHPStan\Type\VerbosityLevel::value());

        if (! str_contains($calleeType, 'Gate')) {
            return [];
        }

        if (! isset($node->args[0])) {
            return [];
        }
        $arg = $node->args[0]->value;
        if ($arg instanceof String_) {
            return [
                RuleErrorBuilder::message(sprintf(
                    'Raw permission string "%s" passed to %s::%s — use a BackedEnum implementing App\\Authorization\\Contracts\\Permission instead.',
                    $arg->value,
                    $calleeType,
                    $methodName,
                ))->identifier('azimuth.rawPermissionString')->build(),
            ];
        }

        return [];
    }
}
```

Wire the autoload for `phpstan-rules/`. In `apps/backend/composer.json`, add to `autoload-dev`:

```json
"autoload-dev": {
    "psr-4": {
        "Tests\\": "tests/",
        "App\\Static\\": "phpstan-rules/"
    }
}
```

Run: `composer dump-autoload` inside the container.

- [ ] **Step 4: Add `analyze` Nx target**

In `apps/backend/project.json`, add:

```json
"analyze": {
    "executor": "nx:run-commands",
    "options": {
        "command": "docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/phpstan analyze --memory-limit=2G",
        "cwd": "{workspaceRoot}"
    }
}
```

- [ ] **Step 5: Run analyze; resolve violations**

Run: `pnpm nx analyze backend`

Expected: PHPStan reports level-8 errors. Fix each:

- Add return types to seeders/migrations where missing.
- Add `@param` PHPDoc where types are mixed.
- Cast `array_values()` returns to typed arrays where Spatie Data type inference is loose.

Iterate until: `[OK] No errors`.

- [ ] **Step 6: Smoke-test the custom rule**

Add a test fixture file at `apps/backend/tests/Static/RawPermissionFixture.php`:

```php
<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Gate;

// This file is read by the rule-test only; it is not autoloaded.
function fixture_raw_permission(): void
{
    Gate::allows('ping.view'); // <-- should be flagged
}
```

Create `apps/backend/tests/Static/PreventRawPermissionStringsRuleTest.php`:

```php
<?php

declare(strict_types=1);

use PHPStan\Testing\RuleTestCase;
use App\Static\PreventRawPermissionStrings;

/** @extends RuleTestCase<PreventRawPermissionStrings> */
class PreventRawPermissionStringsRuleTest extends RuleTestCase
{
    protected function getRule(): \PHPStan\Rules\Rule
    {
        return new PreventRawPermissionStrings();
    }

    public function test_flags_raw_permission_string(): void
    {
        $this->analyse(
            [__DIR__ . '/RawPermissionFixture.php'],
            [['Raw permission string "ping.view" passed to', 11]],
        );
    }
}
```

`PHPStan\Testing\RuleTestCase` ships with `phpstan/phpstan` itself; no extra package is needed.

Run: `pnpm nx test backend -- --filter=PreventRawPermissionStringsRuleTest`
Expected: 1 passing test.

- [ ] **Step 7: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
ci(backend): PHPStan/Larastan level 8 + custom rule forbidding raw permission strings

The custom rule (App\Static\PreventRawPermissionStrings) flags any raw
string argument passed to Gate::allows/denies/check/authorize/forUser.
This enforces decision #5 mechanically: every authorization call site
must pass a BackedEnum implementing Permission.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 24: Deptrac four-layer ruleset

**Files:**

- Modify: `apps/backend/composer.json` + `composer.lock`
- Create: `apps/backend/deptrac.yaml`
- Modify: `apps/backend/project.json` (add `deptrac` target)

- [ ] **Step 1: Install Deptrac**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require --dev qossmic/deptrac
```

- [ ] **Step 2: Author deptrac.yaml**

Create `apps/backend/deptrac.yaml`:

```yaml
parameters:
  paths:
    - ./app

  layers:
    - name: Domain
      collectors:
        - { type: directory, regex: app/Modules/.*/Domain/.* }
    - name: Application
      collectors:
        - { type: directory, regex: app/Modules/.*/Application/.* }
        - { type: directory, regex: app/Cqrs/.* }
    - name: Infrastructure
      collectors:
        - { type: directory, regex: app/Modules/.*/Infrastructure/.* }
    - name: Presentation
      collectors:
        - { type: directory, regex: app/Modules/.*/Presentation/.* }
    - name: Framework
      collectors:
        - { type: bool, must: [{ type: classLike, regex: ^Illuminate\\.* }] }
        - { type: bool, must: [{ type: classLike, regex: ^Filament\\.* }] }
        - { type: bool, must: [{ type: classLike, regex: ^Laravel\\.* }] }
        - { type: bool, must: [{ type: classLike, regex: ^Spatie\\.* }] }

  ruleset:
    Domain: [] # Domain depends on nothing
    Application: [Domain] # Application depends on Domain only
    Infrastructure: [Domain, Application, Framework] # Infra can use everything below + framework
    Presentation: [Application, Framework] # Presentation depends on Application, framework

  formatters:
    table:
      report_fresh_violations: true
```

- [ ] **Step 3: Add `deptrac` Nx target**

In `apps/backend/project.json`:

```json
"deptrac": {
    "executor": "nx:run-commands",
    "options": {
        "command": "docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/deptrac analyse --no-progress --report-uncovered",
        "cwd": "{workspaceRoot}"
    }
}
```

- [ ] **Step 4: Run and resolve violations**

Run: `pnpm nx deptrac backend`
Expected: Either "0 violations" OR a list of violations to fix. Common fixes:

- A Domain class importing `Illuminate\Database\Eloquent\Model` → move to Infrastructure.
- A UseCase importing a Filament class → move dependency to Presentation.

Iterate until clean.

- [ ] **Step 5: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
ci(backend): Deptrac four-layer ruleset

Domain → no framework. Application → Domain only. Infrastructure →
everything below + framework. Presentation → Application + framework.
Enforces SOLID layering (CLAUDE.md hard rule #2) at CI time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 25: Extend CI with `test-backend` job

**Files:**

- Create: `infra/docker-compose.ci.yml` (lean compose for CI)
- Modify: `.github/workflows/ci.yml` (add test-backend job)

- [ ] **Step 1: Author the CI compose**

Create `infra/docker-compose.ci.yml`:

```yaml
name: azimuth-ci

services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: azimuth
      POSTGRES_USER: azimuth
      POSTGRES_PASSWORD: azimuth
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U azimuth -d azimuth']
      interval: 5s
      timeout: 3s
      retries: 12

  dragonfly:
    image: docker.dragonflydb.io/dragonflydb/dragonfly:latest
    command: ['--logtostderr', '--cluster_mode=emulated']
    ulimits:
      memlock: -1
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 12

  typesense:
    image: typesense/typesense:29.1
    command: ['--data-dir=/data', '--api-key=ci', '--enable-cors']

  backend:
    build:
      context: ..
      dockerfile: infra/docker/frankenphp.Dockerfile
    depends_on:
      postgres: { condition: service_healthy }
      dragonfly: { condition: service_healthy }
    environment:
      APP_ENV: testing
      APP_KEY: base64:CIaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=
      DB_CONNECTION: pgsql
      DB_HOST: postgres
      DB_PORT: 5432
      DB_DATABASE: azimuth
      DB_USERNAME: azimuth
      DB_PASSWORD: azimuth
      REDIS_HOST: dragonfly
      REDIS_PORT: 6379
      QUEUE_CONNECTION: sync
      MAIL_MAILER: array
      SCOUT_DRIVER: typesense
      TYPESENSE_API_KEY: ci
      TYPESENSE_HOST: typesense
      TYPESENSE_PORT: 8108
      TYPESENSE_PROTOCOL: http
    healthcheck:
      disable: true
```

- [ ] **Step 2: Extend the CI workflow**

In `.github/workflows/ci.yml`, append a new job:

```yaml
test-backend:
  runs-on: ubuntu-latest
  needs: lint-and-typecheck
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22 }
    - run: corepack enable
    - name: Boot CI stack
      run: docker compose -f infra/docker-compose.ci.yml up -d --wait
    - name: Composer install
      run: docker compose -f infra/docker-compose.ci.yml exec -T backend composer install --no-interaction --prefer-dist --optimize-autoloader
    - name: Run migrations
      run: docker compose -f infra/docker-compose.ci.yml exec -T backend php artisan migrate --force
    - name: Pest
      run: docker compose -f infra/docker-compose.ci.yml exec -T backend ./vendor/bin/pest --parallel
    - name: PHPStan
      run: docker compose -f infra/docker-compose.ci.yml exec -T backend ./vendor/bin/phpstan analyze --memory-limit=2G
    - name: Deptrac
      run: docker compose -f infra/docker-compose.ci.yml exec -T backend ./vendor/bin/deptrac analyse --no-progress --report-uncovered
```

- [ ] **Step 3: Commit and push to verify CI runs green**

```bash
git add infra/docker-compose.ci.yml .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: add test-backend job (Pest + PHPStan + Deptrac)

infra/docker-compose.ci.yml is a lean compose used only by CI: postgres
+ dragonfly + typesense + backend. Runs migrations, then test/analyze/
deptrac. Existing lint-and-typecheck job stays as the gate before this
heavier job runs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

Watch the GitHub Actions run; if it fails, capture the failure mode in the commit message of the fix.

---

## Task 26: Architecture docs + ADRs 0002, 0003, 0004, 0005, 0007

**Files:**

- Create: `docs/architecture/cqrs.md`
- Create: `docs/architecture/auth.md`
- Create: `docs/architecture/data-stores.md`
- Create: `docs/adr/0002-cqrs-three-layer.md`
- Create: `docs/adr/0003-permission-marker-interface.md`
- Create: `docs/adr/0004-stub-socialite-per-request-fixture.md`
- Create: `docs/adr/0005-filament-for-admin.md`
- Create: `docs/adr/0007-bus-middleware-order.md`

(ADR 0006 is reserved for Phase 3 frontend per spec §10.)

- [ ] **Step 1: Author `docs/architecture/cqrs.md` against this section checklist**

The doc MUST contain these sections, in this order, with the content described:

1. **Why CQRS here.** State the problem: writes carry intent and require auditing; reads have different scaling/caching needs. The three-layer split (Command/Query → Handler → UseCase) keeps bus-adapter concerns out of pure logic.
2. **The six contracts.** For each of `Command`, `Query`, `CommandHandler`, `QueryHandler`, `CommandUseCase`, `QueryUseCase`: signature (link to `app/Cqrs/<File>.php`), one-sentence purpose, and which layer it lives in.
3. **The buses.** `CommandBus` interface + `LaravelCommandBus` impl + `QueryBus` + `LaravelQueryBus`. Show the `dispatch()` signature for each. Document `HandlerRegistry::register()` and how module `ServiceProvider::boot()` calls it (link to `PingServiceProvider` as an example).
4. **The middleware pipeline.** Table of the five middleware in order: `Logging → Metrics → Authorize → Validate → Transaction`. Per row: file path, what it does, what it requires of the message (e.g., `permission()`, `rules()`). Note that QueryBus skips `Transaction`.
5. **Why Authorize before Validate.** Two-paragraph defense per decision #6: don't reveal schema knowledge to unauthorized callers; defense-in-depth; link to the decision-log spec.
6. **Adding a new command end-to-end (worked example: `RecordPing`).** Walk the seven file changes a developer makes: `*Command.php` (extends Data, implements Command, declares `permission()`), `*UseCase.php` (framework-free), `*Handler.php` (calls UseCase), register handler in module ServiceProvider, write the three Pest tests (happy/invalid/garbage), wire HTTP route, run `pnpm nx test backend`. Use the actual file paths from Tasks 17 and 20.
7. **Adding a new query.** Same shape, abbreviated; reference the `ListPings` files from Task 18.
8. **Module ServiceProvider conventions.** State the rule: every module under `app/Modules/<Bounded>/Infrastructure/<Bounded>ServiceProvider.php` registers its repository binding and its handler registrations; gets listed in `bootstrap/providers.php`.
9. **Testing patterns.** UseCase tests use in-memory repository fixtures (no DB); Handler tests reuse those; Controller tests use `RefreshDatabase` + Passport tokens. Reference `EloquentPingRepositoryTest` and `PingControllerTest`.
10. **References.** Links to: `docs/superpowers/specs/2026-05-02-azimuth-scaffold-design.md` §5, the decision-log spec, ADR 0002, ADR 0007.

- [ ] **Step 2: Author `docs/architecture/auth.md` against this section checklist**

Required sections:

1. **Overview.** One paragraph: Passport for access tokens; Socialite for IdP-shaped login; Spatie laravel-permission for roles/permissions; Filament/Horizon panels gated by role; Permission marker interface forbids raw strings.
2. **Passport configuration.** Token expirations (15d/30d/6mo per Task 6 step 4); key persistence via the `passport-keys` named volume; idempotent provisioning in entrypoint.
3. **The stub Socialite driver.** Decision #7 explained: per-request `?identity=<email>` fixture, default `stub-user@azimuth.local`. File paths: `app/Authentication/Socialite/StubProvider.php`, `SocialiteStubServiceProvider`, controller, routes. Walk the redirect → callback → token mint flow.
4. **Adding a real OAuth provider (future).** Steps to add e.g. Google: `composer require socialiteproviders/google`, register, add `services.google` config, add routes that copy the stub controller's pattern.
5. **Permissions and roles.** Decision #5: marker interface `App\Authorization\Contracts\Permission`. Every module declares a `<Module>Permission` enum. The `PermissionsSeeder` reflects across enums under `app/Modules` and reconciles. Spatie's tables: `permissions`, `roles`, `model_has_*`. The `Role` enum is in `app/Authorization/Roles/Role.php`.
6. **Authorization in practice.** Three call-sites: (a) bus dispatch — `AuthorizeMiddleware` calls `Gate::authorize($message->permission()->value)`; (b) Filament resources — `canViewAny` / `canCreate` use `auth()->user()?->can(<Permission>::<Case>->value)`; (c) Horizon — gate calls `$user->hasRole(Role::Admin->value)`. The PHPStan rule (Task 23) forbids raw strings in any `Gate::*` call.
7. **Filament admin gate.** `User implements FilamentUser`; `canAccessPanel(Panel)` checks `Role::Admin`.
8. **Horizon gate.** `Gate::define('viewHorizon', …)` checks `Role::Admin`.
9. **References.** Links to: ADR 0003, ADR 0004, decision-log spec §3 rows 5 and 7.

- [ ] **Step 3: Author `docs/architecture/data-stores.md` against this section checklist**

Required sections — one subsection per data store:

1. **Postgres + PostGIS.** Image: `postgis/postgis:16-3.4`. Container: `azimuth-postgres`. Port: `5432`. Extensions enabled: `postgis`, `postgis_topology`, `pgcrypto`, `uuid-ossp` (+ defaults). Reads/writes: every Eloquent model. Migrations live at `apps/backend/database/migrations`.
2. **Dragonfly (Redis-compatible).** Image: `docker.dragonflydb.io/dragonflydb/dragonfly:latest`. Container: `azimuth-dragonfly`. Port: `6379`. Used for: cache (`CACHE_DRIVER=redis`), session, queue (`QUEUE_CONNECTION=redis`), Horizon, broadcasting (when running through pusher driver against Soketi, the queue still flows here).
3. **Typesense.** Image: `typesense/typesense:29.1`. Container: `azimuth-typesense`. Port: `8108`. Driver: Laravel Scout (`SCOUT_DRIVER=typesense`). Searchable models: `PingModel` (Task 19); future modules opt in via the `Searchable` trait.
4. **MinIO (S3-compatible).** Image: `minio/minio:latest`. Container: `azimuth-minio`. Host ports: `9100` (S3) / `9101` (console). Bucket: `azimuth-dev`. Used for: any `Storage::disk('s3')->put(...)` call, future Browsershot output.
5. **Soketi.** Image: `quay.io/soketi/soketi:latest-16-alpine`. Container: `azimuth-soketi`. Ports: `6001` WS / `9601` metrics. Used for: broadcasting via `pusher` driver. Channel definitions live in `routes/channels.php`.
6. **Mailpit.** Image: `axllent/mailpit:latest`. Container: `azimuth-mailpit`. Ports: `1025` SMTP / `8025` UI. Catches every dev mail.
7. **Cross-cutting health checks.** Reproduce the gate's HTTP/CLI probes (from `docs/runbooks/local-dev.md`).
8. **References.** Links to: `infra/docker-compose.yml`, `infra/docker-compose.ci.yml`, the Phase 1 deviation notes in spec §13.1.

- [ ] **Step 4: Author the five ADRs against this template**

Each ADR uses the same shape as `docs/adr/0001-nx-with-laravel-via-run-commands.md`. Each has these required sections (use real prose, not placeholders): `## Context` (2–4 sentences naming the forces at play), `## Decision` (the actual choice in 1–2 sentences plus a bullet list of constraints it imposes), `## Consequences` (Positive / Negative / Neutral subsections, 2–4 bullets each), `## References` (links to the decision-log spec row, the spec section it implements, and any commits).

- **`docs/adr/0002-cqrs-three-layer.md`** — title: "Three-Layer CQRS (Command/Query → Handler → UseCase)". Context: SOLID separation of bus-adapter concerns from pure business logic; framework imports must not leak into Domain or Application UseCases. Decision: split write side into Command (Data DTO) / Handler (bus adapter) / UseCase (pure); same for reads; HandlerRegistry binds them. Consequences: + testability, + framework-free unit tests; − more files per feature; ~ requires module ServiceProvider per bounded context.
- **`docs/adr/0003-permission-marker-interface.md`** — title: "Permission as a Marker Interface (no raw strings)". Context: spatie/laravel-permission stores names as strings; raw-string sites drift. Decision: every module declares `enum <Module>Permission: string implements App\Authorization\Contracts\Permission`; PHPStan rule forbids raw strings in `Gate::*` calls. Consequences: + compile-time safety, + reconciler seeder works by reflection; − one extra file per module; ~ developers must add cases to the enum, not migrations.
- **`docs/adr/0004-stub-socialite-per-request-fixture.md`** — title: "Stub Socialite Driver with Per-Request Fixture Identity". Context: dev needs an OAuth-shaped flow without IdP wiring; tests need multi-role flexibility. Decision: stub driver accepts `?identity=<email>`, default `stub-user@azimuth.local`. Consequences: + multi-role tests with no test-only branches in production code; − stub identity must never reach prod (controller is wired only when stub provider is registered); ~ real providers added later by following the same controller pattern.
- **`docs/adr/0005-filament-for-admin.md`** — title: "Filament for the Admin Panel". Context: needs CRUD UI for every module gated by Spatie permissions; building from scratch is wasteful. Decision: Filament panel at `/admin` with `discoverResources(in: app_path('Modules'))`. Consequences: + fastest path to module-CRUD admin; − Filament conventions leak into Presentation layer; ~ panel is gated by `Role::Admin`.
- **`docs/adr/0007-bus-middleware-order.md`** — title: "Bus Middleware Order: Authorize Before Validate". Context: standard CQRS literature places Validate first; we deliberately invert. Decision: order is `Logging → Metrics → Authorize → Validate → Transaction` (CommandBus); QueryBus drops `Transaction`. Consequences: + unauthorized callers never see schema-shaped errors; − slightly more compute per malformed-and-unauthorized call; ~ revisit if perf bites at Phase 4.

- [ ] **Step 5: Update docs index**

In `docs/README.md`, add links to the three new architecture docs and five ADRs under their respective sections.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture docs/adr docs/README.md
git commit -m "$(cat <<'EOF'
docs: architecture (cqrs/auth/data-stores) + ADRs 0002-0005, 0007

Architecture docs are evergreen reference; ADRs lock the rationale for
the Phase 2 decisions per CLAUDE.md hard rule #7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 27: Phase 2 gate verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole gate locally**

Run, in order:

```bash
pnpm nx test backend
pnpm nx analyze backend
pnpm nx deptrac backend
```

Expected: every command prints success / no errors / no violations.

- [ ] **Step 2: HTTP gate — full ping flow**

```bash
TOKEN=$(curl -s "http://localhost:8000/auth/socialite/stub/callback?identity=gate@local" | jq -r .access_token)
echo "got token: ${TOKEN:0:20}…"

curl -fsS -X POST "http://localhost:8000/api/ping" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note":{"en":"gate","pt":"portao"}}' | jq

curl -fsS "http://localhost:8000/api/ping" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected: POST returns `201` with the new ping; GET returns an array of length ≥ 1 containing it.

- [ ] **Step 3: Admin panel gate**

Open `http://localhost:8000/admin` in a browser. Log in as a user with the Admin role. Confirm: the Ping resource is visible in the navigation under "Modules" and the index page lists pings.

- [ ] **Step 4: Scramble docs gate**

Open `http://localhost:8000/docs/api`. Confirm: the page renders, the API title is "Azimuth API", and the `/api/ping` GET and POST endpoints are both listed.

- [ ] **Step 5: CI gate**

On the GitHub PR for `feat/phase-2-backend-core`, confirm both jobs are green:

- `lint-and-typecheck`
- `test-backend`

- [ ] **Step 6: Open the PR**

```bash
gh pr create --title "feat: phase 2 backend core (cqrs + auth + filament + scramble + ping)" --body "$(cat <<'EOF'
## Summary

- All Laravel packages from spec §5.6 installed and configured (Octane, Horizon, Passport, Pennant, Precognition, Cashier migrations only, Echo + pusher-php-server, Scout + Typesense, Socialite + stub, Filament @ /admin, Scramble @ /docs/api, Spatie data/translatable/browsershot, spatie/laravel-permission v7).
- `app/Cqrs` namespace with six contracts + CommandBus + QueryBus + five-step middleware pipeline (Logging → Metrics → Authorize → Validate → Transaction).
- `app/Modules/Ping` end-to-end across Domain / Application / Infrastructure / Presentation; canonical template for future modules.
- PHPStan/Larastan level 8 + Deptrac four-layer ruleset; custom PHPStan rule forbidding raw permission strings.
- Pest suite covering happy/invalid/garbage paths for UseCase, Handler, Controller; bus dispatch tests; Socialite-stub → Passport-token integration test.
- CI extended with `test-backend` job.
- Architecture docs and ADRs 0002–0005, 0007.

## Test plan

- [x] `nx test backend` green
- [x] `nx analyze backend` green
- [x] `nx deptrac backend` green
- [x] `POST /api/ping` (with Passport token from stub login) returns 201 and persists
- [x] `GET /api/ping` returns the new ping
- [x] `/admin` shows the Ping Filament resource
- [x] `/docs/api` renders OpenAPI with the Ping endpoints listed
- [x] CI green on this branch

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Update Phase 2 handoff doc to mark Phase 2 complete**

Modify `docs/runbooks/phase-2-handoff.md` — change the document's framing from "next session picks up Phase 2" to "Phase 2 is done and green; the next session picks up at Phase 3" — or replace it with a fresh `phase-3-handoff.md` modeled on the same shape. Either is fine; pick the path the team prefers.

- [ ] **Step 8: Optional — rename GitHub remote (decision #2)**

Now that the branch is up and the PR is open, rename the remote:

1. On GitHub: Settings → Repository name → `vector` → `azimuth`.
2. Locally:

```bash
git remote set-url origin https://github.com/FerrLab/azimuth.git
git fetch origin
```

---

## Self-review notes (filled by the plan author)

**Spec coverage:** Every Phase 2 §13.2 deliverable maps to a task above. Specifically:

- Laravel packages from §5.6 → Tasks 2–12
- `app/Cqrs` contracts + bus + middleware → Tasks 13–15
- `app/Modules/Ping` Domain/Application/Infrastructure/Presentation → Tasks 16–21
- Stub Socialite + Passport flow → Tasks 6, 12, 22
- PHPStan/Larastan level 8 + custom rule → Task 23
- Deptrac four-layer ruleset → Task 24
- Pest happy/invalid/garbage suite → Tasks 17, 18, 20 (and others throughout)
- CI test-backend job → Task 25
- Architecture docs + ADRs → Task 26
- Gate verification → Task 27

**Decision-log coverage:**

1. Pest as task #1 → Task 1.
2. GitHub rename deferred → Task 27 step 8 (optional).
3. Phase 1 deviations patched in spec → already done, commit `923bcc1`.
4. Phase 3 strict serial → respected (no Phase 3 tasks here).
5. Permission marker interface → Task 3 implements it; Task 23 enforces it.
6. Bus middleware order → Tasks 14 & 15.
7. Stub Socialite per-request fixture → Task 12.

**Type consistency:** `RecordPingCommand` uses `note: array<string, string>` everywhere (Tasks 17, 20, 22). `PingPermission::View / ::Create` are referenced consistently (Tasks 16, 17, 18, 20, 21, 22). The `Permission` interface is in `App\Authorization\Contracts` everywhere (Tasks 3, 16, 23). `HandlerRegistry::register(string, string)` signature is consistent across Tasks 14, 15, 19.

**Out-of-scope sentinel:** No task includes Aircraft CRUD work, frontend code, real OAuth providers, Cashier billing logic, or Browsershot rendering pipelines.
