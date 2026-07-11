# EuroScope Gateway & Console v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved spec at `docs/superpowers/specs/2026-07-10-gateway-console-design.md` — a Gateway CQRS module exposing the euroscope-websocket-connector protocol endpoints, plus a token page and raw JSON console in the Next.js app.

**Architecture:** One new backend module `app/Modules/Gateway/` (pure CQRS, mirrors the Ping module). All runtime state lives in Dragonfly: a Redis Stream per user is the ~200-message ring buffer (entry IDs double as poll cursors), a list is the plugin command queue, a TTL key is plugin presence. The browser long-polls symmetric to the plugin — no Soketi. Postgres gains no tables; the gateway token is a Passport PAT whose *name* (`gateway`) is enforced as the plugin/web boundary.

**Tech Stack:** Laravel 13 + Octane, Passport 13, phpredis via Dragonfly, Pest 4; Next.js 15 App Router, Redux Toolkit (RTK Query), zod, next-intl, Vitest, Playwright.

## Global Constraints

- **TDD always.** Every suite covers happy, invalid, and garbage paths (label them in test names like the Ping suites do).
- **Pure CQRS:** every Command/Query extends `Spatie\LaravelData\Data`, implements `App\Cqrs\Command`/`Query`, and declares `permission(): GatewayPermission`. No raw permission strings anywhere (PHPStan rule enforces).
- **Deptrac layers:** Domain depends on nothing; Application → Domain only; Infrastructure → Domain+Application+Framework; Presentation → all. Blocking Redis calls live ONLY in Infrastructure.
- **i18n:** no hardcoded user-facing strings. Frontend copy in `apps/web/src/messages/gateway.{en,pt}.json` + `libs/i18n/src/messages/{en,pt}.json` (nav); backend HTTP error copy in `apps/backend/lang/{en,pt}/gateway.php`.
- **Squared UI:** no `border-radius` classes (no `rounded-*` except `rounded-full`, which this feature doesn't need).
- **Protocol constants (copy verbatim):** ring buffer `MAXLEN 200` (exact trim); plugin poll hold ≤ **25 s**; console poll hold ≤ **15 s**; batch caps **200 messages / 512 KB (524288 bytes)**; send rate limit **60/min/user**; client feed cap **500**; poll backoff **1 s → 30 s** doubling; presence TTL **35 s**; token name **`gateway`**; gateway Redis key prefix **`gateway`** (config `gateway.key_prefix`).
- **Backend commands run in Docker** (stack must be up: `docker compose --env-file .env -f infra/docker-compose.yml up -d`). Test/lint wrappers:
  - Full backend suite: `pnpm nx test backend`
  - One file: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest <path>`
  - After EVERY backend task: `pnpm nx lint:fix backend` then `pnpm nx lint backend`
  - Gates: `pnpm nx analyze backend` (PHPStan), `pnpm nx deptrac backend`
- **Frontend commands run host-side:** full suite `pnpm nx test web`; one file `pnpm -C apps/web exec vitest run <path>`; e2e `pnpm nx e2e web`.
- **Conventional commits**, squash-merge to `main`.
- Backend feature tests use sqlite `:memory:` (`RefreshDatabase`) but talk to the **real Dragonfly** (tests execute inside the backend container where `REDIS_HOST=dragonfly`). Pest runs `--parallel`, and each parallel worker's sqlite user IDs restart at 1 — so every Redis-touching test MUST call `GatewayRedisTestSupport::useIsolatedPrefix()` (unique per-process key prefix) in `beforeEach` and `GatewayRedisTestSupport::flush()` in `afterEach` (defined in Task 2).

## File Map

```text
apps/backend/
├── config/gateway.php                                       (T1)
├── lang/en/gateway.php, lang/pt/gateway.php                 (T6)
├── app/Modules/Gateway/
│   ├── Domain/
│   │   ├── GatewayPermission.php                            (T1)
│   │   ├── Direction.php                                    (T1)
│   │   ├── ConsoleBatch.php                                 (T1)
│   │   ├── GatewayToken.php                                 (T1)
│   │   ├── GatewayStreamRepository.php                      (T1)
│   │   ├── CommandQueueRepository.php                       (T1)
│   │   ├── PluginPresenceRepository.php                     (T1)
│   │   └── GatewayTokenRepository.php                       (T1)
│   ├── Application/
│   │   ├── Commands/ RecordPluginMessages{Command,Handler}, IngestResult,
│   │   │             EnqueuePluginCommand{Command,Handler},
│   │   │             RotateGatewayToken{Command,Handler}    (T5)
│   │   └── Queries/  PollPluginCommands{Query,Handler},
│   │                 TailConsoleMessages{Query,Handler}, ConsoleView,
│   │                 GetTokenStatus{Query,Handler}          (T5)
│   ├── Infrastructure/
│   │   ├── GatewayServiceProvider.php                       (T1, grows T2–T5)
│   │   ├── RedisGatewayStreamRepository.php                 (T2)
│   │   ├── RedisCommandQueueRepository.php                  (T3)
│   │   ├── RedisPluginPresenceRepository.php                (T3)
│   │   └── PassportGatewayTokenRepository.php               (T4)
│   └── Presentation/Http/
│       ├── Middleware/EnsureGatewayToken.php                (T6)
│       ├── PluginTransportController.php                    (T6)
│       ├── ConsoleController.php                            (T7)
│       ├── TokenController.php                              (T7)
│       ├── Requests/RecordPluginMessagesRequest.php         (T6)
│       ├── Requests/EnqueuePluginCommandRequest.php         (T7)
│       └── routes.php                                       (T6, grows T7)
├── tests/Support/Modules/Gateway/  (fakes + GatewayRedisTestSupport)   (T2, T5)
├── tests/Feature/Modules/Gateway/  (repo + endpoint tests)  (T1–T4, T6, T7)
└── tests/Unit/Modules/Gateway/     (handler tests)          (T5)

apps/web/
├── src/features/gateway/
│   ├── schema.ts + schema.test.ts                           (T8)
│   ├── api.ts + api.test.ts                                 (T8)
│   ├── slice.ts + slice.test.ts                             (T8)
│   ├── useGatewayPoll.ts + useGatewayPoll.test.tsx          (T9)
│   └── components/ TokenPanel(+test)                        (T10)
│                   ConsoleClient, MessageFeed(+test),
│                   CommandComposer(+test), ConsoleStatusHeader(+test)  (T11)
├── src/app/[locale]/token/page.tsx                          (T10)
├── src/app/[locale]/console/page.tsx                        (T11)
├── src/messages/gateway.{en,pt}.json                        (T10)
├── src/i18n/request.ts (wire gateway catalogs)              (T10)
├── src/shared/store/index.ts (register gateway reducer)     (T8)
├── src/app/[locale]/dashboard/page.tsx (nav links)          (T10)
└── e2e/support/fake-plugin.ts, e2e/gateway-console.spec.ts,
    e2e/global-setup.ts (add GatewayPermission)              (T12)

libs/api-client/src/baseApi.ts (add GatewayToken tag)        (T8)
libs/i18n/src/messages/{en,pt}.json (nav + rebrand)          (T10, T13)
docs/architecture/gateway.md, docs/adr/0009-*.md,
docs/architecture/overview.md, README.md, CLAUDE.md          (T13)
```

---

### Task 1: Gateway Domain layer, permissions, module wiring

**Files:**

- Create: `apps/backend/app/Modules/Gateway/Domain/GatewayPermission.php`
- Create: `apps/backend/app/Modules/Gateway/Domain/Direction.php`
- Create: `apps/backend/app/Modules/Gateway/Domain/ConsoleBatch.php`
- Create: `apps/backend/app/Modules/Gateway/Domain/GatewayToken.php`
- Create: `apps/backend/app/Modules/Gateway/Domain/GatewayStreamRepository.php`
- Create: `apps/backend/app/Modules/Gateway/Domain/CommandQueueRepository.php`
- Create: `apps/backend/app/Modules/Gateway/Domain/PluginPresenceRepository.php`
- Create: `apps/backend/app/Modules/Gateway/Domain/GatewayTokenRepository.php`
- Create: `apps/backend/app/Modules/Gateway/Infrastructure/GatewayServiceProvider.php`
- Create: `apps/backend/config/gateway.php`
- Modify: `apps/backend/bootstrap/providers.php`
- Modify: `apps/backend/database/seeders/RolesSeeder.php`
- Test: `apps/backend/tests/Feature/Modules/Gateway/GatewayPermissionsTest.php`

**Interfaces:**

- Consumes: `App\Authorization\Contracts\Permission`, `Database\Seeders\PermissionsSeeder` (auto-discovers enums under `app/Modules`).
- Produces (used by every later backend task):
  - `GatewayPermission::UseGateway = 'gateway.use'`, `::UseConsole = 'gateway.console'`, `::ManageToken = 'gateway.token'`
  - `enum Direction: string { case In = 'in'; case Out = 'out'; }`
  - `ConsoleBatch { /** @var array<int, array{id:string,direction:string,envelope:string}> */ public readonly array $messages; public readonly ?string $cursor; public readonly bool $reset; }`
  - `GatewayToken { public readonly string $plainText; public readonly \DateTimeImmutable $createdAt; }`
  - `GatewayStreamRepository::append(int $userId, Direction $direction, string $envelopeJson): string` and `::tail(int $userId, ?string $afterId, int $blockMs): ConsoleBatch`
  - `CommandQueueRepository::enqueue(int $userId, string $envelopeJson): void` and `::drain(int $userId, int $blockSeconds): array` (returns `array<int, string>`)
  - `PluginPresenceRepository::markSeen(int $userId): void` and `::isConnected(int $userId): bool`
  - `GatewayTokenRepository::rotate(int $userId): GatewayToken` and `::activeTokenCreatedAt(int $userId): ?\DateTimeImmutable`
  - config key `gateway.key_prefix` (default `'gateway'`, env `GATEWAY_KEY_PREFIX`)

- [ ] **Step 1: Write the failing test**

`apps/backend/tests/Feature/Modules/Gateway/GatewayPermissionsTest.php`:

```php
<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Modules\Gateway\Domain\GatewayPermission;
use Database\Seeders\PermissionsSeeder;
use Database\Seeders\RolesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

it('declares the three gateway permissions (happy)', function (): void {
    expect(GatewayPermission::UseGateway->value)->toBe('gateway.use');
    expect(GatewayPermission::UseConsole->value)->toBe('gateway.console');
    expect(GatewayPermission::ManageToken->value)->toBe('gateway.token');
});

it('is discovered by the permissions seeder (happy)', function (): void {
    (new PermissionsSeeder)->run();

    foreach (GatewayPermission::cases() as $case) {
        $this->assertDatabaseHas('permissions', [
            'name' => $case->value,
            'guard_name' => 'web',
        ]);
    }
});

it('grants all gateway permissions to the member role (happy)', function (): void {
    (new PermissionsSeeder)->run();
    (new RolesSeeder)->run();

    $member = RoleModel::where('name', Role::Member->value)
        ->where('guard_name', 'web')
        ->firstOrFail();

    foreach (GatewayPermission::cases() as $case) {
        expect($member->hasPermissionTo($case->value))->toBeTrue();
    }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Modules/Gateway/GatewayPermissionsTest.php`
Expected: FAIL — `Class "App\Modules\Gateway\Domain\GatewayPermission" not found`

- [ ] **Step 3: Create the Domain files**

`apps/backend/app/Modules/Gateway/Domain/GatewayPermission.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

use App\Authorization\Contracts\Permission;

enum GatewayPermission: string implements Permission
{
    case UseGateway = 'gateway.use';
    case UseConsole = 'gateway.console';
    case ManageToken = 'gateway.token';
}
```

`apps/backend/app/Modules/Gateway/Domain/Direction.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

enum Direction: string
{
    case In = 'in';
    case Out = 'out';
}
```

`apps/backend/app/Modules/Gateway/Domain/ConsoleBatch.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

final class ConsoleBatch
{
    /**
     * @param  array<int, array{id: string, direction: string, envelope: string}>  $messages
     * @param  ?string  $cursor  Stream ID of the newest returned entry; callers resume from here.
     * @param  bool  $reset  True when the caller's cursor predates the ring buffer — replace, don't append.
     */
    public function __construct(
        public readonly array $messages,
        public readonly ?string $cursor,
        public readonly bool $reset,
    ) {}
}
```

`apps/backend/app/Modules/Gateway/Domain/GatewayToken.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

use DateTimeImmutable;

final class GatewayToken
{
    public function __construct(
        public readonly string $plainText,
        public readonly DateTimeImmutable $createdAt,
    ) {}
}
```

`apps/backend/app/Modules/Gateway/Domain/GatewayStreamRepository.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

interface GatewayStreamRepository
{
    /** Append one protocol envelope (raw JSON) to the user's ring buffer. Returns the stream entry ID. */
    public function append(int $userId, Direction $direction, string $envelopeJson): string;

    /**
     * Read the ring buffer. Null $afterId = full backfill (never blocks).
     * With a cursor: blocks up to $blockMs for new entries; flags reset
     * when the cursor predates the oldest retained entry.
     */
    public function tail(int $userId, ?string $afterId, int $blockMs): ConsoleBatch;
}
```

`apps/backend/app/Modules/Gateway/Domain/CommandQueueRepository.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

interface CommandQueueRepository
{
    public function enqueue(int $userId, string $envelopeJson): void;

    /**
     * Drain every queued command, blocking up to $blockSeconds for the first.
     *
     * @return array<int, string> raw JSON envelopes, oldest first; [] on timeout
     */
    public function drain(int $userId, int $blockSeconds): array;
}
```

`apps/backend/app/Modules/Gateway/Domain/PluginPresenceRepository.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

interface PluginPresenceRepository
{
    public function markSeen(int $userId): void;

    public function isConnected(int $userId): bool;
}
```

`apps/backend/app/Modules/Gateway/Domain/GatewayTokenRepository.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

use DateTimeImmutable;

interface GatewayTokenRepository
{
    /** Revoke any existing gateway token and mint a fresh one. */
    public function rotate(int $userId): GatewayToken;

    public function activeTokenCreatedAt(int $userId): ?DateTimeImmutable;
}
```

- [ ] **Step 4: Create config, provider, and wire the module**

`apps/backend/config/gateway.php`:

```php
<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Redis key prefix
    |--------------------------------------------------------------------------
    |
    | All gateway runtime keys (message stream, command queue, presence) are
    | namespaced under this prefix. Tests override it per-process so parallel
    | Pest workers sharing one Dragonfly never collide.
    |
    */

    'key_prefix' => env('GATEWAY_KEY_PREFIX', 'gateway'),

];
```

`apps/backend/app/Modules/Gateway/Infrastructure/GatewayServiceProvider.php` (bindings/registrations land in Tasks 2–5):

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Infrastructure;

use Illuminate\Support\ServiceProvider;

class GatewayServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        //
    }
}
```

`apps/backend/bootstrap/providers.php` — add the import and entry (keep existing lines):

```php
use App\Modules\Gateway\Infrastructure\GatewayServiceProvider;
// ...
return [
    AppServiceProvider::class,
    AdminPanelProvider::class,
    HorizonServiceProvider::class,
    SocialiteStubServiceProvider::class,
    BusServiceProvider::class,
    PingServiceProvider::class,
    GatewayServiceProvider::class,
];
```

`apps/backend/database/seeders/RolesSeeder.php` — extend the member grant list. Add the import `use App\Modules\Gateway\Domain\GatewayPermission;` and change:

```php
        $memberPermissionNames = [
            PingPermission::View->value,
            PingPermission::Create->value,
            GatewayPermission::UseGateway->value,
            GatewayPermission::UseConsole->value,
            GatewayPermission::ManageToken->value,
        ];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Modules/Gateway/GatewayPermissionsTest.php`
Expected: PASS (3 tests)

- [ ] **Step 6: Lint and commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend docs
git commit -m "feat(gateway): domain layer, permissions, module wiring"
```

---

### Task 2: Redis stream repository (ring buffer + blocking tail)

**Files:**

- Create: `apps/backend/app/Modules/Gateway/Infrastructure/RedisGatewayStreamRepository.php`
- Create: `apps/backend/tests/Support/Modules/Gateway/GatewayRedisTestSupport.php`
- Modify: `apps/backend/app/Modules/Gateway/Infrastructure/GatewayServiceProvider.php` (binding)
- Test: `apps/backend/tests/Feature/Modules/Gateway/RedisGatewayStreamRepositoryTest.php`

**Interfaces:**

- Consumes: `GatewayStreamRepository`, `ConsoleBatch`, `Direction` (Task 1); `config('gateway.key_prefix')`; `Illuminate\Support\Facades\Redis` (phpredis client).
- Produces: `RedisGatewayStreamRepository implements GatewayStreamRepository` bound in the container; key shape `{prefix}:{userId}:messages`; `GatewayRedisTestSupport::useIsolatedPrefix(): void` and `::flush(): void` used by ALL later Redis-touching tests.

**phpredis gotchas this task must respect (encode as code comments):**

1. The Laravel Redis connection applies `OPT_PREFIX` (`eurostrip-database-`) to keys client-side — replies from `XREAD`/`KEYS` contain the *prefixed* names, so never use reply keys as inputs; strip or ignore them.
2. `xRead` returns `false` on block-timeout — normalize to `[]`.
3. Use exact `MAXLEN` (approx = `false`) so trim behavior is deterministic in tests.
4. If `XREAD BLOCK` ever throws `read error on connection`, set `'read_timeout' => 0` in `config/database.php` `redis.default` — the default socket timeout must exceed the 15 s hold.

- [ ] **Step 1: Write the test support class**

`apps/backend/tests/Support/Modules/Gateway/GatewayRedisTestSupport.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Support\Modules\Gateway;

use Illuminate\Support\Facades\Redis;

final class GatewayRedisTestSupport
{
    /** Point gateway keys at a unique prefix so parallel Pest workers never collide. */
    public static function useIsolatedPrefix(): void
    {
        config(['gateway.key_prefix' => 'gwtest:'.getmypid().':'.bin2hex(random_bytes(4))]);
    }

    /** Delete every key under the isolated prefix. */
    public static function flush(): void
    {
        $conn = Redis::connection();
        // KEYS replies carry the phpredis OPT_PREFIX; DEL re-applies it, so strip first.
        $clientPrefix = (string) config('database.redis.options.prefix');
        foreach ($conn->keys(config('gateway.key_prefix').':*') as $key) {
            $bare = str_starts_with((string) $key, $clientPrefix)
                ? substr((string) $key, strlen($clientPrefix))
                : (string) $key;
            $conn->del($bare);
        }
    }
}
```

- [ ] **Step 2: Write the failing tests**

`apps/backend/tests/Feature/Modules/Gateway/RedisGatewayStreamRepositoryTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Gateway\Domain\Direction;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use App\Modules\Gateway\Infrastructure\RedisGatewayStreamRepository;
use Tests\Support\Modules\Gateway\GatewayRedisTestSupport;

beforeEach(fn () => GatewayRedisTestSupport::useIsolatedPrefix());
afterEach(fn () => GatewayRedisTestSupport::flush());

it('binds the interface in the container (happy)', function (): void {
    expect(app(GatewayStreamRepository::class))->toBeInstanceOf(RedisGatewayStreamRepository::class);
});

it('appends and backfills without a cursor (happy)', function (): void {
    $repo = new RedisGatewayStreamRepository;
    $repo->append(7, Direction::In, '{"a":1}');
    $repo->append(7, Direction::Out, '{"b":2}');

    $batch = $repo->tail(7, null, 0);

    expect($batch->messages)->toHaveCount(2);
    expect($batch->messages[0]['direction'])->toBe('in');
    expect($batch->messages[0]['envelope'])->toBe('{"a":1}');
    expect($batch->messages[1]['direction'])->toBe('out');
    expect($batch->reset)->toBeFalse();
    expect($batch->cursor)->toBe($batch->messages[1]['id']);
});

it('tails only entries newer than the cursor (happy)', function (): void {
    $repo = new RedisGatewayStreamRepository;
    $firstId = $repo->append(7, Direction::In, '{"a":1}');
    $repo->append(7, Direction::In, '{"b":2}');

    $batch = $repo->tail(7, $firstId, 0);

    expect($batch->messages)->toHaveCount(1);
    expect($batch->messages[0]['envelope'])->toBe('{"b":2}');
    expect($batch->reset)->toBeFalse();
});

it('returns an empty batch and keeps the cursor on blocking timeout (invalid)', function (): void {
    $repo = new RedisGatewayStreamRepository;
    $lastId = $repo->append(7, Direction::In, '{"a":1}');

    $batch = $repo->tail(7, $lastId, 300);

    expect($batch->messages)->toBe([]);
    expect($batch->cursor)->toBe($lastId);
    expect($batch->reset)->toBeFalse();
});

it('trims to 200 entries and flags reset for a trimmed cursor (garbage volume)', function (): void {
    $repo = new RedisGatewayStreamRepository;
    $staleId = $repo->append(7, Direction::In, '{"i":0}');
    for ($i = 1; $i <= 210; $i++) {
        $repo->append(7, Direction::In, sprintf('{"i":%d}', $i));
    }

    $batch = $repo->tail(7, $staleId, 0);

    expect($batch->reset)->toBeTrue();
    expect($batch->messages)->toHaveCount(200);
    expect($batch->messages[0]['envelope'])->toBe('{"i":11}');
});

it('isolates streams per user (happy)', function (): void {
    $repo = new RedisGatewayStreamRepository;
    $repo->append(1, Direction::In, '{"mine":true}');

    expect($repo->tail(2, null, 0)->messages)->toBe([]);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Modules/Gateway/RedisGatewayStreamRepositoryTest.php`
Expected: FAIL — `Class "App\Modules\Gateway\Infrastructure\RedisGatewayStreamRepository" not found`

- [ ] **Step 4: Implement the repository and binding**

`apps/backend/app/Modules/Gateway/Infrastructure/RedisGatewayStreamRepository.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Infrastructure;

use App\Modules\Gateway\Domain\ConsoleBatch;
use App\Modules\Gateway\Domain\Direction;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use Illuminate\Support\Facades\Redis;

final class RedisGatewayStreamRepository implements GatewayStreamRepository
{
    private const RING_SIZE = 200;

    public function append(int $userId, Direction $direction, string $envelopeJson): string
    {
        // Exact MAXLEN (approx = false): deterministic trims, and 200 entries
        // is far too small for approximate node-based trimming to matter.
        $id = Redis::connection()->xAdd($this->key($userId), '*', [
            'direction' => $direction->value,
            'envelope' => $envelopeJson,
        ], self::RING_SIZE, false);

        return (string) $id;
    }

    public function tail(int $userId, ?string $afterId, int $blockMs): ConsoleBatch
    {
        $conn = Redis::connection();
        $key = $this->key($userId);

        if ($afterId === null) {
            $entries = $conn->xRange($key, '-', '+', self::RING_SIZE);

            return $this->batchFrom(is_array($entries) ? $entries : [], reset: false, fallbackCursor: null);
        }

        // A cursor older than the oldest retained entry means the ring trimmed
        // past it — the client has a gap and must replace, not append.
        $oldest = $conn->xRange($key, '-', '+', 1);
        if (is_array($oldest) && $oldest !== [] && self::isBefore($afterId, (string) array_key_first($oldest))) {
            $entries = $conn->xRange($key, '-', '+', self::RING_SIZE);

            return $this->batchFrom(is_array($entries) ? $entries : [], reset: true, fallbackCursor: null);
        }

        // XREAD BLOCK doubles as the long-poll wait: returns immediately when
        // entries newer than the cursor exist, otherwise holds up to $blockMs.
        // phpredis returns false on timeout; replies key by the *prefixed*
        // stream name, so take the first value instead of matching the key.
        $reply = $blockMs > 0
            ? $conn->xRead([$key => $afterId], self::RING_SIZE, $blockMs)
            : $conn->xRead([$key => $afterId], self::RING_SIZE);
        $entries = is_array($reply) && $reply !== [] ? (array) reset($reply) : [];

        return $this->batchFrom($entries, reset: false, fallbackCursor: $afterId);
    }

    /** @param array<int|string, mixed> $entries */
    private function batchFrom(array $entries, bool $reset, ?string $fallbackCursor): ConsoleBatch
    {
        $messages = [];
        $cursor = $fallbackCursor;
        foreach ($entries as $id => $fields) {
            $fields = (array) $fields;
            $messages[] = [
                'id' => (string) $id,
                'direction' => (string) ($fields['direction'] ?? ''),
                'envelope' => (string) ($fields['envelope'] ?? ''),
            ];
            $cursor = (string) $id;
        }

        return new ConsoleBatch($messages, $cursor, $reset);
    }

    private static function isBefore(string $a, string $b): bool
    {
        [$aMs, $aSeq] = array_map(intval(...), explode('-', $a) + [1 => '0']);
        [$bMs, $bSeq] = array_map(intval(...), explode('-', $b) + [1 => '0']);

        return $aMs < $bMs || ($aMs === $bMs && $aSeq < $bSeq);
    }

    private function key(int $userId): string
    {
        return config('gateway.key_prefix').':'.$userId.':messages';
    }
}
```

In `GatewayServiceProvider::register()` add:

```php
        $this->app->bind(
            \App\Modules\Gateway\Domain\GatewayStreamRepository::class,
            RedisGatewayStreamRepository::class,
        );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Modules/Gateway/RedisGatewayStreamRepositoryTest.php`
Expected: PASS (6 tests; the timeout test takes ~0.3 s)

- [ ] **Step 6: Lint and commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "feat(gateway): redis stream repository (ring buffer + blocking tail)"
```

---

### Task 3: Redis command queue + plugin presence repositories

**Files:**

- Create: `apps/backend/app/Modules/Gateway/Infrastructure/RedisCommandQueueRepository.php`
- Create: `apps/backend/app/Modules/Gateway/Infrastructure/RedisPluginPresenceRepository.php`
- Modify: `apps/backend/app/Modules/Gateway/Infrastructure/GatewayServiceProvider.php` (bindings)
- Test: `apps/backend/tests/Feature/Modules/Gateway/RedisCommandQueueRepositoryTest.php`
- Test: `apps/backend/tests/Feature/Modules/Gateway/RedisPluginPresenceRepositoryTest.php`

**Interfaces:**

- Consumes: `CommandQueueRepository`, `PluginPresenceRepository` (Task 1); `GatewayRedisTestSupport` (Task 2).
- Produces: implementations bound in the container; key shapes `{prefix}:{userId}:commands` (list) and `{prefix}:{userId}:plugin-seen` (string, `EX 35`); presence TTL constant **35**.

- [ ] **Step 1: Write the failing tests**

`apps/backend/tests/Feature/Modules/Gateway/RedisCommandQueueRepositoryTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Gateway\Domain\CommandQueueRepository;
use App\Modules\Gateway\Infrastructure\RedisCommandQueueRepository;
use Tests\Support\Modules\Gateway\GatewayRedisTestSupport;

beforeEach(fn () => GatewayRedisTestSupport::useIsolatedPrefix());
afterEach(fn () => GatewayRedisTestSupport::flush());

it('binds the interface in the container (happy)', function (): void {
    expect(app(CommandQueueRepository::class))->toBeInstanceOf(RedisCommandQueueRepository::class);
});

it('drains queued commands in order and empties the queue (happy)', function (): void {
    $repo = new RedisCommandQueueRepository;
    $repo->enqueue(7, '{"n":1}');
    $repo->enqueue(7, '{"n":2}');
    $repo->enqueue(7, '{"n":3}');

    expect($repo->drain(7, 1))->toBe(['{"n":1}', '{"n":2}', '{"n":3}']);
    expect($repo->drain(7, 1))->toBe([]);
});

it('returns empty after the block timeout on an empty queue (invalid)', function (): void {
    $repo = new RedisCommandQueueRepository;

    $start = microtime(true);
    expect($repo->drain(9, 1))->toBe([]);
    expect(microtime(true) - $start)->toBeGreaterThan(0.9);
});

it('does not leak commands across users (garbage)', function (): void {
    $repo = new RedisCommandQueueRepository;
    $repo->enqueue(1, '{"mine":true}');

    expect($repo->drain(2, 1))->toBe([]);
    expect($repo->drain(1, 1))->toBe(['{"mine":true}']);
});
```

`apps/backend/tests/Feature/Modules/Gateway/RedisPluginPresenceRepositoryTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Gateway\Domain\PluginPresenceRepository;
use App\Modules\Gateway\Infrastructure\RedisPluginPresenceRepository;
use Illuminate\Support\Facades\Redis;
use Tests\Support\Modules\Gateway\GatewayRedisTestSupport;

beforeEach(fn () => GatewayRedisTestSupport::useIsolatedPrefix());
afterEach(fn () => GatewayRedisTestSupport::flush());

it('binds the interface in the container (happy)', function (): void {
    expect(app(PluginPresenceRepository::class))->toBeInstanceOf(RedisPluginPresenceRepository::class);
});

it('reports connected after markSeen with a 35s TTL (happy)', function (): void {
    $repo = new RedisPluginPresenceRepository;
    $repo->markSeen(7);

    expect($repo->isConnected(7))->toBeTrue();

    $ttl = (int) Redis::connection()->ttl(config('gateway.key_prefix').':7:plugin-seen');
    expect($ttl)->toBeGreaterThan(0)->toBeLessThanOrEqual(35);
});

it('reports disconnected when never seen (invalid)', function (): void {
    expect((new RedisPluginPresenceRepository)->isConnected(404))->toBeFalse();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Modules/Gateway/RedisCommandQueueRepositoryTest.php tests/Feature/Modules/Gateway/RedisPluginPresenceRepositoryTest.php`
Expected: FAIL — classes not found

- [ ] **Step 3: Implement both repositories and bindings**

`apps/backend/app/Modules/Gateway/Infrastructure/RedisCommandQueueRepository.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Infrastructure;

use App\Modules\Gateway\Domain\CommandQueueRepository;
use Illuminate\Support\Facades\Redis;

final class RedisCommandQueueRepository implements CommandQueueRepository
{
    private const DRAIN_REST = 199;

    public function enqueue(int $userId, string $envelopeJson): void
    {
        Redis::connection()->rPush($this->key($userId), $envelopeJson);
    }

    public function drain(int $userId, int $blockSeconds): array
    {
        $conn = Redis::connection();
        $key = $this->key($userId);

        // BLPOP 0 would block forever — clamp to at least 1 second.
        $first = $conn->blPop([$key], max(1, $blockSeconds));
        if (! is_array($first) || count($first) < 2) {
            return [];
        }

        // One command woke us; grab whatever else queued up without blocking
        // so a burst goes out to the plugin in a single poll response.
        $items = [(string) $first[1]];
        $rest = $conn->lPop($key, self::DRAIN_REST);
        foreach (is_array($rest) ? $rest : [] as $value) {
            $items[] = (string) $value;
        }

        return $items;
    }

    private function key(int $userId): string
    {
        return config('gateway.key_prefix').':'.$userId.':commands';
    }
}
```

`apps/backend/app/Modules/Gateway/Infrastructure/RedisPluginPresenceRepository.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Infrastructure;

use App\Modules\Gateway\Domain\PluginPresenceRepository;
use Illuminate\Support\Facades\Redis;

final class RedisPluginPresenceRepository implements PluginPresenceRepository
{
    // Must outlive one 25s plugin poll cycle plus latency slack.
    private const TTL_SECONDS = 35;

    public function markSeen(int $userId): void
    {
        Redis::connection()->setEx($this->key($userId), self::TTL_SECONDS, '1');
    }

    public function isConnected(int $userId): bool
    {
        return (bool) Redis::connection()->exists($this->key($userId));
    }

    private function key(int $userId): string
    {
        return config('gateway.key_prefix').':'.$userId.':plugin-seen';
    }
}
```

In `GatewayServiceProvider::register()` add:

```php
        $this->app->bind(
            \App\Modules\Gateway\Domain\CommandQueueRepository::class,
            RedisCommandQueueRepository::class,
        );
        $this->app->bind(
            \App\Modules\Gateway\Domain\PluginPresenceRepository::class,
            RedisPluginPresenceRepository::class,
        );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Modules/Gateway/RedisCommandQueueRepositoryTest.php tests/Feature/Modules/Gateway/RedisPluginPresenceRepositoryTest.php`
Expected: PASS (7 tests; ~3 s from deliberate block timeouts)

- [ ] **Step 5: Lint and commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "feat(gateway): redis command queue and plugin presence repositories"
```

---

### Task 4: Passport-backed gateway token repository

**Files:**

- Create: `apps/backend/app/Modules/Gateway/Infrastructure/PassportGatewayTokenRepository.php`
- Modify: `apps/backend/app/Modules/Gateway/Infrastructure/GatewayServiceProvider.php` (binding)
- Test: `apps/backend/tests/Feature/Modules/Gateway/PassportGatewayTokenRepositoryTest.php`

**Interfaces:**

- Consumes: `GatewayTokenRepository`, `GatewayToken` (Task 1); `App\Models\User` (`HasApiTokens::createToken()`, `tokens()` relation — see `SocialiteStubController` for the mint pattern).
- Produces: `PassportGatewayTokenRepository implements GatewayTokenRepository`; the token NAME constant is `'gateway'` — Task 6's middleware and Task 7's tests rely on exactly this name.

- [ ] **Step 1: Write the failing tests**

`apps/backend/tests/Feature/Modules/Gateway/PassportGatewayTokenRepositoryTest.php`:

```php
<?php

declare(strict_types=1);

use App\Models\User;
use App\Modules\Gateway\Infrastructure\PassportGatewayTokenRepository;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\ClientRepository;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // RefreshDatabase truncates oauth_clients between tests, so we seed a
    // fresh personal-access client per test (same as PingControllerTest).
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );
});

it('mints a personal access token named gateway (happy)', function (): void {
    $user = User::factory()->create();
    $repo = new PassportGatewayTokenRepository;

    $token = $repo->rotate($user->id);

    expect($token->plainText)->toBeString()->not->toBe('');
    expect($token->createdAt)->toBeInstanceOf(DateTimeImmutable::class);
    expect($user->tokens()->where('name', 'gateway')->where('revoked', false)->count())->toBe(1);
});

it('revokes the previous gateway token on rotate (happy)', function (): void {
    $user = User::factory()->create();
    $repo = new PassportGatewayTokenRepository;

    $first = $repo->rotate($user->id);
    $second = $repo->rotate($user->id);

    expect($second->plainText)->not->toBe($first->plainText);
    expect($user->tokens()->where('name', 'gateway')->where('revoked', false)->count())->toBe(1);
    expect($user->tokens()->where('name', 'gateway')->where('revoked', true)->count())->toBe(1);
});

it('leaves non-gateway tokens untouched (happy)', function (): void {
    $user = User::factory()->create();
    $user->createToken('stub-login');

    (new PassportGatewayTokenRepository)->rotate($user->id);

    expect($user->tokens()->where('name', 'stub-login')->where('revoked', false)->count())->toBe(1);
});

it('reports null status before any token exists (invalid)', function (): void {
    $user = User::factory()->create();

    expect((new PassportGatewayTokenRepository)->activeTokenCreatedAt($user->id))->toBeNull();
});

it('reports the active token creation time after rotate (happy)', function (): void {
    $user = User::factory()->create();
    $repo = new PassportGatewayTokenRepository;

    $token = $repo->rotate($user->id);

    expect($repo->activeTokenCreatedAt($user->id)?->format(DATE_ATOM))
        ->toBe($token->createdAt->format(DATE_ATOM));
});

it('throws for an unknown user (garbage)', function (): void {
    expect(fn () => (new PassportGatewayTokenRepository)->rotate(999_999))
        ->toThrow(ModelNotFoundException::class);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Modules/Gateway/PassportGatewayTokenRepositoryTest.php`
Expected: FAIL — class not found

- [ ] **Step 3: Implement the repository and binding**

`apps/backend/app/Modules/Gateway/Infrastructure/PassportGatewayTokenRepository.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Infrastructure;

use App\Models\User;
use App\Modules\Gateway\Domain\GatewayToken;
use App\Modules\Gateway\Domain\GatewayTokenRepository;
use DateTimeImmutable;

final class PassportGatewayTokenRepository implements GatewayTokenRepository
{
    public const TOKEN_NAME = 'gateway';

    public function rotate(int $userId): GatewayToken
    {
        $user = User::query()->findOrFail($userId);

        $user->tokens()
            ->where('name', self::TOKEN_NAME)
            ->where('revoked', false)
            ->get()
            ->each(fn ($token) => $token->revoke());

        $result = $user->createToken(self::TOKEN_NAME);

        return new GatewayToken(
            plainText: $result->accessToken,
            createdAt: $result->token->created_at->toDateTimeImmutable(),
        );
    }

    public function activeTokenCreatedAt(int $userId): ?DateTimeImmutable
    {
        $token = User::query()->findOrFail($userId)
            ->tokens()
            ->where('name', self::TOKEN_NAME)
            ->where('revoked', false)
            ->latest('created_at')
            ->first();

        return $token?->created_at?->toDateTimeImmutable();
    }
}
```

In `GatewayServiceProvider::register()` add:

```php
        $this->app->bind(
            \App\Modules\Gateway\Domain\GatewayTokenRepository::class,
            PassportGatewayTokenRepository::class,
        );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Modules/Gateway/PassportGatewayTokenRepositoryTest.php`
Expected: PASS (6 tests)

- [ ] **Step 5: Lint and commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "feat(gateway): passport-backed gateway token repository"
```

---

### Task 5: Application layer — commands, queries, handlers

**Files:**

- Create: `apps/backend/app/Modules/Gateway/Application/Commands/RecordPluginMessagesCommand.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Commands/RecordPluginMessagesHandler.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Commands/IngestResult.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Commands/EnqueuePluginCommandCommand.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Commands/EnqueuePluginCommandHandler.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Commands/RotateGatewayTokenCommand.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Commands/RotateGatewayTokenHandler.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Queries/PollPluginCommandsQuery.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Queries/PollPluginCommandsHandler.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Queries/TailConsoleMessagesQuery.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Queries/TailConsoleMessagesHandler.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Queries/ConsoleView.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Queries/GetTokenStatusQuery.php`
- Create: `apps/backend/app/Modules/Gateway/Application/Queries/GetTokenStatusHandler.php`
- Create: `apps/backend/tests/Support/Modules/Gateway/InMemoryGatewayStreamRepository.php`
- Create: `apps/backend/tests/Support/Modules/Gateway/InMemoryCommandQueueRepository.php`
- Create: `apps/backend/tests/Support/Modules/Gateway/InMemoryPluginPresenceRepository.php`
- Create: `apps/backend/tests/Support/Modules/Gateway/InMemoryGatewayTokenRepository.php`
- Modify: `apps/backend/app/Modules/Gateway/Infrastructure/GatewayServiceProvider.php` (handler registry)
- Test: `apps/backend/tests/Unit/Modules/Gateway/Application/Commands/RecordPluginMessagesHandlerTest.php`
- Test: `apps/backend/tests/Unit/Modules/Gateway/Application/Commands/EnqueuePluginCommandHandlerTest.php`
- Test: `apps/backend/tests/Unit/Modules/Gateway/Application/Commands/RotateGatewayTokenHandlerTest.php`
- Test: `apps/backend/tests/Unit/Modules/Gateway/Application/Queries/PollPluginCommandsHandlerTest.php`
- Test: `apps/backend/tests/Unit/Modules/Gateway/Application/Queries/TailConsoleMessagesHandlerTest.php`
- Test: `apps/backend/tests/Unit/Modules/Gateway/Application/Queries/GetTokenStatusHandlerTest.php`

**Interfaces:**

- Consumes: all Task 1 Domain types; `App\Cqrs\{Command,Query,CommandHandler,QueryHandler}`; `Symfony\Component\Uid\Ulid` (same as `RecordPingHandler`); `App\Cqrs\Bus\HandlerRegistry`.
- Produces (Task 6/7 controllers dispatch these):
  - `RecordPluginMessagesCommand(int $userId, array $messages)` → handler returns `IngestResult { int $stored; int $dropped; }`
  - `EnqueuePluginCommandCommand(int $userId, string $action, ?string $callsign = null, ?array $payload = null, string|int|null $id = null)` → handler returns the built envelope as `array<string, mixed>` (`type` forced to `'command'`, `id` auto-ULID when null)
  - `RotateGatewayTokenCommand(int $userId)` → returns `GatewayToken`
  - `PollPluginCommandsQuery(int $userId, int $timeoutSeconds)` (valid 1–25) → returns `array<int, string>` (raw JSON envelopes)
  - `TailConsoleMessagesQuery(int $userId, ?string $afterId, int $timeoutSeconds)` (valid 0–15; `afterId` must match `/^\d+-\d+$/` when set) → returns `ConsoleView { ConsoleBatch $batch; bool $pluginConnected; }`
  - `GetTokenStatusQuery(int $userId)` → returns `?DateTimeImmutable`
  - Permission mapping: `UseGateway` on RecordPluginMessages + PollPluginCommands; `UseConsole` on EnqueuePluginCommand + TailConsoleMessages; `ManageToken` on RotateGatewayToken + GetTokenStatus.
- Unit tests are framework-free (default Pest `Unit` binding) and use the in-memory fakes.

- [ ] **Step 1: Write the in-memory fakes**

`apps/backend/tests/Support/Modules/Gateway/InMemoryGatewayStreamRepository.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Support\Modules\Gateway;

use App\Modules\Gateway\Domain\ConsoleBatch;
use App\Modules\Gateway\Domain\Direction;
use App\Modules\Gateway\Domain\GatewayStreamRepository;

final class InMemoryGatewayStreamRepository implements GatewayStreamRepository
{
    /** @var array<int, array<int, array{id: string, direction: string, envelope: string}>> */
    public array $streams = [];

    public ConsoleBatch $nextBatch;

    public ?int $lastBlockMs = null;

    private int $seq = 0;

    public function __construct()
    {
        $this->nextBatch = new ConsoleBatch([], null, false);
    }

    public function append(int $userId, Direction $direction, string $envelopeJson): string
    {
        $id = (++$this->seq).'-0';
        $this->streams[$userId][] = [
            'id' => $id,
            'direction' => $direction->value,
            'envelope' => $envelopeJson,
        ];

        return $id;
    }

    public function tail(int $userId, ?string $afterId, int $blockMs): ConsoleBatch
    {
        $this->lastBlockMs = $blockMs;

        return $this->nextBatch;
    }
}
```

`apps/backend/tests/Support/Modules/Gateway/InMemoryCommandQueueRepository.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Support\Modules\Gateway;

use App\Modules\Gateway\Domain\CommandQueueRepository;

final class InMemoryCommandQueueRepository implements CommandQueueRepository
{
    /** @var array<int, array<int, string>> */
    public array $queues = [];

    public ?int $lastBlockSeconds = null;

    public function enqueue(int $userId, string $envelopeJson): void
    {
        $this->queues[$userId][] = $envelopeJson;
    }

    public function drain(int $userId, int $blockSeconds): array
    {
        $this->lastBlockSeconds = $blockSeconds;
        $items = $this->queues[$userId] ?? [];
        $this->queues[$userId] = [];

        return $items;
    }
}
```

`apps/backend/tests/Support/Modules/Gateway/InMemoryPluginPresenceRepository.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Support\Modules\Gateway;

use App\Modules\Gateway\Domain\PluginPresenceRepository;

final class InMemoryPluginPresenceRepository implements PluginPresenceRepository
{
    /** @var array<int, bool> */
    public array $seen = [];

    public function markSeen(int $userId): void
    {
        $this->seen[$userId] = true;
    }

    public function isConnected(int $userId): bool
    {
        return $this->seen[$userId] ?? false;
    }
}
```

`apps/backend/tests/Support/Modules/Gateway/InMemoryGatewayTokenRepository.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Support\Modules\Gateway;

use App\Modules\Gateway\Domain\GatewayToken;
use App\Modules\Gateway\Domain\GatewayTokenRepository;
use DateTimeImmutable;

final class InMemoryGatewayTokenRepository implements GatewayTokenRepository
{
    public int $rotations = 0;

    public ?DateTimeImmutable $createdAt = null;

    public function rotate(int $userId): GatewayToken
    {
        $this->rotations++;
        $this->createdAt = new DateTimeImmutable('2026-07-10T12:00:00+00:00');

        return new GatewayToken('secret-'.$this->rotations, $this->createdAt);
    }

    public function activeTokenCreatedAt(int $userId): ?DateTimeImmutable
    {
        return $this->createdAt;
    }
}
```

- [ ] **Step 2: Write the failing handler tests**

`apps/backend/tests/Unit/Modules/Gateway/Application/Commands/RecordPluginMessagesHandlerTest.php`:

```php
<?php

declare(strict_types=1);

use App\Cqrs\Command;
use App\Modules\Gateway\Application\Commands\RecordPluginMessagesCommand;
use App\Modules\Gateway\Application\Commands\RecordPluginMessagesHandler;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Gateway\InMemoryGatewayStreamRepository;

it('stores object entries tagged as inbound (happy)', function (): void {
    $stream = new InMemoryGatewayStreamRepository;
    $handler = new RecordPluginMessagesHandler($stream);

    $result = $handler->handle(new RecordPluginMessagesCommand(userId: 7, messages: [
        ['type' => 'event', 'action' => 'flight_updated', 'callsign' => 'DLH4TX'],
        ['type' => 'response', 'action' => 'ping', 'ok' => true],
    ]));

    expect($result->stored)->toBe(2);
    expect($result->dropped)->toBe(0);
    expect($stream->streams[7])->toHaveCount(2);
    expect($stream->streams[7][0]['direction'])->toBe('in');
    expect(json_decode($stream->streams[7][0]['envelope'], true))
        ->toBe(['type' => 'event', 'action' => 'flight_updated', 'callsign' => 'DLH4TX']);
});

it('drops non-object entries without failing the batch (invalid)', function (): void {
    $stream = new InMemoryGatewayStreamRepository;
    $handler = new RecordPluginMessagesHandler($stream);

    $result = $handler->handle(new RecordPluginMessagesCommand(userId: 7, messages: [
        ['type' => 'event', 'action' => 'flight_removed'],
        [1, 2, 3],
        'not-an-object',
        null,
    ]));

    expect($result->stored)->toBe(1);
    expect($result->dropped)->toBe(3);
    expect($stream->streams[7])->toHaveCount(1);
});

it('handles an empty batch (invalid)', function (): void {
    $stream = new InMemoryGatewayStreamRepository;
    $handler = new RecordPluginMessagesHandler($stream);

    $result = $handler->handle(new RecordPluginMessagesCommand(userId: 7, messages: []));

    expect($result->stored)->toBe(0);
    expect($result->dropped)->toBe(0);
    expect($stream->streams)->toBe([]);
});

it('rejects a garbage Command type (garbage)', function (): void {
    $handler = new RecordPluginMessagesHandler(new InMemoryGatewayStreamRepository);

    $bogus = new class extends Data implements Command
    {
        public function __construct(public string $x = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
```

`apps/backend/tests/Unit/Modules/Gateway/Application/Commands/EnqueuePluginCommandHandlerTest.php`:

```php
<?php

declare(strict_types=1);

use App\Cqrs\Command;
use App\Modules\Gateway\Application\Commands\EnqueuePluginCommandCommand;
use App\Modules\Gateway\Application\Commands\EnqueuePluginCommandHandler;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Gateway\InMemoryCommandQueueRepository;
use Tests\Support\Modules\Gateway\InMemoryGatewayStreamRepository;

function enqueueHandler(): array
{
    $queue = new InMemoryCommandQueueRepository;
    $stream = new InMemoryGatewayStreamRepository;

    return [new EnqueuePluginCommandHandler($queue, $stream), $queue, $stream];
}

it('queues a full envelope and mirrors it outbound (happy)', function (): void {
    [$handler, $queue, $stream] = enqueueHandler();

    $envelope = $handler->handle(new EnqueuePluginCommandCommand(
        userId: 7,
        action: 'set_squawk',
        callsign: 'ABC1234',
        payload: ['code' => '2354'],
        id: 'req-42',
    ));

    expect($envelope)->toBe([
        'type' => 'command',
        'id' => 'req-42',
        'action' => 'set_squawk',
        'callsign' => 'ABC1234',
        'payload' => ['code' => '2354'],
    ]);
    expect($queue->queues[7])->toHaveCount(1);
    expect(json_decode($queue->queues[7][0], true))->toBe($envelope);
    expect($stream->streams[7][0]['direction'])->toBe('out');
    expect($stream->streams[7][0]['envelope'])->toBe($queue->queues[7][0]);
});

it('generates an id when absent (happy)', function (): void {
    [$handler] = enqueueHandler();

    $envelope = $handler->handle(new EnqueuePluginCommandCommand(userId: 7, action: 'ping'));

    expect($envelope['id'])->toBeString()->not->toBe('');
});

it('omits callsign and payload when null (happy)', function (): void {
    [$handler] = enqueueHandler();

    $envelope = $handler->handle(new EnqueuePluginCommandCommand(userId: 7, action: 'list_flights'));

    expect($envelope)->not->toHaveKeys(['callsign', 'payload']);
});

it('rejects an empty action (invalid)', function (): void {
    [$handler] = enqueueHandler();

    expect(fn () => $handler->handle(new EnqueuePluginCommandCommand(userId: 7, action: '  ')))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects a garbage Command type (garbage)', function (): void {
    [$handler] = enqueueHandler();

    $bogus = new class extends Data implements Command
    {
        public function __construct(public string $x = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
```

`apps/backend/tests/Unit/Modules/Gateway/Application/Queries/PollPluginCommandsHandlerTest.php`:

```php
<?php

declare(strict_types=1);

use App\Cqrs\Query;
use App\Modules\Gateway\Application\Queries\PollPluginCommandsHandler;
use App\Modules\Gateway\Application\Queries\PollPluginCommandsQuery;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Gateway\InMemoryCommandQueueRepository;
use Tests\Support\Modules\Gateway\InMemoryPluginPresenceRepository;

it('marks presence and drains the queue (happy)', function (): void {
    $queue = new InMemoryCommandQueueRepository;
    $presence = new InMemoryPluginPresenceRepository;
    $queue->enqueue(7, '{"action":"ping"}');
    $handler = new PollPluginCommandsHandler($queue, $presence);

    $commands = $handler->handle(new PollPluginCommandsQuery(userId: 7, timeoutSeconds: 25));

    expect($commands)->toBe(['{"action":"ping"}']);
    expect($presence->isConnected(7))->toBeTrue();
    expect($queue->lastBlockSeconds)->toBe(25);
});

it('rejects a timeout below 1 second (invalid)', function (): void {
    $handler = new PollPluginCommandsHandler(new InMemoryCommandQueueRepository, new InMemoryPluginPresenceRepository);

    expect(fn () => $handler->handle(new PollPluginCommandsQuery(userId: 7, timeoutSeconds: 0)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects a timeout above 25 seconds (invalid)', function (): void {
    $handler = new PollPluginCommandsHandler(new InMemoryCommandQueueRepository, new InMemoryPluginPresenceRepository);

    expect(fn () => $handler->handle(new PollPluginCommandsQuery(userId: 7, timeoutSeconds: 26)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects a garbage Query type (garbage)', function (): void {
    $handler = new PollPluginCommandsHandler(new InMemoryCommandQueueRepository, new InMemoryPluginPresenceRepository);

    $bogus = new class extends Data implements Query
    {
        public function __construct(public string $x = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
```

`apps/backend/tests/Unit/Modules/Gateway/Application/Queries/TailConsoleMessagesHandlerTest.php`:

```php
<?php

declare(strict_types=1);

use App\Cqrs\Query;
use App\Modules\Gateway\Application\Queries\TailConsoleMessagesHandler;
use App\Modules\Gateway\Application\Queries\TailConsoleMessagesQuery;
use App\Modules\Gateway\Domain\ConsoleBatch;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Gateway\InMemoryGatewayStreamRepository;
use Tests\Support\Modules\Gateway\InMemoryPluginPresenceRepository;

it('returns the batch with plugin presence (happy)', function (): void {
    $stream = new InMemoryGatewayStreamRepository;
    $presence = new InMemoryPluginPresenceRepository;
    $presence->markSeen(7);
    $stream->nextBatch = new ConsoleBatch(
        [['id' => '5-0', 'direction' => 'in', 'envelope' => '{"a":1}']],
        '5-0',
        false,
    );
    $handler = new TailConsoleMessagesHandler($stream, $presence);

    $view = $handler->handle(new TailConsoleMessagesQuery(userId: 7, afterId: '4-0', timeoutSeconds: 15));

    expect($view->batch->messages)->toHaveCount(1);
    expect($view->pluginConnected)->toBeTrue();
    expect($stream->lastBlockMs)->toBe(15_000);
});

it('reports a disconnected plugin (happy)', function (): void {
    $handler = new TailConsoleMessagesHandler(new InMemoryGatewayStreamRepository, new InMemoryPluginPresenceRepository);

    $view = $handler->handle(new TailConsoleMessagesQuery(userId: 7, afterId: null, timeoutSeconds: 0));

    expect($view->pluginConnected)->toBeFalse();
});

it('rejects a negative timeout (invalid)', function (): void {
    $handler = new TailConsoleMessagesHandler(new InMemoryGatewayStreamRepository, new InMemoryPluginPresenceRepository);

    expect(fn () => $handler->handle(new TailConsoleMessagesQuery(userId: 7, afterId: null, timeoutSeconds: -1)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects a timeout above 15 seconds (invalid)', function (): void {
    $handler = new TailConsoleMessagesHandler(new InMemoryGatewayStreamRepository, new InMemoryPluginPresenceRepository);

    expect(fn () => $handler->handle(new TailConsoleMessagesQuery(userId: 7, afterId: null, timeoutSeconds: 16)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects a malformed cursor (garbage)', function (): void {
    $handler = new TailConsoleMessagesHandler(new InMemoryGatewayStreamRepository, new InMemoryPluginPresenceRepository);

    expect(fn () => $handler->handle(new TailConsoleMessagesQuery(userId: 7, afterId: 'DROP TABLE', timeoutSeconds: 0)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects a garbage Query type (garbage)', function (): void {
    $handler = new TailConsoleMessagesHandler(new InMemoryGatewayStreamRepository, new InMemoryPluginPresenceRepository);

    $bogus = new class extends Data implements Query
    {
        public function __construct(public string $x = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
```

`apps/backend/tests/Unit/Modules/Gateway/Application/Commands/RotateGatewayTokenHandlerTest.php`:

```php
<?php

declare(strict_types=1);

use App\Cqrs\Command;
use App\Modules\Gateway\Application\Commands\RotateGatewayTokenCommand;
use App\Modules\Gateway\Application\Commands\RotateGatewayTokenHandler;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Gateway\InMemoryGatewayTokenRepository;

it('delegates rotation to the repository (happy)', function (): void {
    $repo = new InMemoryGatewayTokenRepository;
    $handler = new RotateGatewayTokenHandler($repo);

    $token = $handler->handle(new RotateGatewayTokenCommand(userId: 7));

    expect($token->plainText)->toBe('secret-1');
    expect($repo->rotations)->toBe(1);
});

it('rejects a garbage Command type (garbage)', function (): void {
    $handler = new RotateGatewayTokenHandler(new InMemoryGatewayTokenRepository);

    $bogus = new class extends Data implements Command
    {
        public function __construct(public string $x = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
```

`apps/backend/tests/Unit/Modules/Gateway/Application/Queries/GetTokenStatusHandlerTest.php`:

```php
<?php

declare(strict_types=1);

use App\Cqrs\Query;
use App\Modules\Gateway\Application\Queries\GetTokenStatusHandler;
use App\Modules\Gateway\Application\Queries\GetTokenStatusQuery;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Gateway\InMemoryGatewayTokenRepository;

it('returns null when no token exists (happy)', function (): void {
    $handler = new GetTokenStatusHandler(new InMemoryGatewayTokenRepository);

    expect($handler->handle(new GetTokenStatusQuery(userId: 7)))->toBeNull();
});

it('returns the creation time when a token exists (happy)', function (): void {
    $repo = new InMemoryGatewayTokenRepository;
    $repo->rotate(7);
    $handler = new GetTokenStatusHandler($repo);

    expect($handler->handle(new GetTokenStatusQuery(userId: 7)))->toEqual($repo->createdAt);
});

it('rejects a garbage Query type (garbage)', function (): void {
    $handler = new GetTokenStatusHandler(new InMemoryGatewayTokenRepository);

    $bogus = new class extends Data implements Query
    {
        public function __construct(public string $x = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Unit/Modules/Gateway`
Expected: FAIL — command/handler classes not found

- [ ] **Step 4: Implement DTOs and handlers**

`apps/backend/app/Modules/Gateway/Application/Commands/RecordPluginMessagesCommand.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

use App\Cqrs\Command;
use App\Modules\Gateway\Domain\GatewayPermission;
use Spatie\LaravelData\Data;

class RecordPluginMessagesCommand extends Data implements Command
{
    /** @param array<int, mixed> $messages Raw decoded batch entries; the handler filters non-objects. */
    public function __construct(
        public int $userId,
        public array $messages,
    ) {}

    public function permission(): GatewayPermission
    {
        return GatewayPermission::UseGateway;
    }
}
```

`apps/backend/app/Modules/Gateway/Application/Commands/IngestResult.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

final class IngestResult
{
    public function __construct(
        public readonly int $stored,
        public readonly int $dropped,
    ) {}
}
```

`apps/backend/app/Modules/Gateway/Application/Commands/RecordPluginMessagesHandler.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use App\Modules\Gateway\Domain\Direction;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use InvalidArgumentException;

class RecordPluginMessagesHandler implements CommandHandler
{
    public function __construct(private GatewayStreamRepository $stream) {}

    public function handle(Command $command): IngestResult
    {
        if (! $command instanceof RecordPluginMessagesCommand) {
            throw new InvalidArgumentException(
                sprintf('%s expects RecordPluginMessagesCommand, got %s', self::class, $command::class),
            );
        }

        $stored = 0;
        $dropped = 0;
        foreach ($command->messages as $message) {
            // The gateway is transport, not validator: store any JSON object
            // verbatim (protocol v1 is additive), drop everything else.
            if (! is_array($message) || array_is_list($message)) {
                $dropped++;

                continue;
            }
            $json = json_encode($message, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($json === false) {
                $dropped++;

                continue;
            }
            $this->stream->append($command->userId, Direction::In, $json);
            $stored++;
        }

        return new IngestResult(stored: $stored, dropped: $dropped);
    }
}
```

`apps/backend/app/Modules/Gateway/Application/Commands/EnqueuePluginCommandCommand.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

use App\Cqrs\Command;
use App\Modules\Gateway\Domain\GatewayPermission;
use Spatie\LaravelData\Data;

class EnqueuePluginCommandCommand extends Data implements Command
{
    /** @param array<string, mixed>|null $payload */
    public function __construct(
        public int $userId,
        public string $action,
        public ?string $callsign = null,
        public ?array $payload = null,
        public string|int|null $id = null,
    ) {}

    public function permission(): GatewayPermission
    {
        return GatewayPermission::UseConsole;
    }
}
```

`apps/backend/app/Modules/Gateway/Application/Commands/EnqueuePluginCommandHandler.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use App\Modules\Gateway\Domain\CommandQueueRepository;
use App\Modules\Gateway\Domain\Direction;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use InvalidArgumentException;
use RuntimeException;
use Symfony\Component\Uid\Ulid;

class EnqueuePluginCommandHandler implements CommandHandler
{
    public function __construct(
        private CommandQueueRepository $queue,
        private GatewayStreamRepository $stream,
    ) {}

    /** @return array<string, mixed> the envelope as queued */
    public function handle(Command $command): array
    {
        if (! $command instanceof EnqueuePluginCommandCommand) {
            throw new InvalidArgumentException(
                sprintf('%s expects EnqueuePluginCommandCommand, got %s', self::class, $command::class),
            );
        }
        if (trim($command->action) === '') {
            throw new InvalidArgumentException('action must be a non-empty string');
        }

        $envelope = [
            'type' => 'command',
            'id' => $command->id ?? (string) new Ulid,
            'action' => $command->action,
        ];
        if ($command->callsign !== null) {
            $envelope['callsign'] = $command->callsign;
        }
        if ($command->payload !== null) {
            $envelope['payload'] = $command->payload;
        }

        $json = json_encode($envelope, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            throw new RuntimeException('envelope could not be encoded as JSON');
        }

        $this->queue->enqueue($command->userId, $json);
        // Mirror into the stream so the sender's own console shows the command.
        $this->stream->append($command->userId, Direction::Out, $json);

        return $envelope;
    }
}
```

`apps/backend/app/Modules/Gateway/Application/Commands/RotateGatewayTokenCommand.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

use App\Cqrs\Command;
use App\Modules\Gateway\Domain\GatewayPermission;
use Spatie\LaravelData\Data;

class RotateGatewayTokenCommand extends Data implements Command
{
    public function __construct(public int $userId) {}

    public function permission(): GatewayPermission
    {
        return GatewayPermission::ManageToken;
    }
}
```

`apps/backend/app/Modules/Gateway/Application/Commands/RotateGatewayTokenHandler.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use App\Modules\Gateway\Domain\GatewayToken;
use App\Modules\Gateway\Domain\GatewayTokenRepository;
use InvalidArgumentException;

class RotateGatewayTokenHandler implements CommandHandler
{
    public function __construct(private GatewayTokenRepository $tokens) {}

    public function handle(Command $command): GatewayToken
    {
        if (! $command instanceof RotateGatewayTokenCommand) {
            throw new InvalidArgumentException(
                sprintf('%s expects RotateGatewayTokenCommand, got %s', self::class, $command::class),
            );
        }

        return $this->tokens->rotate($command->userId);
    }
}
```

`apps/backend/app/Modules/Gateway/Application/Queries/PollPluginCommandsQuery.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Queries;

use App\Cqrs\Query;
use App\Modules\Gateway\Domain\GatewayPermission;
use Spatie\LaravelData\Data;

class PollPluginCommandsQuery extends Data implements Query
{
    public function __construct(
        public int $userId,
        public int $timeoutSeconds,
    ) {}

    public function permission(): GatewayPermission
    {
        return GatewayPermission::UseGateway;
    }
}
```

`apps/backend/app/Modules/Gateway/Application/Queries/PollPluginCommandsHandler.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Queries;

use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use App\Modules\Gateway\Domain\CommandQueueRepository;
use App\Modules\Gateway\Domain\PluginPresenceRepository;
use InvalidArgumentException;

class PollPluginCommandsHandler implements QueryHandler
{
    private const MAX_TIMEOUT_SECONDS = 25;

    public function __construct(
        private CommandQueueRepository $queue,
        private PluginPresenceRepository $presence,
    ) {}

    /** @return array<int, string> */
    public function handle(Query $query): array
    {
        if (! $query instanceof PollPluginCommandsQuery) {
            throw new InvalidArgumentException(
                sprintf('%s expects PollPluginCommandsQuery, got %s', self::class, $query::class),
            );
        }
        if ($query->timeoutSeconds < 1 || $query->timeoutSeconds > self::MAX_TIMEOUT_SECONDS) {
            throw new InvalidArgumentException('timeoutSeconds must be between 1 and '.self::MAX_TIMEOUT_SECONDS);
        }

        // Polling IS the liveness signal: the console's "connected" badge
        // keys off this mark plus its 35s TTL.
        $this->presence->markSeen($query->userId);

        return $this->queue->drain($query->userId, $query->timeoutSeconds);
    }
}
```

`apps/backend/app/Modules/Gateway/Application/Queries/ConsoleView.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Queries;

use App\Modules\Gateway\Domain\ConsoleBatch;

final class ConsoleView
{
    public function __construct(
        public readonly ConsoleBatch $batch,
        public readonly bool $pluginConnected,
    ) {}
}
```

`apps/backend/app/Modules/Gateway/Application/Queries/TailConsoleMessagesQuery.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Queries;

use App\Cqrs\Query;
use App\Modules\Gateway\Domain\GatewayPermission;
use Spatie\LaravelData\Data;

class TailConsoleMessagesQuery extends Data implements Query
{
    public function __construct(
        public int $userId,
        public ?string $afterId,
        public int $timeoutSeconds,
    ) {}

    public function permission(): GatewayPermission
    {
        return GatewayPermission::UseConsole;
    }
}
```

`apps/backend/app/Modules/Gateway/Application/Queries/TailConsoleMessagesHandler.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Queries;

use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use App\Modules\Gateway\Domain\PluginPresenceRepository;
use InvalidArgumentException;

class TailConsoleMessagesHandler implements QueryHandler
{
    private const MAX_TIMEOUT_SECONDS = 15;

    public function __construct(
        private GatewayStreamRepository $stream,
        private PluginPresenceRepository $presence,
    ) {}

    public function handle(Query $query): ConsoleView
    {
        if (! $query instanceof TailConsoleMessagesQuery) {
            throw new InvalidArgumentException(
                sprintf('%s expects TailConsoleMessagesQuery, got %s', self::class, $query::class),
            );
        }
        if ($query->timeoutSeconds < 0 || $query->timeoutSeconds > self::MAX_TIMEOUT_SECONDS) {
            throw new InvalidArgumentException('timeoutSeconds must be between 0 and '.self::MAX_TIMEOUT_SECONDS);
        }
        if ($query->afterId !== null && preg_match('/^\d+-\d+$/', $query->afterId) !== 1) {
            throw new InvalidArgumentException('afterId must be a Redis stream ID (e.g. 1720527600000-0)');
        }

        $batch = $this->stream->tail($query->userId, $query->afterId, $query->timeoutSeconds * 1_000);

        return new ConsoleView(
            batch: $batch,
            pluginConnected: $this->presence->isConnected($query->userId),
        );
    }
}
```

`apps/backend/app/Modules/Gateway/Application/Queries/GetTokenStatusQuery.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Queries;

use App\Cqrs\Query;
use App\Modules\Gateway\Domain\GatewayPermission;
use Spatie\LaravelData\Data;

class GetTokenStatusQuery extends Data implements Query
{
    public function __construct(public int $userId) {}

    public function permission(): GatewayPermission
    {
        return GatewayPermission::ManageToken;
    }
}
```

`apps/backend/app/Modules/Gateway/Application/Queries/GetTokenStatusHandler.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Queries;

use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use App\Modules\Gateway\Domain\GatewayTokenRepository;
use DateTimeImmutable;
use InvalidArgumentException;

class GetTokenStatusHandler implements QueryHandler
{
    public function __construct(private GatewayTokenRepository $tokens) {}

    public function handle(Query $query): ?DateTimeImmutable
    {
        if (! $query instanceof GetTokenStatusQuery) {
            throw new InvalidArgumentException(
                sprintf('%s expects GetTokenStatusQuery, got %s', self::class, $query::class),
            );
        }

        return $this->tokens->activeTokenCreatedAt($query->userId);
    }
}
```

- [ ] **Step 5: Register handlers on the bus**

Replace `GatewayServiceProvider::boot()` (keep `register()` bindings from Tasks 2–4):

```php
    public function boot(\App\Cqrs\Bus\HandlerRegistry $registry): void
    {
        $registry->register(
            \App\Modules\Gateway\Application\Commands\RecordPluginMessagesCommand::class,
            \App\Modules\Gateway\Application\Commands\RecordPluginMessagesHandler::class,
        );
        $registry->register(
            \App\Modules\Gateway\Application\Commands\EnqueuePluginCommandCommand::class,
            \App\Modules\Gateway\Application\Commands\EnqueuePluginCommandHandler::class,
        );
        $registry->register(
            \App\Modules\Gateway\Application\Commands\RotateGatewayTokenCommand::class,
            \App\Modules\Gateway\Application\Commands\RotateGatewayTokenHandler::class,
        );
        $registry->register(
            \App\Modules\Gateway\Application\Queries\PollPluginCommandsQuery::class,
            \App\Modules\Gateway\Application\Queries\PollPluginCommandsHandler::class,
        );
        $registry->register(
            \App\Modules\Gateway\Application\Queries\TailConsoleMessagesQuery::class,
            \App\Modules\Gateway\Application\Queries\TailConsoleMessagesHandler::class,
        );
        $registry->register(
            \App\Modules\Gateway\Application\Queries\GetTokenStatusQuery::class,
            \App\Modules\Gateway\Application\Queries\GetTokenStatusHandler::class,
        );
    }
```

(Use plain `use` imports at the top of the file instead of inline FQCNs — Pint will enforce ordering.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Unit/Modules/Gateway`
Expected: PASS (25 tests)

- [ ] **Step 7: Lint and commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "feat(gateway): application commands, queries and handlers"
```

---

### Task 6: Plugin transport endpoints (`/api/euroscope`)

**Files:**

- Create: `apps/backend/app/Modules/Gateway/Presentation/Http/Middleware/EnsureGatewayToken.php`
- Create: `apps/backend/app/Modules/Gateway/Presentation/Http/PluginTransportController.php`
- Create: `apps/backend/app/Modules/Gateway/Presentation/Http/Requests/RecordPluginMessagesRequest.php`
- Create: `apps/backend/app/Modules/Gateway/Presentation/Http/routes.php`
- Create: `apps/backend/lang/en/gateway.php`
- Create: `apps/backend/lang/pt/gateway.php`
- Modify: `apps/backend/routes/api.php` (require the module routes)
- Test: `apps/backend/tests/Feature/Modules/Gateway/PluginTransportTest.php`

**Interfaces:**

- Consumes: Task 5 bus messages; Task 1–3 repositories (via container, for test assertions); `PassportGatewayTokenRepository::TOKEN_NAME` (Task 4); the seeding pattern from `PingControllerTest`.
- Produces:
  - `POST /api/euroscope/messages` → `204` (body `{"messages": [...]}`, ≤200 entries, ≤524288 bytes → else `413`)
  - `GET /api/euroscope/poll?timeout=25` → `200 {"commands":[...]}` or `204`
  - `EnsureGatewayToken` middleware, parameterized `:require` (plugin routes) / `:reject` (Task 7 console routes) — checks the Passport token *name* against `'gateway'`, aborts `403` with `__('gateway.token_required')` / `__('gateway.token_not_allowed')`.
  - Test helper `gatewayAuthenticatedAs(string $tokenName): array{0: User, 1: string}` (local to each test file).

- [ ] **Step 1: Write the failing tests**

`apps/backend/tests/Feature/Modules/Gateway/PluginTransportTest.php`:

```php
<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use App\Modules\Gateway\Domain\CommandQueueRepository;
use App\Modules\Gateway\Domain\GatewayPermission;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use App\Modules\Gateway\Domain\PluginPresenceRepository;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\ClientRepository;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role as RoleModel;
use Tests\Support\Modules\Gateway\GatewayRedisTestSupport;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );

    (new PermissionsSeeder([GatewayPermission::class]))->run();

    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web'])
        ->givePermissionTo(
            Permission::findByName(GatewayPermission::UseGateway->value),
            Permission::findByName(GatewayPermission::UseConsole->value),
            Permission::findByName(GatewayPermission::ManageToken->value),
        );

    GatewayRedisTestSupport::useIsolatedPrefix();
});

afterEach(fn () => GatewayRedisTestSupport::flush());

/**
 * @return array{0: User, 1: string}
 */
function gatewayAuthenticatedAs(string $tokenName = 'gateway'): array
{
    $user = User::factory()->create();
    $user->assignRole(Role::Member->value);
    $token = $user->createToken($tokenName)->accessToken;

    return [$user, $token];
}

it('ingests a batch and stores each envelope inbound (happy)', function (): void {
    [$user, $token] = gatewayAuthenticatedAs();

    $response = $this->withToken($token)->postJson('/api/euroscope/messages', [
        'messages' => [
            ['type' => 'event', 'callsign' => 'DLH4TX', 'action' => 'flight_updated', 'payload' => ['origin' => 'EDDM']],
            ['type' => 'response', 'id' => 7, 'action' => 'ping', 'ok' => true],
        ],
    ]);

    $response->assertNoContent();

    $batch = app(GatewayStreamRepository::class)->tail($user->id, null, 0);
    expect($batch->messages)->toHaveCount(2);
    expect($batch->messages[0]['direction'])->toBe('in');
    expect(json_decode($batch->messages[0]['envelope'], true)['action'])->toBe('flight_updated');
});

it('drops garbage entries but keeps the good ones (invalid entries)', function (): void {
    [$user, $token] = gatewayAuthenticatedAs();

    $this->withToken($token)->postJson('/api/euroscope/messages', [
        'messages' => [
            ['type' => 'event', 'action' => 'flight_removed', 'callsign' => 'ABC1234'],
            'garbage-string',
            [1, 2, 3],
        ],
    ])->assertNoContent();

    expect(app(GatewayStreamRepository::class)->tail($user->id, null, 0)->messages)->toHaveCount(1);
});

it('rejects a batch of more than 200 messages (invalid)', function (): void {
    [, $token] = gatewayAuthenticatedAs();

    $messages = array_fill(0, 201, ['type' => 'event', 'action' => 'x']);

    $this->withToken($token)
        ->postJson('/api/euroscope/messages', ['messages' => $messages])
        ->assertStatus(422);
});

it('rejects a batch body over 512 KB (garbage volume)', function (): void {
    [, $token] = gatewayAuthenticatedAs();

    $messages = [['type' => 'event', 'action' => 'x', 'payload' => ['blob' => str_repeat('a', 600_000)]]];

    $this->withToken($token)
        ->postJson('/api/euroscope/messages', ['messages' => $messages])
        ->assertStatus(413);
});

it('rejects a body without messages (invalid)', function (): void {
    [, $token] = gatewayAuthenticatedAs();

    $this->withToken($token)->postJson('/api/euroscope/messages', [])->assertStatus(422);
});

it('drains queued commands on poll (happy)', function (): void {
    [$user, $token] = gatewayAuthenticatedAs();
    app(CommandQueueRepository::class)->enqueue($user->id, '{"type":"command","id":"x","action":"ping"}');

    $response = $this->withToken($token)->getJson('/api/euroscope/poll?timeout=1');

    $response->assertOk();
    $response->assertJsonCount(1, 'commands');
    $response->assertJsonPath('commands.0.action', 'ping');
});

it('returns 204 when the queue stays empty for the hold (happy timeout)', function (): void {
    [, $token] = gatewayAuthenticatedAs();

    $this->withToken($token)->getJson('/api/euroscope/poll?timeout=1')->assertNoContent();
});

it('marks plugin presence on poll (happy)', function (): void {
    [$user, $token] = gatewayAuthenticatedAs();

    $this->withToken($token)->getJson('/api/euroscope/poll?timeout=1');

    expect(app(PluginPresenceRepository::class)->isConnected($user->id))->toBeTrue();
});

it('rejects a web-session token on plugin routes (invalid token name)', function (): void {
    [, $token] = gatewayAuthenticatedAs('stub-login');

    $this->withToken($token)
        ->postJson('/api/euroscope/messages', ['messages' => [['a' => 1]]])
        ->assertForbidden();
    $this->withToken($token)->getJson('/api/euroscope/poll?timeout=1')->assertForbidden();
});

it('rejects unauthenticated plugin requests (garbage)', function (): void {
    $this->postJson('/api/euroscope/messages', ['messages' => [['a' => 1]]])->assertStatus(401);
    $this->getJson('/api/euroscope/poll')->assertStatus(401);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Modules/Gateway/PluginTransportTest.php`
Expected: FAIL — 404s (routes don't exist yet)

- [ ] **Step 3: Implement middleware, request, controller, routes, lang**

`apps/backend/lang/en/gateway.php`:

```php
<?php

declare(strict_types=1);

return [
    'token_required' => 'This endpoint requires the gateway token.',
    'token_not_allowed' => 'The gateway token cannot be used here.',
    'batch_too_large' => 'The message batch exceeds 512 KB.',
];
```

`apps/backend/lang/pt/gateway.php`:

```php
<?php

declare(strict_types=1);

return [
    'token_required' => 'Este endpoint exige o token do gateway.',
    'token_not_allowed' => 'O token do gateway não pode ser usado aqui.',
    'batch_too_large' => 'O lote de mensagens excede 512 KB.',
];
```

`apps/backend/app/Modules/Gateway/Presentation/Http/Middleware/EnsureGatewayToken.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Presentation\Http\Middleware;

use App\Modules\Gateway\Infrastructure\PassportGatewayTokenRepository;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Both the web session and the plugin authenticate as the same user via
 * Passport PATs; the token NAME is the boundary between the two surfaces.
 * `:require` gates plugin transport routes, `:reject` keeps a leaked
 * gateway token away from the browser-facing API.
 */
final class EnsureGatewayToken
{
    public function handle(Request $request, Closure $next, string $mode): Response
    {
        $tokenName = $request->user()?->token()?->name;
        $isGateway = $tokenName === PassportGatewayTokenRepository::TOKEN_NAME;

        if ($mode === 'require' && ! $isGateway) {
            abort(403, __('gateway.token_required'));
        }
        if ($mode === 'reject' && $isGateway) {
            abort(403, __('gateway.token_not_allowed'));
        }

        return $next($request);
    }
}
```

`apps/backend/app/Modules/Gateway/Presentation/Http/Requests/RecordPluginMessagesRequest.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RecordPluginMessagesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Entries are deliberately NOT validated per-item: the gateway is
     * transport, and the handler drops non-objects without failing the batch.
     *
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'messages' => ['required', 'array', 'max:200'],
        ];
    }
}
```

`apps/backend/app/Modules/Gateway/Presentation/Http/PluginTransportController.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Presentation\Http;

use App\Cqrs\Bus\CommandBus;
use App\Cqrs\Bus\QueryBus;
use App\Models\User;
use App\Modules\Gateway\Application\Commands\IngestResult;
use App\Modules\Gateway\Application\Commands\RecordPluginMessagesCommand;
use App\Modules\Gateway\Application\Queries\PollPluginCommandsQuery;
use App\Modules\Gateway\Presentation\Http\Requests\RecordPluginMessagesRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

class PluginTransportController
{
    private const MAX_BODY_BYTES = 524_288;

    private const MAX_POLL_SECONDS = 25;

    public function __construct(
        private CommandBus $commandBus,
        private QueryBus $queryBus,
    ) {}

    /**
     * Ingest a batch of protocol messages from the EuroScope plugin.
     *
     * @bodyParam messages object[] required Up to 200 protocol v1 envelopes. Example: [{"type":"event","callsign":"DLH4TX","action":"flight_updated","payload":{}}]
     *
     * @response 204
     */
    public function store(RecordPluginMessagesRequest $request): Response
    {
        if (strlen((string) $request->getContent()) > self::MAX_BODY_BYTES) {
            abort(413, __('gateway.batch_too_large'));
        }

        $user = $request->user();
        assert($user instanceof User);

        $result = $this->commandBus->dispatch(new RecordPluginMessagesCommand(
            userId: $user->id,
            messages: $request->validated('messages'),
        ));
        assert($result instanceof IngestResult);

        if ($result->dropped > 0) {
            Log::info('gateway: dropped non-object batch entries', [
                'user_id' => $user->id,
                'dropped' => $result->dropped,
                'stored' => $result->stored,
            ]);
        }

        return response()->noContent();
    }

    /**
     * Long-poll for commands queued for the EuroScope plugin.
     *
     * Holds the request up to `timeout` seconds (max 25) waiting for commands.
     *
     * @response 200 {"commands": [{"type": "command", "id": "req-42", "callsign": "ABC1234", "action": "set_squawk", "payload": {"code": "2354"}}]}
     * @response 204
     */
    public function poll(Request $request): JsonResponse|Response
    {
        $user = $request->user();
        assert($user instanceof User);

        $timeout = max(1, min((int) $request->query('timeout', '25'), self::MAX_POLL_SECONDS));

        /** @var array<int, string> $commands */
        $commands = $this->queryBus->dispatch(new PollPluginCommandsQuery(
            userId: $user->id,
            timeoutSeconds: $timeout,
        ));

        if ($commands === []) {
            return response()->noContent();
        }

        return response()->json([
            'commands' => array_map(fn (string $json): mixed => json_decode($json, true), $commands),
        ]);
    }
}
```

`apps/backend/app/Modules/Gateway/Presentation/Http/routes.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Gateway\Presentation\Http\Middleware\EnsureGatewayToken;
use App\Modules\Gateway\Presentation\Http\PluginTransportController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:api', EnsureGatewayToken::class.':require'])
    ->prefix('euroscope')
    ->group(function (): void {
        Route::post('/messages', [PluginTransportController::class, 'store'])->name('api.euroscope.messages');
        Route::get('/poll', [PluginTransportController::class, 'poll'])->name('api.euroscope.poll');
    });
```

`apps/backend/routes/api.php` — add after the Ping require:

```php
require app_path('Modules/Gateway/Presentation/Http/routes.php');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Modules/Gateway/PluginTransportTest.php`
Expected: PASS (10 tests; ~3 s from deliberate 1 s holds)

- [ ] **Step 5: Lint and commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "feat(gateway): plugin transport endpoints (/api/euroscope)"
```

---

### Task 7: Console and token endpoints (`/api/gateway`)

**Files:**

- Create: `apps/backend/app/Modules/Gateway/Presentation/Http/ConsoleController.php`
- Create: `apps/backend/app/Modules/Gateway/Presentation/Http/TokenController.php`
- Create: `apps/backend/app/Modules/Gateway/Presentation/Http/Requests/EnqueuePluginCommandRequest.php`
- Modify: `apps/backend/app/Modules/Gateway/Presentation/Http/routes.php` (add `/gateway` group)
- Modify: `apps/backend/app/Providers/AppServiceProvider.php` (rate limiter)
- Test: `apps/backend/tests/Feature/Modules/Gateway/ConsoleEndpointsTest.php`
- Test: `apps/backend/tests/Feature/Modules/Gateway/TokenEndpointsTest.php`

**Interfaces:**

- Consumes: Task 5 bus messages; Task 6 middleware + the same `beforeEach` seeding block and `gatewayAuthenticatedAs()` helper shape (redefine per file — Pest file-scoped functions must have unique names, so name them `consoleAuthenticatedAs` / `tokenAuthenticatedAs`).
- Produces (the wire contract Task 8–11 frontend consumes):
  - `POST /api/gateway/commands` (throttle `gateway-send`, 60/min/user) body `{action, callsign?, payload?, id?}` → `202 {"queued": {…envelope…}}`
  - `GET /api/gateway/console/poll?after=<cursor>&timeout=<0-15>` → `200 {"messages":[{"id","direction","envelope":{…decoded…}}], "cursor": string|null, "reset": bool, "pluginConnected": bool}`
  - `POST /api/gateway/token` → `201 {"token": "<plaintext>", "created_at": "<ISO8601>"}`
  - `GET /api/gateway/token` → `200 {"exists": bool, "created_at": "<ISO8601>"|null}`
  - All four reject a gateway-named token with `403`.

- [ ] **Step 1: Write the failing tests**

`apps/backend/tests/Feature/Modules/Gateway/ConsoleEndpointsTest.php`:

```php
<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use App\Modules\Gateway\Domain\CommandQueueRepository;
use App\Modules\Gateway\Domain\Direction;
use App\Modules\Gateway\Domain\GatewayPermission;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use App\Modules\Gateway\Domain\PluginPresenceRepository;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\ClientRepository;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role as RoleModel;
use Tests\Support\Modules\Gateway\GatewayRedisTestSupport;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );

    (new PermissionsSeeder([GatewayPermission::class]))->run();

    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web'])
        ->givePermissionTo(
            Permission::findByName(GatewayPermission::UseGateway->value),
            Permission::findByName(GatewayPermission::UseConsole->value),
            Permission::findByName(GatewayPermission::ManageToken->value),
        );

    GatewayRedisTestSupport::useIsolatedPrefix();
});

afterEach(fn () => GatewayRedisTestSupport::flush());

/**
 * @return array{0: User, 1: string}
 */
function consoleAuthenticatedAs(string $tokenName = 'stub-login'): array
{
    $user = User::factory()->create();
    $user->assignRole(Role::Member->value);
    $token = $user->createToken($tokenName)->accessToken;

    return [$user, $token];
}

it('queues a command and mirrors it into the feed (happy)', function (): void {
    [$user, $token] = consoleAuthenticatedAs();

    $response = $this->withToken($token)->postJson('/api/gateway/commands', [
        'action' => 'set_squawk',
        'callsign' => 'ABC1234',
        'payload' => ['code' => '2354'],
    ]);

    $response->assertStatus(202);
    $response->assertJsonPath('queued.type', 'command');
    $response->assertJsonPath('queued.action', 'set_squawk');
    expect($response->json('queued.id'))->not->toBeEmpty();

    expect(app(CommandQueueRepository::class)->drain($user->id, 1))->toHaveCount(1);
    $batch = app(GatewayStreamRepository::class)->tail($user->id, null, 0);
    expect($batch->messages)->toHaveCount(1);
    expect($batch->messages[0]['direction'])->toBe('out');
});

it('rejects a command without an action (invalid)', function (): void {
    [, $token] = consoleAuthenticatedAs();

    $this->withToken($token)->postJson('/api/gateway/commands', [
        'callsign' => 'ABC1234',
    ])->assertStatus(422);
});

it('rejects a garbage action type (garbage)', function (): void {
    [, $token] = consoleAuthenticatedAs();

    $this->withToken($token)->postJson('/api/gateway/commands', [
        'action' => ['not' => 'a-string'],
    ])->assertStatus(422);
});

it('rate limits sends at 60 per minute (invalid volume)', function (): void {
    [, $token] = consoleAuthenticatedAs();

    for ($i = 0; $i < 60; $i++) {
        $this->withToken($token)
            ->postJson('/api/gateway/commands', ['action' => 'ping'])
            ->assertStatus(202);
    }

    $this->withToken($token)
        ->postJson('/api/gateway/commands', ['action' => 'ping'])
        ->assertStatus(429);
});

it('backfills the console without a cursor (happy)', function (): void {
    [$user, $token] = consoleAuthenticatedAs();
    app(GatewayStreamRepository::class)->append($user->id, Direction::In, '{"type":"event","action":"flight_updated"}');

    $response = $this->withToken($token)->getJson('/api/gateway/console/poll?timeout=0');

    $response->assertOk();
    $response->assertJsonCount(1, 'messages');
    $response->assertJsonPath('messages.0.direction', 'in');
    $response->assertJsonPath('messages.0.envelope.action', 'flight_updated');
    $response->assertJsonPath('reset', false);
    expect($response->json('cursor'))->toBe($response->json('messages.0.id'));
});

it('tails only after the cursor and reports presence (happy)', function (): void {
    [$user, $token] = consoleAuthenticatedAs();
    $stream = app(GatewayStreamRepository::class);
    $firstId = $stream->append($user->id, Direction::In, '{"n":1}');
    $stream->append($user->id, Direction::In, '{"n":2}');
    app(PluginPresenceRepository::class)->markSeen($user->id);

    $response = $this->withToken($token)->getJson('/api/gateway/console/poll?after='.$firstId.'&timeout=0');

    $response->assertOk();
    $response->assertJsonCount(1, 'messages');
    $response->assertJsonPath('messages.0.envelope.n', 2);
    $response->assertJsonPath('pluginConnected', true);
});

it('flags reset when the cursor was trimmed away (invalid cursor)', function (): void {
    [$user, $token] = consoleAuthenticatedAs();
    $stream = app(GatewayStreamRepository::class);
    for ($i = 0; $i <= 210; $i++) {
        $stream->append($user->id, Direction::In, sprintf('{"i":%d}', $i));
    }

    $response = $this->withToken($token)->getJson('/api/gateway/console/poll?after=1-1&timeout=0');

    $response->assertOk();
    $response->assertJsonPath('reset', true);
    $response->assertJsonCount(200, 'messages');
});

it('rejects a malformed cursor (garbage)', function (): void {
    [, $token] = consoleAuthenticatedAs();

    $this->withToken($token)
        ->getJson('/api/gateway/console/poll?after=;DROP&timeout=0')
        ->assertStatus(422);
});

it('rejects the gateway token on console routes (invalid token name)', function (): void {
    [, $token] = consoleAuthenticatedAs('gateway');

    $this->withToken($token)->postJson('/api/gateway/commands', ['action' => 'ping'])->assertForbidden();
    $this->withToken($token)->getJson('/api/gateway/console/poll?timeout=0')->assertForbidden();
});

it('rejects unauthenticated console requests (garbage)', function (): void {
    $this->postJson('/api/gateway/commands', ['action' => 'ping'])->assertStatus(401);
    $this->getJson('/api/gateway/console/poll')->assertStatus(401);
});
```

`apps/backend/tests/Feature/Modules/Gateway/TokenEndpointsTest.php`:

```php
<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use App\Modules\Gateway\Domain\GatewayPermission;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\ClientRepository;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );

    (new PermissionsSeeder([GatewayPermission::class]))->run();

    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web'])
        ->givePermissionTo(
            Permission::findByName(GatewayPermission::UseGateway->value),
            Permission::findByName(GatewayPermission::UseConsole->value),
            Permission::findByName(GatewayPermission::ManageToken->value),
        );
});

