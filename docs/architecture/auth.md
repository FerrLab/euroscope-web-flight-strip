# Authentication & Authorization

This document is the canonical reference for how EuroStrip authenticates users
and authorizes their actions. For the rationale on the unusual pieces (the
permission marker interface, the stub Socialite driver, VATSIM Connect as
the production identity provider) see
[ADR 0003](../adr/0003-permission-marker-interface.md),
[ADR 0004](../adr/0004-stub-socialite-per-request-fixture.md), and
[ADR 0010](../adr/0010-vatsim-connect-oauth.md).

## 1. Overview

EuroStrip uses **Passport** for OAuth2 access tokens (the API surface),
**Socialite** for IdP-shaped login flows — **VATSIM Connect** is the production
driver (§4) and a deterministic **stub** driver stands in outside production
(§3) — and **spatie/laravel-permission v7**
for the role/permission model. The Filament admin panel and Laravel Horizon
are gated by Spatie roles. Authorization checks throughout the codebase route
through a marker interface — `App\Authorization\Contracts\Permission` — that
forbids raw permission strings and is enforced by a custom PHPStan rule.

## 2. Passport configuration

Passport is provisioned at boot via the backend container's entrypoint:

- **Token expirations** are set in `AuthServiceProvider::boot()` per Phase 2
  Task 6 — access tokens 15 days, refresh tokens 30 days, personal access
  tokens 6 months. These match the spec's defaults; production deployments may
  shorten them via configuration.
- **Key persistence.** Passport's RSA key pair is generated once (with
  `passport:keys --force`) into `storage/passport/`. This directory is mounted
  from a named Docker volume — `passport-keys` — so keys survive container
  rebuilds. Without this, a `docker compose down` followed by `up` would
  invalidate every issued token.
- **Idempotent provisioning.** The entrypoint script checks for the presence
  of `oauth-private.key` before running `passport:install`; the install path
  also creates the seed `Personal Access Client` row when missing. Re-runs are
  safe.

API routes that require authentication use the `auth:api` middleware:

```php
Route::middleware('auth:api')->prefix('ping')->group(function () { ... });
```

A token mint happens through the stub Socialite callback (see §3).
[`tests/Feature/Auth/PassportTokenSmokeTest.php`](../../apps/backend/tests/Feature/Auth/PassportTokenSmokeTest.php)
covers issue-and-use of an access token end-to-end.

## 3. The stub Socialite driver

Per decision #7, dev and test login uses a deterministic stub driver instead
of a real OAuth provider. This unlocks multi-role testing (admin vs member,
two unrelated users in one test) without ever introducing a test-only branch
into production code.

### Files

- [`app/Authentication/Socialite/StubProvider.php`](../../apps/backend/app/Authentication/Socialite/StubProvider.php) —
  the Socialite provider implementation.
- [`app/Providers/SocialiteStubServiceProvider.php`](../../apps/backend/app/Providers/SocialiteStubServiceProvider.php) —
  registers the `stub` driver via `Socialite::extend('stub', ...)`.
- [`app/Http/Controllers/Auth/SocialiteStubController.php`](../../apps/backend/app/Http/Controllers/Auth/SocialiteStubController.php) —
  redirect + callback endpoints.
- Routes: `GET /auth/socialite/stub/redirect` and `GET /auth/socialite/stub/callback`,
  both unauthenticated.

### Flow

1. Caller hits `GET /auth/socialite/stub/redirect?identity=alice@example.com`.
2. The controller calls `Socialite::driver('stub')->redirect()`. The stub's
   `getAuthUrl` returns the callback URL with the `identity` query param
   carried forward. Default identity is `stub-user@eurostrip.local` when the
   query is absent.
3. The browser follows the redirect to
   `GET /auth/socialite/stub/callback?identity=alice@example.com`.
4. The controller calls `Socialite::driver('stub')->user()`. The stub builds a
   `SocialiteUser` from the `identity` query param — id, email, name (the
   local part of the email), and a fixed access/refresh-token pair — without
   ever hitting an external endpoint.
