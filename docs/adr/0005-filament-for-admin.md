# ADR 0005 — Filament for the Admin Panel

**Date:** 2026-05-05
**Status:** Accepted

## Context

Every bounded module in EuroStrip needs a CRUD-shaped admin UI gated by Spatie
permissions. Building this from scratch — even with a generic CRUD generator
— costs time we'd rather spend on domain features. The forces in play:

- We want admin UI per module to be a 50–100 LOC Filament resource, not a
  500–1,000 LOC bespoke controller + Blade tree.
- The admin panel must be gated by `Role::Admin` (per ADR 0003 / `Role` enum)
  and per-action by the module's `<Module>Permission` enum cases — same
  authorization stack as the rest of the application.
- The frontend is Next.js (Phase 3); the admin panel is the **only** Blade-
  rendered surface in the codebase. A heavy admin framework would normally
  be a coupling concern, but here it lives in its own walled garden.

## Decision

Use **Filament v4.x** as the admin panel, mounted at `/admin`. Each bounded
module owns a `Presentation/Filament/<Module>Resource.php` whose action gates
(`canViewAny`, `canCreate`, `canEdit`, `canDelete`) call
`auth()->user()?->can(<Module>Permission::<Case>->value)`. The panel itself is
gated by the Filament `canAccessPanel(Panel)` contract on `User`, which
checks `Role::Admin`.

The panel provider
([`AdminPanelProvider`](../../apps/backend/app/Providers/Filament/AdminPanelProvider.php))
auto-discovers resources from `app_path('Modules')` so that a new module's
resource is registered simply by existing on disk:

```php
->discoverResources(in: app_path('Modules'), for: 'App\\Modules')
```

This decision imposes the following constraints:

- Filament conventions (its base `Resource` class, its forms/tables DSL, its
  Blade page templates) leak into each module's `Presentation` layer. Domain
  and Application layers remain clean.
- Filament's pace of change drives the pace of major upgrades on the admin
  surface. A Filament major version bump is a coordinated change across
  every module's resource.

**Note on version.** The original Phase 1 spec called for Filament v3, but
v3 does not support Laravel 13. Phase 2 installed **Filament v4.x** instead.
The v4 API is broadly source-compatible with the v3 patterns the spec
described; the change is invisible at the call-site level and is recorded
here to avoid future confusion when reading older planning docs.

## Consequences

**Positive:**

- A new module's admin CRUD is roughly 80 lines of Filament resource code.
- Permission gates piggyback on the same `<Module>Permission` enum used by
  the bus middleware — one source of truth for authorization, one PHPStan
  rule guarding it.
- Auto-discovery means the per-module ServiceProvider does not need to
  register the resource; it shows up in `/admin` by being on disk.

**Negative:**

- Filament conventions reach into the `Presentation` layer of every module
  (its `Resource` base class, its DSLs). Acceptable because Presentation is
  the layer where framework coupling is permitted by design.
- Visual customization beyond the theming hooks Filament provides costs more
  than equivalent custom Blade. We accept this for the admin panel because
  visual polish is not the point — fast CRUD is.

**Neutral:**

- The panel is gated by `Role::Admin` only; per-action gates use atomic
  permissions. This matches the role-vs-permission pattern documented in
  [`docs/architecture/auth.md`](../architecture/auth.md) §6.
- Filament emits its own routes at boot. We do not reverse-route to
  Filament-managed URLs from outside the panel; if we ever need to, deep-
  link routes are stable per Filament's public API.

## Alternatives Considered

1. **Roll our own admin Blade tree.** Rejected — at our headcount the
   marginal LOC cost of every CRUD page is the wrong place to invest. The
   Filament tax is one major-version bump every ~18 months.
2. **Backpack for Laravel.** Rejected because its v6 ergonomics around
   per-resource permission gating are less direct than Filament's, and its
   active development is slower.
3. **Nova.** Rejected on cost (paid license) and ecosystem velocity (slower
   than Filament for our size of project).

## References

- [Phase 2 decision log — Filament for admin (no row; locked in spec).](../superpowers/specs/2026-05-05-eurostrip-scaffold-phase-2-decisions.md)
- [Original spec §5.6 — Filament admin at `/admin`.](../superpowers/specs/2026-05-02-eurostrip-scaffold-design.md)
- [`docs/architecture/auth.md`](../architecture/auth.md) §7 — Filament admin gate.
- Coverage:
  [`tests/Feature/Filament/AdminPanelGateTest.php`](../../apps/backend/tests/Feature/Filament/AdminPanelGateTest.php),
  [`tests/Feature/Modules/Ping/Filament/PingResourceTest.php`](../../apps/backend/tests/Feature/Modules/Ping/Filament/PingResourceTest.php).
