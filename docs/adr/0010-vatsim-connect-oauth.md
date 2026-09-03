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

- The profile fields are reachable only through Socialite's
  `Contracts\User` interface methods. `SocialiteProviders\Vatsim\Provider::mapUserToObject()`
  maps exactly three keys — `id` (from `data.cid`), `name` (from
  `data.personal.name_full`) and `email` (from `data.personal.email`) — and
  `AbstractUser::map()` replaces the attribute bag with precisely those,
  so `$user->cid` / `$user->full_name` resolve to `null` via `__get()`.
  `VatsimAuthController::callback()` therefore uses `getId()`/`getName()`/`getEmail()`,
  and `tests/Feature/Auth/VatsimAuthTest.php`'s `fakeVatsimUser()` mirrors
  that vendor mapping verbatim so the fixture cannot drift from the
  library again.
- `getId()` has no declared return type and simply hands back whatever
  `data.cid` decoded to — VATSIM may serialise the CID as a JSON number
  rather than a string, so the controller casts defensively (`is_int()` →
  `(string)`) before the null/empty check. `users.vatsim_cid` stays a
  string column.
- `POST /auth/socialite/exchange` must be excepted from CSRF verification
  in `bootstrap/app.php` (`Middleware::preventRequestForgery`): the Next.js
  server redeems the code with a server-to-server POST that carries no
  session cookie and no `_token`, so the default `web` group would answer 419. Laravel's CSRF middleware short-circuits under
  `runningUnitTests()`, so `tests/Feature/Auth/AuthExchangeCsrfExemptionTest.php`
  flips `app['env']` away from `testing` to exercise the real check.
- The exchange endpoint is necessarily unauthenticated (rate-limited to
  20/min/IP); its security rests on the code's 64-character entropy and
  60-second TTL rather than a session check.
- The locale cannot survive the VATSIM hop in the query string (OAuth2
  gives the provider nothing app-specific to echo back), so `redirect()`
  stashes it in the Laravel session and `callback()` `pull()`s it back.
  This adds a session dependency to `callback()` — already unavoidable,
  since Socialite's `state` CSRF check needs the same session — and means
  the browser must reach Laravel on the same origin as
  `VATSIM_REDIRECT_URI`. The Next.js `/api/auth/vatsim-redirect` handler
  consequently uses `NEXT_PUBLIC_API_URL` (browser-facing), not
  `EUROSTRIP_BACKEND_URL` (Docker-internal) like its sibling handlers.
- An email that already belongs to a row carrying a _different_ VATSIM CID
  is refused (`App\Authentication\Exceptions\ConflictingSocialiteIdentity`)
  rather than adopted, and surfaces as the same `?error=oauth` redirect.
  Recovering such an account is a manual, admin-side operation; there is
  deliberately no self-service merge.