/**
 * @return array{0: User, 1: string}
 */
function tokenAuthenticatedAs(string $tokenName = 'stub-login'): array
{
    $user = User::factory()->create();
    $user->assignRole(Role::Member->value);
    $token = $user->createToken($tokenName)->accessToken;

    return [$user, $token];
}

it('reports no token before creation (happy empty)', function (): void {
    [, $token] = tokenAuthenticatedAs();

    $this->withToken($token)->getJson('/api/gateway/token')
        ->assertOk()
        ->assertJson(['exists' => false, 'created_at' => null]);
});

it('creates a gateway token and returns the secret once (happy)', function (): void {
    [$user, $token] = tokenAuthenticatedAs();

    $response = $this->withToken($token)->postJson('/api/gateway/token');

    $response->assertStatus(201);
    expect($response->json('token'))->toBeString()->not->toBe('');
    expect($response->json('created_at'))->not->toBeNull();
    expect($user->tokens()->where('name', 'gateway')->where('revoked', false)->count())->toBe(1);

    $this->withToken($token)->getJson('/api/gateway/token')
        ->assertOk()
        ->assertJsonPath('exists', true);
});

it('revokes the previous token on rotate (happy)', function (): void {
    [$user, $token] = tokenAuthenticatedAs();

    $first = $this->withToken($token)->postJson('/api/gateway/token')->json('token');
    $second = $this->withToken($token)->postJson('/api/gateway/token')->json('token');

    expect($second)->not->toBe($first);
    expect($user->tokens()->where('name', 'gateway')->where('revoked', false)->count())->toBe(1);

    // The revoked secret no longer authenticates on plugin routes.
    $this->withToken($first)->getJson('/api/euroscope/poll?timeout=1')->assertStatus(401);
});

