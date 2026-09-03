# VATSIM Connect OAuth2 Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub Socialite login with real VATSIM Connect OAuth2 as the production identity provider, while keeping the stub available in non-production environments so local dev and e2e keep working without VATSIM credentials.

**Architecture:** Laravel Socialite + the `socialiteproviders/vatsim` package mint a Passport Bearer token in the backend callback; the token crosses to the browser as a single-use Dragonfly-backed exchange code (never in a URL) that Next.js redeems server-side to set its existing httpOnly session cookie. Identity resolution (CID-first, email-fallback-adopt, then create) is one shared service so the VATSIM and stub callbacks use identical semantics. The stub's two HTTP endpoints refuse at request time outside non-production environments; the driver registration itself is left harmless and always-on (an unreachable extra driver has no security exposure).

**Tech Stack:** Laravel 13, Socialite 5 (`socialiteproviders/vatsim`), Laravel Passport, Dragonfly (Redis-compatible) via `Illuminate\Support\Facades\Redis`, Next.js 15 route handlers, Pest 4, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-03-vatsim-oauth-design.md`](../specs/2026-09-03-vatsim-oauth-design.md)

## Global Constraints

- Every suite covers happy, invalid and garbage paths at minimum (CLAUDE.md hard rule 1).
- No raw permission strings; this feature adds no new `Permission` enum cases (login has nothing to authorize against) — N/A here, but do not introduce one to check a box.
- Pint runs after every backend task: `pnpm nx lint:fix backend` then `pnpm nx lint backend` before committing.
- No hardcoded user-facing strings — every new UI string goes through `apps/web/src/messages/auth.en.json` / `auth.pt.json`.
- `/docs` is evergreen — Task 11 updates `docs/architecture/auth.md` and adds ADR 0010.
- Squared UI — the new "Continue with VATSIM" button reuses `ObcButton` exactly as the existing stub button does; no new styling.
- VATSIM scopes requested: `full_name`, `email` (required). Nothing else — no rating, division, or subdivision is requested or stored.
- Any VATSIM account may sign in on first login (auto-assigned the `member` role, matching current stub policy). No rating gate, no allowlist — out of scope per the spec.
- Backend commands run via `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend <cmd>` (or the `pnpm nx <target> backend` wrapper where one exists). Frontend commands run host-side: `pnpm nx <target> web`.

---

### Task 1: `vatsim_cid` column on `users`

**Files:**

- Create: `apps/backend/database/migrations/2026_09_03_000000_add_vatsim_cid_to_users_table.php`
- Modify: `apps/backend/app/Models/User.php`
- Test: `apps/backend/tests/Feature/Auth/VatsimCidColumnTest.php`

**Interfaces:**

- Produces: `users.vatsim_cid` — `string|null`, unique, nullable. Every later task that creates or queries a `User` by VATSIM identity uses this column name verbatim.

- [ ] **Step 1: Write the failing test**

```php
<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

it('has a nullable vatsim_cid column (happy)', function (): void {
    expect(Schema::hasColumn('users', 'vatsim_cid'))->toBeTrue();

    $user = User::factory()->create(['vatsim_cid' => null]);
    expect($user->fresh()->vatsim_cid)->toBeNull();
});

it('accepts a numeric CID string (happy)', function (): void {
    $user = User::factory()->create(['vatsim_cid' => '1234567']);
    expect($user->fresh()->vatsim_cid)->toBe('1234567');
});

it('rejects a duplicate CID across two users (invalid)', function (): void {
    User::factory()->create(['vatsim_cid' => '1234567']);

    expect(fn () => User::factory()->create(['vatsim_cid' => '1234567']))
        ->toThrow(\Illuminate\Database\QueryException::class);
});

