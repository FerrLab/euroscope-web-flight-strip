# ADR 0002 — Three-Layer CQRS (Command/Query → Handler → UseCase)

**Date:** 2026-05-05
**Status:** Superseded by [ADR 0008](./0008-pure-cqrs.md) on 2026-05-07

> **Superseded note (2026-05-07):** Phase 4 collapsed the three-layer split into pure CQRS. The Application layer now has Command + Handler only — no separate UseCase. See [ADR 0008](./0008-pure-cqrs.md) for the rationale and impact. The Context, Decision, and original Consequences below are preserved as historical record.

## Context

Azimuth's backend has two competing forces. SOLID separation requires that
business logic not depend on the framework — the same logic should be testable
without booting Laravel, and a future swap of bus implementation, ORM, or HTTP
stack should not ripple through Domain code. At the same time, the bus needs
adapter-shaped concerns: routing a message to its handler, applying middleware,
deserializing payloads. A naive single-class Service pulls both concerns
together and ends up importing Eloquent and request facades into the middle of
business logic, which makes unit-testing slow and fragile and lets framework
churn touch Domain.

A second force: writes and reads have asymmetric needs. Writes carry intent and
benefit from transactional, audited dispatch; reads benefit from caching and
have no transaction requirement. A bus design that treats them identically
forces one path to compromise.

## Decision

Split each feature's write side into three classes, each with one
responsibility:

- **`*Command`** (extends `Spatie\LaravelData\Data`, implements
  `App\Cqrs\Command`) — the message DTO. Declares its required permission via
  `permission(): Permission`.
- **`*Handler`** (implements `App\Cqrs\CommandHandler`) — the bus adapter.
  Translates the command into the UseCase's plain inputs and returns its
  result. Free to use framework symbols.
- **`*UseCase`** (implements `App\Cqrs\CommandUseCase`) — pure business logic.
  Imports no framework symbols; persistence is reached through a domain
  repository interface injected via the constructor.

Same shape on the read side with `Query` / `QueryHandler` / `QueryUseCase`.
The shared `HandlerRegistry` binds messages to handlers; each module's
`ServiceProvider::boot()` registers its own.

This decision imposes the following constraints:

- Every Command and Query MUST declare a `permission()` returning a
  `BackedEnum` case (`AuthorizeMiddleware` enforces this at runtime; PHPStan
  enforces it statically per ADR 0003).
- Every UseCase MUST be framework-free. Deptrac forbids framework imports in
  any class implementing `CommandUseCase` / `QueryUseCase`.
- Every bounded module MUST own a `<Module>ServiceProvider` that binds its
  domain repository interface and registers its handlers.

## Consequences

**Positive:**

- UseCase tests are pure-PHP and run in milliseconds against in-memory
  repositories — no `RefreshDatabase`, no service container, no facade roots.
- Cross-cutting concerns (logging, metrics, authorization, validation,
  transactions) are written once in the bus middleware and apply to every
  feature uniformly — including features dispatched from non-HTTP contexts
  (queued jobs, Tinker, CLI commands).
- Future bus or ORM swaps touch only the Handler and Repository layers; Domain
  and UseCases are insulated.

**Negative:**

- Three files per feature instead of one. Boilerplate cost for trivial
  features.
- Junior developers initially struggle with where to put validation rules
  (Spatie Data on the Command vs. `rules()` for cross-field vs. Form Request
  for HTTP-shape). The runbook for adding a feature documents this.

**Neutral:**

- Each bounded module needs a ServiceProvider. The reflective seeder for
  permissions (per ADR 0003) and the auto-discovery in
  `AdminPanelProvider::discoverResources(in: app_path('Modules'))` mean that
  most other registrations happen automatically; the per-module provider is
  effectively a one-time setup cost per bounded context.

## Alternatives Considered

1. **Single Service class per feature.** Rejected — couples bus-adapter
   concerns to business logic and makes UseCases un-testable without booting
   the framework.
2. **Two-layer split (Command + Handler-with-logic).** Rejected — keeps
   framework imports inside the logic class. Phase 2 deliberately invests in
   the third layer because the testing-speed and dependency-isolation wins
   are large; the three-files-per-feature cost is small.
3. **A community CQRS package (e.g. tarekdj/laravel-message-bus).** Rejected
   — the bus is ~150 lines we want to own. The middleware ordering decision
   (ADR 0007) is a non-default we'd have to fight a third-party package to
   express.

## References

- [Phase 2 decision log row 6 (middleware order ties to this layout).](../superpowers/specs/2026-05-05-azimuth-scaffold-phase-2-decisions.md)
- [Original spec §5 — backend architecture.](../superpowers/specs/2026-05-02-azimuth-scaffold-design.md)
- [`docs/architecture/cqrs.md`](../architecture/cqrs.md) — current contracts and conventions.
- [ADR 0007 — Bus Middleware Order](0007-bus-middleware-order.md).