it('rejects the gateway token itself on token routes (invalid token name)', function (): void {
    [, $webToken] = tokenAuthenticatedAs();
    $gatewaySecret = $this->withToken($webToken)->postJson('/api/gateway/token')->json('token');

    $this->withToken($gatewaySecret)->getJson('/api/gateway/token')->assertForbidden();
    $this->withToken($gatewaySecret)->postJson('/api/gateway/token')->assertForbidden();
});

it('rejects unauthenticated token requests (garbage)', function (): void {
    $this->getJson('/api/gateway/token')->assertStatus(401);
    $this->postJson('/api/gateway/token')->assertStatus(401);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Modules/Gateway/ConsoleEndpointsTest.php tests/Feature/Modules/Gateway/TokenEndpointsTest.php`
Expected: FAIL — 404s

- [ ] **Step 3: Implement request, controllers, routes, rate limiter**

`apps/backend/app/Modules/Gateway/Presentation/Http/Requests/EnqueuePluginCommandRequest.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Presentation\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;

class EnqueuePluginCommandRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'action' => ['required', 'string', 'min:1', 'max:64'],
            'callsign' => ['sometimes', 'nullable', 'string', 'max:16'],
            'payload' => ['sometimes', 'nullable', 'array'],
            'id' => ['sometimes', 'nullable', function (string $attribute, mixed $value, Closure $fail): void {
                if (! is_string($value) && ! is_int($value)) {
                    $fail(__('gateway.id_must_be_scalar'));
                }
            }],
        ];
    }
}
```

Add to both lang files (`lang/en/gateway.php` / `lang/pt/gateway.php`):

```php
    'id_must_be_scalar' => 'The id must be a string or an integer.',
