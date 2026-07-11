# Adding a feature

> Your step-by-step playbook for taking an idea to a green PR.

This is the canonical workflow for every new feature in Azimuth. If you find yourself off-script, stop and ask why — the gates exist because shortcuts surface as production incidents.

## The 12 steps

1. **Brainstorm** the feature with `superpowers:brainstorming` → spec at `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md`.
2. **Plan** with `superpowers:writing-plans` → plan at `docs/superpowers/plans/YYYY-MM-DD-<feature>-plan.md`.
3. **Branch** `feat/<short-description>` off `main` (or the active phase branch).
4. **Permission enum** — add the new `BackedEnum` case(s) to `<Module>Permission`. Never use raw strings.
5. **Handler test (red)** — Pest unit test under `tests/Unit/Modules/<Module>/Application/{Commands,Queries}/<Handler>Test.php`. Cover happy + invalid + garbage.
6. **Handler implementation (green)** — Command/Query DTO + Handler. Bus middleware (`Logging → Metrics → Authorize → Validate → Transaction` for commands; minus `Transaction` for queries) handles cross-cutting concerns, so handlers stay thin.
7. **Service-provider wiring** — bind the repository contract and register `Command/Query → Handler` in `<Module>ServiceProvider`.
8. **Controller test (red)** — Pest feature test under `tests/Feature/Modules/<Module>/Http/<Controller>Test.php`.
9. **Controller + FormRequest + Resource** — controller stays skinny: validate, dispatch, return resource.
10. **Filament admin** — wire Filament resource changes when admins need the feature.
11. **Frontend** — TDD the RTK Query slice, the component, and the Playwright spec (when UI is in scope). Regenerate `libs/api-client` from the new OpenAPI.
12. **Docs + lint + PR** — update relevant `/docs/architecture/*.md` (or write an ADR), run the four lint commands, open a conventional-commit PR.

---

## Worked example: the Ping module

The Ping module is the canonical reference exemplar of every convention in this runbook. It is intentionally minimal: a `Ping` entity with a translatable `note`, an authenticated user can record a ping or list their recent pings.

You can study the real commits to follow the dance:

| Commit    | What it added                                                   |
| --------- | --------------------------------------------------------------- |
| `c8937eb` | Domain layer (entity, value object, repository, permission)     |
| `4d3ff78` | Application/Commands (`RecordPing`)                             |
| `48d782b` | Application/Queries (`ListPings`)                               |
| `132b595` | Infrastructure (Eloquent model, factory, repository, migration) |
| `65a86b2` | Presentation/Http (controller, routes, FormRequest)             |
| `f75a511` | Filament admin resource                                         |
| `787cc7c` | PHPStan custom rule forbidding raw permission strings           |
| `0ab2873` | Typesense schema for Scout sync                                 |
| `4069172` | Drop `CommandUseCase` + `QueryUseCase` marker interfaces        |
| `92587a3` | Collapse `RecordPingUseCase` into `RecordPingHandler`           |
| `aa2ffa2` | Collapse `ListPingsUseCase` into `ListPingsHandler`             |

The last three commits are the move to **pure CQRS** (see [ADR 0008](../adr/0008-pure-cqrs.md)): we no longer have a separate UseCase layer. A Command is a DTO, the Handler does the work, full stop. Cross-cutting concerns live in the bus middleware, not in the handler.

The rest of this document walks through each step using the Ping handler as the worked example. All paths are real; you can grep them against the repo.

---

## Step-by-step

### Step 1 — Brainstorm

Before you write a line of code, run:

```text
/superpowers:brainstorming
```

The skill will pull intent, requirements, and constraints out of you. Expect questions like:

- What is the user-facing problem?
- What are the entry points (HTTP, Filament, CLI, scheduled)?
- What's the smallest happy path that delivers value?
- What can be deferred to a follow-up?
- What is **out of scope**?

Capture the output into:

```text
docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md
```

Conventions for the spec file:

- Date prefix is the date of the brainstorm.
- Feature slug is kebab-case, terse, no `feature-` prefix.
- The spec is the source of truth for _what_ and _why_; the plan is the source of truth for _how_.
- Cite the spec by path in your PR description.

If you skip this step you will pay for it during implementation when the requirements drift.

### Step 2 — Plan

Once the spec is stable:

```text
/superpowers:writing-plans
```

This produces a numbered task list at:

```text
docs/superpowers/plans/YYYY-MM-DD-<feature>-plan.md
```

The plan should:

- Map every spec requirement to one or more tasks.
- Be ordered TDD-first: failing test before implementation, every time.
- Identify parallelizable tasks (`superpowers:dispatching-parallel-agents`).
- Call out any infra or schema migrations explicitly.

For non-trivial features, run `superpowers:executing-plans` (review checkpoints) or `superpowers:subagent-driven-development` (parallel task fan-out) when you start work.

### Step 3 — Branch

Branch off the current dev base (`main` outside an active phase, or `feat/phase-<n>-<scope>` during a phase):

```bash
git checkout main
git pull --ff-only
git checkout -b feat/<short-description>
```

Naming:

- `feat/<thing>` — new user-facing feature.
- `fix/<thing>` — bug fix.
- `chore/<thing>` — build, deps, docs-only.
- `refactor/<thing>` — no behavior change.

Keep the slug short. The PR title carries the prose.

### Step 4 — Permission enum

Every authorized action goes through a `BackedEnum` permission case. Raw strings are forbidden — PHPStan has a custom rule that fails CI (commit `787cc7c`).

For the Ping module, the enum lives at `apps/backend/app/Modules/Ping/Domain/PingPermission.php`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Domain;

use App\Authorization\Contracts\Permission;

enum PingPermission: string implements Permission
{
    case View = 'ping.view';
    case Create = 'ping.create';
}
```

Rules:

- Implement `App\Authorization\Contracts\Permission` (the marker; see [ADR 0003](../adr/0003-permission-marker-interface.md)).
- Backing values are `<module>.<action>` lower-snake.
- New cases must be picked up by the `PermissionsSeeder` (it iterates every enum implementing `Permission`).

If your feature introduces a new permission, add the case here first. The Authorize bus middleware reads `Command::permission()` and checks the current user against this enum.

### Step 5 — Handler test (red)

Write the failing handler test before the handler. The test triad — **happy / invalid / garbage** — is non-negotiable (see [`conventions/tdd.md`](../conventions/tdd.md)).

For Ping, the test lives at `apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingHandlerTest.php`:

```php
<?php

declare(strict_types=1);

use App\Cqrs\Command;
use App\Modules\Ping\Application\Commands\RecordPingCommand;
use App\Modules\Ping\Application\Commands\RecordPingHandler;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Ping\InMemoryPingRepository;

it('records a ping for a user (happy)', function (): void {
    $repo = new InMemoryPingRepository;
    $handler = new RecordPingHandler($repo);

    $cmd = new RecordPingCommand(userId: 7, note: ['en' => 'hi']);
    $ping = $handler->handle($cmd);

    expect($ping->userId)->toBe(7);
    expect($repo->saved)->toHaveCount(1);
    expect($repo->saved[$ping->id]->note->forLocale('en'))->toBe('hi');
});

it('rejects userId < 1 (invalid)', function (): void {
    $handler = new RecordPingHandler(new InMemoryPingRepository);
    $cmd = new RecordPingCommand(userId: 0, note: ['en' => 'x']);

    expect(fn () => $handler->handle($cmd))->toThrow(InvalidArgumentException::class);
});

