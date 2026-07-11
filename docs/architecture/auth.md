# Authentication & Authorization

This document is the canonical reference for how EuroStrip authenticates users
and authorizes their actions. For the rationale on the unusual pieces (the
permission marker interface, the stub Socialite driver) see
[ADR 0003](../adr/0003-permission-marker-interface.md) and
[ADR 0004](../adr/0004-stub-socialite-per-request-fixture.md).

## 1. Overview

EuroStrip uses **Passport** for OAuth2 access tokens (the API surface),
**Socialite** with a stub driver for IdP-shaped login flows (real providers
plug in later without changing call-sites), and **spatie/laravel-permission v7**
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
5. The controller upserts the user (`User::firstOrCreate`) and mints a
   Passport personal access token via `$user->createToken('stub-login')`.
6. JSON response: `{ "access_token": "...", "token_type": "Bearer",
"user": { ... } }`.

The stub's `getTokenUrl()` returns `http://stub.invalid/token` precisely
because it must never be called; the abstract Socialite plumbing requires the
method to exist but the stub bypasses the OAuth code-for-token step entirely.

End-to-end coverage:
[`tests/Feature/Auth/SocialiteStubTest.php`](../../apps/backend/tests/Feature/Auth/SocialiteStubTest.php)
and
[`tests/Feature/Auth/SocialiteStubToPingFlowTest.php`](../../apps/backend/tests/Feature/Auth/SocialiteStubToPingFlowTest.php).

## 4. Adding a real OAuth provider (future)

The stub establishes the controller pattern; adding a real provider is
mechanical. Steps for, e.g., Google:

1. Install the SocialiteProviders package:

   ```bash
   composer require socialiteproviders/google
   ```

2. Register the driver. Either subscribe the package's event listener as the
   socialiteproviders docs prescribe, or follow the `SocialiteStubServiceProvider`
   shape and call `Socialite::extend('google', ...)` in your own provider.

3. Add config to `config/services.php`:

   ```php
   'google' => [
       'client_id'     => env('GOOGLE_CLIENT_ID'),
       'client_secret' => env('GOOGLE_CLIENT_SECRET'),
       'redirect'      => env('GOOGLE_REDIRECT_URI'),
   ],
   ```

4. Add controller methods or a new controller mirroring
   `SocialiteStubController` — one redirect, one callback. The callback's
   user-upsert + Passport token-mint code is identical regardless of provider;
   only the driver name (`'google'` vs `'stub'`) changes.
5. Add the routes alongside the stub routes.

The stub controller and a real-provider controller can coexist; gate the stub
behind `APP_ENV === 'local'` or `'testing'` if you want it disabled in
production environments.

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