```

```php
    'id_must_be_scalar' => 'O id deve ser uma string ou um inteiro.',
```

`apps/backend/app/Modules/Gateway/Presentation/Http/ConsoleController.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Presentation\Http;

use App\Cqrs\Bus\CommandBus;
use App\Cqrs\Bus\QueryBus;
use App\Models\User;
use App\Modules\Gateway\Application\Commands\EnqueuePluginCommandCommand;
use App\Modules\Gateway\Application\Queries\ConsoleView;
use App\Modules\Gateway\Application\Queries\TailConsoleMessagesQuery;
use App\Modules\Gateway\Presentation\Http\Requests\EnqueuePluginCommandRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

class ConsoleController
{
    private const MAX_POLL_SECONDS = 15;

    public function __construct(
        private CommandBus $commandBus,
        private QueryBus $queryBus,
    ) {}

    /**
     * Queue a protocol command for the connected EuroScope plugin.
     *
     * @bodyParam action string required Protocol action verb. Example: set_squawk
     * @bodyParam callsign string Flight callsign for flight-scoped actions. Example: ABC1234
     * @bodyParam payload object Action payload. Example: {"code": "2354"}
     * @bodyParam id string Correlation id echoed in the plugin response; auto-generated when omitted.
     *
     * @response 202 {"queued": {"type": "command", "id": "01JZ…", "action": "set_squawk", "callsign": "ABC1234", "payload": {"code": "2354"}}}
     */
    public function send(EnqueuePluginCommandRequest $request): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);

        /** @var array<string, mixed> $envelope */
        $envelope = $this->commandBus->dispatch(new EnqueuePluginCommandCommand(
            userId: $user->id,
            action: $request->validated('action'),
            callsign: $request->validated('callsign'),
            payload: $request->validated('payload'),
            id: $request->validated('id'),
        ));

        return response()->json(['queued' => $envelope], 202);
    }

    /**
     * Long-poll the console message feed.
     *
     * Without `after`, returns the ring buffer immediately (backfill). With a
     * cursor, holds up to `timeout` seconds (max 15) for newer messages.
     *
     * @response 200 {"messages": [{"id": "1720527600000-0", "direction": "in", "envelope": {"type": "event", "action": "flight_updated"}}], "cursor": "1720527600000-0", "reset": false, "pluginConnected": true}
     */
    public function poll(Request $request): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);

        $after = $request->query('after');
        $afterId = is_string($after) && $after !== '' ? $after : null;
        $timeout = max(0, min((int) $request->query('timeout', '15'), self::MAX_POLL_SECONDS));

        try {
            $view = $this->queryBus->dispatch(new TailConsoleMessagesQuery(
                userId: $user->id,
                afterId: $afterId,
                // Backfill never blocks; only a cursor-carrying tail holds.
                timeoutSeconds: $afterId === null ? 0 : $timeout,
            ));
        } catch (InvalidArgumentException $e) {
            throw ValidationException::withMessages(['after' => $e->getMessage()]);
        }
        assert($view instanceof ConsoleView);

        return response()->json([
            'messages' => array_map(fn (array $m): array => [
                'id' => $m['id'],
                'direction' => $m['direction'],
                'envelope' => json_decode($m['envelope'], true),
            ], $view->batch->messages),
            'cursor' => $view->batch->cursor,
            'reset' => $view->batch->reset,
            'pluginConnected' => $view->pluginConnected,
        ]);
    }
}
```

`apps/backend/app/Modules/Gateway/Presentation/Http/TokenController.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Presentation\Http;

