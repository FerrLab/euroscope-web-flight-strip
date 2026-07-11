# Gateway — EuroScope plugin transport & console

The Gateway module (`apps/backend/app/Modules/Gateway/`) connects a running
EuroScope instance to the web app through the
[euroscope-websocket-connector](https://github.com/FerrLab/euroscope-websocket-connector)
plugin, speaking [JSON Contract Protocol v1](https://github.com/FerrLab/euroscope-websocket-connector/blob/main/docs/PROTOCOL.md).
Design spec: `docs/superpowers/specs/2026-07-10-gateway-console-design.md`;
transport decision: [ADR 0009](../adr/0009-long-poll-gateway-transport.md).

## Endpoints

Plugin-facing (Bearer = the user's `gateway` token; `.wsc gateway url`
points at `/api/euroscope`):

| Route                                | Behavior                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/euroscope/messages`       | Batch ingest (≤200 msgs / 512 KB). Object entries stored verbatim; garbage entries dropped + logged, never a batch failure. `204`. |
| `GET /api/euroscope/poll?timeout=25` | Blocks ≤25 s on the command queue. `200 {"commands":[…]}` or `204`. Refreshes presence.                                            |

Browser-facing (cookie → Next proxy → Bearer):

| Route                                                     | Behavior                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST /api/gateway/commands`                              | Validate + queue one command (`type` forced, `id` auto-ULID); mirrored into the feed. Throttle 60/min/user. `202`. |
| `GET /api/gateway/console/poll?after=<cursor>&timeout=15` | Backfill (no cursor, instant) or blocking tail (≤15 s). Returns `messages`, `cursor`, `reset`, `pluginConnected`.  |
| `POST /api/gateway/token`                                 | Rotate: revoke old, mint Passport PAT named `gateway`, return secret once. `201`.                                  |
| `GET /api/gateway/token`                                  | `{exists, created_at}` — never the secret.                                                                         |

## Token boundary

Web sessions and the plugin both authenticate as the same user via Passport
PATs. The `EnsureGatewayToken` middleware turns the token **name** into the
boundary: plugin routes `require` the `gateway` name, browser gateway routes
`reject` it. A leaked gateway token cannot drive the web API; a web session
token cannot impersonate the plugin.

## `.wsc gateway config` encoding

EuroScope's `.wsc` command line rejects `/` and `:` in arguments, so the
token page never shows raw `.wsc gateway url`/`.wsc gateway token` lines.
Instead it shows one line: `.wsc gateway config <blob>`, where `<blob>` is
`base64url(<gateway base URL>:<token>)` — **base64url**, not standard
base64, because standard base64's alphabet includes `+` and `/` and a
JWT-length Passport token makes hitting `/` all but certain. The plugin
must: base64url-decode `<blob>` (`-`→`+`, `_`→`/`, restore `=` padding),
then split the result on the **last** `:` (the URL itself contains `:`,
e.g. `http://host:8000/api/euroscope`) to recover `<url>` and `<token>`.

## Runtime state (Dragonfly)

Three keys per user, nothing in Postgres (the token lives in Passport's
`oauth_access_tokens`):

| Key                            | Type                              | Purpose                                                                                                         |
| ------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `gateway:{userId}:messages`    | Stream, `XADD MAXLEN 200` (exact) | Ring buffer of all traffic; entry ID = console cursor. Fields: `direction` (`in`/`out`), `envelope` (raw JSON). |
| `gateway:{userId}:commands`    | List                              | Pending plugin commands. `BLPOP` + drain implements the plugin long-poll.                                       |
| `gateway:{userId}:plugin-seen` | String, `EX 35`                   | Set on every plugin poll → the console's connected badge.                                                       |

Prefix configurable via `GATEWAY_KEY_PREFIX` (`config/gateway.php`); tests
isolate per-process prefixes (`Tests\Support\Modules\Gateway\GatewayRedisTestSupport`).

## Sizing

Every held long-poll occupies one FrankenPHP worker: 1 per connected plugin
(25 s holds) + 1 per open console tab (15 s holds). Size `OCTANE_WORKERS`
accordingly; a handful of users is fine on defaults, dozens of concurrent
consoles is not. If that ceiling nears, drop the console hold to 0 and let
the client poll every ~2 s — same endpoint, same cursor semantics.

## Testing without EuroScope

`apps/web/e2e/support/fake-plugin.ts` speaks protocol v1 over HTTP (batch
POST + long-poll GET). The e2e spec `gateway-console.spec.ts` runs the whole
loop: login → token → event appears in console → command reaches the fake
plugin. Backend suites live in `tests/{Unit,Feature}/Modules/Gateway/` —
feature tests hit the real Dragonfly.
