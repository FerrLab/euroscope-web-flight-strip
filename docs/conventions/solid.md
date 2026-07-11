# SOLID

> **Hard rule:** SOLID at every layer. UseCases — wait, no, _Handlers_ —
> do one thing. Repositories handle persistence. Domain depends on no
> framework.
>
> (UseCases are gone — see [ADR 0008](../adr/0008-pure-cqrs.md). The
> rule shape is unchanged; the verb shifts from "UseCase" to
> "Handler".)

## Why this doc

SOLID gets cited so often it has lost meaning. This doc skips the
textbook framing and shows where each principle is load-bearing in
_this_ codebase, so the rule is concrete instead of folklore. Every
section cites a real Azimuth file path. If a section ever drifts from
the code, fix the code or fix the doc — don't let the example rot.

## S — Single Responsibility

A class has one reason to change. In Azimuth: one Handler per Command,
one Repository per aggregate, one ValueObject per concept, one
Middleware per cross-cutting concern.

**How it shows up here:**

- `RecordPingHandler` only persists a Ping. It does not authorize
  (the bus does), validate (the bus does), or transact (the bus
  does). Its constructor takes one collaborator — the repository
  interface — and `handle()` does exactly four things: type-check
  the message, build the aggregate, save, return. See
  `apps/backend/app/Modules/Ping/Application/Commands/RecordPingHandler.php`.
  The whole class fits on a screen, and that is a feature, not an
  accident: when a Handler grows past ~40 lines, the SRP question
  "what _else_ is this doing?" almost always has an answer.