use App\Cqrs\Bus\CommandBus;
use App\Cqrs\Bus\QueryBus;
use App\Models\User;
use App\Modules\Gateway\Application\Commands\RotateGatewayTokenCommand;
use App\Modules\Gateway\Application\Queries\GetTokenStatusQuery;
use App\Modules\Gateway\Domain\GatewayToken;
use DateTimeImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TokenController
{
    public function __construct(
        private CommandBus $commandBus,
        private QueryBus $queryBus,
    ) {}

    /**
     * Create (or rotate) the gateway token.
     *
     * Revokes any previous gateway token. The plaintext secret is returned
     * exactly once and never retrievable again.
     *
     * @response 201 {"token": "eyJ0…", "created_at": "2026-07-10T12:00:00+00:00"}
     */
    public function rotate(Request $request): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);

        $token = $this->commandBus->dispatch(new RotateGatewayTokenCommand(userId: $user->id));
        assert($token instanceof GatewayToken);

        return response()->json([
            'token' => $token->plainText,
            'created_at' => $token->createdAt->format(DATE_ATOM),
        ], 201);
    }

    /**
     * Gateway token metadata (never the secret).
     *
     * @response 200 {"exists": true, "created_at": "2026-07-10T12:00:00+00:00"}
     */
    public function status(Request $request): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);

        /** @var ?DateTimeImmutable $createdAt */
        $createdAt = $this->queryBus->dispatch(new GetTokenStatusQuery(userId: $user->id));

        return response()->json([
            'exists' => $createdAt !== null,
            'created_at' => $createdAt?->format(DATE_ATOM),
        ]);
    }
}
```

Append to `apps/backend/app/Modules/Gateway/Presentation/Http/routes.php` (add the controller imports):

```php
Route::middleware(['auth:api', EnsureGatewayToken::class.':reject'])
    ->prefix('gateway')
    ->group(function (): void {
        Route::post('/commands', [ConsoleController::class, 'send'])
            ->middleware('throttle:gateway-send')
            ->name('api.gateway.commands');
        Route::get('/console/poll', [ConsoleController::class, 'poll'])->name('api.gateway.console.poll');
        Route::post('/token', [TokenController::class, 'rotate'])->name('api.gateway.token.rotate');
        Route::get('/token', [TokenController::class, 'status'])->name('api.gateway.token.status');
    });
