# EuroScope Gateway & Console — Design

**Date:** 2026-07-10
**Status:** Approved
**Scope:** v1 of EuroStrip — login, gateway token
management, and a raw JSON console to watch/send protocol payloads.

## 1. Purpose

EuroStrip is a web UI for interacting with a running
EuroScope instance through the
[euroscope-websocket-connector](https://github.com/FerrLab/euroscope-websocket-connector)
plugin. The plugin speaks **JSON Contract Protocol v1**
([PROTOCOL.md](https://github.com/FerrLab/euroscope-websocket-connector/blob/main/docs/PROTOCOL.md)):
despite the repo name, transport is plain HTTPS — the plugin POSTs
batched messages to `{base}/messages` and long-polls
`GET {base}/poll?timeout=25` for commands, authenticated with a Bearer
token configured via `.wsc gateway url` / `.wsc gateway token`.

v1 delivers the minimum loop: a controller logs in, creates a gateway
token, points their plugin at this backend, and gets a live console —
every event/response the plugin emits, plus a composer to send raw
command envelopes back.

Flight-strip UI is explicitly **out of scope** for v1; it will be built
later on top of this plumbing.

## 2. Decisions (settled during brainstorming)

| # | Decision | Choice |
| --- | --- | --- |
| 1 | v1 watch/send surface | Raw JSON console (live feed + JSON composer) |
| 2 | Token model | **One gateway token per user**; "create" rotates and revokes the previous one |
| 3 | Tenancy | Private per user — your token → your plugin → your console only |
| 4 | Login | Keep the scaffold's stub Socialite login; VATSIM Connect OAuth is a later phase (same controller pattern) |
| 5 | Persistence | Live-only. No Postgres rows for messages; a Redis ring buffer (~200 msgs/user) backfills the console on load |
| 6 | Browser realtime | **Long-polling, not Soketi** — symmetric with the plugin transport |
| 7 | Architecture | New `Gateway` CQRS module, all runtime state in Dragonfly (Redis Streams + lists) |

## 3. Endpoints

All endpoints live in the Laravel backend, `app/Modules/Gateway/`.

### Plugin-facing (Bearer = gateway token)

| Route | Behavior |
| --- | --- |
| `POST /api/euroscope/messages` | Accepts `{"messages":[...]}` (≤200 entries / 512 KB). Each JSON-object entry is appended verbatim to the user's message stream tagged `direction: in`. Non-object entries are dropped and logged — never fail the batch. Returns `204`. |
| `GET /api/euroscope/poll?timeout=25` | Blocks up to `min(timeout, 25)`s on the user's command queue. Returns `200 {"commands":[...]}` (drains everything queued) or `204` on timeout. Refreshes the presence key on every call. |

### Browser-facing (httpOnly cookie → Next.js proxy → Bearer)

| Route | Behavior |
| --- | --- |
| `POST /api/gateway/commands` | Validates one command envelope (object; `action` string required; `type` coerced to `"command"`; `id` auto-assigned if absent). Pushes to the command queue and mirrors into the message stream as `direction: out`. Rate limit 60/min/user. |
| `GET /api/gateway/console/poll?after=<cursor>&timeout=15` | Tails the message stream after `cursor` (Redis stream entry ID), blocking up to 15s. No `after` → returns the full ring buffer (backfill). If `after` was trimmed out of the ring, returns the full buffer with `reset: true`. Every response includes `pluginConnected: bool` from the presence key. |
| `POST /api/gateway/token` | Rotates: revokes any existing gateway token, mints a Passport PAT named `gateway`, returns the plaintext secret **once** plus `created_at`. |
| `GET /api/gateway/token` | Metadata only: `{ exists, created_at }`. Never the secret. |

### Token boundary

Web-login tokens and the gateway token are both Passport PATs on the
same user, so by default each would authenticate on the other's
endpoints. An `EnsureGatewayToken` middleware on plugin routes requires
the presenting token's **name** to be `gateway`; the console/token
routes conversely reject gateway-named tokens. Token name becomes an
enforced authorization boundary — no Passport scopes machinery needed.

## 4. Runtime state (Dragonfly)

Three keys per user; nothing else. Postgres gains **no new tables**
(the token lives in Passport's existing `oauth_access_tokens`).

| Key | Type | Purpose |
| --- | --- | --- |
| `gateway:{userId}:messages` | Stream, `XADD MAXLEN ~200` | Ring buffer of all traffic (plugin events/responses + mirrored sent commands). Entry ID doubles as the console cursor. Fields: `direction` (`in`/`out`), `envelope` (raw JSON string). |
| `gateway:{userId}:commands` | List | Commands awaiting the plugin. Blocking pop with timeout implements the plugin long-poll; on wake, remaining entries are drained non-blocking so a batch goes out in one response. |
| `gateway:{userId}:plugin-seen` | String, `EX 35` | Set on every plugin poll. Existence ⇒ "plugin connected". |

### Flows

- **Watch:** plugin `POST /messages` → `XADD` per envelope → browsers
  blocked in `XREAD BLOCK` wake with the new entries.
- **Send:** browser `POST /commands` → `RPUSH` (wakes the plugin's
  blocked poll) + mirrored `XADD`. The plugin's `response` later
  arrives via the watch flow; the console correlates by `id`.

## 5. Module layout (pure CQRS, mirrors Ping)

```text
app/Modules/Gateway/
├── Domain/
│   ├── GatewayPermission.php        # enum implements Permission
│   ├── GatewayStreamRepository.php  # interface — append/tail/backfill
│   └── CommandQueueRepository.php   # interface — enqueue/blocking drain
├── Application/
│   ├── Commands/   RecordPluginMessages{Command,Handler}
│   │               EnqueueGatewayCommand{Command,Handler}
│   │               RotateGatewayToken{Command,Handler}
│   └── Queries/    PollPluginCommands{Query,Handler}
│                   TailConsoleMessages{Query,Handler}
│                   GetTokenStatus{Query,Handler}
├── Infrastructure/
│   ├── RedisGatewayStreamRepository.php
│   ├── RedisCommandQueueRepository.php
│   └── GatewayServiceProvider.php
└── Presentation/Http/
    ├── PluginTransportController.php   # /messages, /poll
    ├── ConsoleController.php           # /commands, /console/poll
    ├── TokenController.php             # token rotate + status
    ├── Requests/…
    ├── Middleware/EnsureGatewayToken.php
    └── routes.php
```

Design notes:

- Every Command/Query declares `permission(): GatewayPermission` —
  cases: `UseGateway` (plugin transport), `UseConsole` (watch/send),
  `ManageToken`. Seeded to the `member` role by the existing
  reconciler seeder.
- **Blocking lives in Infrastructure.** `XREAD BLOCK` / blocking pop
  are repository implementation details; handlers stay one-line thin
  and Domain never sees Redis.
- `PollPluginCommands` is deliberately a **Query** even though the
  drain mutates Redis: it's transport acknowledgment, not domain
  state, and the query bus keeps it out of `TransactionMiddleware` —
  a 25-second held DB transaction would be a bug.
- No Filament resource in v1 — there is nothing to administer beyond
  users, which Filament already covers.

## 6. Frontend

Two new pages behind the existing auth guard, feature folder
`apps/web/src/features/gateway/` (slice, `api.ts`, `schema.ts`,
`useGatewayPoll.ts`, components). i18n catalogs `gateway.en.json` /
`gateway.pt.json`. Squared UI per house rules; the feed is monospace.

### `/[locale]/token`

- Shows token metadata (`created_at`) or an empty state.
- **Generate/Rotate** button with confirm step (rotation disconnects
  the currently connected plugin).
- On creation: one-time reveal — the secret plus copy-ready
  `.wsc gateway url https://…/api/euroscope` and
  `.wsc gateway token <secret>` lines. Navigating away loses the
  secret permanently (by design).

### `/[locale]/console`

- **Feed:** newest-last rows — direction glyph (▼ in / ▲ out), `type`,
  `action`, `callsign`, timestamp — expandable to pretty-printed JSON.
  Client caps memory at ~500 rows (server ring is 200; the cap only
  guards long-lived tabs). Auto-scroll with pause toggle; pause stops
  scrolling, never polling.
- **Composer:** JSON textarea validated by a zod envelope schema
  (object; `action` required; `type` forced to `command`; `id`
  auto-filled). Sent commands appear in the feed via the backend
  mirror — no client-side optimistic state.
- **Status header:** ● connected / ○ plugin offline from
  `pluginConnected`, plus poll-loop health (live / backing off).

### Polling engine — `useGatewayPoll`

One loop per mounted console: fetch
`/api/proxy/gateway/console/poll?after=<cursor>` with a client
timeout slightly above the 15s server hold → dispatch new messages →
advance cursor → immediately re-poll. Errors back off exponentially
(1s → 30s) and surface in the status header. `AbortController` on
unmount. First poll (no cursor) receives the backfill; `reset: true`
replaces the slice contents instead of appending.

### Risk to verify early

The Next.js proxy route (`/api/proxy/[...path]`) must pass a
15-second held response through without buffering or timing out.
Verify in the first implementation task. Fallback if it misbehaves:
serve console polls with `timeout=0` (instant) and poll every 2s —
same endpoint, same cursor semantics, no design change.

## 7. Error handling

- **Pass-through ingestion.** The backend is transport, not validator:
  any JSON object in a plugin batch is stored verbatim (unknown
  actions/fields included — protocol v1 is additive). Non-object
  entries are dropped and logged; the batch never 4xxs over one bad
  entry, because the plugin drops messages permanently on failure.
- **Caps:** request-validation enforces ≤200 messages and 512 KB body
  on `/messages`.
- **Auth failures** return plain `401`/`403`; the plugin parks its
  retry at max backoff per protocol — no special handling here.
- **Trimmed cursor** → `reset: true` + full buffer (see §6).
- **Octane sizing:** every held long-poll occupies a FrankenPHP
  worker (1 per connected plugin + 1 per open console tab). Worker
  count and the 25s/15s holds are explicit config, documented in
  `docs/architecture/gateway.md` with the scaling caveat.

## 8. Testing

TDD throughout; every suite covers happy, invalid, and garbage paths.

- **Pest feature:** plugin ingest (valid batch, oversized, garbage
  entries mixed with good ones), plugin poll (drain, 204 timeout,
  presence refresh), console poll (backfill, cursor advance, trimmed
  reset, `pluginConnected`), command enqueue (validation, rate limit,
  stream mirror), token rotate (old revoked, secret shown once,
  metadata endpoint), `EnsureGatewayToken` both directions (web token
  rejected on plugin routes; gateway token rejected on console
  routes).
- **Pest unit:** handlers against in-memory fake repositories; Redis
  repository implementations against real Dragonfly (present in the
  compose stack and CI).
- **Vitest:** zod envelope schema, gateway slice (append / cap /
  reset), `useGatewayPoll` (mocked fetch: backfill → live → error
  backoff → recovery), feed + composer components.
- **Playwright e2e:** full loop with a **fake plugin** helper (a
  script speaking protocol v1 over HTTP): login → create token → fake
  plugin connects → `flight_updated` appears in console → send
  `set_squawk` → fake plugin's poll receives it. The helper doubles
  as a manual dev tool (no EuroScope needed).
- Backend gates: Pint, Pest, PHPStan, Deptrac.

## 9. Documentation deliverables

- `docs/architecture/gateway.md` — this design, evergreen.
- ADR 0009 — long-poll transport over Redis Streams; records the
  "why not Soketi for this feature" rationale.
- `docs/architecture/overview.md` — topology updated with the Gateway
  module and plugin transport.
- `README.md` + `CLAUDE.md` intro — rebrand from EuroStrip to
  **EuroStrip** (rules, stack, and workflow sections
  unchanged).

## 10. Out of scope (v1)

- Flight-strip UI (bays, strips, drag/drop) — later phase on this
  plumbing.
- VATSIM Connect OAuth — later phase via the Socialite pattern
  (`docs/runbooks/adding-a-socialite-provider.md`).
- Multi-token support, session sharing/mentoring views, message
  persistence/history, Filament gateway admin, structured command
  forms.
