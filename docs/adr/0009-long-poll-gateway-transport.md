# ADR 0009 — Long-poll gateway transport over Redis Streams (no Soketi)

**Date:** 2026-07-10
**Status:** Accepted

## Context

The euroscope-websocket-connector plugin speaks plain HTTPS despite its
name: it POSTs batched protocol messages and long-polls `GET /poll` for
commands. v1 of the gateway needs to relay that traffic to and from a
browser console, live. The stack already runs Soketi (Pusher protocol) for
future realtime features, so pushing events to the browser over websockets
was the obvious candidate.

## Decision

The browser long-polls too, symmetric with the plugin. All runtime state
lives in Dragonfly:

- A **Redis Stream** per user (`XADD MAXLEN 200`, exact) is simultaneously
  the ring buffer, the cursor source (entry IDs), and the long-poll wait
  (`XREAD BLOCK`). Backfill and live tail are one endpoint.
- A **list** per user is the plugin command queue (`BLPOP` + drain).
- A **TTL key** per user is plugin presence.

Messages are never written to Postgres (live-only, per the spec decision);
the gateway token is a Passport PAT whose name (`gateway`) is enforced as
the plugin/web boundary by middleware.

## Consequences

- One transport mechanism end to end; no Pusher client, channel auth, or
  broadcast events to maintain. Dropping a browser consumer costs nothing.
- Each held poll pins an Octane worker (see `architecture/gateway.md`
  sizing note) — acceptable for v1's user counts, revisit if consoles
  multiply; the escape hatch (client-side short polling) needs no redesign.
- `position_updated` volume never touches Postgres; the ring self-trims.
- Soketi stays in the stack for future features but the gateway does not
  depend on it.