```

`apps/backend/app/Providers/AppServiceProvider.php` — in `boot()`, add (with imports `Illuminate\Cache\RateLimiting\Limit`, `Illuminate\Http\Request`, `Illuminate\Support\Facades\RateLimiter`):

```php
        RateLimiter::for('gateway-send', function (Request $request): Limit {
            return Limit::perMinute(60)->by('gateway-send:'.($request->user()?->id ?? $request->ip()));
        });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Modules/Gateway/ConsoleEndpointsTest.php tests/Feature/Modules/Gateway/TokenEndpointsTest.php`
Expected: PASS (15 tests; the rate-limit test sends 61 requests)

- [ ] **Step 5: Run the full backend suite + gates**

```bash
pnpm nx test backend
pnpm nx analyze backend
pnpm nx deptrac backend
```

Expected: all green (fix any PHPStan/Deptrac finding before committing).

- [ ] **Step 6: Lint and commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "feat(gateway): console and token endpoints (/api/gateway)"
```

---

### Task 8: Frontend gateway core — schema, API endpoints, console slice

**Files:**

- Modify: `libs/api-client/src/baseApi.ts` (add `'GatewayToken'` tag)
- Create: `apps/web/src/features/gateway/schema.ts`
- Create: `apps/web/src/features/gateway/schema.test.ts`
- Create: `apps/web/src/features/gateway/api.ts`
- Create: `apps/web/src/features/gateway/api.test.ts`
- Create: `apps/web/src/features/gateway/slice.ts`
- Create: `apps/web/src/features/gateway/slice.test.ts`
- Modify: `apps/web/src/shared/store/index.ts` (register `gateway` reducer)

**Interfaces:**

- Consumes: `baseApi` from `@eurostrip/api-client`; the Task 7 wire contract.
- Produces (Tasks 9–12 rely on these exact names):
  - `commandEnvelopeSchema`, `type CommandEnvelope = { action: string; callsign?: string; payload?: Record<string, unknown>; id?: string | number }`
  - `parseComposerInput(raw: string): { ok: true; envelope: CommandEnvelope } | { ok: false; error: 'invalid-json' | 'invalid-envelope' }`
  - `gatewayApi` hooks: `useTokenStatusQuery()`, `useRotateTokenMutation()`, `useSendCommandMutation()`; DTOs `TokenStatusDto { exists: boolean; created_at: string | null }`, `RotateTokenDto { token: string; created_at: string }`, `QueuedCommandDto { queued: Record<string, unknown> }`
  - `gatewaySlice` with actions `batchReceived(GatewayBatch)`, `pollFailed()`; state at `state.gateway`: `{ messages: ConsoleMessage[]; cursor: string | null; pluginConnected: boolean; pollStatus: 'connecting' | 'live' | 'backoff' }`; `ConsoleMessage { id: string; direction: 'in' | 'out'; envelope: Record<string, unknown> }`; `GatewayBatch { messages: ConsoleMessage[]; cursor: string | null; reset: boolean; pluginConnected: boolean }`; feed capped at 500.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/gateway/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseComposerInput } from './schema';

describe('parseComposerInput', () => {
  it('parses a full command envelope (happy)', () => {
    const result = parseComposerInput(
      '{"action":"set_squawk","callsign":"ABC1234","payload":{"code":"2354"},"id":"req-42"}',
    );
    expect(result).toEqual({
      ok: true,
      envelope: {
        action: 'set_squawk',
        callsign: 'ABC1234',
        payload: { code: '2354' },
        id: 'req-42',
      },
    });
  });

  it('drops a user-provided type field — the server forces it (happy)', () => {
    const result = parseComposerInput('{"type":"event","action":"ping"}');
    expect(result).toEqual({ ok: true, envelope: { action: 'ping' } });
  });

  it('flags invalid JSON (invalid)', () => {
    expect(parseComposerInput('{not json')).toEqual({ ok: false, error: 'invalid-json' });
  });

  it('flags a missing action (invalid)', () => {
    expect(parseComposerInput('{"callsign":"ABC1234"}')).toEqual({
      ok: false,
      error: 'invalid-envelope',
    });
  });

  it('flags non-object roots (garbage)', () => {
    expect(parseComposerInput('42')).toEqual({ ok: false, error: 'invalid-envelope' });
    expect(parseComposerInput('"str"')).toEqual({ ok: false, error: 'invalid-envelope' });
    expect(parseComposerInput('[1,2]')).toEqual({ ok: false, error: 'invalid-envelope' });
  });
});
```

`apps/web/src/features/gateway/slice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeStore } from '@/shared/store/index';
import { gatewaySlice, batchReceived, pollFailed, type ConsoleMessage } from './slice';

const reducer = gatewaySlice.reducer;

function msg(id: string): ConsoleMessage {
  return { id, direction: 'in', envelope: { type: 'event', action: 'x' } };
}

describe('gatewaySlice', () => {
  it('is registered in the store (happy)', () => {
    expect(makeStore().getState().gateway.pollStatus).toBe('connecting');
  });

  it('appends batches, advances cursor, goes live (happy)', () => {
    let state = reducer(
      undefined,
      batchReceived({ messages: [msg('1-0')], cursor: '1-0', reset: false, pluginConnected: true }),
    );
    state = reducer(
      state,
      batchReceived({ messages: [msg('2-0')], cursor: '2-0', reset: false, pluginConnected: true }),
    );
    expect(state.messages.map((m) => m.id)).toEqual(['1-0', '2-0']);
    expect(state.cursor).toBe('2-0');
    expect(state.pluginConnected).toBe(true);
    expect(state.pollStatus).toBe('live');
  });

  it('replaces the feed on reset (invalid cursor recovery)', () => {
    let state = reducer(
      undefined,
      batchReceived({
        messages: [msg('1-0'), msg('2-0')],
        cursor: '2-0',
        reset: false,
        pluginConnected: false,
      }),
    );
    state = reducer(
      state,
      batchReceived({ messages: [msg('9-0')], cursor: '9-0', reset: true, pluginConnected: false }),
    );
    expect(state.messages.map((m) => m.id)).toEqual(['9-0']);
  });

  it('keeps the cursor when a poll returns none (happy timeout)', () => {
    let state = reducer(
      undefined,
      batchReceived({ messages: [msg('1-0')], cursor: '1-0', reset: false, pluginConnected: true }),
    );
    state = reducer(
      state,
      batchReceived({ messages: [], cursor: null, reset: false, pluginConnected: true }),
    );
    expect(state.cursor).toBe('1-0');
  });

  it('caps the feed at 500 messages (garbage volume)', () => {
    const many = Array.from({ length: 510 }, (_, i) => msg(`${i + 1}-0`));
    const state = reducer(
      undefined,
      batchReceived({ messages: many, cursor: '510-0', reset: false, pluginConnected: true }),
    );
    expect(state.messages).toHaveLength(500);
    expect(state.messages[0].id).toBe('11-0');
  });

  it('marks backoff on poll failure but keeps messages (invalid)', () => {
    let state = reducer(
      undefined,
      batchReceived({ messages: [msg('1-0')], cursor: '1-0', reset: false, pluginConnected: true }),
    );
    state = reducer(state, pollFailed());
    expect(state.pollStatus).toBe('backoff');
    expect(state.messages).toHaveLength(1);
  });
});
```

`apps/web/src/features/gateway/api.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gatewayApi } from './api';

describe('gatewayApi', () => {
  it('exposes the three gateway endpoints (happy)', () => {
    expect(gatewayApi.endpoints.tokenStatus).toBeDefined();
    expect(gatewayApi.endpoints.rotateToken).toBeDefined();
    expect(gatewayApi.endpoints.sendCommand).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web exec vitest run src/features/gateway`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement schema, api, slice, store registration**

`libs/api-client/src/baseApi.ts` — change the tagTypes line:

```ts
  tagTypes: ['Ping', 'GatewayToken'],
```

`apps/web/src/features/gateway/schema.ts`:

```ts
import { z } from 'zod';

export const commandEnvelopeSchema = z.object({
  action: z.string().min(1),
  callsign: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  id: z.union([z.string(), z.number().int()]).optional(),
});

export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;

export type ComposerResult =
  | { ok: true; envelope: CommandEnvelope }
  | { ok: false; error: 'invalid-json' | 'invalid-envelope' };

/**
 * Validate raw composer input into a sendable envelope. `type` is stripped —
 * the backend forces `type: "command"` on everything sent from the console.
 */
export function parseComposerInput(raw: string): ComposerResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    delete (parsed as Record<string, unknown>).type;
  }

  const result = commandEnvelopeSchema.safeParse(parsed);
  return result.success
    ? { ok: true, envelope: result.data }
    : { ok: false, error: 'invalid-envelope' };
}
```

`apps/web/src/features/gateway/api.ts`:

```ts
import { baseApi } from '@eurostrip/api-client';
import type { CommandEnvelope } from './schema';

export interface TokenStatusDto {
  exists: boolean;
  created_at: string | null;
}

export interface RotateTokenDto {
  token: string;
  created_at: string;
}

export interface QueuedCommandDto {
  queued: Record<string, unknown>;
}

export const gatewayApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    tokenStatus: builder.query<TokenStatusDto, void>({
      query: () => 'gateway/token',
      providesTags: ['GatewayToken'],
    }),
    rotateToken: builder.mutation<RotateTokenDto, void>({
      query: () => ({ url: 'gateway/token', method: 'POST' }),
      invalidatesTags: ['GatewayToken'],
    }),
    sendCommand: builder.mutation<QueuedCommandDto, CommandEnvelope>({
      query: (body) => ({ url: 'gateway/commands', method: 'POST', body }),
    }),
  }),
});

export const { useTokenStatusQuery, useRotateTokenMutation, useSendCommandMutation } = gatewayApi;
```

`apps/web/src/features/gateway/slice.ts`:

```ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ConsoleMessage {
  id: string;
  direction: 'in' | 'out';
  envelope: Record<string, unknown>;
}

export interface GatewayBatch {
  messages: ConsoleMessage[];
  cursor: string | null;
  reset: boolean;
  pluginConnected: boolean;
}

export interface GatewayState {
  messages: ConsoleMessage[];
  cursor: string | null;
  pluginConnected: boolean;
  pollStatus: 'connecting' | 'live' | 'backoff';
}

// Server ring holds 200; the client cap only guards long-lived tabs.
const MAX_MESSAGES = 500;

const initialState: GatewayState = {
  messages: [],
  cursor: null,
  pluginConnected: false,
  pollStatus: 'connecting',
};

export const gatewaySlice = createSlice({
  name: 'gateway',
  initialState,
  reducers: {
    batchReceived(state, action: PayloadAction<GatewayBatch>) {
      const { messages, cursor, reset, pluginConnected } = action.payload;
      state.pluginConnected = pluginConnected;
      state.pollStatus = 'live';
      state.messages = reset ? messages : [...state.messages, ...messages];
      if (state.messages.length > MAX_MESSAGES) {
        state.messages = state.messages.slice(state.messages.length - MAX_MESSAGES);
      }
      if (cursor) {
        state.cursor = cursor;
      }
    },
    pollFailed(state) {
      state.pollStatus = 'backoff';
    },
  },
});

export const { batchReceived, pollFailed } = gatewaySlice.actions;
```

`apps/web/src/shared/store/index.ts` — add the import and reducer entry:

```ts
import { gatewaySlice } from '@/features/gateway/slice';
// ...
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      auth: authSlice.reducer,
      gateway: gatewaySlice.reducer,
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/gateway`
Expected: PASS (12 tests)

Also run the untouched suites to catch regressions from the `baseApi` change:
Run: `pnpm nx test web` — Expected: PASS
Run: `pnpm nx typecheck web` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/api-client apps/web
git commit -m "feat(web-gateway): schema, api endpoints and console slice"
```

---

### Task 9: `useGatewayPoll` long-poll hook

**Files:**

- Create: `apps/web/src/features/gateway/useGatewayPoll.ts`
- Test: `apps/web/src/features/gateway/useGatewayPoll.test.tsx`

**Interfaces:**

- Consumes: `batchReceived`, `pollFailed`, `GatewayBatch` (Task 8); `useAppDispatch` from `@/shared/store/hooks`; the proxy path `/api/proxy/api/gateway/console/poll`.
- Produces: `useGatewayPoll(enabled = true): void` — mounts one polling loop: first request has no `after` (backfill), later requests carry the last cursor; server hold 15 s, client abort 20 s; error backoff 1 s → 30 s doubling; loop stops and aborts on unmount. Task 11's `ConsoleClient` calls it.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/gateway/useGatewayPoll.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from '@/shared/store/index';
import { useGatewayPoll } from './useGatewayPoll';