5. The controller resolves the user through the shared
   [`ResolveSocialiteUser`](../../apps/backend/app/Authentication/ResolveSocialiteUser.php)
   (the same code path §4 documents for VATSIM, called with a `null` CID) and
   mints a Passport personal access token via `$user->createToken('stub-login')`.
6. JSON response: `{ "access_token": "...", "token_type": "Bearer",
"user": { ... } }`.

The stub's `getTokenUrl()` returns `http://stub.invalid/token` precisely
because it must never be called; the abstract Socialite plumbing requires the
method to exist but the stub bypasses the OAuth code-for-token step entirely.

End-to-end coverage:
[`tests/Feature/Auth/SocialiteStubTest.php`](../../apps/backend/tests/Feature/Auth/SocialiteStubTest.php)
and
[`tests/Feature/Auth/SocialiteStubToPingFlowTest.php`](../../apps/backend/tests/Feature/Auth/SocialiteStubToPingFlowTest.php).

## 4. VATSIM Connect (production)

VATSIM members sign in with their real VATSIM account via
`socialiteproviders/vatsim`, registered the same way the stub is (a
`ServiceProvider::boot()` calling `SocialiteManager::buildProvider()` —
see [`app/Providers/VatsimSocialiteServiceProvider.php`](../../apps/backend/app/Providers/VatsimSocialiteServiceProvider.php)).
Scopes requested: `full_name`, `email` (required) — nothing else is
requested or stored.

### Files

- [`app/Http/Controllers/Auth/VatsimAuthController.php`](../../apps/backend/app/Http/Controllers/Auth/VatsimAuthController.php) —
  redirect + callback.
- [`app/Http/Controllers/Auth/AuthExchangeController.php`](../../apps/backend/app/Http/Controllers/Auth/AuthExchangeController.php) —
  redeems the one-time exchange code for the Bearer.
- [`app/Authentication/ResolveSocialiteUser.php`](../../apps/backend/app/Authentication/ResolveSocialiteUser.php) —
  identity resolution shared with the stub callback.
- [`app/Authentication/ExchangeCodeStore.php`](../../apps/backend/app/Authentication/ExchangeCodeStore.php) —
  the single-use, Dragonfly-backed token handoff.
- Routes: `GET /auth/socialite/vatsim/redirect`, `GET /auth/socialite/vatsim/callback`,
  `POST /auth/socialite/exchange` (rate-limited, `throttle:socialite-exchange`).

### Flow

1. Browser hits `GET /api/auth/vatsim-redirect` (Next.js), which 302s the
   **browser** to Laravel's `GET /auth/socialite/vatsim/redirect`. That
   handler builds its target from `NEXT_PUBLIC_API_URL`, not
   `EUROSTRIP_BACKEND_URL` like its server-side siblings: the browser
   follows this hop itself, and it must land on the same origin as
   `VATSIM_REDIRECT_URI` or the Laravel session cookie carrying Socialite's
   OAuth `state` will not come back on the callback.
2. `redirect()` stores the requested locale in the Laravel session
   (`vatsim_oauth_locale`) and redirects to VATSIM Connect for consent,
   requesting `full_name` + `email` with `email` marked as a
   _required_ scope (`Provider::requiredScopes()`, which VATSIM enforces at
   the consent screen). The session stash exists because VATSIM's redirect
   back is plain OAuth2 — only `code` and `state`, never an app-specific
   `locale`.
3. VATSIM redirects back to `GET /auth/socialite/vatsim/callback`. The
   controller reads CID/name/email off the Socialite user with
   `getId()`/`getName()`/`getEmail()` (the provider maps nothing else —
   see ADR 0010), `pull()`s the locale back out of the session, resolves
   the user via `ResolveSocialiteUser` (CID first, then email-adopt, then
   create), mints a Passport personal access token, and stores it under a
   random 64-character code with a 60-second TTL via
   `ExchangeCodeStore::put()`.
4. Laravel redirects to `{FRONTEND_URL}/api/auth/vatsim-callback?code=...&locale=...`
   — the Bearer itself is never in this URL.
