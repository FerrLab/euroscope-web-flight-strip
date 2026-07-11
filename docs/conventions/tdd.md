# Test-Driven Development

> **Hard rule:** Every feature is test-first. Each suite covers happy,
> invalid, and garbage paths at minimum. Code without a failing test
> first is a bug we haven't seen yet.

This document is the canonical reference for the TDD discipline used
throughout Azimuth. It is enforced by reviewer judgment on every PR
and underpins the `superpowers:test-driven-development` workflow that
ships features in this repo.

## The triad: happy / invalid / garbage

Every code unit (handler, hook, helper, component, repository) gets at
least three test cases:

- **Happy path** — the input the unit was designed to receive. The
  golden case the feature description describes. If the spec says
  "record a ping for a user", the happy test records a ping for a
  user and asserts the side effects you'd describe in the spec.
- **Invalid path** — input the unit's signature accepts but the
  unit's contract rejects. Empty strings where non-empty is required;
  out-of-range numbers; expired tokens; foreign-key violations;
  duplicate aggregates. The shape is right, the value is wrong.
- **Garbage path** — input that violates the unit's signature
  outright. Wrong types, null where a value is required, malformed
  payloads, the wrong `Command` shape passed to a `Handler`. Tests
  that the unit fails _fast and loud_ (typed exception) instead of
  producing nonsense or silently corrupting state.

The triad is the floor, not the ceiling. Concurrency, performance,
boundary, and authorization cases stack on top — but a unit with
fewer than three cases has not been finished.

## Why all three

**Happy path** is what makes the test suite a _living specification_
of the system. A new engineer reading `RecordPingHandlerTest.php`
should understand what `RecordPingHandler` is for in thirty seconds:
it records a ping for a user, persists it, and the persisted note is
locale-keyed. The happy test is the docstring nobody can let drift
out of date.

**Invalid path** is where business rules live. Laravel's request
validators catch most of this at the HTTP boundary, but the domain
must enforce its own invariants too — UseCases run from queue jobs,
console commands, and Filament actions where the validator was never
involved. A `RecordPingHandler` that accepts `userId: 0` because the
HTTP layer "should have caught it" is a UseCase with a hidden
dependency on its caller. Encode the rule once, in the domain, and
test it once, in the domain test.

**Garbage path** is the contract guard. PHP's strict type system
catches a lot, but interfaces like `Handler::handle(Command $cmd)`
are wide — _any_ `Command` is type-correct, including the wrong one.
The pure-CQRS bus dispatches handlers based on a class-name map; a
typo in registration means a `RecordPingHandler` could be invoked
with a `ListPingsQuery`. The garbage test is what catches that, and
it is what lets us rip out the registration map and replace it with
attribute-based routing tomorrow without fear.

## Worked example: RecordPingHandler

The Ping module is the canonical exemplar. Its command-handler test
lives at
`apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingHandlerTest.php`:

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