it('allows many users with a null CID — null is not unique-constrained (garbage)', function (): void {
    User::factory()->create(['vatsim_cid' => null]);
    User::factory()->create(['vatsim_cid' => null]);

    expect(User::query()->whereNull('vatsim_cid')->count())->toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Auth/VatsimCidColumnTest.php`
Expected: FAIL — `vatsim_cid` column does not exist / `vatsim_cid` is not a fillable attribute.

- [ ] **Step 3: Write the migration**

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('vatsim_cid')->nullable()->unique()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('vatsim_cid');
        });
    }
};
```

- [ ] **Step 4: Add `vatsim_cid` to the User model's fillable attribute**

In `apps/backend/app/Models/User.php`, change:

```php
#[Fillable(['name', 'email', 'password'])]
```

to:

```php
#[Fillable(['name', 'email', 'password', 'vatsim_cid'])]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Auth/VatsimCidColumnTest.php`
Expected: PASS (4/4)

- [ ] **Step 6: Pint + commit**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pint app/Models/User.php database/migrations/2026_09_03_000000_add_vatsim_cid_to_users_table.php
git add apps/backend/database/migrations/2026_09_03_000000_add_vatsim_cid_to_users_table.php apps/backend/app/Models/User.php apps/backend/tests/Feature/Auth/VatsimCidColumnTest.php
git commit -m "feat(auth): add vatsim_cid column to users

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Single-use exchange code store (Dragonfly)

**Files:**

- Create: `apps/backend/config/socialite.php`
- Create: `apps/backend/app/Authentication/ExchangeCodeStore.php`
- Create: `apps/backend/tests/Support/Authentication/SocialiteExchangeRedisTestSupport.php`
- Test: `apps/backend/tests/Feature/Authentication/ExchangeCodeStoreTest.php`

**Interfaces:**

- Produces: `App\Authentication\ExchangeCodeStore::put(string $token, int $ttlSeconds): string` (returns the generated code) and `::redeem(string $code): ?string` (atomic; returns the token once, `null` on miss or replay). Task 5 and Task 6 both depend on these two exact signatures.

- [ ] **Step 1: Write the test support helper**

```php
<?php

declare(strict_types=1);

namespace Tests\Support\Authentication;

use Illuminate\Support\Facades\Redis;

final class SocialiteExchangeRedisTestSupport
{
    /** Point exchange-code keys at a unique prefix so parallel Pest workers never collide. */
    public static function useIsolatedPrefix(): void
    {
        config(['socialite.exchange.key_prefix' => 'authtest:'.getmypid().':'.bin2hex(random_bytes(4))]);
    }

    /** Delete every key under the isolated prefix. */
    public static function flush(): void
    {
        $conn = Redis::connection();
        $clientPrefix = (string) config('database.redis.options.prefix');
        foreach ($conn->keys(config('socialite.exchange.key_prefix').':*') as $key) {
            $bare = str_starts_with((string) $key, $clientPrefix)
                ? substr((string) $key, strlen($clientPrefix))
                : (string) $key;
            $conn->del($bare);
        }
    }
}
```

- [ ] **Step 2: Write the failing test**

```php
<?php

declare(strict_types=1);

use App\Authentication\ExchangeCodeStore;
use Illuminate\Support\Facades\Redis;
use Tests\Support\Authentication\SocialiteExchangeRedisTestSupport;

beforeEach(function (): void {
    SocialiteExchangeRedisTestSupport::useIsolatedPrefix();
});

afterEach(function (): void {
    SocialiteExchangeRedisTestSupport::flush();
});

it('redeems a stored token exactly once (happy)', function (): void {
    $store = app(ExchangeCodeStore::class);

    $code = $store->put('bearer-token-abc', 60);
    expect($code)->toBeString()->not->toBe('');

    expect($store->redeem($code))->toBe('bearer-token-abc');
});

it('sets a TTL close to the requested window (happy)', function (): void {
    $store = app(ExchangeCodeStore::class);
    $code = $store->put('tok', 60);

    $key = config('socialite.exchange.key_prefix').':'.$code;
    $ttl = Redis::connection()->ttl($key);

    expect($ttl)->toBeGreaterThan(0)->toBeLessThanOrEqual(60);
});

it('returns null on a replayed code (invalid)', function (): void {
    $store = app(ExchangeCodeStore::class);
    $code = $store->put('tok', 60);

    $store->redeem($code);

    expect($store->redeem($code))->toBeNull();
});

it('returns null for an unknown code (garbage)', function (): void {
    $store = app(ExchangeCodeStore::class);

    expect($store->redeem('this-code-was-never-issued'))->toBeNull();
});

it('returns null for an empty code (garbage)', function (): void {
    $store = app(ExchangeCodeStore::class);

    expect($store->redeem(''))->toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Authentication/ExchangeCodeStoreTest.php`
Expected: FAIL — `App\Authentication\ExchangeCodeStore` and `config/socialite.php` do not exist.

- [ ] **Step 4: Write `config/socialite.php`**

```php
<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Socialite exchange code
    |--------------------------------------------------------------------------
    |
    | After a Socialite callback mints a Passport token, the token crosses
    | to the browser as a single-use code stored here rather than as a URL
    | parameter — see docs/superpowers/specs/2026-09-03-vatsim-oauth-design.md.
    | Tests override key_prefix per-process so parallel Pest workers sharing
    | one Dragonfly instance never collide (mirrors config/gateway.php).
    |
    */

    'exchange' => [
        'key_prefix' => env('SOCIALITE_EXCHANGE_KEY_PREFIX', 'socialite:exchange'),
        'ttl_seconds' => (int) env('SOCIALITE_EXCHANGE_TTL_SECONDS', 60),
    ],

];
```

- [ ] **Step 5: Write `ExchangeCodeStore`**

```php
<?php

declare(strict_types=1);

namespace App\Authentication;

use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;

/**
 * Single-use handoff for a Socialite-minted Passport Bearer token: the
 * backend stores the token under a random code with a short TTL, and the
 * frontend redeems it exactly once. The Bearer itself never appears in a
 * URL, browser history, or access log — only the code does, and the code
 * is dead the instant it is redeemed.
 */
final class ExchangeCodeStore
{
    public function put(string $token, int $ttlSeconds): string
    {
        $code = Str::random(64);
        Redis::connection()->setex($this->key($code), $ttlSeconds, $token);

        return $code;
    }

    /** Atomic GETDEL — a replayed code can never mint a second session. */
    public function redeem(string $code): ?string
    {
        if ($code === '') {
            return null;
        }

        $value = Redis::connection()->getDel($this->key($code));

        return is_string($value) && $value !== '' ? $value : null;
    }

    private function key(string $code): string
    {
        return config('socialite.exchange.key_prefix').':'.$code;
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Authentication/ExchangeCodeStoreTest.php`
Expected: PASS (5/5)

- [ ] **Step 7: Pint + commit**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pint app/Authentication/ExchangeCodeStore.php config/socialite.php tests/Support/Authentication/SocialiteExchangeRedisTestSupport.php tests/Feature/Authentication/ExchangeCodeStoreTest.php
git add apps/backend/config/socialite.php apps/backend/app/Authentication/ExchangeCodeStore.php apps/backend/tests/Support/Authentication/SocialiteExchangeRedisTestSupport.php apps/backend/tests/Feature/Authentication/ExchangeCodeStoreTest.php
git commit -m "feat(auth): single-use exchange code store for the OAuth token handoff

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Shared identity resolution (`ResolveSocialiteUser`)

**Files:**

- Create: `apps/backend/app/Authentication/ResolveSocialiteUser.php`
- Modify: `apps/backend/app/Http/Controllers/Auth/SocialiteStubController.php`
- Test: `apps/backend/tests/Feature/Authentication/ResolveSocialiteUserTest.php`

**Interfaces:**

- Consumes: nothing new (Eloquent `User`, Spatie `Role` model, `App\Authorization\Roles\Role` enum — all already in the codebase).
- Produces: `App\Authentication\ResolveSocialiteUser::resolve(?string $cid, string $email, string $name): \App\Models\User`. Task 5's VATSIM callback calls this with a real CID; the stub callback (this task) calls it with `$cid = null`.

- [ ] **Step 1: Write the failing test**

```php
<?php

declare(strict_types=1);

use App\Authentication\ResolveSocialiteUser;
use App\Authorization\Roles\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web']);
});

it('creates a new user with the given CID and assigns member (happy)', function (): void {
    $user = app(ResolveSocialiteUser::class)->resolve('1234567', 'alice@vatsim.local', 'Alice');

    expect($user->vatsim_cid)->toBe('1234567');
    expect($user->email)->toBe('alice@vatsim.local');
    expect($user->hasRole(Role::Member->value))->toBeTrue();
    $this->assertDatabaseCount('users', 1);
});

it('matches an existing user by CID on repeat login without duplicating (happy)', function (): void {
    $first = app(ResolveSocialiteUser::class)->resolve('1234567', 'alice@vatsim.local', 'Alice');
    $second = app(ResolveSocialiteUser::class)->resolve('1234567', 'alice@vatsim.local', 'Alice');

    expect($second->id)->toBe($first->id);
    $this->assertDatabaseCount('users', 1);
});

it('adopts an existing row by email when no CID matches yet (happy — links a pre-existing account)', function (): void {
    $existing = User::factory()->create(['email' => 'bob@vatsim.local', 'vatsim_cid' => null]);

    $resolved = app(ResolveSocialiteUser::class)->resolve('7654321', 'bob@vatsim.local', 'Bob');

    expect($resolved->id)->toBe($existing->id);
    expect($resolved->fresh()->vatsim_cid)->toBe('7654321');
    $this->assertDatabaseCount('users', 1);
});

it('does not re-assign member if the user already has it (invalid — no duplicate pivot row)', function (): void {
    $user = app(ResolveSocialiteUser::class)->resolve('1234567', 'alice@vatsim.local', 'Alice');
    app(ResolveSocialiteUser::class)->resolve('1234567', 'alice@vatsim.local', 'Alice');

    expect($user->fresh()->roles()->count())->toBe(1);
});

it('creates a user with no CID when none is supplied — the stub path (garbage — cid absent by design)', function (): void {
    $user = app(ResolveSocialiteUser::class)->resolve(null, 'stub-user@eurostrip.local', 'stub-user');

    expect($user->vatsim_cid)->toBeNull();
    expect($user->hasRole(Role::Member->value))->toBeTrue();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Authentication/ResolveSocialiteUserTest.php`
Expected: FAIL — `App\Authentication\ResolveSocialiteUser` does not exist.

- [ ] **Step 3: Write `ResolveSocialiteUser`**

```php
<?php

declare(strict_types=1);

namespace App\Authentication;

use App\Authorization\Roles\Role;
use App\Models\User;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role as RoleModel;

/**
 * Identity resolution shared by every Socialite callback (VATSIM and the
 * non-production stub) so both mint sessions with identical semantics —
 * see docs/superpowers/specs/2026-09-03-vatsim-oauth-design.md.
 *
 * Resolution order:
 *  1. Match on vatsim_cid, when one is supplied — the stable identity.
 *  2. Else match on email and adopt the row (set its CID, if any).
 *  3. Else create.
 *
 * First login for a brand-new user assigns the `member` role. There is no
 * rating gate or allowlist — any VATSIM account may sign in.
 */
final class ResolveSocialiteUser
{
    public function resolve(?string $cid, string $email, string $name): User
    {
        $user = $cid !== null
            ? User::query()->where('vatsim_cid', $cid)->first()
            : null;

        if ($user === null) {
            $user = User::query()->where('email', $email)->first();

            if ($user !== null && $cid !== null && $user->vatsim_cid === null) {
                $user->vatsim_cid = $cid;
                $user->save();
            }
        }

        if ($user === null) {
            $user = User::create([
                'name' => $name,
                'email' => $email,
                'vatsim_cid' => $cid,
                'password' => bcrypt(Str::random(32)),
            ]);
        }

        $member = RoleModel::where('name', Role::Member->value)->where('guard_name', 'web')->first();
        if ($member !== null && ! $user->hasRole($member)) {
            $user->assignRole($member);
        }

        return $user;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Authentication/ResolveSocialiteUserTest.php`
Expected: PASS (5/5)

- [ ] **Step 5: Refactor the stub controller to use the shared service**

In `apps/backend/app/Http/Controllers/Auth/SocialiteStubController.php`, replace the `callback()` body's manual `firstOrCreate` + role block with a call to the new service. The full file becomes:

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Authentication\ResolveSocialiteUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Socialite\Facades\Socialite;
use Symfony\Component\HttpFoundation\RedirectResponse as SymfonyRedirectResponse;

class SocialiteStubController
{
    public function redirect(Request $request): SymfonyRedirectResponse
    {
        return Socialite::driver('stub')->redirect();
    }

    public function callback(Request $request, ResolveSocialiteUser $resolver): JsonResponse
    {
        $stubUser = Socialite::driver('stub')->user();

        $user = $resolver->resolve(null, (string) $stubUser->getEmail(), (string) $stubUser->getName());

        $token = $user->createToken('stub-login')->accessToken;

        return response()->json([
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => ['id' => $user->id, 'email' => $user->email],
        ]);
    }
}
```

- [ ] **Step 6: Run the pre-existing stub tests to confirm no regression**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Auth/SocialiteStubTest.php tests/Feature/Auth/SocialiteStubToPingFlowTest.php`
Expected: PASS — same assertions as before the refactor (6/6 across both files).

- [ ] **Step 7: Pint + commit**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pint app/Authentication/ResolveSocialiteUser.php app/Http/Controllers/Auth/SocialiteStubController.php tests/Feature/Authentication/ResolveSocialiteUserTest.php
git add apps/backend/app/Authentication/ResolveSocialiteUser.php apps/backend/app/Http/Controllers/Auth/SocialiteStubController.php apps/backend/tests/Feature/Authentication/ResolveSocialiteUserTest.php
git commit -m "refactor(auth): extract shared Socialite identity resolution

Both the stub and (Task 5) VATSIM callbacks now mint sessions through
the same CID-first, email-adopt, then-create rule.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Install and register the VATSIM Socialite driver

**Files:**

- Modify: `apps/backend/composer.json` / `composer.lock` (via `composer require`)
- Create: `apps/backend/app/Providers/VatsimSocialiteServiceProvider.php`
- Modify: `apps/backend/config/services.php`
- Modify: `apps/backend/bootstrap/providers.php`
- Modify: `.env.example` (repo root)
- Modify: `infra/docker-compose.yml`
- Test: `apps/backend/tests/Feature/Auth/VatsimDriverRegistrationTest.php`

**Interfaces:**

- Produces: the `'vatsim'` Socialite driver, resolvable via `Socialite::driver('vatsim')`, returning a `SocialiteProviders\Vatsim\Provider` instance. Task 5 depends on this driver name existing.

- [ ] **Step 1: Install the package**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend composer require socialiteproviders/vatsim`

- [ ] **Step 2: Write the failing test**

```php
<?php

declare(strict_types=1);

use Laravel\Socialite\Facades\Socialite;
use SocialiteProviders\Vatsim\Provider;

it('resolves the vatsim driver to the SocialiteProviders Vatsim provider (happy)', function (): void {
    config([
        'services.vatsim.client_id' => 'test-client-id',
        'services.vatsim.client_secret' => 'test-client-secret',
        'services.vatsim.redirect' => 'http://localhost:8000/auth/socialite/vatsim/callback',
    ]);

    expect(Socialite::driver('vatsim'))->toBeInstanceOf(Provider::class);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Auth/VatsimDriverRegistrationTest.php`
Expected: FAIL — `InvalidArgumentException: Driver [vatsim] not supported.`

- [ ] **Step 4: Add the `vatsim` config block**

In `apps/backend/config/services.php`, insert after the `'typesense'` block (before the closing `];`):

```php
    'vatsim' => [
        'client_id' => env('VATSIM_CLIENT_ID'),
        'client_secret' => env('VATSIM_CLIENT_SECRET'),
        'redirect' => env('VATSIM_REDIRECT_URI', 'http://localhost:8000/auth/socialite/vatsim/callback'),
        'test' => env('VATSIM_TEST', false),
    ],
```

- [ ] **Step 5: Write `VatsimSocialiteServiceProvider`**

```php
<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Laravel\Socialite\Contracts\Factory as SocialiteFactory;
use Laravel\Socialite\SocialiteManager;
use SocialiteProviders\Vatsim\Provider as VatsimProvider;

class VatsimSocialiteServiceProvider extends ServiceProvider
{
    public function boot(SocialiteFactory $factory): void
    {
        // SocialiteManager (the runtime implementation) provides
        // buildProvider(); the Factory contract does not declare it.
        assert($factory instanceof SocialiteManager);
        $factory->extend('vatsim', function ($app) use ($factory) {
            return $factory->buildProvider(VatsimProvider::class, (array) $app['config']['services.vatsim']);
        });
    }
}
```

- [ ] **Step 6: Register the provider**

In `apps/backend/bootstrap/providers.php`, add the import and array entry (order matches the file's existing style — alongside `SocialiteStubServiceProvider`):

```php
use App\Providers\SocialiteStubServiceProvider;
use App\Providers\VatsimSocialiteServiceProvider;

return [
    AppServiceProvider::class,
    AdminPanelProvider::class,
    HorizonServiceProvider::class,
    SocialiteStubServiceProvider::class,
    VatsimSocialiteServiceProvider::class,
    BusServiceProvider::class,
    PingServiceProvider::class,
    GatewayServiceProvider::class,
];
```

- [ ] **Step 7: Run test to verify it passes**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Auth/VatsimDriverRegistrationTest.php`
Expected: PASS (1/1)

- [ ] **Step 8: Add env vars**

In `.env.example` (repo root), the file already has blank `VATSIM_CLIENT_ID=` / `VATSIM_CLIENT_SECRET=` lines — add two more directly below them:

```dotenv
VATSIM_CLIENT_ID=
VATSIM_CLIENT_SECRET=
VATSIM_REDIRECT_URI=http://localhost:8000/auth/socialite/vatsim/callback
VATSIM_TEST=true
```

(`VATSIM_TEST=true` in the example file so a fresh `cp .env.example .env` points at VATSIM's sandbox — `auth-dev.vatsim.net` — by default; production deployments set it to `false`.)

- [ ] **Step 9: Pass the vars into the backend container**

In `infra/docker-compose.yml`, in the `backend` service's `environment:` block, add after the `PUSHER_APP_CLUSTER: mt1` line:

```yaml
VATSIM_CLIENT_ID: ${VATSIM_CLIENT_ID}
VATSIM_CLIENT_SECRET: ${VATSIM_CLIENT_SECRET}
VATSIM_REDIRECT_URI: ${VATSIM_REDIRECT_URI}
VATSIM_TEST: ${VATSIM_TEST}
```

- [ ] **Step 10: Pint + commit**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pint app/Providers/VatsimSocialiteServiceProvider.php config/services.php bootstrap/providers.php tests/Feature/Auth/VatsimDriverRegistrationTest.php
git add apps/backend/composer.json apps/backend/composer.lock apps/backend/app/Providers/VatsimSocialiteServiceProvider.php apps/backend/config/services.php apps/backend/bootstrap/providers.php apps/backend/tests/Feature/Auth/VatsimDriverRegistrationTest.php .env.example infra/docker-compose.yml
git commit -m "feat(auth): register the VATSIM Connect Socialite driver

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: VATSIM redirect + callback controller

**Files:**

- Create: `apps/backend/app/Http/Controllers/Auth/VatsimAuthController.php`
- Modify: `apps/backend/routes/web.php`
- Test: `apps/backend/tests/Feature/Auth/VatsimAuthTest.php`

**Interfaces:**

- Consumes: `App\Authentication\ResolveSocialiteUser::resolve()` (Task 3), `App\Authentication\ExchangeCodeStore::put()` (Task 2).
- Produces: `GET /auth/socialite/vatsim/redirect` (name `auth.socialite.vatsim.redirect`) and `GET /auth/socialite/vatsim/callback` (name `auth.socialite.vatsim.callback`). On success the callback redirects to `{FRONTEND_URL}/api/auth/vatsim-callback?code=<exchange-code>&locale=<locale>`; on any failure it redirects to `{FRONTEND_URL}/{locale}/login?error=oauth`. `FRONTEND_URL` reads from `config('app.frontend_url')`, added in Step 3 below. Task 9 depends on the `code` and `error` query param names exactly as given here.

Reading the CID and name from the mapped Socialite user needs the exact right accessor, verified directly against `vendor/laravel/socialite/src/AbstractUser.php`: `map(array $attributes)` only copies a key onto a real typed property (`$this->id`, `$this->email`, ...) when `property_exists($this, $key)` — neither `cid` nor `full_name` is a declared property, so `SocialiteProviders\Vatsim\Provider::mapUserToObject()`'s `->map(['cid' => ..., 'full_name' => ..., ...])` call leaves them reachable only through `AbstractUser::__get()`, i.e. `$vatsimUser->cid` and `$vatsimUser->full_name` (magic property access on the _mapped_ attributes) — **not** `$vatsimUser->getId()` (reads the untouched, always-null `$id` property) and **not** `$vatsimUser->user['full_name']` (`->user` is `getRaw()`'s backing array — the _unmapped_ provider response, where a top-level `full_name` key never existed; the real key nests at `data.personal.name_full`).

`email` is the one field the library's `mapUserToObject()` never maps at all (not even into the magic attributes) — see `SocialiteProviders\Vatsim\Provider::mapUserToObject()`, which the library's own name-field mapping (`name_first`/`name_last`/`name_full`, all read from that same `data.personal.*` raw branch) confirms the raw shape for. Reading it demands `getRaw()` and the deep path `data.personal.email`, which is what `emailFromRaw()` below does. If a live account ever shows this specific path wrong, the extraction lives in that one method — a one-line fix.

- [ ] **Step 1: Write the failing test**

```php
<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;

uses(RefreshDatabase::class);

function fakeVatsimUser(?string $cid, ?string $email, ?string $fullName = 'Alice Example'): SocialiteUser
{
    $raw = [
        'data' => [
            'cid' => $cid,
            'personal' => [
                'name_first' => 'Alice',
                'name_last' => 'Example',
                'name_full' => $fullName,
                'email' => $email,
            ],
        ],
    ];

    return (new SocialiteUser)->setRaw($raw)->map([
        'cid' => $cid,
        'full_name' => $fullName,
    ]);
}

it('redirects to the provider (happy)', function (): void {
    $fake = Mockery::mock(\Laravel\Socialite\Contracts\Provider::class);
    $fake->shouldReceive('redirect')->once()->andReturn(redirect('https://auth.vatsim.net/oauth/authorize'));
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/redirect');

    $response->assertRedirect('https://auth.vatsim.net/oauth/authorize');
});

it('creates a user, mints a token, and redirects with an exchange code (happy)', function (): void {
    $fake = Mockery::mock(\Laravel\Socialite\Contracts\Provider::class);
    $fake->shouldReceive('user')->once()->andReturn(fakeVatsimUser('1234567', 'alice@vatsim.local'));
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback?locale=en');

    $response->assertRedirect();
    $location = $response->headers->get('Location');
    expect($location)->toContain('/api/auth/vatsim-callback');
    expect($location)->toContain('locale=en');
    parse_str((string) parse_url((string) $location, PHP_URL_QUERY), $query);
    expect($query['code'])->toBeString()->not->toBeEmpty();

    $this->assertDatabaseHas('users', ['email' => 'alice@vatsim.local', 'vatsim_cid' => '1234567']);
});

it('the exchange code redeems to a working Bearer token (happy — end to end)', function (): void {
    $fake = Mockery::mock(\Laravel\Socialite\Contracts\Provider::class);
    $fake->shouldReceive('user')->once()->andReturn(fakeVatsimUser('1234567', 'alice@vatsim.local'));
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback?locale=en');
    parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

    $exchanged = app(\App\Authentication\ExchangeCodeStore::class)->redeem($query['code']);
    expect($exchanged)->toBeString();

    $user = User::query()->where('email', 'alice@vatsim.local')->firstOrFail();
    $me = $this->withToken($exchanged)->getJson('/api/user');
    $me->assertOk();
    expect($me->json('id'))->toBe($user->id);
});

it('redirects to login with an error when the profile has no email (invalid)', function (): void {
    $fake = Mockery::mock(\Laravel\Socialite\Contracts\Provider::class);
    $fake->shouldReceive('user')->once()->andReturn(fakeVatsimUser('1234567', null));
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback?locale=en');

    $response->assertRedirect();
    expect($response->headers->get('Location'))->toContain('/en/login?error=oauth');
    $this->assertDatabaseCount('users', 0);
});

it('redirects to login with an error when the profile has no CID (invalid)', function (): void {
    $fake = Mockery::mock(\Laravel\Socialite\Contracts\Provider::class);
    $fake->shouldReceive('user')->once()->andReturn(fakeVatsimUser(null, 'alice@vatsim.local'));
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback?locale=en');

    expect($response->headers->get('Location'))->toContain('/en/login?error=oauth');
    $this->assertDatabaseCount('users', 0);
});

it('redirects to login with an error when the provider throws (garbage — denied consent / state mismatch)', function (): void {
    $fake = Mockery::mock(\Laravel\Socialite\Contracts\Provider::class);
    $fake->shouldReceive('user')->once()->andThrow(new \Laravel\Socialite\Two\InvalidStateException);
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback?locale=en');

    expect($response->headers->get('Location'))->toContain('/en/login?error=oauth');
});

it('falls back to English when locale is missing (garbage)', function (): void {
    $fake = Mockery::mock(\Laravel\Socialite\Contracts\Provider::class);
    $fake->shouldReceive('user')->once()->andThrow(new \Laravel\Socialite\Two\InvalidStateException);
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback');

    expect($response->headers->get('Location'))->toContain('/en/login?error=oauth');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Auth/VatsimAuthTest.php`
Expected: FAIL — route `auth.socialite.vatsim.redirect` not defined.

- [ ] **Step 3: Add `frontend_url` to `config/app.php`**

In `apps/backend/config/app.php`, add inside the returned array (any position among the other top-level keys is fine; put it near `'url'`):

```php
    'frontend_url' => env('FRONTEND_URL', 'http://localhost:3000'),
```

Add to `.env.example` (repo root), near `NEXT_PUBLIC_API_URL`:

```dotenv
FRONTEND_URL=http://localhost:3000
```

Add to `infra/docker-compose.yml`'s `backend` service environment block, alongside the `VATSIM_*` lines added in Task 4:

```yaml
FRONTEND_URL: ${FRONTEND_URL:-http://localhost:3000}
```

- [ ] **Step 4: Write `VatsimAuthController`**

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Authentication\ExchangeCodeStore;
use App\Authentication\ResolveSocialiteUser;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;
use Symfony\Component\HttpFoundation\RedirectResponse as SymfonyRedirectResponse;
use Throwable;

class VatsimAuthController
{
    public function redirect(Request $request): SymfonyRedirectResponse
    {
        return Socialite::driver('vatsim')->scopes(['full_name', 'email'])->redirect();
    }

    public function callback(Request $request, ResolveSocialiteUser $resolver, ExchangeCodeStore $codes): RedirectResponse
    {
        $locale = $this->pickLocale($request->query('locale'));

        try {
            $vatsimUser = Socialite::driver('vatsim')->user();
        } catch (Throwable) {
            return $this->toLoginError($locale);
        }

        $cid = $this->stringOrNull($vatsimUser->cid);
        $email = $this->emailFromRaw($vatsimUser);
        $name = $this->stringOrNull($vatsimUser->full_name) ?? 'VATSIM Member';

        if ($cid === null || $email === null) {
            return $this->toLoginError($locale);
        }

        $user = $resolver->resolve($cid, $email, $name);
        $token = $user->createToken('vatsim-login')->accessToken;

        $code = $codes->put($token, (int) config('socialite.exchange.ttl_seconds'));

        $callback = rtrim((string) config('app.frontend_url'), '/').'/api/auth/vatsim-callback';

        return redirect()->away($callback.'?'.http_build_query(['code' => $code, 'locale' => $locale]));
    }

    /**
     * The library maps name_first/name_last/name_full from data.personal.*
     * but does not map email itself — read it from the same raw branch.
     */
    private function emailFromRaw(SocialiteUser $user): ?string
    {
        return $this->stringOrNull(Arr::get($user->getRaw(), 'data.personal.email'));
    }

    private function stringOrNull(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        return $value;
    }

    private function toLoginError(string $locale): RedirectResponse
    {
        $frontend = rtrim((string) config('app.frontend_url'), '/');

        return redirect()->away($frontend.'/'.$locale.'/login?error=oauth');
    }

    private function pickLocale(mixed $value): string
    {
        return in_array($value, ['en', 'pt'], true) ? $value : 'en';
    }
}
```

- [ ] **Step 5: Add the routes**

In `apps/backend/routes/web.php`, add after the existing stub routes:

```php
use App\Http\Controllers\Auth\VatsimAuthController;

Route::get('/auth/socialite/vatsim/redirect', [VatsimAuthController::class, 'redirect'])
    ->name('auth.socialite.vatsim.redirect');
Route::get('/auth/socialite/vatsim/callback', [VatsimAuthController::class, 'callback'])
    ->name('auth.socialite.vatsim.callback');
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Auth/VatsimAuthTest.php`
Expected: PASS (7/7)

- [ ] **Step 7: Pint + commit**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pint app/Http/Controllers/Auth/VatsimAuthController.php routes/web.php config/app.php tests/Feature/Auth/VatsimAuthTest.php
git add apps/backend/app/Http/Controllers/Auth/VatsimAuthController.php apps/backend/routes/web.php apps/backend/config/app.php apps/backend/tests/Feature/Auth/VatsimAuthTest.php .env.example infra/docker-compose.yml
git commit -m "feat(auth): VATSIM Connect redirect + callback controller

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Exchange endpoint

**Files:**

- Create: `apps/backend/app/Http/Controllers/Auth/AuthExchangeController.php`
- Modify: `apps/backend/routes/web.php`
- Modify: `apps/backend/app/Providers/AppServiceProvider.php`
- Test: `apps/backend/tests/Feature/Auth/AuthExchangeTest.php`

**Interfaces:**

- Consumes: `App\Authentication\ExchangeCodeStore::redeem()` (Task 2).
- Produces: `POST /auth/socialite/exchange` (name `auth.socialite.exchange`), body `{ "code": "..." }`, response `200 { "access_token": "..." }` or `422` on an invalid/expired/replayed code. Task 9's frontend handler depends on this exact request/response shape.

- [ ] **Step 1: Write the failing test**

```php
<?php

declare(strict_types=1);

use App\Authentication\ExchangeCodeStore;

it('redeems a valid code for its Bearer token (happy)', function (): void {
    $code = app(ExchangeCodeStore::class)->put('a-real-bearer-token', 60);

    $response = $this->postJson('/auth/socialite/exchange', ['code' => $code]);

    $response->assertOk();
    expect($response->json('access_token'))->toBe('a-real-bearer-token');
});

it('rejects a replayed code (invalid)', function (): void {
    $code = app(ExchangeCodeStore::class)->put('a-real-bearer-token', 60);
    $this->postJson('/auth/socialite/exchange', ['code' => $code]);

    $response = $this->postJson('/auth/socialite/exchange', ['code' => $code]);

    $response->assertStatus(422);
});

it('rejects an unknown code (garbage)', function (): void {
    $response = $this->postJson('/auth/socialite/exchange', ['code' => 'never-issued']);

    $response->assertStatus(422);
});

it('rejects a missing code (garbage)', function (): void {
    $response = $this->postJson('/auth/socialite/exchange', []);

    $response->assertStatus(422);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Auth/AuthExchangeTest.php`
Expected: FAIL — route not defined.

- [ ] **Step 3: Write `AuthExchangeController`**

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Authentication\ExchangeCodeStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthExchangeController
{
    public function exchange(Request $request, ExchangeCodeStore $codes): JsonResponse
    {
        $request->validate(['code' => ['required', 'string']]);

        $token = $codes->redeem((string) $request->input('code'));

        if ($token === null) {
            return response()->json(['message' => 'Invalid or expired code.'], 422);
        }

        return response()->json(['access_token' => $token]);
    }
}
```

- [ ] **Step 4: Add the route with rate limiting**

In `apps/backend/routes/web.php`, add:

```php
use App\Http\Controllers\Auth\AuthExchangeController;

Route::post('/auth/socialite/exchange', [AuthExchangeController::class, 'exchange'])
    ->middleware('throttle:socialite-exchange')
    ->name('auth.socialite.exchange');
```

In `apps/backend/app/Providers/AppServiceProvider.php`, add a second rate limiter next to the existing `gateway-send` one, inside `boot()`:

```php
        RateLimiter::for('socialite-exchange', function (Request $request): Limit {
            return Limit::perMinute(20)->by($request->ip());
        });
```

(This endpoint is necessarily unauthenticated — the caller has no session yet — so the code's 64-character entropy is the real security boundary; the rate limit only blunts brute-force guessing.)

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Auth/AuthExchangeTest.php`
Expected: PASS (4/4)

- [ ] **Step 6: Pint + commit**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pint app/Http/Controllers/Auth/AuthExchangeController.php routes/web.php app/Providers/AppServiceProvider.php tests/Feature/Auth/AuthExchangeTest.php
git add apps/backend/app/Http/Controllers/Auth/AuthExchangeController.php apps/backend/routes/web.php apps/backend/app/Providers/AppServiceProvider.php apps/backend/tests/Feature/Auth/AuthExchangeTest.php
git commit -m "feat(auth): rate-limited exchange endpoint for the OAuth code handoff

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Gate the stub outside non-production

**Files:**

- Modify: `apps/backend/app/Http/Controllers/Auth/SocialiteStubController.php`
- Test: `apps/backend/tests/Feature/Auth/SocialiteStubProductionGateTest.php`

**Interfaces:**

- Produces: both stub endpoints return `404` when `app()->isProduction()` is true. Nothing downstream depends on this beyond the behavior itself.

- [ ] **Step 1: Write the failing test**

```php
<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\ClientRepository;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );
});

afterEach(function (): void {
    $this->app['env'] = 'testing';
});

it('404s the stub redirect in production (invalid)', function (): void {
    $this->app['env'] = 'production';

    $this->get('/auth/socialite/stub/redirect')->assertStatus(404);
});

it('404s the stub callback in production (invalid)', function (): void {
    $this->app['env'] = 'production';

    $this->get('/auth/socialite/stub/callback')->assertStatus(404);
});

it('serves the stub callback outside production (happy)', function (): void {
    $this->app['env'] = 'testing';

    $this->get('/auth/socialite/stub/callback')->assertOk();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Auth/SocialiteStubProductionGateTest.php`
Expected: FAIL — the first two tests get `200`, not `404`.

- [ ] **Step 3: Add the production guard to the controller**

In `apps/backend/app/Http/Controllers/Auth/SocialiteStubController.php`, add a guard at the top of both methods:

```php
    public function redirect(Request $request): SymfonyRedirectResponse
    {
        abort_if(app()->isProduction(), 404);

        return Socialite::driver('stub')->redirect();
    }

    public function callback(Request $request, ResolveSocialiteUser $resolver): JsonResponse
    {
        abort_if(app()->isProduction(), 404);

        $stubUser = Socialite::driver('stub')->user();
        ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Auth/SocialiteStubProductionGateTest.php`
Expected: PASS (3/3)

- [ ] **Step 5: Run the full stub suite once more to confirm nothing else broke**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test tests/Feature/Auth/`
Expected: all green.

- [ ] **Step 6: Pint + commit**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pint app/Http/Controllers/Auth/SocialiteStubController.php tests/Feature/Auth/SocialiteStubProductionGateTest.php
git add apps/backend/app/Http/Controllers/Auth/SocialiteStubController.php apps/backend/tests/Feature/Auth/SocialiteStubProductionGateTest.php
git commit -m "fix(auth): 404 the stub Socialite endpoints in production

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Session cookie `SameSite=Strict` → `Lax`

**Files:**

- Modify: `apps/web/src/shared/auth/cookie.ts`
- Modify: `apps/web/src/shared/auth/cookie.test.ts`

**Interfaces:**

- Produces: `buildSessionCookie()` output now contains `SameSite=Lax`. No signature change — Task 9's handler calls it exactly as Task 5's stub-callback already does.

- [ ] **Step 1: Update the failing assertion first**

In `apps/web/src/shared/auth/cookie.test.ts`, change:

```ts
expect(c).toContain('SameSite=Strict');
```

to:

```ts
expect(c).toContain('SameSite=Lax');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web -- cookie.test.ts`
Expected: FAIL — actual value is `SameSite=Strict`.

- [ ] **Step 3: Change the cookie attribute**

In `apps/web/src/shared/auth/cookie.ts`, in both `buildSessionCookie` and `buildLogoutCookie`, change `'SameSite=Strict'` to `'SameSite=Lax'`. Add a comment explaining why (this is the one required, non-cosmetic change from the design):

```ts
export function buildSessionCookie(token: string, opts: { secure: boolean }): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    // Lax, not Strict: the VATSIM OAuth callback's final redirect to
    // /{locale}/dashboard is the tail of a chain that started cross-site
    // at auth.vatsim.net. Browsers withhold Strict cookies on that
    // navigation; Lax still blocks the cookie on cross-site POSTs,
    // iframes and subresources — the real CSRF vectors — and all of
    // EuroStrip's API traffic goes through this server-side proxy, never
    // a browser-direct call.
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 14}`,
  ];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function buildLogoutCookie(opts: { secure: boolean }): string {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web -- cookie.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/auth/cookie.ts apps/web/src/shared/auth/cookie.test.ts
git commit -m "fix(auth): session cookie SameSite Strict to Lax for the OAuth redirect chain

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Frontend VATSIM redirect + callback route handlers

**Files:**

- Create: `apps/web/src/app/api/auth/vatsim-redirect/route.ts`
- Create: `apps/web/src/app/api/auth/vatsim-callback/route.ts`
- Test: `apps/web/src/app/api/auth/vatsim-callback/route.test.ts`

**Interfaces:**

- Consumes: `buildSessionCookie` (Task 8) from `@/shared/auth/cookie`; backend's `GET /auth/socialite/vatsim/redirect` (Task 5) and `POST /auth/socialite/exchange` (Task 6).
- Produces: `GET /api/auth/vatsim-redirect` and `GET /api/auth/vatsim-callback`, matching the URL shape Task 5's backend controller already redirects to (`?code=...&locale=...`).

- [ ] **Step 1: Write `vatsim-redirect` (no test — mirrors the untested `stub-redirect/route.ts` precedent; it is a pure URL builder with no branching)**

```ts
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.EUROSTRIP_BACKEND_URL ?? 'http://127.0.0.1:8000';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get('locale') ?? 'en';
  const target = new URL('/auth/socialite/vatsim/redirect', BACKEND_URL);
  target.searchParams.set('locale', locale);
  return NextResponse.redirect(target, 302);
}
```

- [ ] **Step 2: Write the failing test for `vatsim-callback`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

function makeReq(query: string) {
  return new Request(`http://localhost:3000/api/auth/vatsim-callback${query}`);
}

describe('/api/auth/vatsim-callback', () => {
  it('exchanges the code and redirects to /en/dashboard with the session cookie (happy)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await GET(makeReq('?code=abc123&locale=en'));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/socialite/exchange'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/en/dashboard');
    expect(res.headers.get('Set-Cookie')).toContain('eurostrip_session=tok');
  });

  it('honors locale=pt (happy)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await GET(makeReq('?code=abc123&locale=pt'));

    expect(res.headers.get('Location')).toContain('/pt/dashboard');
  });

  it('redirects to login with an error when the code is missing (invalid)', async () => {
    const res = await GET(makeReq(''));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/en/login?error=oauth');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('redirects to login with an error when the backend rejects the code (invalid)', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ message: 'bad' }), { status: 422 }));

    const res = await GET(makeReq('?code=expired&locale=en'));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/en/login?error=oauth');
  });

  it('redirects to login with an error on a malformed backend response (garbage)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ nope: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await GET(makeReq('?code=abc123&locale=en'));

    expect(res.headers.get('Location')).toContain('/en/login?error=oauth');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm nx test web -- vatsim-callback`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 4: Write `vatsim-callback/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { buildSessionCookie } from '@/shared/auth/cookie';
import { LOCALES, type Locale } from '@eurostrip/i18n';

const BACKEND_URL = process.env.EUROSTRIP_BACKEND_URL ?? 'http://127.0.0.1:8000';

function pickLocale(value: string | null): Locale {
  if (value && (LOCALES as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return 'en';
}

function loginError(url: URL, locale: Locale): NextResponse {
  return NextResponse.redirect(new URL(`/${locale}/login?error=oauth`, url), 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = pickLocale(url.searchParams.get('locale'));
  const code = url.searchParams.get('code');

  if (!code) {
    return loginError(url, locale);
  }

  const upstream = await fetch(`${BACKEND_URL}/auth/socialite/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!upstream.ok) {
    return loginError(url, locale);
  }

  const body = (await upstream.json()) as { access_token?: string };
  if (!body.access_token) {
    return loginError(url, locale);
  }

  const secure = process.env.NODE_ENV === 'production';
  const cookie = buildSessionCookie(body.access_token, { secure });

  const dashboard = new URL(`/${locale}/dashboard`, url);
  const res = NextResponse.redirect(dashboard, 302);
  res.headers.set('Set-Cookie', cookie);
  return res;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test web -- vatsim-callback`
Expected: PASS (5/5)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/auth/vatsim-redirect/route.ts apps/web/src/app/api/auth/vatsim-callback/route.ts apps/web/src/app/api/auth/vatsim-callback/route.test.ts
git commit -m "feat(auth): frontend VATSIM redirect and code-exchange route handlers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Login page — VATSIM button, stub gated to non-production

**Files:**

- Modify: `apps/web/src/app/[locale]/login/page.tsx`
- Create: `apps/web/src/app/[locale]/login/page.test.tsx`
- Modify: `apps/web/src/app/api/auth/stub-redirect/route.ts`
- Modify: `apps/web/src/app/api/auth/stub-callback/route.ts`
- Modify: `apps/web/src/app/api/auth/stub-callback/route.test.ts`
- Create: `apps/web/src/app/api/auth/stub-redirect/route.test.ts`
- Modify: `apps/web/src/messages/auth.en.json`
- Modify: `apps/web/src/messages/auth.pt.json`

**Interfaces:**

- Consumes: `/api/auth/vatsim-redirect` (Task 9).
- Produces: nothing consumed by later tasks — this is the UI surface.

- [ ] **Step 1: Add the i18n keys**

`apps/web/src/messages/auth.en.json`:

```json
{
  "auth": {
    "loginTitle": "Sign in to EuroStrip",
    "continueWithVatsim": "Continue with VATSIM",
    "continueWithStub": "Continue with Stub",
    "logoutLabel": "Log out",
    "loginError": "Sign-in failed. Please try again."
  }
}
```

`apps/web/src/messages/auth.pt.json`:

```json
{
  "auth": {
    "loginTitle": "Entrar em EuroStrip",
    "continueWithVatsim": "Continuar com VATSIM",
    "continueWithStub": "Continuar com Stub",
    "logoutLabel": "Sair",
    "loginError": "Falha ao entrar. Tente novamente."
  }
}
```

- [ ] **Step 2: Write the failing page test**

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import LoginPage from './page';

const messages = {
  auth: {
    loginTitle: 'Sign in to EuroStrip',
    continueWithVatsim: 'Continue with VATSIM',
    continueWithStub: 'Continue with Stub',
    logoutLabel: 'Log out',
    loginError: 'Sign-in failed. Please try again.',
  },
};

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginPage />
    </NextIntlClientProvider>,
  );
}

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('always shows the VATSIM button (happy)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Continue with VATSIM' })).toBeTruthy();
  });

  it('shows the stub button outside production (happy — dev/test convenience)', () => {
    vi.stubEnv('NODE_ENV', 'test');
    renderPage();
    expect(screen.getByRole('link', { name: 'Continue with Stub' })).toBeTruthy();
  });

  it('hides the stub button in production (invalid — must never reach real users)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    renderPage();
    expect(screen.queryByRole('link', { name: 'Continue with Stub' })).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm nx test web -- login/page.test.tsx`
Expected: FAIL — no "Continue with VATSIM" link exists yet.

- [ ] **Step 4: Rewrite the login page**

```tsx
'use client';

import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg-secondary p-4">
      <ObcCard className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-4">{t('loginTitle')}</h1>
        <Link href={`/api/auth/vatsim-redirect?locale=${locale}`}>
          <ObcButton fullWidth>{t('continueWithVatsim')}</ObcButton>
        </Link>
        {process.env.NODE_ENV !== 'production' && (
          <Link href={`/api/auth/stub-redirect?locale=${locale}`} className="block mt-2">
            <ObcButton fullWidth>{t('continueWithStub')}</ObcButton>
          </Link>
        )}
      </ObcCard>
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test web -- login/page.test.tsx`
Expected: PASS (3/3)

- [ ] **Step 6: Write the failing test for gating the stub route handlers**

`apps/web/src/app/api/auth/stub-redirect/route.test.ts` (new file):

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeReq(query: string) {
  return new Request(`http://localhost:3000/api/auth/stub-redirect${query}`);
}

describe('/api/auth/stub-redirect', () => {
  it('redirects to the backend stub callback outside production (happy)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const res = await GET(makeReq('?identity=a@b'));
    expect(res.status).toBe(302);
  });

  it('404s in production (invalid — must never reach real users)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await GET(makeReq('?identity=a@b'));
    expect(res.status).toBe(404);
  });
});
```

Add to `apps/web/src/app/api/auth/stub-callback/route.test.ts` (append to the existing `describe` block):

```ts
it('404s in production (invalid — must never reach real users)', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const res = await GET(makeReq('?identity=a@b'));
  expect(res.status).toBe(404);
  vi.unstubAllEnvs();
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `pnpm nx test web -- stub-redirect stub-callback`
Expected: FAIL — both handlers currently respond even when `NODE_ENV=production`.

- [ ] **Step 8: Add the production guard to both stub handlers**

`apps/web/src/app/api/auth/stub-redirect/route.ts` — add as the first line inside `GET`:

```ts
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }
  const url = new URL(request.url);
  ...
```

(add `import { NextResponse } from 'next/server';` if not already present in that file)

`apps/web/src/app/api/auth/stub-callback/route.ts` — same guard as the first line inside `GET`:

```ts
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }
  const url = new URL(request.url);
  ...
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm nx test web -- stub-redirect stub-callback login/page.test.tsx cookie.test.ts vatsim-callback`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/[locale]/login/page.tsx apps/web/src/app/[locale]/login/page.test.tsx apps/web/src/app/api/auth/stub-redirect/route.ts apps/web/src/app/api/auth/stub-redirect/route.test.ts apps/web/src/app/api/auth/stub-callback/route.ts apps/web/src/app/api/auth/stub-callback/route.test.ts apps/web/src/messages/auth.en.json apps/web/src/messages/auth.pt.json
git commit -m "feat(auth): VATSIM login button; hide the stub outside dev/test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Docs — ADR, auth architecture, CLAUDE.md index

**Files:**

- Create: `docs/adr/0010-vatsim-connect-oauth.md`
- Modify: `docs/adr/0004-stub-socialite-per-request-fixture.md`
- Modify: `docs/architecture/auth.md`
- Modify: `CLAUDE.md`

No tests — documentation only. This task's "done" is the self-review checklist below.

- [ ] **Step 1: Write ADR 0010**

Create `docs/adr/0010-vatsim-connect-oauth.md`:

```markdown
# ADR 0010 — VATSIM Connect as the Production Identity Provider

**Date:** 2026-09-03
**Status:** Accepted
**Supersedes:** [ADR 0004](0004-stub-socialite-per-request-fixture.md) (in production only — the stub remains in force for dev/test)

## Context

EuroStrip's controllers are VATSIM members; the stub Socialite driver from
ADR 0004 was always a placeholder for their real identity provider, VATSIM
Connect. Design: [`docs/superpowers/specs/2026-09-03-vatsim-oauth-design.md`](../superpowers/specs/2026-09-03-vatsim-oauth-design.md).

## Decision

`socialiteproviders/vatsim` is registered exactly like the stub (a
`ServiceProvider::boot()` calling `SocialiteManager::buildProvider()`),
requesting the `full_name` and `email` scopes (required) — nothing else.
Identity resolves CID-first, falling back to adopting an existing row by
email, then creating; this is `App\Authentication\ResolveSocialiteUser`,
shared verbatim by the VATSIM and stub callbacks. `users.vatsim_cid` is
the new unique, nullable identity column.

Because Next.js owns the httpOnly session cookie (ADR 0006) but Laravel's
callback is what mints the Passport Bearer, the token crosses the
boundary as a single-use, 60-second Dragonfly-backed exchange code
(`App\Authentication\ExchangeCodeStore`) rather than as a URL parameter —
the Bearer itself never appears in a URL, browser history, or access log.

The stub survives outside production (both HTTP endpoints `404` when
`app()->isProduction()`; the frontend hides the stub button and 404s its
own two route handlers when `NODE_ENV === 'production'`) so local dev and
e2e keep working without VATSIM credentials — ADR 0004's onboarding
promise is unchanged for non-production environments.

The session cookie's `SameSite` moved from `Strict` to `Lax`: the final
hop to `/{locale}/dashboard` is the tail of a redirect chain that began
cross-site at `auth.vatsim.net`, and `Strict` cookies are withheld on
that navigation. `Lax` still blocks the cookie on cross-site POSTs,
iframes and subresources; EuroStrip's API traffic goes through the
server-side Next.js proxy, never a browser-direct call, so the practical
CSRF posture is unchanged.

Any VATSIM account may sign in on first login and is auto-assigned the
`member` role — the same policy the stub used. No rating gate, no
allowlist; that is a distinct, later decision if the product ever needs
one.

## Consequences

**Positive:**

- Real controllers sign in with the credentials they already have.
- The Bearer token is never exposed in a URL, history entry, or log line
  at any point in the flow.
- Dev/test onboarding is unaffected — the stub still requires zero VATSIM
  credentials outside production.
- Identity resolution is one audited, shared code path for every login
  method, present and future.

**Negative:**

- VATSIM's `/api/user` payload does not map `email` through the
  provider's own `mapUserToObject()` — `App\Http\Controllers\Auth\VatsimAuthController::emailFromRaw()`
  reads it from the raw response at `data.personal.email`, an assumption
  inferred from the library's sibling `name_first`/`name_last`/`name_full`
  fields (which do live at that path) rather than from a captured live
  response. If a real account ever proves this path wrong, the fix is
  confined to that one method.
- The exchange endpoint is necessarily unauthenticated (rate-limited to
  20/min/IP); its security rests on the code's 64-character entropy and
  60-second TTL rather than a session check.
```

- [ ] **Step 2: Mark ADR 0004 superseded**

In `docs/adr/0004-stub-socialite-per-request-fixture.md`, change the header line:

```markdown
**Status:** Accepted
```

to:

```markdown
**Status:** Superseded by [ADR 0010](0010-vatsim-connect-oauth.md) for production. The stub described here remains in force for local dev, tests, and e2e.
```

- [ ] **Step 3: Update `docs/architecture/auth.md`**

Change the file's introductory sentence (currently referencing only the stub) to also point at the new ADR:

```markdown
This document is the canonical reference for how EuroStrip authenticates users
and authorizes their actions. For the rationale on the unusual pieces (the
permission marker interface, the stub Socialite driver, VATSIM Connect as
the production identity provider) see
[ADR 0003](../adr/0003-permission-marker-interface.md),
[ADR 0004](../adr/0004-stub-socialite-per-request-fixture.md), and
[ADR 0010](../adr/0010-vatsim-connect-oauth.md).
```

Replace section "## 4. Adding a real OAuth provider (future)" in full — it is no longer hypothetical — with:

```markdown
## 4. VATSIM Connect (production)

VATSIM members sign in with their real VATSIM account via
`socialiteproviders/vatsim`, registered the same way the stub is (a
`ServiceProvider::boot()` calling `SocialiteManager::buildProvider()` —
see [`app/Providers/VatsimSocialiteServiceProvider.php`](../../apps/backend/app/Providers/VatsimSocialiteServiceProvider.php)).
Scopes requested: `full_name`, `email` (required) — nothing else is
requested or stored.

### Files

- [`app/Http/Controllers/Auth/VatsimAuthController.php`](../../apps/backend/app/Http/Controllers/Auth/VatsimAuthController.php) —
  redirect + callback.
- [`app/Http/Controllers/Auth/AuthExchangeController.php`](../../apps/backend/app/Http/Controllers/Auth/AuthExchangeController.php) —
  redeems the one-time exchange code for the Bearer.
- [`app/Authentication/ResolveSocialiteUser.php`](../../apps/backend/app/Authentication/ResolveSocialiteUser.php) —
  identity resolution shared with the stub callback.
- [`app/Authentication/ExchangeCodeStore.php`](../../apps/backend/app/Authentication/ExchangeCodeStore.php) —
  the single-use, Dragonfly-backed token handoff.
- Routes: `GET /auth/socialite/vatsim/redirect`, `GET /auth/socialite/vatsim/callback`,
  `POST /auth/socialite/exchange` (rate-limited, `throttle:socialite-exchange`).

### Flow

1. Browser hits `GET /api/auth/vatsim-redirect` (Next.js), which redirects
   to Laravel's `GET /auth/socialite/vatsim/redirect`.
2. Laravel redirects to VATSIM Connect for consent.
3. VATSIM redirects back to `GET /auth/socialite/vatsim/callback`. The
   controller resolves the user via `ResolveSocialiteUser` (CID first,
   then email-adopt, then create), mints a Passport personal access
   token, and stores it under a random 64-character code with a 60-second
   TTL via `ExchangeCodeStore::put()`.
4. Laravel redirects to `{FRONTEND_URL}/api/auth/vatsim-callback?code=...&locale=...`
   — the Bearer itself is never in this URL.
5. Next.js POSTs the code to `POST /auth/socialite/exchange`, which
   redeems it exactly once (`ExchangeCodeStore::redeem()`, an atomic
   `GETDEL`) and returns the Bearer.
6. Next.js sets the existing httpOnly `eurostrip_session` cookie (ADR 0006) and redirects to `/{locale}/dashboard`.

Any failure — consent denied, state mismatch, a profile missing CID or
email, an expired or replayed exchange code — redirects to
`/{locale}/login?error=oauth`. No partial session is ever written.

### Identity resolution

`ResolveSocialiteUser::resolve(?string $cid, string $email, string $name)`:
match on `vatsim_cid` when given; else match on `email` and adopt the row
(setting its CID); else create. First login assigns the `member` role —
any VATSIM account may sign in; there is no rating gate or allowlist.

### Production gating of the stub

Both stub HTTP endpoints (`SocialiteStubController::redirect`/`callback`)
`abort_if(app()->isProduction(), 404)`. The frontend's stub route
handlers make the same check against `NODE_ENV`, and the login page hides
its stub button under the same condition. The stub driver's registration
is left unconditional — an unreachable extra Socialite driver has no
security exposure on its own.

Coverage: [`tests/Feature/Auth/VatsimAuthTest.php`](../../apps/backend/tests/Feature/Auth/VatsimAuthTest.php),
[`tests/Feature/Auth/AuthExchangeTest.php`](../../apps/backend/tests/Feature/Auth/AuthExchangeTest.php),
[`tests/Feature/Auth/SocialiteStubProductionGateTest.php`](../../apps/backend/tests/Feature/Auth/SocialiteStubProductionGateTest.php),
[`tests/Feature/Authentication/ResolveSocialiteUserTest.php`](../../apps/backend/tests/Feature/Authentication/ResolveSocialiteUserTest.php),
[`tests/Feature/Authentication/ExchangeCodeStoreTest.php`](../../apps/backend/tests/Feature/Authentication/ExchangeCodeStoreTest.php).
```

Renumber check: the old "## 4. Adding a real OAuth provider (future)" is replaced in place by the new "## 4. VATSIM Connect (production)" — sections 5–9 that already followed it keep their existing numbers unchanged. Confirm the file reads 1, 2, 3, 4, 5, 6, 7, 8, 9 in order after the edit.

- [ ] **Step 4: Update `CLAUDE.md`'s ADR index line**

In `CLAUDE.md`, find the bullet list under "What lives where" → "**ADRs:**" and add a `0010 VATSIM Connect OAuth` entry after `0009 bus middleware order` (read the exact current wording first — the list already ends at 0009 per the repo's most recent commit — and append `, 0010 VATSIM Connect OAuth` before the closing paren, matching the existing comma-separated style).

- [ ] **Step 5: Self-review**

Read `docs/adr/0010-vatsim-connect-oauth.md` and `docs/architecture/auth.md` §4 fresh: confirm every file path referenced actually exists (it does, from Tasks 1–10), confirm no "TBD"/placeholder text, confirm the flow description matches `VatsimAuthController` exactly as written in Task 5.

- [ ] **Step 6: Commit**

```bash
git add docs/adr/0010-vatsim-connect-oauth.md docs/adr/0004-stub-socialite-per-request-fixture.md docs/architecture/auth.md CLAUDE.md
git commit -m "docs(auth): ADR 0010 and auth.md for VATSIM Connect OAuth

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Final verification (after Task 11)

- [ ] Run the full backend suite: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan test`
- [ ] Run Pint check (no `--fix`, must be clean): `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pint --test`
- [ ] Run PHPStan: `pnpm nx phpstan backend` (or the project's equivalent target — check `apps/backend/package.json`/`project.json` for the exact target name if this differs)
- [ ] Run Deptrac: `pnpm nx deptrac backend` (or equivalent — confirms the new `app/Authentication/*` and `app/Http/Controllers/Auth/*` files land in the layers this plan assumed)
- [ ] Run the full frontend suite: `pnpm nx test web`
- [ ] Run frontend lint: `pnpm nx lint web`
- [ ] Run `pnpm lint:docs`
- [ ] Manually smoke-test the real VATSIM flow once real credentials are in `.env` (`VATSIM_CLIENT_ID`, `VATSIM_CLIENT_SECRET`; the example defaults `VATSIM_TEST=true` at the sandbox): click "Continue with VATSIM" on `/en/login`, complete consent, land on `/en/dashboard` with a working session.
- [ ] Run the e2e suite (`pnpm nx e2e web`) to confirm the stub path still works end-to-end in dev.
