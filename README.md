# Azimuth

> Your companion from A to Z.

A full PDCA application for general aviation — navigation data, flight planning, route parsing, and operations management.

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