- `PingNote` only enforces note-content invariants — non-empty
  translation map, non-empty locale keys, string values. It is not
  used for serialization (Spatie Data does that on the Command),
  display (the controller's response shape does that), or
  persistence (the Eloquent model does that). See
  `apps/backend/app/Modules/Ping/Domain/PingNote.php`.
- The bus middleware pipeline splits cross-cutting concerns into
  one class each — `LoggingMiddleware`, `MetricsMiddleware`,
  `AuthorizeMiddleware`, `ValidateMiddleware`,
  `TransactionMiddleware`. None of them know about the others; the
  `LaravelCommandBus` composes them in the order specified by
  [ADR 0007](../adr/0007-bus-middleware-order.md). See
  `apps/backend/app/Cqrs/Bus/Middleware/`.

The smell: if a Handler grows a second `private` collaborator that
isn't a repository or a domain service, it's probably absorbing a
middleware concern. Push it back to the pipeline.

## O — Open/Closed

Open for extension, closed for modification. Adding behaviour should
mean _adding_ a class, not editing an existing one.

**How it shows up here:**

- The bus middleware pipeline is the canonical example. Adding a new
  cross-cutting concern (rate-limit, request caching, idempotency
  keys) means writing a new class that implements
  `App\Cqrs\Bus\Middleware\Middleware` and inserting it into the
  pipeline registration. None of the existing middleware classes
  change. See `apps/backend/app/Cqrs/Bus/Middleware/Middleware.php`
  and the registration in the service provider.
- Adding a new permission means adding a `case` to a module's
  `*Permission` enum. The marker interface
  (`App\Authorization\Contracts\Permission`) is closed — its
  contract has not changed since [ADR 0003](../adr/0003-permission-marker-interface.md)
  — and every new permission is _additive_. See
  `apps/backend/app/Modules/Ping/Domain/PingPermission.php` and
  `apps/backend/app/Authorization/Contracts/Permission.php`.
- Adding a new module is additive: a new `App\Modules\<Name>` tree
  with its own ServiceProvider that registers Commands/Queries on
  the shared `HandlerRegistry`. Nothing in `App\Cqrs\Bus` needs to
  change. The Ping module is the canonical example of the shape;
  any new module copies that skeleton.

The smell: a `switch` or chain of `if`s on a class name, an enum, or
a string discriminator inside the bus or a middleware. That's a
polymorphism gap — turn it into a strategy interface plus
implementations and let the container pick.

## L — Liskov Substitution

Subtypes must be usable wherever the supertype is expected, with no
surprises about behaviour, side effects, or thrown exceptions.

**How it shows up here:**

- `PingRepository` (interface in Domain) has two implementations:
  `EloquentPingRepository` for production
  (`apps/backend/app/Modules/Ping/Infrastructure/EloquentPingRepository.php`)
  and `InMemoryPingRepository` for tests
  (`apps/backend/tests/Support/Modules/Ping/InMemoryPingRepository.php`).
  Tests bind the in-memory variant; production binds the Eloquent
  one. The Handler does not know — and must not care — which one
  is wired. Both honour the same three-method contract.
- `Command` and `Query` are marker interfaces (see
  `apps/backend/app/Cqrs/Command.php` and `app/Cqrs/Query.php`).
  Concrete DTOs like `RecordPingCommand` and `ListPingsQuery`
  implement them and are always substitutable inside the bus.
  `LaravelCommandBus` accepts any `Command`; the
  `HandlerRegistry` resolves the matching `CommandHandler`. Any
  new Command class slots in without touching the bus.
- `BackedEnum` is the supertype `App\Authorization\Contracts\Permission`
  extends, so anywhere we accept a `Permission` we can pass a
  concrete enum case (`PingPermission::Create`, future
  `AircraftPermission::Update`, etc.) and the contract holds —
  `->value` is a string, `cases()` exists. The seeder, the
  middleware, and PHPStan all depend on that substitutability.

The smell: a Handler that does `if ($repo instanceof Eloquent...)`
is an LSP violation. The `instanceof` should never appear except in
the `handle()` type-narrowing guard at the top of the method (which
is a PHPStan-driven workaround, not a behavioural branch).

## I — Interface Segregation

Clients should not depend on methods they don't use. Many small
focused contracts beat one fat one.

**How it shows up here:**

- `PingRepository` exposes exactly three methods —
  `save(Ping): void`, `findById(string): ?Ping`, and
  `recentForUser(int, int): array`. There is no `update`, `delete`,
  `query`, or generic `findBy*`. Each method exists because a
  Handler asked for it. See
  `apps/backend/app/Modules/Ping/Domain/PingRepository.php`.
- `CommandHandler::handle(Command): mixed` and
  `QueryHandler::handle(Query): mixed` are two separate
  one-method interfaces, not a shared `Handler` super-interface.
  That separation matters: a Command handler returns the result of
  a write (the aggregate, an id, sometimes void), while a Query
  handler returns a read model. Forcing both into one interface
  would give every Handler knowledge of both worlds. See
  `apps/backend/app/Cqrs/CommandHandler.php` and
  `apps/backend/app/Cqrs/QueryHandler.php`.
- `Middleware::handle(object $message, Closure $next): mixed` is a
  single, narrow contract — a Russian-doll pipeline node, nothing
  else. See `apps/backend/app/Cqrs/Bus/Middleware/Middleware.php`.

The smell: a Repository interface that returns a Laravel `Builder`,
or a Handler that takes the bus itself as a constructor argument.
Both leak capabilities the caller does not need.

## D — Dependency Inversion

High-level modules don't depend on low-level modules; both depend on
abstractions. Abstractions don't depend on details; details depend on
abstractions. This is _the_ big one for a domain-driven codebase.

**How it shows up here:**

- `RecordPingHandler` depends on `PingRepository` (the _interface_
  in Domain), not on `EloquentPingRepository` (the _concrete_ in
  Infrastructure). The wiring lives in
  `apps/backend/app/Modules/Ping/Infrastructure/PingServiceProvider.php`,
  which calls `$this->app->bind(PingRepository::class, EloquentPingRepository::class)`
  in `register()`. The Domain layer has zero `use Illuminate\…` or
  `use Spatie\…` (other than `Spatie\LaravelData` for DTOs, which
  Deptrac treats as a neutral DTO toolkit, not Framework — see
  `deptrac.yaml`).
- The four-layer Deptrac ruleset
  (`apps/backend/deptrac.yaml`) is dependency inversion encoded as
  CI: Domain depends on nothing; Application may depend on Domain
  (and the framework-agnostic CQRS contracts); Infrastructure
  adapts the framework to Domain/Application; Presentation drives
  all three. A pull request that puts an Eloquent import inside
  Domain fails Deptrac before review.
- The bus itself inverts: `LaravelCommandBus` and
  `LaravelQueryBus` (Infrastructure) implement `CommandBus` and
  `QueryBus` (Application), so Presentation controllers depend on
  the bus contracts, not on the Laravel-flavoured implementations.
  See `apps/backend/app/Cqrs/Bus/CommandBus.php` and
  `apps/backend/app/Cqrs/Bus/LaravelCommandBus.php`. Swapping in
  an in-process bus for tests, or a queued bus for async commands,
  is a binding swap — no controller, no Handler changes.
- The `Permission` marker interface (Application contract) is
  implemented by Domain enums (`PingPermission`). The
  `AuthorizeMiddleware` (Infrastructure) depends only on the
  marker plus Laravel's `Gate` facade. Adding a new module's
  permissions does not touch the middleware. See
  `apps/backend/app/Cqrs/Bus/Middleware/AuthorizeMiddleware.php`.

The smell: a `use Illuminate\…` import inside `app/Modules/*/Domain/`,
or a Domain class type-hinting a concrete Infrastructure class. Either
is a Deptrac failure and a code-review block.

## How we enforce SOLID

There is no "SOLID linter," and we don't pretend otherwise. The
enforcement is a stack, and each layer catches a different class of
violation:

- **Reviewer judgment** for the obvious shape. A Handler with five
  collaborators is not Single-Responsibility; a Repository with
  fifteen methods is not Interface-Segregation; a Domain class
  with a `use Illuminate\…` import is not Dependency-Inversion.
  Trust your nose, and ask out loud in the PR if you smell smoke.
- **PHPStan level 9** (`apps/backend/phpstan.neon`) plus the
  custom permission-string rule under
  `apps/backend/phpstan-rules/` catches variance, contract, and
  string-literal-permission bugs that hand-review misses. Level 9
  also forces every Handler to satisfy the precise return type its
  Command's docblock promises — that's an LSP guard rail.
- **Deptrac** (`apps/backend/deptrac.yaml`) catches direction
  inversions — the only mechanical way to keep Domain pure. The
  CI job fails the build if any layer reaches "up." This is what
  makes the Dependency Inversion section above actually true,
  not aspirational.
- **The TDD triad** (see [`tdd.md`](./tdd.md)) makes "this class
  needs to know too much" painful at write-time. A Handler that
  needs more than one in-memory repository fixture to test is
  whispering a SRP smell at you. A test that has to mock the bus
  inside a Handler is shouting at you. Listen.

When all four are green, the SOLID claim survives the next refactor.
When one is red, the doc above stops being aspirational and starts
being a lie — fix the code first, then the doc.

## See also

- [`tdd.md`](./tdd.md) — happy / invalid / garbage triad per layer
- [`naming.md`](./naming.md) — Command, Query, Handler, Repository
  naming rules
- [`../architecture/cqrs.md`](../architecture/cqrs.md) — bus shape
  and middleware pipeline
- [`../adr/0002-cqrs-three-layer.md`](../adr/0002-cqrs-three-layer.md) —
  the original three-layer decision
- [`../adr/0008-pure-cqrs.md`](../adr/0008-pure-cqrs.md) — why
  UseCases were collapsed into Handlers
- Robert C. Martin, _Design Principles and Design Patterns_ (2000) —
  the source of the acronym, still worth reading.
