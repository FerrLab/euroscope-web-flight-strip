# Azimuth Backend

Laravel 13 + Octane/FrankenPHP application for the Azimuth platform.

This app follows a CQRS three-layer architecture (Command/Query → Handler →
UseCase). See [`docs/architecture/backend.md`](../../docs/architecture/backend.md)
for the layered design, and [`CLAUDE.md`](../../CLAUDE.md) at the repo root for
the workspace-wide collaboration rules.

## Local development

Bring the stack up via the workspace runbook:
[`docs/runbooks/local-dev.md`](../../docs/runbooks/local-dev.md).

## Testing

```bash
pnpm nx test backend
```

## Linting

```bash
pnpm nx lint:fix backend
```

Pint runs as part of the lint:fix target — it must be clean before any
backend change is considered "done".

## API documentation

Scramble auto-generates the OpenAPI document at `/docs/api` on every boot.
The generated `openapi.json` is the input to `libs/api-client`; CI fails if a
public route is missing from the document.