function makeWrapper(store: AppStore) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const batch = {
  messages: [{ id: '1-0', direction: 'in', envelope: { type: 'event', action: 'flight_updated' } }],
  cursor: '1-0',
  reset: false,
  pluginConnected: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGatewayPoll', () => {
  it('dispatches the backfill then re-polls with the cursor (happy)', async () => {
    const calls: string[] = [];
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      calls.push(String(input));
      if (calls.length === 1) {
        return Promise.resolve(jsonResponse(batch));
      }
      return new Promise(() => {}); // subsequent poll hangs like a real long poll
    });

    const store = makeStore();
    renderHook(() => useGatewayPoll(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(store.getState().gateway.messages).toHaveLength(1));
    expect(store.getState().gateway.cursor).toBe('1-0');

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).not.toContain('after=');
    expect(calls[1]).toContain('after=1-0');
  });

  it('flags backoff on failure and recovers on the next poll (invalid)', async () => {
    let count = 0;
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      count++;
      if (count === 1) {
        return Promise.reject(new Error('network down'));
      }
      if (count === 2) {
        return Promise.resolve(jsonResponse(batch));
      }
      return new Promise(() => {});
    });

    const store = makeStore();
    renderHook(() => useGatewayPoll(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(store.getState().gateway.pollStatus).toBe('backoff'));
    // Backoff starts at 1s; the retry then succeeds.
    await waitFor(() => expect(store.getState().gateway.pollStatus).toBe('live'), {
      timeout: 3_000,
    });
    expect(store.getState().gateway.messages).toHaveLength(1);
  });

  it('treats non-2xx as failure (invalid)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));

    const store = makeStore();
    renderHook(() => useGatewayPoll(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(store.getState().gateway.pollStatus).toBe('backoff'));
  });

  it('stops polling on unmount (garbage teardown)', async () => {
    let count = 0;
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      count++;
      return new Promise(() => {});
    });

    const store = makeStore();
    const { unmount } = renderHook(() => useGatewayPoll(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(count).toBe(1));
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(count).toBe(1);
  });

  it('does nothing when disabled (invalid)', async () => {
    const spy = vi.spyOn(global, 'fetch');

    const store = makeStore();
    renderHook(() => useGatewayPoll(false), { wrapper: makeWrapper(store) });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/useGatewayPoll.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

`apps/web/src/features/gateway/useGatewayPoll.ts`:

```ts
'use client';

import { useEffect } from 'react';
import { useAppDispatch } from '@/shared/store/hooks';
import { batchReceived, pollFailed, type GatewayBatch } from './slice';

const POLL_URL = '/api/proxy/api/gateway/console/poll';
const SERVER_HOLD_SECONDS = 15;
// Must exceed the server hold, or healthy long polls get aborted mid-wait.
const CLIENT_TIMEOUT_MS = 20_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

/**
 * Owns the console's long-poll loop: backfill on mount (no cursor), then
 * cursor-tail polls that the server holds up to 15s. Errors back off
 * exponentially; unmount aborts the in-flight request and ends the loop.
 */
export function useGatewayPoll(enabled = true) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let controller = new AbortController();
    let cursor: string | null = null;
    let backoffMs = 0;

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    async function loop() {
      while (!cancelled) {
        if (backoffMs > 0) {
          await sleep(backoffMs);
        }
        if (cancelled) {
          return;
        }
        controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
        try {
          const params = new URLSearchParams({ timeout: String(SERVER_HOLD_SECONDS) });
          if (cursor) {
            params.set('after', cursor);
          }
          const res = await fetch(`${POLL_URL}?${params.toString()}`, {
            signal: controller.signal,
            credentials: 'include',
          });
          if (!res.ok) {
            throw new Error(`poll failed with ${res.status}`);
          }
          const batch = (await res.json()) as GatewayBatch;
          if (cancelled) {
            return;
          }
          if (batch.cursor) {
            cursor = batch.cursor;
          }
          dispatch(batchReceived(batch));
          backoffMs = 0;
        } catch {
          if (cancelled) {
            return;
          }
          dispatch(pollFailed());
          backoffMs = backoffMs === 0 ? BACKOFF_MIN_MS : Math.min(backoffMs * 2, BACKOFF_MAX_MS);
        } finally {
          clearTimeout(timer);
        }
      }
    }

    void loop();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, dispatch]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/useGatewayPoll.test.tsx`
Expected: PASS (5 tests; the backoff test takes ~1.5 s)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/gateway
git commit -m "feat(web-gateway): long-poll hook with cursor and backoff"
```

---

### Task 10: Token page

**Files:**

- Create: `apps/web/src/app/[locale]/token/page.tsx`
- Create: `apps/web/src/features/gateway/components/TokenPanel.tsx`
- Create: `apps/web/src/features/gateway/components/TokenPanel.test.tsx`
- Create: `apps/web/src/messages/gateway.en.json`
- Create: `apps/web/src/messages/gateway.pt.json`
- Modify: `apps/web/src/i18n/request.ts` (wire gateway catalogs)
- Modify: `libs/i18n/src/messages/en.json` + `libs/i18n/src/messages/pt.json` (nav entries)
- Modify: `apps/web/src/app/[locale]/dashboard/page.tsx` (nav links)
- Modify: `.env.example` (document `NEXT_PUBLIC_GATEWAY_BASE_URL`)

**Interfaces:**

- Consumes: `useTokenStatusQuery`, `useRotateTokenMutation` (Task 8).
- Produces: `/[locale]/token` page; `TokenPanel` with `data-testid="gateway-token-secret"` (Task 12's e2e reads it); button labels `Generate token` / `Rotate token` / `Yes, rotate`; nav keys `nav.console` = "Console", `nav.gatewayToken` = "Gateway token"; env `NEXT_PUBLIC_GATEWAY_BASE_URL` (default `http://127.0.0.1:8000/api/euroscope`) shown in the `.wsc` lines.

- [ ] **Step 1: Create the i18n catalogs and wiring**

`apps/web/src/messages/gateway.en.json`:

```json
{
  "gateway": {
    "console": {
      "title": "Gateway console",
      "connected": "● Plugin connected",
      "disconnected": "○ Plugin offline",
      "pollLive": "Live",
      "pollBackoff": "Reconnecting…",
      "empty": "No messages yet — connect your plugin or send a command.",
      "pause": "Pause auto-scroll",
      "resume": "Resume auto-scroll",
      "directionIn": "▼ in",
      "directionOut": "▲ out",
      "composer": {
        "label": "Command JSON",
        "hint": "{\"action\":\"set_squawk\",\"callsign\":\"ABC1234\",\"payload\":{\"code\":\"2354\"}}",
        "send": "Send",
        "invalidJson": "Not valid JSON.",
        "invalidEnvelope": "The envelope needs at least an \"action\" string.",
        "sendFailed": "Sending failed — try again."
      }
    },
    "token": {
      "title": "Gateway token",
      "loading": "Loading token status…",
      "none": "No gateway token yet.",
      "createdAt": "Created {date}",
      "generate": "Generate token",
      "rotate": "Rotate token",
      "confirm": "Rotating disconnects the currently connected plugin. Continue?",
      "confirmYes": "Yes, rotate",
      "confirmNo": "Cancel",
      "revealHint": "Copy these now — the secret is shown only once.",
      "error": "Token operation failed."
    }
  }
}
```

`apps/web/src/messages/gateway.pt.json`:

```json
{
  "gateway": {
    "console": {
      "title": "Console do gateway",
      "connected": "● Plugin conectado",
      "disconnected": "○ Plugin offline",
      "pollLive": "Ao vivo",
      "pollBackoff": "Reconectando…",
      "empty": "Sem mensagens ainda — conecte seu plugin ou envie um comando.",
      "pause": "Pausar rolagem automática",
      "resume": "Retomar rolagem automática",
      "directionIn": "▼ entrada",
      "directionOut": "▲ saída",
      "composer": {
        "label": "JSON do comando",
        "hint": "{\"action\":\"set_squawk\",\"callsign\":\"ABC1234\",\"payload\":{\"code\":\"2354\"}}",
        "send": "Enviar",
        "invalidJson": "JSON inválido.",
        "invalidEnvelope": "O envelope precisa de ao menos uma string \"action\".",
        "sendFailed": "Falha no envio — tente novamente."
      }
    },
    "token": {
      "title": "Token do gateway",
      "loading": "Carregando status do token…",
      "none": "Nenhum token do gateway ainda.",
      "createdAt": "Criado em {date}",
      "generate": "Gerar token",
      "rotate": "Rotacionar token",
      "confirm": "Rotacionar desconecta o plugin conectado no momento. Continuar?",
      "confirmYes": "Sim, rotacionar",
      "confirmNo": "Cancelar",
      "revealHint": "Copie agora — o segredo é exibido apenas uma vez.",
      "error": "Falha na operação do token."
    }
  }
}
```

`apps/web/src/i18n/request.ts` — add imports and spread them:

```ts
import gatewayEn from '@/messages/gateway.en.json';
import gatewayPt from '@/messages/gateway.pt.json';

const PER_FEATURE: Record<string, Record<string, unknown>> = {
  en: { ...authEn, ...pingEn, ...gatewayEn },
  pt: { ...authPt, ...pingPt, ...gatewayPt },
};
```

`libs/i18n/src/messages/en.json` — extend `nav`:

```json
  "nav": {
    "dashboard": "Dashboard",
    "ping": "Pings",
    "console": "Console",
    "gatewayToken": "Gateway token",
    "logout": "Log out"
  },
```

`libs/i18n/src/messages/pt.json` — extend `nav`:

```json
  "nav": {
    "dashboard": "Painel",
    "ping": "Pings",
    "console": "Console",
    "gatewayToken": "Token do gateway",
    "logout": "Sair"
  },
```

`apps/web/src/app/[locale]/dashboard/page.tsx` — add two links inside the `<nav>`, before the logout form:

```tsx
          <Link href="./console" className="underline">
            {t('console')}
          </Link>
          <Link href="./token" className="underline">
            {t('gatewayToken')}
          </Link>
```

`.env.example` (repo root) — append:

```bash
# Base URL the EuroScope plugin should target (shown on the token page).
NEXT_PUBLIC_GATEWAY_BASE_URL=http://127.0.0.1:8000/api/euroscope
```

- [ ] **Step 2: Write the failing TokenPanel tests**

`apps/web/src/features/gateway/components/TokenPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { TokenPanel } from './TokenPanel';

const messages = {
  gateway: {
    token: {
      title: 'Gateway token',
      loading: 'Loading token status…',
      none: 'No gateway token yet.',
      createdAt: 'Created {date}',
      generate: 'Generate token',
      rotate: 'Rotate token',
      confirm: 'Rotating disconnects the currently connected plugin. Continue?',
      confirmYes: 'Yes, rotate',
      confirmNo: 'Cancel',
      revealHint: 'Copy these now — the secret is shown only once.',
      error: 'Token operation failed.',
    },
  },
};

function wrap(ui: React.ReactElement) {
  return (
    <Provider store={makeStore()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {ui}
      </NextIntlClientProvider>
    </Provider>
  );
}

function mockFetch(handler: (method: string) => Response | null) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const method = input instanceof Request ? input.method : (init?.method ?? 'GET');
    const response = handler(method.toUpperCase());
    if (!response) {
      throw new Error('unexpected fetch');
    }
    return response;
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TokenPanel', () => {
  it('shows the empty state and generates directly without confirm (happy)', async () => {
    mockFetch((method) =>
      method === 'GET'
        ? json({ exists: false, created_at: null })
        : json({ token: 'secret-abc', created_at: '2026-07-10T12:00:00Z' }, 201),
    );
    render(wrap(<TokenPanel />));

    expect(await screen.findByText('No gateway token yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Generate token' }));

    expect(await screen.findByTestId('gateway-token-secret')).toHaveTextContent('secret-abc');
    expect(screen.getByText(/\.wsc gateway token secret-abc/)).toBeInTheDocument();
    expect(screen.getByText(/\.wsc gateway url /)).toBeInTheDocument();
  });

  it('requires confirmation before rotating an existing token (happy)', async () => {
    mockFetch((method) =>
      method === 'GET'
        ? json({ exists: true, created_at: '2026-07-01T00:00:00Z' })
        : json({ token: 'secret-new', created_at: '2026-07-10T12:00:00Z' }, 201),
    );
    render(wrap(<TokenPanel />));

    await userEvent.click(await screen.findByRole('button', { name: 'Rotate token' }));
    expect(
      screen.getByText('Rotating disconnects the currently connected plugin. Continue?'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Yes, rotate' }));
    expect(await screen.findByTestId('gateway-token-secret')).toHaveTextContent('secret-new');
  });

  it('cancel keeps the token untouched (invalid path)', async () => {
    mockFetch((method) =>
      method === 'GET' ? json({ exists: true, created_at: '2026-07-01T00:00:00Z' }) : null,
    );
    render(wrap(<TokenPanel />));

    await userEvent.click(await screen.findByRole('button', { name: 'Rotate token' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('gateway-token-secret')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rotate token' })).toBeInTheDocument();
  });

  it('surfaces a rotate failure (garbage)', async () => {
    mockFetch((method) =>
      method === 'GET'
        ? json({ exists: false, created_at: null })
        : new Response('boom', { status: 500 }),
    );
    render(wrap(<TokenPanel />));

    await userEvent.click(await screen.findByRole('button', { name: 'Generate token' }));

    expect(await screen.findByText('Token operation failed.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/components/TokenPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: Implement TokenPanel and the page**

`apps/web/src/features/gateway/components/TokenPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Spinner } from '@eurostrip/ui';
import { useRotateTokenMutation, useTokenStatusQuery } from '../api';

const GATEWAY_BASE =
  process.env.NEXT_PUBLIC_GATEWAY_BASE_URL ?? 'http://127.0.0.1:8000/api/euroscope';

export function TokenPanel() {
  const t = useTranslations('gateway.token');
  const { data, isLoading } = useTokenStatusQuery();
  const [rotateToken, { isLoading: isRotating }] = useRotateTokenMutation();
  const [confirming, setConfirming] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return <Spinner label={t('loading')} />;
  }

  const exists = data?.exists ?? false;

  async function rotate() {
    setConfirming(false);
    setError(null);
    const result = await rotateToken();
    if ('error' in result && result.error) {
      setError(t('error'));
    } else if (result.data) {
      setSecret(result.data.token);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {exists && data?.created_at ? (
        <p className="text-sm">
          {t('createdAt', { date: new Date(data.created_at).toLocaleString() })}
        </p>
      ) : (
        <p className="text-sm">{t('none')}</p>
      )}

      {!confirming && (
        <Button
          type="button"
          disabled={isRotating}
          onClick={() => (exists ? setConfirming(true) : void rotate())}
        >
          {exists ? t('rotate') : t('generate')}
        </Button>
      )}

      {confirming && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t('confirm')}</p>
          <div className="flex gap-2">
            <Button type="button" disabled={isRotating} onClick={() => void rotate()}>
              {t('confirmYes')}
            </Button>
            <Button type="button" onClick={() => setConfirming(false)}>
              {t('confirmNo')}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-accent-danger text-sm">{error}</p>}

      {secret && (
        <div className="flex flex-col gap-2 border border-neutral-600 p-4">
          <p className="text-sm font-semibold">{t('revealHint')}</p>
          <code data-testid="gateway-token-secret" className="break-all font-mono text-xs">
            {secret}
          </code>
          <code className="break-all font-mono text-xs">{`.wsc gateway url ${GATEWAY_BASE}`}</code>
          <code className="break-all font-mono text-xs">{`.wsc gateway token ${secret}`}</code>
        </div>
      )}
    </div>
  );
}
```

`apps/web/src/app/[locale]/token/page.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Card } from '@eurostrip/ui';
import { TokenPanel } from '@/features/gateway/components/TokenPanel';
import { SESSION_COOKIE_NAME } from '@/shared/auth/cookie';

export default async function TokenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!session?.value) redirect(`/${locale}/login`);
  return <TokenPageClient />;
}

