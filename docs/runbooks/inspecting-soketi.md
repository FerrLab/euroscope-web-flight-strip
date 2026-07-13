# Inspecting Soketi

[Soketi](https://soketi.app) is the WebSocket server we use for
realtime broadcasts (Pusher protocol). It exposes a small set of
HTTP endpoints for inspection and management on port `9601`. This
runbook collects the curl recipes that have been useful during
development.

We chose NOT to add a separate UI like
[soketi-ui](https://github.com/Daynnnnn/soketi-ui) — the curl
recipes below cover every observability question we've actually had.
If your need outgrows curl, soketi-ui is a one-line compose addition
(see the bottom of this doc).

## Setup

The default app config (in compose):

| Setting      | Value (from .env)      |
| ------------ | ---------------------- |
| App ID       | `${PUSHER_APP_ID}`     |
| App key      | `${PUSHER_APP_KEY}`    |
| App secret   | `${PUSHER_APP_SECRET}` |
| WS port      | `6001` (host)          |
| Metrics port | `9601` (host)          |

Replace `<APP_ID>` in the recipes below with your actual app ID
(check `apps/backend/.env` — defaults to `eurostrip-local`).

## The recipes

### Health check

```bash
curl -s http://localhost:9601/usage
```

Returns aggregated memory + uptime + connection counts. Used as our
healthcheck probe in compose (see the `soketi` service block in
`infra/docker-compose.yml`).

### Total connection count

```bash
curl -s http://localhost:9601/apps/<APP_ID>/connections | jq
```

Returns:

```json
{ "connections": 3, "max_connections": 0 }
```

(`0` for max means unlimited.)

### List active channels

```bash
curl -s http://localhost:9601/apps/<APP_ID>/channels | jq
```

Returns each channel with its subscriber count + occupancy.

### Inspect a specific channel

```bash
curl -s http://localhost:9601/apps/<APP_ID>/channels/private-user.42 | jq
```

For presence channels:

```bash
curl -s http://localhost:9601/apps/<APP_ID>/channels/presence-room.7/users | jq
```

### Trigger an event manually

The `POST /apps/<APP_ID>/events` endpoint requires an HMAC-SHA256
signature computed from the app SECRET — the algorithm is documented
at <https://pusher.com/docs/channels/library_auth_reference/rest-api/>.
Don't hand-roll it; let the Pusher SDK sign the request:

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php -r "
\$pusher = new Pusher\\Pusher(
  getenv('PUSHER_APP_KEY'),
  getenv('PUSHER_APP_SECRET'),
  getenv('PUSHER_APP_ID'),
  ['host' => 'soketi', 'port' => 6001, 'scheme' => 'http', 'useTLS' => false]
);
\$pusher->trigger('test-channel', 'test-event', ['hello' => 'world']);
"
```

### Tailing connection events live

```bash
docker compose --env-file .env -f infra/docker-compose.yml logs -f soketi
```

`SOKETI_DEBUG=1` is already set in compose — expect verbose
per-event logs.

### Browser-side WebSocket inspection

In Chrome DevTools → Network → WS filter. Look for the
`socket.io`-like polling fallback first; the actual WebSocket
upgrade is the row that stays open after the initial 101 Switching
Protocols.

## Common gotchas

- `localhost` resolves to `::1` inside the Soketi alpine image but
  Soketi binds IPv4 — for in-container probes always use `127.0.0.1`,
  never `localhost`. (See the healthcheck comment in the compose
  file.)
- Port 6001 speaks WebSocket only. HTTP probes against 6001 return
  garbage. Use 9601 for management.
- The auth signature on `/events` POSTs must use the app SECRET, not
  the app KEY. The SDK gets this right; don't hand-roll.
- Connection count includes idle connections — disconnect events
  arrive after a configurable timeout (default 60s).

## When curl isn't enough

If you find yourself needing a UI (live channel updates, search,
event history beyond the log tail), add
[soketi-ui](https://github.com/Daynnnnn/soketi-ui) to compose:

```yaml
soketi-ui:
  image: daynnnnn/soketi-ui:latest
  ports: ['3001:80']
  environment:
    SOKETI_HOST: soketi
    SOKETI_APP_ID: ${PUSHER_APP_ID}
    SOKETI_APP_KEY: ${PUSHER_APP_KEY}
    SOKETI_APP_SECRET: ${PUSHER_APP_SECRET}
```

(Reach for this if curl recipes cover <50% of what you need to see.)

## See also

- [Soketi docs](https://soketi.app/docs)
- [Pusher Channels HTTP API reference](https://pusher.com/docs/channels/library_auth_reference/rest-api/)
- [`../architecture/data-stores.md`](../architecture/data-stores.md)