5. Next.js POSTs the code to `POST /auth/socialite/exchange`, which
   redeems it exactly once (`ExchangeCodeStore::redeem()`, an atomic
   `GETDEL`) and returns the Bearer. That route is excepted from CSRF
   verification in `bootstrap/app.php` — it is a server-to-server POST with
   no session cookie and no `_token`, so the `web` group would otherwise
   answer 419.
6. Next.js sets the existing httpOnly `eurostrip_session` cookie (ADR 0006) and redirects to `/{locale}/dashboard`.

Any failure — consent denied, state mismatch, a profile missing CID or
email, an email already linked to a different CID, an expired or replayed
exchange code — redirects to `/{locale}/login?error=oauth`. The whole
callback body is wrapped, so an unexpected failure during resolution or
token minting degrades the same way instead of surfacing a 500. No partial
session is ever written.

### Identity resolution

`ResolveSocialiteUser::resolve(?string $cid, string $email, string $name)`:
match on `vatsim_cid` when given; else match on `email` and adopt the row
(setting its CID); else create. First login assigns the `member` role —
any VATSIM account may sign in; there is no rating gate or allowlist.

The email-adopt branch refuses rather than adopts when the matched row
already carries a **different**, non-null `vatsim_cid` — that row belongs to
another VATSIM member, and returning it would mint a Bearer for the wrong
account. It throws
[`ConflictingSocialiteIdentity`](../../apps/backend/app/Authentication/Exceptions/ConflictingSocialiteIdentity.php),
which the VATSIM callback turns into the usual `?error=oauth` redirect.

### Production gating of the stub

Both stub HTTP endpoints (`SocialiteStubController::redirect`/`callback`)
`abort_if(app()->isProduction(), 404)`. The frontend's stub route
handlers make the same check against `NODE_ENV`, and the login page hides
its stub button under the same condition. The stub driver's registration
is left unconditional — an unreachable extra Socialite driver has no
security exposure on its own.

Coverage: [`tests/Feature/Auth/VatsimAuthTest.php`](../../apps/backend/tests/Feature/Auth/VatsimAuthTest.php),
[`tests/Feature/Auth/AuthExchangeTest.php`](../../apps/backend/tests/Feature/Auth/AuthExchangeTest.php),
[`tests/Feature/Auth/AuthExchangeCsrfExemptionTest.php`](../../apps/backend/tests/Feature/Auth/AuthExchangeCsrfExemptionTest.php),
[`tests/Feature/Auth/SocialiteStubProductionGateTest.php`](../../apps/backend/tests/Feature/Auth/SocialiteStubProductionGateTest.php),
[`tests/Feature/Authentication/ResolveSocialiteUserTest.php`](../../apps/backend/tests/Feature/Authentication/ResolveSocialiteUserTest.php),
[`tests/Feature/Authentication/ExchangeCodeStoreTest.php`](../../apps/backend/tests/Feature/Authentication/ExchangeCodeStoreTest.php).

## 5. Permissions and roles

### The marker interface

`App\Authorization\Contracts\Permission` is a marker interface that extends
PHP's `BackedEnum`. Every permission in the codebase is a `case` of an enum
that implements it. This is the type system carrying the constraint:

```php
// app/Authorization/Contracts/Permission.php
interface Permission extends BackedEnum {}

// app/Modules/Ping/Domain/PingPermission.php
enum PingPermission: string implements Permission
{
    case View   = 'ping.view';
    case Create = 'ping.create';
}
```

Every module declares its own `<Module>Permission` enum next to its other
domain types. The string value is the wire-format name Spatie stores; the
enum case is what the codebase passes around.

### The reconciler seeder

[`database/seeders/PermissionsSeeder.php`](../../apps/backend/database/seeders/PermissionsSeeder.php)
walks `app/Modules` recursively, finds every enum implementing the `Permission`
interface, collects every case's `->value`, and **reconciles** the
`permissions` table:

- Inserts rows for any case missing in the database.
- Deletes any database row whose `name` no longer matches any enum case
  (orphan removal).
- Forgets the Spatie permission cache so changes take effect immediately.

This means **adding a permission is one line of PHP** — add the case to the
enum and rerun the seeder. There are no permission migrations to author.

Tests cover both the discovery walk
([`PermissionsSeederDiscoveryTest`](../../apps/backend/tests/Feature/Authorization/PermissionsSeederDiscoveryTest.php))
and the reconciliation behavior
([`PermissionsSeederTest`](../../apps/backend/tests/Feature/Authorization/PermissionsSeederTest.php)).

### Spatie's tables

Spatie's published migrations create:

- `permissions` — one row per case, `name` matches the enum value.
- `roles` — one row per `Role` enum case (currently `admin`, `member`).
- `model_has_permissions` / `model_has_roles` — polymorphic pivots binding
  permissions and roles to user records.
- `role_has_permissions` — pivot binding permissions to roles.

The `Role` enum lives at
[`app/Authorization/Roles/Role.php`](../../apps/backend/app/Authorization/Roles/Role.php):

```php
enum Role: string
{
    case Admin  = 'admin';
    case Member = 'member';
}
```

We deliberately keep `Role` simple (string-backed enum, no marker interface)
because roles are aggregated permissions, not the unit of authorization. The
marker interface only applies to atomic permissions.

## 6. Authorization in practice

There are three call-sites that perform authorization checks. All of them go
through the `Permission` enum's `->value`, never a raw string. The custom
PHPStan rule from Task 23 forbids raw strings in any `Gate::*` call —
`Gate::authorize('ping.create')` fails the build; `Gate::authorize(PingPermission::Create->value)`
passes.

### (a) Bus dispatch

The `AuthorizeMiddleware` in the CQRS pipeline reads the message's permission:

```php
// app/Cqrs/Bus/Middleware/AuthorizeMiddleware.php
Gate::authorize($message->permission()->value);
```

Every Command and Query declares `permission(): Permission`. The middleware
throws `AuthorizationException` if the method is missing — a message without a
declared permission is a programmer error, not an oversight.

### (b) Filament resources

Filament resource gates use `auth()->user()?->can(...)` with the enum value:

```php
public static function canCreate(): bool
{
    return auth()->user()?->can(PingPermission::Create->value) ?? false;
}
```

`canViewAny`, `canEdit`, `canDelete` follow the same shape. See
[`app/Modules/Ping/Presentation/Filament/PingResource.php`](../../apps/backend/app/Modules/Ping/Presentation/Filament/PingResource.php).

### (c) Horizon

The Horizon gate checks the role enum, not a permission:

```php
// app/Providers/HorizonServiceProvider.php
Gate::define('viewHorizon', function ($user = null): bool {
    return $user !== null && $user->hasRole(Role::Admin->value);
});
```

Operational dashboards are role-gated rather than permission-gated because
"who can see the queue" is a coarse-grained ops concern, not a domain action.

## 7. Filament admin gate

`User implements FilamentUser` (Filament contract). The
[`canAccessPanel(Panel)`](../../apps/backend/app/Models/User.php) method
gates panel access:

```php
public function canAccessPanel(Panel $panel): bool
{
    return $this->hasRole(Role::Admin->value);
}
```

The panel itself is configured in
[`app/Providers/Filament/AdminPanelProvider.php`](../../apps/backend/app/Providers/Filament/AdminPanelProvider.php),
mounted at `/admin`, and discovers Filament resources from both
`app/Filament/Resources` and `app/Modules` (so each module's
`Presentation/Filament/<Module>Resource.php` is auto-registered).

### Why `protected string $guard_name = 'web'` matters

Spatie's `HasRoles` trait stores the guard name on each `permissions` and
`roles` row and resolves checks against the current request's guard. Passport
flips Laravel's default guard to `api` during API requests. Without an
explicit `$guard_name` override, an admin checking `$user->hasRole(...)` from
a Filament page (under `web`) and the same admin checking it from a Passport-
authenticated API route (under `api`) would resolve against two different
guard partitions in Spatie's tables — leading to false negatives.

