# Adding a Socialite provider

This runbook walks through extending Azimuth's Socialite-based auth
with a real OAuth provider, using the existing stub as the template.
Worked example: GitHub.

## Architecture recap

- Backend uses Laravel Socialite + Passport. The stub provider
  (`stub`) is wired identically to a real provider — same callback
  shape, same identity resolution, same Passport personal-access-token
  issuance — so adding a real provider is mostly config + secrets +
  driver registration.
- Frontend posts to `/api/auth/<provider>-redirect` (Next.js route
  handler), which kicks off the OAuth round-trip. After the provider
  redirects back to Laravel's `/auth/socialite/<provider>/callback`,
  the Next.js `<provider>-callback` handler proxies the token JSON,
  stores the Bearer in an httpOnly cookie, and redirects to
  `/<locale>/dashboard`.
- Bearer never reaches browser JS. See [`../architecture/auth.md`](../architecture/auth.md).
- The stub uses a self-redirect (no real IdP). For a real provider,
  the frontend redirect handler points the browser straight at
  Laravel's `/auth/socialite/<provider>/redirect`, which then bounces
  through the IdP and lands on `/auth/socialite/<provider>/callback`.

## The steps

### 1. Provision OAuth credentials

For GitHub: <https://github.com/settings/developers> → New OAuth App.

- Application name: `Azimuth (dev)`, `Azimuth (prod)`, etc.
- Homepage URL: `http://localhost:3000` (dev) or your production URL.
- Authorization callback URL: `http://localhost:8000/auth/socialite/github/callback`
  (dev) — this is the **Laravel** route, NOT the Next.js proxy.
- Copy the Client ID and generate a Client Secret.

(For Google: <https://console.cloud.google.com> → APIs & Services →
Credentials → OAuth 2.0 Client ID. Same callback shape.)

### 2. Install the provider package

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  composer require socialiteproviders/github
```

For Google, the official `laravel/socialite` package already ships
the driver — skip this step. Most third-party providers live in the
[SocialiteProviders ecosystem](https://socialiteproviders.com).

### 3. Register the driver

Two options — pick the one that matches the package's docs.

**Option A — service provider (matches the stub).** Create
`apps/backend/app/Providers/GitHubSocialiteServiceProvider.php`
modelled on `SocialiteStubServiceProvider`. In `boot()`, call
`$factory->extend('github', fn ($app) => new GitHubProvider(...))`
using `SocialiteProviders\GitHub\Provider` and the `services.github`
config block from step 4.

**Option B — event listener (the SocialiteProviders convention).**
Create `apps/backend/app/Providers/EventServiceProvider.php` that
extends `Illuminate\Foundation\Support\Providers\EventServiceProvider`
with:

```php
protected $listen = [
    \SocialiteProviders\Manager\SocialiteWasCalled::class => [
        \SocialiteProviders\GitHub\GitHubExtendSocialite::class.'@handle',
    ],
];
```

Register the chosen provider in `apps/backend/bootstrap/providers.php`.
Never enable both — you'll double-register the driver and the second
registration wins silently.

### 4. Wire credentials in config/services.php

Append to `apps/backend/config/services.php` (alongside the existing
`stub` block):

```php
'github' => [
    'client_id' => env('GITHUB_CLIENT_ID'),
    'client_secret' => env('GITHUB_CLIENT_SECRET'),
    'redirect' => env('GITHUB_REDIRECT_URI', 'http://localhost:8000/auth/socialite/github/callback'),
],
```

Add to `apps/backend/.env.example`:

```dotenv
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:8000/auth/socialite/github/callback
```

### 5. Backend routes

Add to `apps/backend/routes/web.php`, mirroring the stub:

```php
use App\Http\Controllers\Auth\GitHubSocialiteController;

Route::get('/auth/socialite/github/redirect', [GitHubSocialiteController::class, 'redirect'])
    ->name('auth.socialite.github.redirect');
Route::get('/auth/socialite/github/callback', [GitHubSocialiteController::class, 'callback'])
    ->name('auth.socialite.github.callback');