function TokenPageClient() {
  const t = useTranslations('gateway.token');
  return (
    <main className="p-8 space-y-8">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <Card>
        <TokenPanel />
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/components/TokenPanel.test.tsx`
Expected: PASS (4 tests)

Run: `pnpm nx test web` and `pnpm nx lint web` and `pnpm nx typecheck web`
Expected: PASS (the i18n ESLint rule must not flag the new components)

- [ ] **Step 6: Commit**

```bash
git add apps/web libs/i18n .env.example
git commit -m "feat(web-gateway): token page with one-time secret reveal"
```

---

### Task 11: Console page

**Files:**

- Create: `apps/web/src/features/gateway/components/ConsoleClient.tsx`
- Create: `apps/web/src/features/gateway/components/ConsoleStatusHeader.tsx`
- Create: `apps/web/src/features/gateway/components/ConsoleStatusHeader.test.tsx`
- Create: `apps/web/src/features/gateway/components/MessageFeed.tsx`
- Create: `apps/web/src/features/gateway/components/MessageFeed.test.tsx`
- Create: `apps/web/src/features/gateway/components/CommandComposer.tsx`
- Create: `apps/web/src/features/gateway/components/CommandComposer.test.tsx`
- Create: `apps/web/src/app/[locale]/console/page.tsx`

**Interfaces:**

- Consumes: `useGatewayPoll` (Task 9); slice state/actions (Task 8); `useSendCommandMutation`, `parseComposerInput` (Task 8); `gateway.console.*` catalog keys (Task 10).
- Produces: `/[locale]/console` page. e2e (Task 12) relies on: textarea labeled `Command JSON`, button `Send`, feed rows showing the envelope `action` text.

- [ ] **Step 1: Write the failing component tests**

`apps/web/src/features/gateway/components/ConsoleStatusHeader.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { batchReceived, pollFailed } from '../slice';
import { ConsoleStatusHeader } from './ConsoleStatusHeader';

const messages = {
  gateway: {
    console: {
      connected: '● Plugin connected',
      disconnected: '○ Plugin offline',
      pollLive: 'Live',
      pollBackoff: 'Reconnecting…',
    },
  },
};

function renderWith(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConsoleStatusHeader />
      </NextIntlClientProvider>
    </Provider>,
  );
}

describe('ConsoleStatusHeader', () => {
  it('shows offline + live defaults after a first empty batch (happy)', () => {
    const store = makeStore();
    store.dispatch(
      batchReceived({ messages: [], cursor: null, reset: false, pluginConnected: false }),
    );
    renderWith(store);
    expect(screen.getByText('○ Plugin offline')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows connected when the plugin polled recently (happy)', () => {
    const store = makeStore();
    store.dispatch(
      batchReceived({ messages: [], cursor: null, reset: false, pluginConnected: true }),
    );
    renderWith(store);
    expect(screen.getByText('● Plugin connected')).toBeInTheDocument();
  });

  it('shows reconnecting while backing off (invalid)', () => {
    const store = makeStore();
    store.dispatch(pollFailed());
    renderWith(store);
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
  });
});
```

`apps/web/src/features/gateway/components/MessageFeed.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { batchReceived } from '../slice';
import { MessageFeed } from './MessageFeed';

const messages = {
  gateway: {
    console: {
      title: 'Gateway console',
      empty: 'No messages yet — connect your plugin or send a command.',
      pause: 'Pause auto-scroll',
      resume: 'Resume auto-scroll',
      directionIn: '▼ in',
      directionOut: '▲ out',
    },
  },
};

function renderWith(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <MessageFeed />
      </NextIntlClientProvider>
    </Provider>,
  );
}

describe('MessageFeed', () => {
  it('shows the empty state (happy empty)', () => {
    renderWith(makeStore());
    expect(
      screen.getByText('No messages yet — connect your plugin or send a command.'),
    ).toBeInTheDocument();
  });

  it('renders rows with direction, type, action and callsign (happy)', () => {
    const store = makeStore();
    store.dispatch(
      batchReceived({
        messages: [
          {
            id: '1720527600000-0',
            direction: 'in',
            envelope: { type: 'event', action: 'flight_updated', callsign: 'DLH4TX' },
          },
          {
            id: '1720527600001-0',
            direction: 'out',
            envelope: { type: 'command', action: 'set_squawk', callsign: 'ABC1234' },
          },
        ],
        cursor: '1720527600001-0',
        reset: false,
        pluginConnected: true,
      }),
    );
    renderWith(store);

    expect(screen.getByText('flight_updated')).toBeInTheDocument();
    expect(screen.getByText('set_squawk')).toBeInTheDocument();
    expect(screen.getByText('▼ in')).toBeInTheDocument();
    expect(screen.getByText('▲ out')).toBeInTheDocument();
    expect(screen.getByText('DLH4TX')).toBeInTheDocument();
  });

  it('tolerates envelopes missing standard fields (garbage)', () => {
    const store = makeStore();
    store.dispatch(
      batchReceived({
        messages: [{ id: '1-0', direction: 'in', envelope: { weird: true } }],
        cursor: '1-0',
        reset: false,
        pluginConnected: true,
      }),
    );
    renderWith(store);
    // Renders without crashing; the row exists with placeholder dashes.
    expect(screen.getByText('▼ in')).toBeInTheDocument();
  });

  it('toggles the pause label (happy)', async () => {
    renderWith(makeStore());
    await userEvent.click(screen.getByRole('button', { name: 'Pause auto-scroll' }));
    expect(screen.getByRole('button', { name: 'Resume auto-scroll' })).toBeInTheDocument();
  });
});
```

`apps/web/src/features/gateway/components/CommandComposer.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { CommandComposer } from './CommandComposer';

const messages = {
  gateway: {
    console: {
      composer: {
        label: 'Command JSON',
        hint: '{"action":"set_squawk"}',
        send: 'Send',
        invalidJson: 'Not valid JSON.',
        invalidEnvelope: 'The envelope needs at least an "action" string.',
        sendFailed: 'Sending failed — try again.',
      },
    },
  },
};

function wrap(ui: React.ReactElement) {
  return (
    <Provider store={makeStore()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {ui}
      </NextIntlClientProvider>
    </Provider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CommandComposer', () => {
  it('sends a valid envelope and clears the textarea (happy)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ queued: { type: 'command', action: 'ping' } }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(wrap(<CommandComposer />));

    const box = screen.getByLabelText('Command JSON');
    await userEvent.type(box, '{{"action":"ping"}');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(fetchSpy).toHaveBeenCalled();
    expect(await screen.findByLabelText('Command JSON')).toHaveValue('');
  });

  it('rejects invalid JSON without calling the API (invalid)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(wrap(<CommandComposer />));

    await userEvent.type(screen.getByLabelText('Command JSON'), '{{not json');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Not valid JSON.')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an envelope without action (invalid)', async () => {
    render(wrap(<CommandComposer />));

    await userEvent.type(screen.getByLabelText('Command JSON'), '{{"callsign":"ABC1234"}');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('The envelope needs at least an "action" string.'),
    ).toBeInTheDocument();
  });

  it('surfaces a server failure (garbage)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    render(wrap(<CommandComposer />));

    await userEvent.type(screen.getByLabelText('Command JSON'), '{{"action":"ping"}');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Sending failed — try again.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/components`
Expected: FAIL — modules not found (TokenPanel tests keep passing)

- [ ] **Step 3: Implement the components and page**

`apps/web/src/features/gateway/components/ConsoleStatusHeader.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useAppSelector } from '@/shared/store/hooks';

export function ConsoleStatusHeader() {
  const t = useTranslations('gateway.console');
  const pluginConnected = useAppSelector((s) => s.gateway.pluginConnected);
  const pollStatus = useAppSelector((s) => s.gateway.pollStatus);

  return (
    <div className="flex items-center gap-4 text-sm" data-testid="console-status">
      <span>{pluginConnected ? t('connected') : t('disconnected')}</span>
      <span>{pollStatus === 'backoff' ? t('pollBackoff') : t('pollLive')}</span>
    </div>
  );
}
```

`apps/web/src/features/gateway/components/MessageFeed.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@eurostrip/ui';
import { useAppSelector } from '@/shared/store/hooks';
import type { ConsoleMessage } from '../slice';

function entryTime(id: string): string {
  const ms = Number(id.split('-')[0]);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleTimeString() : '';
}

function FeedRow({ message }: { message: ConsoleMessage }) {
  const t = useTranslations('gateway.console');
  const envelope = message.envelope;
  const text = (key: string) => (typeof envelope[key] === 'string' ? String(envelope[key]) : '—');

  return (
    <details className="border-b border-neutral-700 py-1 font-mono text-sm">
      <summary className="flex cursor-pointer gap-3">
        <span className="w-16 shrink-0">
          {message.direction === 'in' ? t('directionIn') : t('directionOut')}
        </span>
        <span className="w-20 shrink-0">{text('type')}</span>
        <span className="w-44 shrink-0">{text('action')}</span>
        <span className="w-24 shrink-0">{text('callsign')}</span>
        <span className="shrink-0">{entryTime(message.id)}</span>
      </summary>
      <pre className="overflow-x-auto p-2 text-xs">{JSON.stringify(envelope, null, 2)}</pre>
    </details>
  );
}

export function MessageFeed() {
  const t = useTranslations('gateway.console');
  const messages = useAppSelector((s) => s.gateway.messages);
  const [paused, setPaused] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused) {
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages, paused]);

  return (
    <section aria-label={t('title')}>
      <div className="flex justify-end pb-2">
        <Button type="button" onClick={() => setPaused((p) => !p)}>
          {paused ? t('resume') : t('pause')}
        </Button>
      </div>
      {messages.length === 0 && <p className="text-sm">{t('empty')}</p>}
      <div className="max-h-[60vh] overflow-y-auto">
        {messages.map((m) => (
          <FeedRow key={m.id} message={m} />
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}
```

`apps/web/src/features/gateway/components/CommandComposer.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@eurostrip/ui';
import { parseComposerInput } from '../schema';
import { useSendCommandMutation } from '../api';

export function CommandComposer() {
  const t = useTranslations('gateway.console.composer');
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sendCommand, { isLoading }] = useSendCommandMutation();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const parsed = parseComposerInput(raw);
        if (!parsed.ok) {
          setError(parsed.error === 'invalid-json' ? t('invalidJson') : t('invalidEnvelope'));
          return;
        }
        const result = await sendCommand(parsed.envelope);
        if ('error' in result && result.error) {
          setError(t('sendFailed'));
        } else {
          setRaw('');
        }
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm">{t('label')}</span>
        <textarea
          aria-label={t('label')}
          className="min-h-24 border border-neutral-600 bg-transparent p-2 font-mono text-sm"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={t('hint')}
        />
      </label>
      {error && <p className="text-accent-danger text-sm">{error}</p>}
      <Button type="submit" disabled={isLoading}>
        {t('send')}
      </Button>
    </form>
  );
}
```

`apps/web/src/features/gateway/components/ConsoleClient.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@eurostrip/ui';
import { useGatewayPoll } from '../useGatewayPoll';
import { CommandComposer } from './CommandComposer';
import { ConsoleStatusHeader } from './ConsoleStatusHeader';
import { MessageFeed } from './MessageFeed';

export function ConsoleClient() {
  const t = useTranslations('gateway.console');
  useGatewayPoll();

  return (
    <main className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{t('title')}</h1>
        <ConsoleStatusHeader />
      </header>
      <Card>
        <MessageFeed />
      </Card>
      <Card>
        <CommandComposer />
      </Card>
    </main>
  );
}
```

`apps/web/src/app/[locale]/console/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ConsoleClient } from '@/features/gateway/components/ConsoleClient';
import { SESSION_COOKIE_NAME } from '@/shared/auth/cookie';

export default async function ConsolePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!session?.value) redirect(`/${locale}/login`);
  return <ConsoleClient />;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/gateway`
Expected: PASS (all gateway suites)

Run: `pnpm nx test web && pnpm nx lint web && pnpm nx typecheck web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web-gateway): raw JSON console page"
```

---

### Task 12: Fake plugin helper + end-to-end flow

**Files:**

- Create: `apps/web/e2e/support/fake-plugin.ts`
- Create: `apps/web/e2e/gateway-console.spec.ts`
- Modify: `apps/web/e2e/global-setup.ts` (seed GatewayPermission)

**Interfaces:**

- Consumes: the full stack (Docker up + `next dev`, which `pnpm nx e2e web` starts itself); Task 10/11 labels (`Generate token`, `Rotate token`, `Yes, rotate`, `Command JSON`, `Send`, nav `Gateway token`/`Console`); `data-testid="gateway-token-secret"`.
- Produces: `FakePlugin` class speaking protocol v1 over HTTP — also usable manually for dev without EuroScope.

- [ ] **Step 1: Update global-setup to seed gateway permissions**

In `apps/web/e2e/global-setup.ts`, change the `PHP_SCRIPT` seeder line to include the gateway enum:

```ts
const PHP_SCRIPT = `
$seeder = new \\Database\\Seeders\\PermissionsSeeder([\\App\\Modules\\Ping\\Domain\\PingPermission::class, \\App\\Modules\\Gateway\\Domain\\GatewayPermission::class]);
$seeder->run();
$role = \\Spatie\\Permission\\Models\\Role::firstOrCreate(['name' => 'member', 'guard_name' => 'web']);
$role->givePermissionTo(\\Spatie\\Permission\\Models\\Permission::all());
foreach (\\App\\Models\\User::all() as $u) { $u->syncRoles([$role]); }
echo 'e2e-setup-ok';
`;
```

- [ ] **Step 2: Write the fake plugin helper**

`apps/web/e2e/support/fake-plugin.ts`:

```ts
import type { APIRequestContext } from '@playwright/test';

const BACKEND_URL = process.env.EWFS_BACKEND_URL ?? 'http://127.0.0.1:8000';

export interface ProtocolEnvelope {
  type: string;
  id?: string | number;
  callsign?: string;
  action: string;
  payload?: Record<string, unknown>;
  ok?: boolean;
  error?: string;
}

/**
 * Minimal stand-in for the euroscope-websocket-connector plugin: POSTs
 * message batches and long-polls for commands over plain HTTP, exactly like
 * PROTOCOL.md describes. Also handy for manual testing without EuroScope.
 */
export class FakePlugin {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  async sendMessages(envelopes: ProtocolEnvelope[]): Promise<number> {
    const res = await this.request.post(`${BACKEND_URL}/api/euroscope/messages`, {
      headers: this.headers(),
      data: { messages: envelopes },
    });
    return res.status();
  }

  async pollOnce(timeoutSeconds = 5): Promise<ProtocolEnvelope[]> {
    const res = await this.request.get(
      `${BACKEND_URL}/api/euroscope/poll?timeout=${timeoutSeconds}`,
      { headers: this.headers() },
    );
    if (res.status() === 204) {
      return [];
    }
    const body = (await res.json()) as { commands: ProtocolEnvelope[] };
    return body.commands;
  }
}
```

- [ ] **Step 3: Write the e2e spec**

`apps/web/e2e/gateway-console.spec.ts`:

```ts
import { test, expect, request as pwRequest } from '@playwright/test';
import { FakePlugin, type ProtocolEnvelope } from './support/fake-plugin';

test('login → create token → plugin event in console → command reaches plugin (happy)', async ({
  page,
}) => {
  // 1. Stub login.
  await page.goto('/en/login');
  await page.getByRole('link', { name: /Continue with Stub/i }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 15_000 });

  // 2. Create (or rotate) the gateway token and capture the one-time secret.
  await page.getByRole('link', { name: 'Gateway token' }).click();
  await expect(page).toHaveURL(/\/en\/token/);

  // The backend persists across e2e runs: first run generates, later runs rotate.
  const rotate = page.getByRole('button', { name: 'Rotate token' });
  if (await rotate.isVisible().catch(() => false)) {
    await rotate.click();
    await page.getByRole('button', { name: 'Yes, rotate' }).click();
  } else {
    await page.getByRole('button', { name: 'Generate token' }).click();
  }
  const secret = (await page.getByTestId('gateway-token-secret').textContent())?.trim();
  expect(secret).toBeTruthy();

  // 3. The fake plugin pushes a flight_updated event with that token.
  const api = await pwRequest.newContext();
  const plugin = new FakePlugin(api, secret!);
  const callsign = `E2E${Date.now() % 10_000}`;
  const event: ProtocolEnvelope = {
    type: 'event',
    callsign,
    action: 'flight_updated',
    payload: { callsign, origin: 'EDDM', destination: 'EDDF' },
  };
  expect(await plugin.sendMessages([event])).toBe(204);

  // 4. The event shows up in the console feed (backfill on page load).
  await page.goto('/en/console');
  await expect(page.getByText('flight_updated')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(callsign).first()).toBeVisible();

  // 5. Send a set_squawk command from the composer.
  await page
    .getByLabel('Command JSON')
    .fill(JSON.stringify({ action: 'set_squawk', callsign, payload: { code: '2354' } }));
  await page.getByRole('button', { name: 'Send' }).click();

  // The mirrored outbound command appears in the feed.
  await expect(page.getByText('set_squawk')).toBeVisible({ timeout: 20_000 });

  // 6. The fake plugin's poll receives it.
  const commands = await plugin.pollOnce(10);
  expect(commands).toHaveLength(1);
  expect(commands[0].type).toBe('command');
  expect(commands[0].action).toBe('set_squawk');
  expect(commands[0].callsign).toBe(callsign);
  expect(commands[0].payload).toEqual({ code: '2354' });
  expect(commands[0].id).toBeTruthy();

  await api.dispose();
});
```

- [ ] **Step 4: Run the e2e suite**

Stack must be up first: `docker compose --env-file .env -f infra/docker-compose.yml up -d`

Run: `pnpm nx e2e web`
Expected: PASS (both the existing `login-and-ping` spec and the new gateway spec)

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e
git commit -m "test(e2e): fake plugin and gateway console flow"
```

---

### Task 13: Documentation — gateway architecture doc, ADR 0009, overview

**Files:**

- Create: `docs/architecture/gateway.md`
- Create: `docs/adr/0009-long-poll-gateway-transport.md`
- Modify: `docs/architecture/overview.md` (stack table + where-to-go list)

> Project naming note: the project-wide rename to **EuroStrip** (containers, package scope, APP_NAME, docs) was applied directly on `main` before this plan executes — write all new docs with the EuroStrip name and current package scopes.

**Interfaces:**

- Consumes: the shipped implementation (Tasks 1–12) and the spec.
- Produces: evergreen docs per CLAUDE.md hard rule 8.

- [ ] **Step 1: Write `docs/architecture/gateway.md`**

```markdown
# Gateway — EuroScope plugin transport & console

The Gateway module (`apps/backend/app/Modules/Gateway/`) connects a running
EuroScope instance to the web app through the
[euroscope-websocket-connector](https://github.com/FerrLab/euroscope-websocket-connector)
plugin, speaking [JSON Contract Protocol v1](https://github.com/FerrLab/euroscope-websocket-connector/blob/main/docs/PROTOCOL.md).
Design spec: `docs/superpowers/specs/2026-07-10-gateway-console-design.md`;
transport decision: [ADR 0009](../adr/0009-long-poll-gateway-transport.md).

## Endpoints

Plugin-facing (Bearer = the user's `gateway` token; `.wsc gateway url`
points at `/api/euroscope`):

| Route | Behavior |
| --- | --- |
| `POST /api/euroscope/messages` | Batch ingest (≤200 msgs / 512 KB). Object entries stored verbatim; garbage entries dropped + logged, never a batch failure. `204`. |
| `GET /api/euroscope/poll?timeout=25` | Blocks ≤25 s on the command queue. `200 {"commands":[…]}` or `204`. Refreshes presence. |

Browser-facing (cookie → Next proxy → Bearer):

| Route | Behavior |
| --- | --- |
| `POST /api/gateway/commands` | Validate + queue one command (`type` forced, `id` auto-ULID); mirrored into the feed. Throttle 60/min/user. `202`. |
| `GET /api/gateway/console/poll?after=<cursor>&timeout=15` | Backfill (no cursor, instant) or blocking tail (≤15 s). Returns `messages`, `cursor`, `reset`, `pluginConnected`. |
| `POST /api/gateway/token` | Rotate: revoke old, mint Passport PAT named `gateway`, return secret once. `201`. |
| `GET /api/gateway/token` | `{exists, created_at}` — never the secret. |

## Token boundary

Web sessions and the plugin both authenticate as the same user via Passport
PATs. The `EnsureGatewayToken` middleware turns the token **name** into the
boundary: plugin routes `require` the `gateway` name, browser gateway routes
`reject` it. A leaked gateway token cannot drive the web API; a web session
token cannot impersonate the plugin.

## Runtime state (Dragonfly)

Three keys per user, nothing in Postgres (the token lives in Passport's
`oauth_access_tokens`):

| Key | Type | Purpose |
| --- | --- | --- |
| `gateway:{userId}:messages` | Stream, `XADD MAXLEN 200` (exact) | Ring buffer of all traffic; entry ID = console cursor. Fields: `direction` (`in`/`out`), `envelope` (raw JSON). |
| `gateway:{userId}:commands` | List | Pending plugin commands. `BLPOP` + drain implements the plugin long-poll. |
| `gateway:{userId}:plugin-seen` | String, `EX 35` | Set on every plugin poll → the console's connected badge. |

Prefix configurable via `GATEWAY_KEY_PREFIX` (`config/gateway.php`); tests
isolate per-process prefixes (`Tests\Support\Modules\Gateway\GatewayRedisTestSupport`).

## Sizing

Every held long-poll occupies one FrankenPHP worker: 1 per connected plugin
(25 s holds) + 1 per open console tab (15 s holds). Size `OCTANE_WORKERS`
accordingly; a handful of users is fine on defaults, dozens of concurrent
consoles is not. If that ceiling nears, drop the console hold to 0 and let
the client poll every ~2 s — same endpoint, same cursor semantics.

## Testing without EuroScope

`apps/web/e2e/support/fake-plugin.ts` speaks protocol v1 over HTTP (batch
POST + long-poll GET). The e2e spec `gateway-console.spec.ts` runs the whole
loop: login → token → event appears in console → command reaches the fake
plugin. Backend suites live in `tests/{Unit,Feature}/Modules/Gateway/` —
feature tests hit the real Dragonfly.
```

- [ ] **Step 2: Write `docs/adr/0009-long-poll-gateway-transport.md`**

```markdown
# 0009 — Long-poll gateway transport over Redis Streams (no Soketi)

Date: 2026-07-10
Status: accepted

## Context

The euroscope-websocket-connector plugin speaks plain HTTPS despite its
name: it POSTs batched protocol messages and long-polls `GET /poll` for
commands. v1 of the gateway needs to relay that traffic to and from a
browser console, live. The stack already runs Soketi (Pusher protocol) for
future realtime features, so pushing events to the browser over websockets
was the obvious candidate.

## Decision

The browser long-polls too, symmetric with the plugin. All runtime state
lives in Dragonfly:

- A **Redis Stream** per user (`XADD MAXLEN 200`, exact) is simultaneously
  the ring buffer, the cursor source (entry IDs), and the long-poll wait
  (`XREAD BLOCK`). Backfill and live tail are one endpoint.
- A **list** per user is the plugin command queue (`BLPOP` + drain).
- A **TTL key** per user is plugin presence.

Messages are never written to Postgres (live-only, per the spec decision);
the gateway token is a Passport PAT whose name (`gateway`) is enforced as
the plugin/web boundary by middleware.

## Consequences

- One transport mechanism end to end; no Pusher client, channel auth, or
  broadcast events to maintain. Dropping a browser consumer costs nothing.
- Each held poll pins an Octane worker (see `architecture/gateway.md`
  sizing note) — acceptable for v1's user counts, revisit if consoles
  multiply; the escape hatch (client-side short polling) needs no redesign.
- `position_updated` volume never touches Postgres; the ring self-trims.
- Soketi stays in the stack for future features but the gateway does not
  depend on it.
```

- [ ] **Step 3: Update `docs/architecture/overview.md`**

In the "Stack at a glance" table, add after the Realtime row:

```markdown
| Gateway     | EuroScope plugin ⇄ HTTPS long-poll (protocol v1)       | `apps/backend/app/Modules/Gateway/`                    |
```

In "Where to go next", after the auth line, add:

```markdown
- **Gateway (EuroScope transport + console)** — [`gateway.md`](./gateway.md)
```

- [ ] **Step 4: Docs gates**

Run: `pnpm lint:docs`
Expected: PASS (markdownlint + link checks)

Run: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest tests/Feature/Docs`
Expected: PASS (Scramble still renders; the new routes carry PHPDoc from Tasks 6–7)

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "docs(gateway): architecture doc, ADR 0009, overview update"
```

---

## Final gate (after all tasks)

```bash
pnpm lint
pnpm test
pnpm nx test backend
pnpm nx analyze backend
pnpm nx deptrac backend
pnpm nx lint backend
pnpm lint:docs
pnpm nx e2e web
```

All green → done. Squash-merge per repo convention if working on a branch.
