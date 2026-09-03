# VATSIM Connect OAuth2 login — design

- **Date:** 2026-09-03
- **Status:** Approved
- **Supersedes (in production):** [ADR 0004](../../adr/0004-stub-socialite-per-request-fixture.md)
- **Touches:** [ADR 0006](../../adr/0006-frontend-stack-and-cookie-auth.md) (session cookie `SameSite`)

## Goal

Real controllers sign in with their VATSIM account. The stub identity
disappears from the product surface and from production entirely, while
remaining available in non-production so e2e and local dev keep working
without VATSIM credentials.

## Decisions

1. **Stub survives only outside production.** Both stub HTTP endpoints
   `abort_if(app()->isProduction(), 404)` at request time (chosen over
   gating route _registration_, which boots once per test process before
   a test body can flip the environment and so cannot be exercised by a
   real HTTP test); driver registration is left unconditional since an
   unreachable extra Socialite driver has no security exposure on its
   own. The frontend applies the same idea against `NODE_ENV`: both stub
   route handlers 404 in production and the login page hides the stub
   button. Production has no reachable stub login.
2. **Profile scope is CID + name + email.** Scopes requested:
   `full_name`, `email` (email required). Rating, division and
   subdivision are deliberately not requested — nothing authorizes on
   them today, and the consent screen should ask only for what is used.
3. **Token crosses to the browser as a one-time code.** Laravel never
   puts the Bearer in a URL; it stores it in Dragonfly under a
   single-use code and Next.js redeems that code server-side, keeping
   ADR 0006 intact (Next.js owns the httpOnly cookie).

## Flow

```text
login page → GET  :3000/api/auth/vatsim-redirect?locale=en   (Next, thin)
           → 302  :8000/auth/socialite/vatsim/redirect        (Laravel)
           → 302  auth.vatsim.net/oauth/authorize             (consent)
           → 302  :8000/auth/socialite/vatsim/callback        (Laravel)
                    verify state → fetch profile → upsert by CID
                    → mint Passport token → stash under one-time code
           → 302  :3000/api/auth/vatsim-callback?code&locale  (Next)
                    POST code to :8000/auth/socialite/exchange
                    → Bearer → httpOnly cookie
           → 302  :3000/en/dashboard
```

## Identity model

`users` gains `vatsim_cid`: string, unique, nullable. Nullable because
stub and admin-seeded identities have no CID; unique because a CID
identifies exactly one account.

Resolution order in the callback:

1. Match on `vatsim_cid` — the stable identity.
2. Else match on `email` and **adopt** the row, setting its CID. This
   links pre-existing accounts (including stub rows in dev) on first
   VATSIM login instead of colliding with the unique email index.
3. Else create the user with a random password that is never used.

Email is a profile field, not an identity: VATSIM members change theirs.

First login assigns the `member` role — any VATSIM account may sign in.
No rating gate or allowlist. Recorded here because it is a policy
choice, not an accident: adding a gate later is a callback-level rule
and does not disturb this design.

## One-time exchange code

- `Str::random(64)`, stored at `auth:exchange:{code}` in Dragonfly with
  a 60-second TTL, value = the Passport access token.
- Redeemed with an atomic `GETDEL` so a replayed code cannot mint a
  second session.
- `POST /auth/socialite/exchange` is unauthenticated by necessity (the
  caller has no session yet) and therefore rate-limited; the code's
  entropy is the security boundary.

## Session cookie: `SameSite=Strict` → `Lax`

Required, not cosmetic. The final hop to `/{locale}/dashboard` is the
tail of a redirect chain that began cross-site at `auth.vatsim.net`;
browsers withhold `Strict` cookies on such navigations, so the dashboard
would not see the session and would bounce back to login. `Lax` still
withholds the cookie on cross-site POSTs, iframes and subresources — the
real CSRF vectors — and EuroStrip's API traffic goes through the
server-side Next.js proxy rather than browser-direct calls, so the
posture is unchanged in practice.

## Components

### Backend

- `socialiteproviders/vatsim` registered by a new
  `VatsimSocialiteServiceProvider` (mirrors the stub provider).
- `config/services.php` → `vatsim` block with `client_id`,
  `client_secret`, `redirect`, `test` (sandbox switch).
- `VatsimAuthController` — `redirect()` and `callback()`.
- `AuthExchangeController` — `POST /auth/socialite/exchange`.
- `ResolveSocialiteUser` — the upsert-and-role rule as one testable
  unit, so both the VATSIM and stub callbacks share identical identity
  semantics rather than duplicating them.
- Migration: `add_vatsim_cid_to_users`.

### Frontend

- `/api/auth/vatsim-redirect` and `/api/auth/vatsim-callback` route
  handlers; existing stub handlers gated behind the dev flag.
- Login page: VATSIM button always; stub button only when
  `NEXT_PUBLIC_ENABLE_STUB_LOGIN` is set.
- `auth.{en,pt}.json` gains button and failure copy.

## Error handling

- VATSIM denies consent or state mismatch → redirect to
  `/{locale}/login?error=oauth` with localized copy. No stack trace, no
  raw provider error surfaced.
- Profile missing CID or email → refuse the login, same error redirect;
  a session without a stable identity is not creatable.
- Exchange code absent, expired or already redeemed → Next redirects to
  login with the same error; no partial session is written.

## Testing

Every suite covers happy, invalid and garbage paths.

- **Backend callback:** new user created with CID and `member`;
  repeat login does not duplicate; email collision adopts the existing
  row; missing CID/email refused; provider exception → error redirect.
  Socialite is mocked — no network in tests.
- **Backend exchange:** code redeems once and returns the Bearer; a
  replayed code fails; unknown/malformed code fails.
- **Stub gating:** stub routes 404 under production env.
- **Frontend handler:** code exchanged → cookie set → dashboard;
  backend rejection → login with error; missing code → 400.
- **Login page:** VATSIM button renders; stub button hidden when the
  flag is unset.
- **e2e:** keeps the stub path; a real consent screen cannot be driven
  in CI.

## Out of scope

Rating-based authorization, allowlists, refresh-token rotation, and
VATSIM data-feed integration (online controller list). Each is a
separate change that this design does not block.