it('rejects empty note as invalid (invalid)', function (): void {
    $handler = new RecordPingHandler(new InMemoryPingRepository);
    $cmd = new RecordPingCommand(userId: 1, note: []);

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

Annotated:

| Case                            | Path    | What it proves                                                                                                                         |
| ------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `records a ping for a user`     | happy   | The handler does its job: persists a `Ping` aggregate via the repo and returns it.                                                     |
| `rejects userId < 1`            | invalid | Domain invariant: every ping belongs to a real user. The HTTP layer also enforces this; the domain test makes it impossible to bypass. |
| `rejects empty note as invalid` | invalid | Domain invariant: a ping with no message is not a ping.                                                                                |
| `rejects garbage Command type`  | garbage | The handler's runtime `instanceof RecordPingCommand` guard fires when the bus hands it the wrong shape.                                |

The garbage case constructs an _anonymous_ `Data` class implementing
the `Command` marker interface — the same shape the bus would build
if a registration map went stale. That is exactly the failure mode
the `instanceof` guard exists to catch.

## Worked example: ListPingsHandler

The query-handler test at
`apps/backend/tests/Unit/Modules/Ping/Application/Queries/ListPingsHandlerTest.php`
demonstrates the triad with two invalid cases — one per boundary on
a bounded numeric input:

```php
<?php

declare(strict_types=1);

use App\Cqrs\Query;
use App\Modules\Ping\Application\Queries\ListPingsHandler;
use App\Modules\Ping\Application\Queries\ListPingsQuery;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Ping\InMemoryPingRepository;

beforeEach(function (): void {
    $this->repo = new InMemoryPingRepository;
    $this->repo->save(new Ping('a', 1, new PingNote(['en' => 'one']), new DateTimeImmutable));
    $this->repo->save(new Ping('b', 1, new PingNote(['en' => 'two']), new DateTimeImmutable));
    $this->repo->save(new Ping('c', 2, new PingNote(['en' => 'three']), new DateTimeImmutable));
});

it('returns recent pings for a user (happy)', function (): void {
    $handler = new ListPingsHandler($this->repo);
    $result = $handler->handle(new ListPingsQuery(userId: 1, limit: 50));

    expect($result)->toHaveCount(2);
});

it('rejects negative limit (invalid)', function (): void {
    $handler = new ListPingsHandler($this->repo);

    expect(fn () => $handler->handle(new ListPingsQuery(userId: 1, limit: -1)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects limit beyond ceiling (invalid)', function (): void {
    $handler = new ListPingsHandler($this->repo);

    expect(fn () => $handler->handle(new ListPingsQuery(userId: 1, limit: 99999)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects garbage Query type (garbage)', function (): void {
    $handler = new ListPingsHandler($this->repo);

    $bogus = new class extends Data implements Query {};

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
```

Annotated:

| Case                              | Path           | What it proves                                                                                     |
| --------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `returns recent pings for a user` | happy          | Filters by `userId`, returns the two pings owned by user 1, ignores user 2's.                      |
| `rejects negative limit`          | invalid (low)  | The `limit` parameter has a lower bound.                                                           |
| `rejects limit beyond ceiling`    | invalid (high) | The `limit` parameter has an upper bound — a defense against a caller asking for the entire table. |
| `rejects garbage Query type`      | garbage        | The `instanceof ListPingsQuery` guard catches a misrouted bus dispatch.                            |

Two invalid cases is correct here: a _bounded_ contract has two
boundaries. A _non-bounded_ invalid case (e.g. "userId is foreign-key
to a real user") would still be one invalid test. Don't pad — the
triad is a floor, not a quota.

## Backend stack: Pest 4

The backend uses [Pest](https://pestphp.com) 4.x (`^4.7`) with the
Laravel plugin. Pest sits on top of PHPUnit; if you've used PHPUnit
before, the migration guide is at
<https://pestphp.com/docs/migrating-from-phpunit-9>.

Key conventions:

- `it('description')` and `test('description')` are equivalent —
  use whichever reads naturally in the sentence.
- Shared setup goes through `beforeEach()` (per file) or the
  `pest()->extend(...)` mechanism configured in `tests/Pest.php`
  (suite-wide).
- Slow tests get a group: `it(...)->group('integration')`; CI runs
  them via `--group=integration` in a separate stage.
- Run a single file with `--filter=RecordPingHandlerTest`.

Run the suite inside the docker stack — host PHP is unsupported on
Windows in this repo:

```bash
docker compose --env-file .env -f infra/docker-compose.yml \
  exec -T backend ./vendor/bin/pest
```

Or via the Nx target wired up in `apps/backend/project.json`:

```bash
pnpm nx test backend
```

## Frontend stack: Vitest + Playwright

The frontend uses [Vitest](https://vitest.dev) for unit and
integration tests of components, hooks, and route handlers, and
[Playwright](https://playwright.dev) for end-to-end browser tests.

- Vitest config: `apps/web/vitest.config.ts` — jsdom environment,
  globals on, setup at `tests/setup.ts`, includes everything matching
  `src/**/*.{test,spec}.{ts,tsx}`.
- Playwright config: `apps/web/e2e/playwright.config.ts` — Chromium
  only, dev-server boot via `next dev -p 3000`, traces on first retry.

The stub-redirect callback test on the auth route handler is the
canonical worked frontend example: it stubs the upstream callback,
asserts the cookie, and exercises the happy/invalid/garbage triad
exactly the same way as a backend handler test.

Run them via Nx:

```bash
pnpm nx test web         # vitest
pnpm nx e2e web-e2e      # playwright
```

See <https://vitest.dev/guide/> and
<https://playwright.dev/docs/intro> for stack docs.

## Discipline

- **Red, then green, then commit.** Don't mix the test commit and
  the implementation commit unless the unit is trivial (one-liner +
  one-line test). The git log should read like a story of failing
  tests landing first.
- **Test behavior, not implementation.** A test that "verifies the
  implementation" instead of "verifies behavior" rots fast. If a
  refactor that preserves behavior breaks a test, the test is wrong
  — fix or delete it, don't bend the refactor around it.
- **Mock at boundaries.** Don't mock the unit under test or the
  entities it owns. `InMemoryPingRepository` (in
  `tests/Support/Modules/Ping/`) is the right shape: the
  _boundary_, faked. Mocking the `Ping` aggregate itself would test
  the mock, not the handler.
- **Fixtures live in support directories.** Backend:
  `apps/backend/tests/Support/`. Frontend: `__fixtures__/` colocated
  with the component under test. No inline 200-line JSON literals;
  they make the test unreadable and the fixture unfindable.
- **The CI gate enforces the triad shape via reviewer judgment, not
  a parser.** No tool counts your `it(...)` calls. Reviewers will
  reject a PR that lacks one of the three paths — defending the
  triad is part of the review checklist.

## When to break the rule

Spike code in a private branch is fine to skip TDD on, but it
doesn't merge. The rule is for code that ships, not for the
five-minute experiment that proved the API was usable. Throw the
spike away and write the feature test-first, taking the design
insight with you.

A bug-fix PR adds the _test that would have caught the bug_ before
changing code (regression test). The new test fails on `main`, the
fix turns it green. Without the regression test, the bug can return
in three months and nobody will notice.

One-line comment-only or doc-only PRs are exempt — there is nothing
to test. Renames that ride a working refactor under green tests are
exempt — the existing tests are the test.

## See also

- [`solid.md`](./solid.md) — single-responsibility makes units easy
  to triad-test
- [`naming.md`](./naming.md) — clear names make `it('does X')`
  sentences readable
- [`../architecture/cqrs.md`](../architecture/cqrs.md) — testing
  patterns section, bus pipeline coverage
- [Pest docs](https://pestphp.com)
- [Vitest docs](https://vitest.dev)
- [Playwright docs](https://playwright.dev)
- [`superpowers:test-driven-development`](../../CLAUDE.md) — the
  workflow skill that drives feature implementation
