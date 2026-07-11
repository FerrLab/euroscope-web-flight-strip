# ADR 0004 — Stub Socialite Driver with Per-Request Fixture Identity

**Date:** 2026-05-05
**Status:** Accepted

## Context

Phase 2 establishes the OAuth-shaped login flow that real identity providers
will eventually plug into. The login surface mints a Passport access token and
upserts a User row from the IdP-supplied profile. Two competing forces shape
the dev/test side of this flow:

- A real OAuth provider in development is friction. Wiring Google or GitHub
  for local dev and CI requires per-developer credentials, callback URLs that
  vary by environment, and outbound network calls that make tests flaky.
- Tests need to authenticate as different identities — admin vs. member, two
  unrelated users in the same test, a user with a specific email pattern.
  Hard-coding a single fixture identity blocks multi-role coverage. Adding a
  test-only branch to production controllers (e.g.
  `if (App::environment('testing')) { ... }`) corrupts production code with
  test concerns and is a CLAUDE.md hard-rule violation.

## Decision

Implement a Socialite driver named `'stub'`
([`app/Authentication/Socialite/StubProvider.php`](../../apps/backend/app/Authentication/Socialite/StubProvider.php))
that accepts a per-request `?identity=<email>` query parameter and defaults
to `stub-user@azimuth.local` when absent. The stub builds a Socialite user
deterministically from this query parameter without any external network
call. The shared callback controller
([`SocialiteStubController`](../../apps/backend/app/Http/Controllers/Auth/SocialiteStubController.php))
upserts the user from `firstOrCreate(['email' => …])` and mints a Passport
personal access token via `$user->createToken('stub-login')`.

This decision imposes the following constraints:

- The stub driver is registered only by
  [`SocialiteStubServiceProvider`](../../apps/backend/app/Providers/SocialiteStubServiceProvider.php).
  Production environments either omit this provider or gate the stub routes
  behind `APP_ENV` to ensure the stub identity never reaches production.
- The stub callback controller's user-upsert logic is identical to what a
  real provider's callback would do. Adding a real provider means following
  the same controller pattern with a different driver name.
- Tests authenticate by hitting `/auth/socialite/stub/redirect?identity=…`
  and following the redirect, exercising the same code path that production
  will eventually exercise with a real IdP.

## Consequences

**Positive:**

- Multi-role tests are written without touching production code:
  `?identity=admin@azimuth.local` for one assertion,
  `?identity=member@azimuth.local` for the next.
- The login flow exercised in dev and CI is the same flow real users will
  follow — no test-only short-circuit, no `Auth::loginAs($user)` shortcut
  that bypasses the OAuth-shaped path.
- Onboarding a new developer requires no IdP account or credentials; `git
clone` + `compose up` produces a working login at
  `?identity=anyone@example.com`.

**Negative:**

- The stub identity must never reach production. Mitigated by registering
  the stub provider in a dedicated `SocialiteStubServiceProvider` that can
  be omitted from prod's provider list (or gated by environment); not
  mitigated automatically.
- Tests that depend on real IdP profile fields (avatar URL, locale,
  emergency-contact-on-Google) cannot exercise those fields against the
  stub. We do not currently consume profile fields beyond email and name.

**Neutral:**

- Adding a real provider follows a mechanical pattern (see
  [`docs/architecture/auth.md`](../architecture/auth.md) §4) — install the
  SocialiteProviders package, register, configure, copy the controller. The
  pattern is the stub's contribution; the stub does not block real-provider
  adoption later.

## Alternatives Considered

1. **`Auth::loginAs($user)` in tests, real OAuth in dev.** Rejected because
   it splits the test path from the production path; the parts of the OAuth
   flow that mint tokens and upsert users would never be exercised by tests.
2. **A static fixture identity (one hard-coded user).** Rejected because it
   blocks multi-role tests. The query-parameter approach is one extra line
   of test code per request and unlocks unlimited fixture identities.
3. **A test-only branch in the real-provider controller.** Rejected on
   CLAUDE.md hard-rule grounds: production code must not contain
   `if (App::environment('testing'))` paths.

## References

- [Phase 2 decision log row 7.](../superpowers/specs/2026-05-05-azimuth-scaffold-phase-2-decisions.md)
- [Original spec §5.6 — Socialite + stub driver.](../superpowers/specs/2026-05-02-azimuth-scaffold-design.md)
- [`docs/architecture/auth.md`](../architecture/auth.md) §3 (the stub flow) and §4 (adding a real provider).
- Coverage:
  [`tests/Feature/Auth/SocialiteStubTest.php`](../../apps/backend/tests/Feature/Auth/SocialiteStubTest.php),
  [`tests/Feature/Auth/SocialiteStubToPingFlowTest.php`](../../apps/backend/tests/Feature/Auth/SocialiteStubToPingFlowTest.php).