it('rejects garbage Command type (garbage)', function (): void {
    $handler = new RecordPingHandler(new InMemoryPingRepository);

    $bogus = new class extends Data implements Command
    {
        public function __construct(public string $note = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
```

Notes:

- Tests use an **in-memory repository** (`tests/Support/Modules/Ping/InMemoryPingRepository.php`) so the handler is tested with no I/O.
- `happy` proves the success path returns the right shape and writes to the repo.
- `invalid` proves the handler rejects domain-invalid inputs.
- `garbage` proves the handler refuses a Command of the wrong type — defensive against bus misregistrations.

Run it red:

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  ./vendor/bin/pest --filter=RecordPingHandlerTest
```

You should see three failures (no handler exists yet).

### Step 6 — Handler implementation (green)

The Command DTO is a Spatie Data class implementing `App\Cqrs\Command`:

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

The handler at `apps/backend/app/Modules/Ping/Application/Commands/RecordPingHandler.php` is intentionally thin — pure CQRS, no UseCase indirection (see [ADR 0008](../adr/0008-pure-cqrs.md)):

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Commands;

use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use App\Modules\Ping\Domain\PingRepository;
use DateTimeImmutable;
use InvalidArgumentException;
use Symfony\Component\Uid\Ulid;

class RecordPingHandler implements CommandHandler
{
    public function __construct(private PingRepository $repository) {}

    public function handle(Command $command): Ping
    {
        if (! $command instanceof RecordPingCommand) {
            throw new InvalidArgumentException(
                sprintf('%s expects RecordPingCommand, got %s', self::class, $command::class),
            );
        }

        $ping = new Ping(
            id: (string) new Ulid,
            userId: $command->userId,
            note: new PingNote($command->note),
            createdAt: new DateTimeImmutable,
        );

        $this->repository->save($ping);

        return $ping;
    }
}
```

What's deliberately **not** here:

- No transaction wrapping — the `Transaction` middleware does that ([ADR 0007](../adr/0007-bus-middleware-order.md)).
- No authorization — the `Authorize` middleware reads `$command->permission()` and checks the current user.
- No structured logging or metrics — `Logging` and `Metrics` middleware handle them.

Run the test green:

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  ./vendor/bin/pest --filter=RecordPingHandlerTest
```

All three tests pass. If the `garbage` test fails, you forgot the `instanceof` guard.

### Step 7 — Service-provider binding

Two things must be wired in `<Module>ServiceProvider`:

1. The repository contract → its Eloquent implementation.
2. Each Command/Query → its Handler in the `HandlerRegistry`.

For Ping, `apps/backend/app/Modules/Ping/Infrastructure/PingServiceProvider.php`:

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

The provider is auto-discovered via `bootstrap/providers.php`. If you add a new module, append it there.

### Step 8 — Controller test (red)

Now move up to the HTTP layer. The feature test exercises the full stack: route → middleware → controller → bus → handler → repository → DB.

`apps/backend/tests/Feature/Modules/Ping/PingControllerTest.php` shows the pattern. Each test seeds permissions and authenticates with a real Passport token:

```php
beforeEach(function (): void {
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );

    (new PermissionsSeeder([PingPermission::class]))->run();

    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web'])
        ->givePermissionTo(
            Permission::findByName(PingPermission::View->value),
            Permission::findByName(PingPermission::Create->value),
        );
});

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

it('rejects unauthenticated requests (invalid)', function (): void {
    $this->getJson('/api/ping')->assertStatus(401);
});
```

Run it red:

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  ./vendor/bin/pest --filter=PingControllerTest
```

### Step 9 — Controller + FormRequest + Resource

The FormRequest validates payload shape. `RecordPingRequest`:

```php
class RecordPingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'note' => ['required', 'array', 'min:1'],
            'note.*' => ['required', 'string', 'min:1', 'max:500'],
        ];
    }
}
```

The controller stays skinny — validate, dispatch, return JSON:

```php
public function store(RecordPingRequest $request): JsonResponse
{
    $user = $request->user();
    assert($user instanceof User);

    $ping = $this->commandBus->dispatch(new RecordPingCommand(
        userId: $user->id,
        note: $request->validated('note'),
    ));
    assert($ping instanceof Ping);

    return response()->json([
        'id' => $ping->id,
        'note' => $ping->note->translations,
        'created_at' => $ping->createdAt->format(DATE_ATOM),
    ], 201);
}
```

Routes go in `apps/backend/app/Modules/Ping/Presentation/Http/routes.php` (auto-loaded by the module bootstrapper):

```php
Route::middleware('auth:api')->prefix('ping')->group(function () {
    Route::get('/', [PingController::class, 'index'])->name('api.ping.index');
    Route::post('/', [PingController::class, 'store'])->name('api.ping.store');
});
```

Annotate every public action with PHPDoc that Scramble can read (`@response`, `@bodyParam`). Scramble regenerates `/docs/api` on every boot — CI fails if a public route is missing from the generated `openapi.json` (see hard rule 6 in [`/CLAUDE.md`](../../CLAUDE.md)).

Run all the Ping tests green:

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  ./vendor/bin/pest --filter=Ping
```

### Step 10 — Filament admin

If admins need the feature, wire it into Filament. The Ping admin lives at `apps/backend/app/Modules/Ping/Presentation/Filament/PingResource.php` and is registered on the panel via the module's service provider.

Conventions:

- Resource label and singular label come from `lang/` (no hardcoded user-facing strings — hard rule 5).
- Resource pages dispatch the same Command/Query bus as the HTTP controller — never call the model directly.
- Squared UI: no `border-radius` except `rounded-full` (hard rule 8). Filament's tokens already enforce this in our Tailwind config.

Filament also needs a feature test under `tests/Feature/Modules/<Module>/Filament/`. See `PingResourceTest.php` for the shape.

### Step 11 — Frontend

When the feature has UI, work in `apps/web` after the backend is green and Scramble has regenerated.

Order of operations:

1. **Regenerate the API client** — Scramble updates `openapi.json` on backend boot; the client is generated from it:

   ```bash
   pnpm nx run backend:openapi:generate
   pnpm nx run api-client:generate
   ```

2. **TDD the RTK Query slice** — endpoint definitions live under `apps/web/src/features/<feature>/api.ts`. Vitest tests verify request shape and tag invalidation.

3. **TDD the component** — Vitest + React Testing Library. All user-facing strings come from `next-intl` catalogs. ESLint blocks raw JSX strings (hard rule 5).

4. **Playwright spec** — at minimum a happy-path spec under `apps/web/e2e/`. Run it against the full Docker stack:

   ```bash
   pnpm nx run web:e2e
   ```

5. **Squared UI** — the Tailwind config exposes only `rounded-none` and `rounded-full`. If you need a non-circle radius, you are off-pattern; stop and re-read [`/CLAUDE.md`](../../CLAUDE.md) hard rule 8.

### Step 12 — Docs + lint + PR

Before opening the PR:

1. Update `/docs`:
   - Touch the relevant `architecture/*.md` if the change affects the architecture.
   - Write an ADR under `docs/adr/NNNN-<slug>.md` if you made a non-trivial decision.
   - Update this runbook only if the workflow itself changed.

2. Run the four backend lint commands:

   ```bash
   pnpm nx lint:fix backend     # Pint
   pnpm nx lint backend          # Pint --test
   pnpm nx run backend:phpstan   # PHPStan/Larastan level 8 + permission rule
   pnpm nx run backend:deptrac   # layer boundary enforcement
   ```

3. Run the test suites:

   ```bash
   pnpm nx run backend:test      # Pest
   pnpm nx test web              # Vitest
   pnpm nx run web:e2e           # Playwright
   ```

4. Verify Scramble emits every public route:

   ```bash
   pnpm nx run backend:openapi:check
   ```

5. Open a PR with a conventional-commit title:
   - `feat(ping): record ping endpoint with translatable note`
   - `fix(ping): reject empty note arrays at the FormRequest layer`
   - `refactor(ping): collapse RecordPingUseCase into RecordPingHandler`

   Cite the spec and the plan in the PR body.

---

## The done checklist

Use this as your final review pass before requesting review:

- [ ] Permission enum case added; PHPStan green
- [ ] Handler test triad (happy / invalid / garbage) green
- [ ] Controller feature test green (auth + happy + invalid + garbage)
- [ ] Service provider binds repository and registers Command/Query → Handler
- [ ] Pint clean (`pnpm nx lint backend`)
- [ ] PHPStan/Larastan clean at level 8 (`pnpm nx run backend:phpstan`)
- [ ] Deptrac clean — no layer-boundary violations (`pnpm nx run backend:deptrac`)
- [ ] Frontend tests green (Vitest)
- [ ] Playwright happy-path spec green
- [ ] Scramble regenerates without missing any new public route
- [ ] All user-facing strings live in `lang/` (backend) or next-intl catalogs (frontend)
- [ ] No `border-radius` outside `rounded-full`
- [ ] Relevant `/docs/architecture/*.md` updated; new ADR if you made a decision
- [ ] PR opened with conventional-commit prefix; spec + plan cited in body

---

## See also

- [`../architecture/cqrs.md`](../architecture/cqrs.md) — the three-then-two layer story and bus middleware order
- [`../conventions/tdd.md`](../conventions/tdd.md) — happy / invalid / garbage triad in detail
- [`../conventions/solid.md`](../conventions/solid.md) — what each layer is allowed to know
- [`../conventions/naming.md`](../conventions/naming.md) — module folder layout and class names
- [`../conventions/i18n.md`](../conventions/i18n.md) — Laravel `lang/` and next-intl catalogs
- [`../adr/0002-cqrs-three-layer.md`](../adr/0002-cqrs-three-layer.md) — original three-layer decision
- [`../adr/0003-permission-marker-interface.md`](../adr/0003-permission-marker-interface.md) — `Permission` marker contract
- [`../adr/0007-bus-middleware-order.md`](../adr/0007-bus-middleware-order.md) — `Logging → Metrics → Authorize → Validate → Transaction`
- [`../adr/0008-pure-cqrs.md`](../adr/0008-pure-cqrs.md) — collapsing UseCase into Handler
- [`./local-dev.md`](./local-dev.md) — bringing the stack up locally
