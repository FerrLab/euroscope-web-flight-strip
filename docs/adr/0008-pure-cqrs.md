# ADR 0008: Pure CQRS — collapse the UseCase layer into the Handler

**Date:** 2026-05-07
**Status:** Accepted (supersedes [ADR 0002](./0002-cqrs-three-layer.md))

## Context

ADR 0002 introduced a three-layer Application split: Command/Query (DTO) → Handler (bus adapter) → UseCase (framework-free business logic). The intent was to keep business logic testable without booting Laravel and to give a clean seam between framework integration and pure logic.

After Phases 2 and 3 shipped (the Ping module exercising the pattern end-to-end), three observations:

1. Each command needed three production files plus three test files. The repetitive cost was real.
2. The Handler's role degraded to a one-line delegate (`return $this->useCase->execute(...)`); it added a layer of indirection without earning its keep.
3. The "framework-free UseCase" guarantee was already provided by Domain (entities, value objects, repository interfaces) — UseCases imported only Domain types and were testable with in-memory repositories. Handlers can do the same.

## Decision

Collapse Command + Handler + UseCase into Command + Handler. The Handler:

- Takes the Domain repository directly via constructor injection (no UseCase intermediate).
- Holds the business logic in its `handle()` method.
- Performs a runtime type assertion on the incoming Command/Query (since `handle(Command|Query)` is the bus contract but Handlers need their concrete type's fields).

The bus middleware pipeline (Logging → Metrics → Authorize → Validate → Transaction for commands; the same minus Transaction for queries) is unchanged. The Permission marker interface contract is unchanged.

The `App\Cqrs\CommandUseCase` and `App\Cqrs\QueryUseCase` marker interfaces are deleted (they no longer signal a meaningful contract).

## Consequences

**Positive:**

- One fewer indirection per feature. Adding a new command goes from 3 files to 2.
- Tests merge: the 3 happy/invalid/garbage UseCase test cases live in the Handler test directly. Plus a new "rejects garbage Command/Query type" case for the Handler's runtime guard.
- Reading a module's Application/ directory is faster — the Handler is the obvious thing to open.

**Negative:**

- The Handler now holds the runtime-type assertion that used to live implicitly in `RecordPingUseCase::execute(int $userId, PingNote $note)` (typed signature). Mitigation: the assertion is one `instanceof` check at the top of `handle()` and is covered by a "rejects garbage Command type" test.
- ADR 0002's "framework-free UseCase" guarantee is now expressed implicitly: the Handler imports only Command/Query, Domain types, and the CommandHandler/QueryHandler contract. Reviewers must enforce this on every new module. PHPStan + Deptrac (four-layer ruleset) catch Application → Framework violations at CI time.

**Neutral:**

- The `naming.md` convention drops the `<Verb><Noun>UseCase` line.
- The `cqrs.md` architecture doc rewrites its "three contracts per side" sections to "two".
- The Permission marker interface decision (Phase 2 decision #5) is unchanged.

## Alternatives Considered

- **Keep ADR 0002 as-is.** Rejected — the ceremony cost was real and the Handler-as-delegate pattern provided no daily-life value.
- **Make the UseCase optional (Handler may inline OR delegate).** Rejected — convention drift would make every module's Application/ directory ambiguous to reviewers.
- **Split UseCase the other way (UseCase holds business logic; Handler is a registered alias).** Rejected — same ceremony, different shape; doesn't address the cost.

## References

- [ADR 0002: Three-Layer CQRS (Superseded)](./0002-cqrs-three-layer.md)
- Phase 4 decision-log spec, decision #6 + §12 (concrete file impact): `docs/superpowers/specs/2026-05-07-azimuth-scaffold-phase-4-decisions.md`
- Implementation commits: `4069172` (drop UseCase contracts), `92587a3` (collapse RecordPing), `aa2ffa2` (collapse ListPings)
- Bus middleware order: [ADR 0007](./0007-bus-middleware-order.md) — unchanged
