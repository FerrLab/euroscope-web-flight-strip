# CQRS Architecture

EuroStrip's backend separates writes from reads using pure CQRS:
**Command/Query → Handler**. The Handler holds the business logic; the bus
middleware wraps it with cross-cutting concerns. This document is the
canonical reference for the contracts, the bus pipeline, and the conventions
every new module must follow. For the rationale see
[ADR 0008](../adr/0008-pure-cqrs.md) (which supersedes
[ADR 0002](../adr/0002-cqrs-three-layer.md)) and
[ADR 0007](../adr/0007-bus-middleware-order.md).

## 1. Why CQRS here

Writes and reads have different needs:

- **Writes** carry _intent_ — "record this ping for user X" — and require
  auditing, authorization checks, transactional persistence, and validation of
  cross-field invariants. They are mostly latency-tolerant and concurrency-bound.
- **Reads** are scaling- and caching-bound. They tolerate weaker validation
  (the request shape is simpler) and don't need transactions; what they need is
  fast paths to the right rows.

A single Service-style class trying to serve both ends up either pulling
framework symbols (Eloquent, requests, gates) into the middle of pure logic, or
hiding the bus-adapter concerns inside controllers, where they cannot be reused.

The CQRS split solves this by giving each concern its own home:

- **Command / Query** — the _message_, a Spatie laravel-data DTO with a
  declared `permission()`. Carries no behavior.
- **Handler** — holds the business logic. Receives the message, asserts its
  concrete type, builds value objects from primitive fields, calls the Domain
  repository. Imports only Command/Query, Domain types, and the
  CommandHandler/QueryHandler contract — no framework symbols in the
  business-logic path.

Bus middleware (logging, metrics, authorize, validate, transaction) wraps the
Handler, so cross-cutting concerns are written once and applied everywhere.

## 2. The four contracts

All four live under `app/Cqrs/`.

| Contract         | File                                                                            | Purpose                                                                                                                         | Layer       |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `Command`        | [`app/Cqrs/Command.php`](../../apps/backend/app/Cqrs/Command.php)               | Marker interface — every command extends `Spatie\LaravelData\Data` and implements `Command`. Carries write-side intent.         | Application |
| `Query`          | [`app/Cqrs/Query.php`](../../apps/backend/app/Cqrs/Query.php)                   | Marker interface — every query extends `Data` and implements `Query`. Carries read-side intent.                                 | Application |
| `CommandHandler` | [`app/Cqrs/CommandHandler.php`](../../apps/backend/app/Cqrs/CommandHandler.php) | `handle(Command $command): mixed`. Holds the write-side business logic. Asserts concrete Command type, persists via repository. | Application |
| `QueryHandler`   | [`app/Cqrs/QueryHandler.php`](../../apps/backend/app/Cqrs/QueryHandler.php)     | `handle(Query $query): mixed`. Holds the read-side business logic. Asserts concrete Query type, fetches via repository.         | Application |

The Handler is the SOLID dependency-inversion seam: the Domain layer owns the
repository interface; the Infrastructure layer provides the Eloquent
implementation; the Handler only sees the Domain interface. Deptrac's
four-layer ruleset enforces this — Application classes may not import
Infrastructure or Framework symbols.

## 3. The buses

Both buses live under `app/Cqrs/Bus/`. They are bound as singletons in
[`BusServiceProvider`](../../apps/backend/app/Providers/BusServiceProvider.php).

**Interfaces:**

```php
// app/Cqrs/Bus/CommandBus.php
interface CommandBus
{
    public function dispatch(Command $command): mixed;
}

// app/Cqrs/Bus/QueryBus.php
interface QueryBus
{
    public function dispatch(Query $query): mixed;
}
```

**Implementations:** `LaravelCommandBus` and `LaravelQueryBus` each take the
shared `HandlerRegistry`, the container, and an ordered array of middleware.
`dispatch()` looks up the handler class for the message type, builds a closure
pipeline by `array_reduce`-ing the reversed middleware list, and runs the
message through it. The final step resolves the handler from the container and
calls `handle($message)`.

**Handler registration.** `HandlerRegistry::register(string $messageClass,
string $handlerClass)` wires one message to one handler. Each module's
`ServiceProvider::boot()` calls `register()` for every Command and Query the
module owns. See
[`PingServiceProvider`](../../apps/backend/app/Modules/Ping/Infrastructure/PingServiceProvider.php)
for the canonical example:

```php
public function boot(HandlerRegistry $registry): void
{
    $registry->register(RecordPingCommand::class, RecordPingHandler::class);
    $registry->register(ListPingsQuery::class, ListPingsHandler::class);
}
```

If a message reaches the bus with no registered handler, the bus throws
`NoHandlerForCommand` / `NoHandlerForQuery` from `app/Cqrs/Bus/Exceptions/`.

## 4. The middleware pipeline

Five middleware compose the CommandBus pipeline. The QueryBus uses the same
list **minus** `Transaction` (queries are read-only). Order is significant.

| #   | Middleware              | File                                                                                                                        | What it does                                                                                                 | Required of the message                                                              |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1   | `LoggingMiddleware`     | [`app/Cqrs/Bus/Middleware/LoggingMiddleware.php`](../../apps/backend/app/Cqrs/Bus/Middleware/LoggingMiddleware.php)         | Emits `cqrs.dispatch.start`, `cqrs.dispatch.end`, `cqrs.dispatch.error` log lines around the inner pipeline. | Nothing.                                                                             |
| 2   | `MetricsMiddleware`     | [`app/Cqrs/Bus/Middleware/MetricsMiddleware.php`](../../apps/backend/app/Cqrs/Bus/Middleware/MetricsMiddleware.php)         | Times the dispatch and logs `cqrs.dispatch.duration_ms`.                                                     | Nothing.                                                                             |
| 3   | `AuthorizeMiddleware`   | [`app/Cqrs/Bus/Middleware/AuthorizeMiddleware.php`](../../apps/backend/app/Cqrs/Bus/Middleware/AuthorizeMiddleware.php)     | Calls `Gate::authorize($message->permission()->value)`. Throws if the message has no `permission()` method.  | `permission(): Permission` returning a `BackedEnum` case.                            |
| 4   | `ValidateMiddleware`    | [`app/Cqrs/Bus/Middleware/ValidateMiddleware.php`](../../apps/backend/app/Cqrs/Bus/Middleware/ValidateMiddleware.php)       | If the message exposes `rules()`, validates `toArray()` against those rules using Laravel's Validator.       | Optional `rules(): array`. Spatie Data already validates type-shape on construction. |
| 5   | `TransactionMiddleware` | [`app/Cqrs/Bus/Middleware/TransactionMiddleware.php`](../../apps/backend/app/Cqrs/Bus/Middleware/TransactionMiddleware.php) | Wraps `$next($message)` in `DB::transaction(...)`. **CommandBus only — not in the QueryBus pipeline.**       | Nothing.                                                                             |

The middleware contract is declared in
[`app/Cqrs/Bus/Middleware/Middleware.php`](../../apps/backend/app/Cqrs/Bus/Middleware/Middleware.php):
`handle(object $message, Closure $next): mixed`.

## 5. Why Authorize before Validate

Standard CQRS write-ups place validation first ("fail fast on bad shape"). We
deliberately invert this. The dispatched-message path is:

`Logging → Metrics → Authorize → Validate → Transaction`

The first reason is **information disclosure**. If validation runs first, an
unauthorized caller submitting a malformed payload receives a 422 with field-
specific error messages — which leaks the schema's existence and shape to
someone who has no business knowing it exists. Putting authorization first
means an unauthorized caller always gets a flat 403 regardless of payload
shape. They cannot probe for schema knowledge by sending different bodies.

The second reason is **defense in depth**. The HTTP boundary already does its
own authorization (route middleware, Form Request `authorize()`, Filament
resource gates). The bus pipeline is a second checkpoint that runs even when a
command is dispatched from a non-HTTP context — Tinker, a queued job, an
artisan command, an internal service-to-service call. Putting authorize before
validate keeps the same protective ordering at every entry point. The cost is
small (a Gate check on a malformed-and-unauthorized message that would also
have failed validation); the asymmetry buys consistent behavior across all
callers.

The decision is locked in row 6 of the decision log
([`docs/superpowers/specs/2026-05-05-eurostrip-scaffold-phase-2-decisions.md`](../superpowers/specs/2026-05-05-eurostrip-scaffold-phase-2-decisions.md))
and recorded in [ADR 0007](../adr/0007-bus-middleware-order.md).

