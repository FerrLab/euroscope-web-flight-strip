# ADR 0007 — Bus Middleware Order: Authorize Before Validate

**Date:** 2026-05-05
**Status:** Accepted

## Context

EuroStrip's CQRS bus pipeline runs five middleware before invoking a handler
(four for the QueryBus — no transaction). The order of these middleware is
load-bearing: it determines what an unauthorized caller sees, where a
malformed payload is caught, and which checks run when a command is
dispatched outside the HTTP path (queue worker, Tinker, scheduler).

Standard CQRS literature places validation before authorization on the
"fail fast" argument: validation is cheap, authorization may hit a database
for permission lookups, so reject malformed payloads first. Phase 2 has the
opposite force in play: an unauthorized caller submitting a deliberately
malformed payload should not learn the schema's shape from the 422 error
messages. Information disclosure is the more important concern at our
threat model.

A second force: the bus is a second-line authorization checkpoint. The HTTP
layer already authorizes via route middleware, Form Request `authorize()`,
and Filament resource gates. The bus's authorize step exists to catch
non-HTTP dispatches — queued jobs, internal service calls, Tinker. Putting
authorize first matches the HTTP layer's order (which authenticates and
authorizes before binding the request body) and keeps a consistent posture
at every entry point.

## Decision

The CommandBus pipeline runs middleware in this order:

```text
Logging → Metrics → Authorize → Validate → Transaction
```

The QueryBus pipeline drops `Transaction` and is otherwise identical:

```text
Logging → Metrics → Authorize → Validate
```

This decision imposes the following constraints:

- Every Command and Query must declare `permission(): Permission` (the
  `AuthorizeMiddleware` throws `AuthorizationException` if the method is
  missing — there is no "unauthenticated" or "public" message type at the
  bus layer).
- Validation errors are only ever surfaced to authorized callers. A 403
  always precedes any 422.
- The transaction is the innermost wrapper, so handler retries / failures
  roll back cleanly without affecting authorize / validate state.
- QueryBus messages must not perform writes, since the absence of
  `TransactionMiddleware` means no rollback path exists. A query that wants
  to write is misclassified; it should be a command.

## Consequences

**Positive:**

- An unauthorized caller never learns the schema's existence, field names,
  or validation rules from error responses. They get a flat 403 regardless
  of payload.
- Bus-level authorization is a defense-in-depth checkpoint that holds for
  non-HTTP dispatches automatically. A queued job dispatched by an
  unauthorized actor still gets stopped.
- The order is symmetric with HTTP request handling (auth → validate →
  business), which reduces cognitive load.

**Negative:**

- Slightly more compute on a malformed-and-unauthorized request — we run
  Logging, Metrics, and Authorize before Validate detects the bad shape.
  In practice the cost is dominated by the Gate check itself, which we run
  in either ordering.
- Validation middleware sees only authorized payloads, so a bug that
  produces a malformed-but-authorized request looks identical to a
  malformed unauthorized one from telemetry alone — the Logging middleware
  surfaces the error context, but only authorized cases reach the
  `cqrs.dispatch.error` log line carrying the validation diff.

**Neutral:**

- Logging and Metrics wrap the rest so they see every dispatch (including
  unauthorized ones) — telemetry is complete regardless of the inner
  outcome.
- Revisit if perf bites. The current pipeline has not appeared in any hot
  path; if a future feature dispatches enough to make the asymmetric
  ordering measurable, the trade is to swap to Validate-first only on
  specific message classes via a dedicated middleware override.

## Alternatives Considered

1. **Validate before Authorize (the textbook order).** Rejected — leaks
   schema information to unauthorized callers. Defense in depth and
   information-disclosure concerns outweigh the marginal compute saving.
2. **Two pipelines: a "cheap-validate" pre-authorize and a
   "expensive-validate" post-authorize.** Rejected as premature complexity.
   We do not have any expensive validators today; if one ever exists, the
   right move is to extract it from `ValidateMiddleware` into a feature-
   specific middleware rather than reorder the global pipeline.
3. **Skip authorize on the QueryBus entirely.** Rejected — read-side
   information disclosure is real (e.g. a query that returns a user list
   reveals which emails exist). The QueryBus runs the same authorize step.

## References

- [Phase 2 decision log row 6.](../superpowers/specs/2026-05-05-eurostrip-scaffold-phase-2-decisions.md)
- [Original spec §5 — backend architecture.](../superpowers/specs/2026-05-02-eurostrip-scaffold-design.md)
- [`docs/architecture/cqrs.md`](../architecture/cqrs.md) §4 (the pipeline) and §5 (the rationale).
- [ADR 0002 — Three-Layer CQRS](0002-cqrs-three-layer.md).
