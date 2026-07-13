# EuroStrip

> Web flight strips for EuroScope.

A web companion for EuroScope: controllers point the
[euroscope-websocket-connector](https://github.com/FerrLab/euroscope-websocket-connector)
plugin at this backend and interact with their session from the browser —
live flight data, protocol commands, and (soon) flight strips.

This is an Nx monorepo:

- `apps/web/` — Next.js 15 frontend
- `apps/backend/` — Laravel 13 backend (CQRS + UseCases on Octane/FrankenPHP)
- `libs/*` — shared TypeScript libraries
- `infra/` — Docker stack
- `docs/` — architecture, ADRs, runbooks, conventions

## Quick start

See `docs/runbooks/local-dev.md`.

## Architecture

See `docs/architecture/overview.md`.