## 6. Adding a new command end-to-end (worked example: `RecordPing`)

To add a new write-side feature, a developer touches **five** locations. The
Ping module is the canonical template; copy its shape.

### Step 1 — Define the Command

[`app/Modules/Ping/Application/Commands/RecordPingCommand.php`](../../apps/backend/app/Modules/Ping/Application/Commands/RecordPingCommand.php)

The command is a Spatie laravel-data `Data` subclass that implements
`App\Cqrs\Command` and declares its required permission:

```php
class RecordPingCommand extends Data implements Command
{
    public function __construct(
        public int $userId,
        /** @var array<string, string> */
        public array $note,
    ) {}

    public function permission(): PingPermission
    {
        return PingPermission::Create;
    }
}
```

Spatie Data validates the constructor types on instantiation. Add a `rules()`
method only when you need cross-field rules beyond type-shape.

### Step 2 — Write the Handler

[`app/Modules/Ping/Application/Commands/RecordPingHandler.php`](../../apps/backend/app/Modules/Ping/Application/Commands/RecordPingHandler.php)

The Handler implements `CommandHandler`, takes the Domain repository interface
in its constructor, asserts the concrete Command type at the top of `handle()`,
then runs the business logic:

```php
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

No facades. No Eloquent. No `request()`. The Handler imports only
`App\Cqrs\Command`, `App\Cqrs\CommandHandler`, the Domain types
(`Ping`, `PingNote`, `PingRepository`), and primitive helpers (`Ulid`,
`DateTimeImmutable`, `InvalidArgumentException`). Deptrac's four-layer ruleset
fails the build if a framework symbol leaks in.

### Step 3 — Register the handler

In the module's ServiceProvider
([`app/Modules/Ping/Infrastructure/PingServiceProvider.php`](../../apps/backend/app/Modules/Ping/Infrastructure/PingServiceProvider.php)),
add a line to `boot()`:

```php
$registry->register(RecordPingCommand::class, RecordPingHandler::class);
```

The provider is loaded automatically because it's listed in `bootstrap/providers.php`.

### Step 4 — Write the four Pest tests (TDD, per CLAUDE.md hard rule #1)

- **Happy path.** Handler test against an in-memory repository fixture
  (`tests/Support/Modules/Ping/InMemoryPingRepository.php`). Asserts the entity
  is constructed correctly and persisted.
- **Invalid path.** Asserts the Handler rejects bad inputs (e.g. unsupported
  locale in the note value object) with the expected exception.
- **Garbage path.** Asserts the Handler rejects nonsense (e.g. negative user
  IDs, empty note maps) cleanly rather than with a stack trace.
- **Garbage Command type.** Asserts the Handler's `instanceof` guard rejects a
  Command of the wrong concrete type with `InvalidArgumentException`.

See [`tests/Unit/Modules/Ping/Application/Commands/RecordPingHandlerTest.php`](../../apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingHandlerTest.php).

### Step 5 — Wire the HTTP route

Controller: [`app/Modules/Ping/Presentation/Http/PingController.php`](../../apps/backend/app/Modules/Ping/Presentation/Http/PingController.php).
Routes: [`app/Modules/Ping/Presentation/Http/routes.php`](../../apps/backend/app/Modules/Ping/Presentation/Http/routes.php).

The controller injects `CommandBus` / `QueryBus`, builds the Command from the
validated request, and dispatches:

```php
$ping = $this->commandBus->dispatch(new RecordPingCommand(
    userId: $user->id,
    note: $request->validated('note'),
));
```

Form Requests live alongside the controller and own request-shape validation
(distinct from the bus's `ValidateMiddleware`, which is for cross-field rules
that should also fire on non-HTTP dispatches).

Then run the test suite:

```bash
pnpm nx test backend
```

If green, run `pnpm nx lint:fix backend` (CLAUDE.md hard rule #4) and you're
done.

## 7. Adding a new query

The shape mirrors the command shape but is shorter — there's no Transaction
middleware to think about and no persistence side-effect to test. The Ping
template:

- [`ListPingsQuery`](../../apps/backend/app/Modules/Ping/Application/Queries/ListPingsQuery.php) — `Data` + `Query`, declares `permission(): PingPermission::View`.
- [`ListPingsHandler`](../../apps/backend/app/Modules/Ping/Application/Queries/ListPingsHandler.php) — `QueryHandler`, asserts the concrete Query type, validates `limit` bounds, returns `array<int, Ping>` from the repository.
- Registered in `PingServiceProvider::boot()` next to the command.
- Four Pest tests: happy / invalid (limit out of range) / garbage (negative limit) / garbage Query type.

Controllers dispatch through `QueryBus`:

```php
$pings = $this->queryBus->dispatch(new ListPingsQuery(
    userId: $user->id,
    limit: 50,
));
```

## 8. Module ServiceProvider conventions

Every bounded module under `app/Modules/<Bounded>/` declares **one**
`<Bounded>ServiceProvider` at
`app/Modules/<Bounded>/Infrastructure/<Bounded>ServiceProvider.php`. That
provider's responsibilities are exactly two:

1. **`register()` — bind the domain repository interface to the Eloquent
   implementation.** This is the SOLID seam between Domain and Infrastructure;
   nothing else may bind it.
2. **`boot(HandlerRegistry $registry)` — register every Command/Query handler
   the module owns.** The HandlerRegistry is resolved via DI; do not touch the
   container directly.

Each module's provider class must be listed in `bootstrap/providers.php` so
Laravel discovers it on boot. The Ping module is listed there as
`App\Modules\Ping\Infrastructure\PingServiceProvider::class`; new modules
follow the same pattern.

## 9. Testing patterns

We layer tests so that the cheapest tests catch the most failures.

- **Handler tests** live under `tests/Unit/Modules/<Module>/Application/`.
  They use an in-memory repository fixture (e.g.
  [`tests/Support/Modules/Ping/InMemoryPingRepository.php`](../../apps/backend/tests/Support/Modules/Ping/InMemoryPingRepository.php))
  and never touch the database. They run the fastest and provide the strongest
  signal on business-logic correctness. Each Handler test covers happy /
  invalid / garbage / garbage-Command-type. See
  [`RecordPingHandlerTest`](../../apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingHandlerTest.php)
  and
  [`ListPingsHandlerTest`](../../apps/backend/tests/Unit/Modules/Ping/Application/Queries/ListPingsHandlerTest.php).
- **Domain tests** cover entity invariants and value-object validation. They
  also live under `tests/Unit/Modules/<Module>/Domain/`. See
  [`tests/Unit/Modules/Ping/Domain/PingNoteTest.php`](../../apps/backend/tests/Unit/Modules/Ping/Domain/PingNoteTest.php)
  for the shape (translatable note: happy / invalid locale / garbage).
- **Repository tests** live under `tests/Feature/Modules/<Module>/`,
  use `RefreshDatabase`, and exercise the Eloquent implementation against
  real Postgres. See
  [`tests/Feature/Modules/Ping/EloquentPingRepositoryTest.php`](../../apps/backend/tests/Feature/Modules/Ping/EloquentPingRepositoryTest.php).
- **Controller tests** also live under `tests/Feature/Modules/<Module>/`,
  use `RefreshDatabase`, and authenticate via Passport tokens minted in setup.
  See
  [`tests/Feature/Modules/Ping/PingControllerTest.php`](../../apps/backend/tests/Feature/Modules/Ping/PingControllerTest.php).

Every Handler and Controller test covers at minimum the **happy / invalid /
garbage** triad mandated by CLAUDE.md hard rule #1; Handlers add a fourth
"garbage Command/Query type" case for the runtime `instanceof` guard.

## 10. References

- Original spec — bounded-context module shape:
  [`docs/superpowers/specs/2026-05-02-eurostrip-scaffold-design.md`](../superpowers/specs/2026-05-02-eurostrip-scaffold-design.md) §5.
- Phase 2 decision log:
  [`docs/superpowers/specs/2026-05-05-eurostrip-scaffold-phase-2-decisions.md`](../superpowers/specs/2026-05-05-eurostrip-scaffold-phase-2-decisions.md)
  (rows 5, 6).
- [ADR 0008 — Pure CQRS](../adr/0008-pure-cqrs.md) (current).
- [ADR 0002 — Three-Layer CQRS](../adr/0002-cqrs-three-layer.md) (superseded).
- [ADR 0007 — Bus Middleware Order](../adr/0007-bus-middleware-order.md).
