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

- VATSIM's `/api/user` payload does not map `email` through the
  provider's own `mapUserToObject()` — `App\Http\Controllers\Auth\VatsimAuthController::emailFromRaw()`
  reads it from the raw response at `data.personal.email`, an assumption
  inferred from the library's sibling `name_first`/`name_last`/`name_full`
  fields (which do live at that path) rather than from a captured live
  response. If a real account ever proves this path wrong, the fix is
  confined to that one method.
- The exchange endpoint is necessarily unauthenticated (rate-limited to
  20/min/IP); its security rests on the code's 64-character entropy and
  60-second TTL rather than a session check.