```

### 6. Backend controller

Create `apps/backend/app/Http/Controllers/Auth/GitHubSocialiteController.php`,
modelled directly on `SocialiteStubController`. The two methods:

- `redirect()` — `return Socialite::driver('github')->scopes(['user:email'])->redirect();`
  (GitHub needs the `user:email` scope to surface the email).
- `callback()` — call `Socialite::driver('github')->user()`,
  `User::firstOrCreate(['email' => $providerUser->getEmail()], ...)`,
  assign the `member` role, mint a Passport token via
  `$user->createToken('github-login')->accessToken`, and return the
  same `{access_token, token_type, user}` JSON shape the stub returns.

If you end up with multiple real providers, extract the shared
`firstOrCreate + role + token` block into a `UserIdentityResolver`
and call it from each controller. Today the stub inlines it; that's
fine for one provider and starts to chafe at two.

### 7. Frontend redirect handler

```bash
mkdir -p apps/web/src/app/api/auth/github-redirect
```

Write `apps/web/src/app/api/auth/github-redirect/route.ts`. Unlike
the stub, this one points at the **backend** redirect endpoint —
that's where the real IdP round-trip starts:

```ts
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.AZIMUTH_BACKEND_URL ?? 'http://127.0.0.1:8000';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get('locale') ?? 'en';
  // Persist locale across the OAuth round-trip so the callback handler
  // can land the user on the right /<locale>/dashboard.
  const res = NextResponse.redirect(`${BACKEND_URL}/auth/socialite/github/redirect`, 302);
  res.cookies.set('azimuth_oauth_locale', locale, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
```

### 8. Frontend callback handler

The provider redirects the **browser** straight to Laravel's
`/auth/socialite/github/callback`, which returns JSON. We need to
intercept that. The cleanest pattern: register a second backend
route (or the same one with a `Location` header) that 302's to the
Next.js handler with the token in a short-lived signed payload, OR
have the frontend handler call the backend callback server-to-server
after the IdP hop. Phase 2 does the latter for the stub. For real
OAuth the cleanest approach is:

1. Backend `callback` redirects to `http://localhost:3000/api/auth/github-callback?token=<signed>` instead of returning JSON.
2. The Next.js `github-callback` handler verifies the signed token, sets the cookie, redirects to `/<locale>/dashboard`.

For a first-pass implementation, cheat: have the backend `callback`
return HTML that POSTs the JSON to the Next.js handler. Whichever
you pick, write `apps/web/src/app/api/auth/github-callback/route.ts`
modelled on `stub-callback/route.ts` — `buildSessionCookie` from
`@/shared/auth/cookie`, locale via the `azimuth_oauth_locale` cookie
set in step 7.

### 9. Frontend login UI

Edit `apps/web/src/app/[locale]/login/page.tsx`:

```tsx
<Link href={`/api/auth/github-redirect?locale=${locale}`}>
  <Button variant="secondary" className="w-full">
    {t('continueWithGitHub')}
  </Button>
</Link>
```

Add `auth.continueWithGitHub` to **every** locale catalog under
`apps/web/src/messages/auth.<locale>.json` (currently `en` and `pt`).
ESLint enforces no hardcoded strings; the missing key will trip
next-intl in CI.

### 10. TDD a feature test

Mirror `tests/Feature/Auth/SocialiteStubTest.php` and cover all three
paths per [`../conventions/tdd.md`](../conventions/tdd.md):

- **happy** — `Socialite::shouldReceive('driver->user')` returns a
  populated `Laravel\Socialite\Two\User`; assert 200 + a string
  `access_token` + the `User` row exists.
- **invalid** — provider returns a user with no email; assert 422 or
  the redirect to your friendly error page.
- **garbage** — `shouldReceive` throws; assert 502 with an i18n
  error key (no raw English in the response).

Run only this suite while iterating:

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend \
  ./vendor/bin/pest --filter=GitHubSocialite
```

### 11. Lint, types, full tests

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pint
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/phpstan analyse --memory-limit=2G
pnpm nx test web
pnpm lint:docs
```

Pint and PHPStan are part of "done" for backend changes (CLAUDE.md
hard rule #4).

### 12. Update docs

- `docs/architecture/auth.md` — add the new provider to the supported
  drivers list and update the §3 sequence diagram if the flow shape
  diverges from the stub.
- `apps/backend/.env.example` — provider credentials (already in step 4).
- This runbook — bump if the recipe needed adjustment for your
  provider.
- ADR if you made a non-trivial decision (provisioning rules,
  account-linking strategy, scope choices).

### 13. Open the PR

Title: `feat(auth): GitHub Socialite provider`. Body should call out:

- Driver registration approach (service provider vs event listener).
- Provisioning rules (default role, allowlist).
- Any scope choices and why.
- The three TDD paths covered.

## Common gotchas

- **Email scopes.** GitHub doesn't return email by default — request
  the `user:email` scope (shown in step 6). Other providers have
  similar quirks; check the package README before debugging "why is
  email null".
- **Mock Socialite in tests.** Never make real OAuth calls in CI.
  `Socialite::shouldReceive('driver->user')` is the standard pattern.
- **Redirect URI must match exactly** what's registered with the
  provider — protocol, host, port, path, trailing slash. A 1-byte
  mismatch is a 30-minute debugging session.
- **`bootstrap/providers.php`, not `config/app.php`.** Laravel 11+
  removed the `providers` array in `config/app.php`; this repo is
  on 13. Register new providers in `bootstrap/providers.php`.
- **Don't use both option A and option B from step 3.** Either the
  service provider OR the event listener registers the driver.
  Doing both double-registers and the second one wins silently.
- **`next.config.js` images.** If you display profile pictures from
  the provider's CDN, add the avatar host to `images.remotePatterns`.
- **CSRF.** The Socialite redirect/callback routes live in
  `routes/web.php` and run through web middleware. Laravel's CSRF
  middleware excludes external POSTs — but if you proxy the callback
  through Next.js with a POST, double-check the exclusion.

## See also

- [`../architecture/auth.md`](../architecture/auth.md)
- [`../adr/0004-stub-socialite-per-request-fixture.md`](../adr/0004-stub-socialite-per-request-fixture.md)
- [Laravel Socialite docs](https://laravel.com/docs/13.x/socialite)
- [SocialiteProviders ecosystem](https://socialiteproviders.com)
- Stub references in this repo:
  - [`apps/backend/app/Authentication/Socialite/StubProvider.php`](../../apps/backend/app/Authentication/Socialite/StubProvider.php)
  - [`apps/backend/app/Http/Controllers/Auth/SocialiteStubController.php`](../../apps/backend/app/Http/Controllers/Auth/SocialiteStubController.php)
  - [`apps/backend/app/Providers/SocialiteStubServiceProvider.php`](../../apps/backend/app/Providers/SocialiteStubServiceProvider.php)
  - [`apps/web/src/app/api/auth/stub-redirect/route.ts`](../../apps/web/src/app/api/auth/stub-redirect/route.ts)
  - [`apps/web/src/app/api/auth/stub-callback/route.ts`](../../apps/web/src/app/api/auth/stub-callback/route.ts)