Pinning `$guard_name = 'web'` on the User model
([`apps/backend/app/Models/User.php`](../../apps/backend/app/Models/User.php))
forces every Spatie lookup to consult the `web` partition regardless of the
runtime auth guard. We seed roles and permissions only under `web`, and every
authorization check in the codebase resolves against that single partition.
This is the fix landed in Task 20; without it, the AdminPanelGate test from
the API side would silently fail.

Coverage:
[`tests/Feature/Filament/AdminPanelGateTest.php`](../../apps/backend/tests/Feature/Filament/AdminPanelGateTest.php).

### Signing in: why failures must leave the panel

The panel has no password form. `->login(VatsimLogin::class)` replaces
Filament's login page with one that answers `/admin/login` by redirecting
straight to VATSIM Connect (ADR 0010). VATSIM only ever calls back to the
single registered `VATSIM_REDIRECT_URI`, so the admin flow flags its intent
in the session on the way out and
[`VatsimAuthController::callback()`](../../apps/backend/app/Http/Controllers/Auth/VatsimAuthController.php)
branches on it coming back.

That makes `/admin/login` an OAuth _trigger_, not a page. **Every failure
exit in `adminCallback()` must therefore redirect off the panel origin** —
to `FRONTEND_URL/{locale}/login?error=…`, never back to `/admin/login`.
Returning a failure to the login page re-enters the round trip, and because
nothing about the outcome changes on the second pass, it never terminates.
Routing an _authorization_ failure back through the _authentication_ entry
point is what produced a live `ERR_TOO_MANY_REDIRECTS`: sign-in was
succeeding every time, and the denied user was bounced straight back to the
provider.

The two error codes the frontend login page renders:

| Code        | Meaning                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `forbidden` | Authenticated with VATSIM, but the user lacks the `admin` role.                                |
| `oauth`     | The round trip itself failed — denied consent, state mismatch, a profile with no cid or email. |

Note that nothing in the codebase _grants_ `admin`;
[`ResolveSocialiteUser`](../../apps/backend/app/Authentication/ResolveSocialiteUser.php)
assigns `member` to every VATSIM login. The first admin is promoted by hand.

Coverage:
[`tests/Feature/Auth/VatsimAdminLoginTest.php`](../../apps/backend/tests/Feature/Auth/VatsimAdminLoginTest.php),
whose "never returns a failed admin login to the panel" case asserts the
invariant across the whole class of failures rather than one target URL.

### Tracing a failed sign-in

`?error=oauth` is deliberately vague to the browser, so the flow logs what
it will not say out loud. Every event is a dotted name with a structured
context, matching the CQRS middleware convention:

| Event                                 | Level   | Context                            |
| ------------------------------------- | ------- | ---------------------------------- |
| `vatsim.oauth.redirect`               | info    | `intent`, `locale` (frontend only) |
| `vatsim.oauth.callback`               | info    | `intent`, `locale`                 |
| `vatsim.oauth.profile_incomplete`     | warning | `intent`, `has_cid`, `has_email`   |
| `vatsim.oauth.admin_denied`           | warning | `cid`, `user_id`, `roles`          |
| `vatsim.oauth.login` / `.admin_login` | info    | `intent`, `cid`, `user_id`         |
| `vatsim.oauth.failed`                 | error   | `intent`, `exception`, `message`   |

`grep vatsim.oauth` gives the whole round trip. The member's email is never
logged; the VATSIM CID is, being a public identifier and the only key worth
correlating on.

`vatsim.oauth.failed` also calls `report()`, which is what carries the stack
trace. Note that `report()` alone was the situation before these events
existed, and it was not enough: the incomplete-profile branch never raised
anything, so half the `error=oauth` responses had no corresponding log line
at all.

The trail continues on the Next side, where the browser lands after the
backend redirects. These are `console` lines from the route handler, which
go to that container's stdout — one JSON object per line, same dotted names:

