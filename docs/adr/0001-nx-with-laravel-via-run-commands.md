# ADR 0001 — Nx with Laravel via run-commands

**Date:** 2026-05-02
**Status:** Accepted

## Context

EuroStrip is a monorepo containing a Next.js frontend (TypeScript) and a Laravel backend (PHP). We chose Nx as the monorepo orchestration tool. Nx is fundamentally TypeScript/JavaScript-oriented; PHP support is not first-class. We needed a way to expose the Laravel app as a real Nx project so that:

- `nx serve`, `nx test`, `nx lint`, etc., work uniformly across both apps
- `nx affected` correctly picks up backend changes and re-runs only what's needed
- CI surface is the same set of commands for both stacks

## Decision

Treat `apps/backend/` as a normal Laravel install (vendored via `composer create-project`), and expose it to Nx via a hand-authored `apps/backend/project.json` whose targets use `nx:run-commands`. Each target shells into the `backend` Docker container (`docker compose exec backend ...`) so the same target runs identically on a developer machine and in CI.

We deliberately avoid third-party Nx-PHP plugins because:

- They tend to bitrot relative to Nx core releases
- The wrapping is thin enough (~80 lines of JSON) that maintaining it ourselves is cheaper than tracking a dependency
- We retain full control over how each command is invoked (Docker exec vs. local, with vs. without TTY, etc.)

## Consequences

**Positive:**

- One muscle-memory command surface across both apps
- `nx affected` works on backend changes (because Nx tracks the project's source root)
- CI parallelism via `nx affected --parallel` applies to both stacks
- Adding new targets (e.g. `nx deptrac backend`) is one JSON edit

**Negative:**

- Nx doesn't introspect PHP source, so file-level dependency tracking inside the backend is opaque to Nx. We rely on `inputs` definitions in `project.json` to scope cache invalidation. This is fine for our use because backend tasks rerun from clean state inside the container anyway.
- `project.json` is hand-maintained; we don't get the Nx generators we get for `@nx/next` projects. The cost is small — backend gains a new target maybe once a phase.

## Alternatives Considered

1. **Two top-level repos joined by pnpm workspaces** — rejected because we lose the Nx affected-graph and the unified command surface, which were the reasons to pick Nx in the first place.
2. **A community Nx PHP plugin** — rejected because of maintenance risk; see Decision above.
3. **Nx wraps the JS side only; backend is a sibling top-level project unmanaged by Nx** — rejected because `nx affected` would never see backend changes and CI would need a parallel invocation strategy for the backend, defeating the unified-surface goal.