| Event                        | Level | Context             |
| ---------------------------- | ----- | ------------------- |
| `auth.exchange.missing_code` | warn  | `locale`            |
| `auth.exchange.unreachable`  | error | `backend`, `cause`  |
| `auth.exchange.rejected`     | warn  | `backend`, `status` |
| `auth.exchange.malformed`    | error | `backend`, `status` |
| `auth.exchange.no_token`     | error | `backend`, `status` |
| `auth.exchange.ok`           | info  | `locale`            |

and on the backend at
[`AuthExchangeController`](../../apps/backend/app/Http/Controllers/Auth/AuthExchangeController.php)
with `auth.exchange.redeemed` / `auth.exchange.redeem_failed`.

Those two halves are what make a failed sign-in answerable. All four Next-side
failures used to collapse into one `error=oauth`, and they call for opposite
fixes:

- `auth.exchange.unreachable` with **no** `auth.exchange.redeem_failed` on the
  backend — the request never arrived. `EUROSTRIP_BACKEND_URL` is unset or
  wrong for that container; the `backend` field says what it tried. Note this
  variable has a `http://127.0.0.1:8000` default that is a dead end inside a
  container, so an unset value fails quietly rather than loudly.
- `auth.exchange.rejected` **with** `auth.exchange.redeem_failed` — it arrived
  and the code was already spent or past its TTL.

Neither side ever logs the exchange code or the access token: the code is
bearer-equivalent for its 60-second life. The backend URL is logged as an
origin only, so a query string cannot smuggle either into a log line.

**Where the log goes.** `LOG_CHANNEL` defaults to `stack` and `LOG_STACK` to
`single`, which writes only `storage/logs/laravel.log` _inside the
container_ — so `docker logs` shows nothing and a reported exception looks
like no exception. The compose services set `LOG_STACK=single,stderr`, which
is additive; set it the same way on real deployments.

**One caveat on `ProductionConfigGuard`.** It runs in
`AppServiceProvider::boot()`, so it fires in every process that boots the
app, not just the HTTP one. A worker started without `FRONTEND_URL` and the
`VATSIM_*` values logs a production `CRITICAL` naming all four while the web
container is perfectly configured. The compose `horizon` and `scheduler`
services therefore carry the same values as `backend`; keep that true on any
deployment, or the guard's loudest output is a false alarm.

### Running behind a TLS-terminating proxy

Cloudflare terminates TLS and forwards to Octane over plain HTTP.
`TrustProxies` ships in Laravel's default middleware stack, but its
`handle()` calls `setTrustedProxies([], …)` until told otherwise — so
`X-Forwarded-Proto` is discarded and every absolute URL the app generates
comes out `http://`. [`bootstrap/app.php`](../../apps/backend/bootstrap/app.php)
therefore calls `$middleware->trustProxies(at: '*')`; the origin is not
publicly routable, so every proxy in front of the app is ours.

Coverage:
[`tests/Feature/Http/TrustedProxyTest.php`](../../apps/backend/tests/Feature/Http/TrustedProxyTest.php).

## 8. Horizon gate

Same role gate as above — `Gate::define('viewHorizon', ...)` returns true iff
`$user->hasRole(Role::Admin->value)`. Coverage:
[`tests/Feature/Horizon/HorizonGateTest.php`](../../apps/backend/tests/Feature/Horizon/HorizonGateTest.php).

## 9. References

- [ADR 0003 — Permission as a Marker Interface](../adr/0003-permission-marker-interface.md).
- [ADR 0004 — Stub Socialite with Per-Request Fixture Identity](../adr/0004-stub-socialite-per-request-fixture.md).
- Phase 2 decision log:
  [`docs/superpowers/specs/2026-05-05-eurostrip-scaffold-phase-2-decisions.md`](../superpowers/specs/2026-05-05-eurostrip-scaffold-phase-2-decisions.md)
  rows 5 (permission contract shape) and 7 (stub Socialite identity).
- CLAUDE.md hard rule #3 (no raw permission strings).
