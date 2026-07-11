# ADR 0003 — Permission as a Marker Interface (no raw strings)

**Date:** 2026-05-05
**Status:** Accepted

## Context

`spatie/laravel-permission` stores permission names as strings. Out of the box,
authorization checks are written as `Gate::authorize('ping.create')`,
`$user->can('ping.create')`, etc. This style has two problems that compound
over the lifetime of a codebase:

- **Drift.** Renaming a permission requires a project-wide string find-and-
  replace. Misses leave silently-failing call-sites that never throw a 403 but
  always return false.
- **Leakage.** New permissions sneak in by typo (`'ping.creat'`), get inserted
  in the database via migrations or ad-hoc seeders, and accumulate as orphans
  with no single source of truth listing what permissions actually exist.

Phase 2 needs an authorization model that catches both classes of problem at
compile time and supports a reflective seeder that reconciles the database
against the source-of-truth list.

## Decision

Every module declares its permissions as a string-backed PHP enum that
implements the marker interface
`App\Authorization\Contracts\Permission` (which itself extends `BackedEnum`):

```php
enum PingPermission: string implements Permission
{
    case View   = 'ping.view';
    case Create = 'ping.create';
}
```

A custom PHPStan rule (Phase 2 Task 23) flags any literal-string argument to
`Gate::authorize`, `Gate::allows`, `Gate::denies`, `Gate::check`, or
`policy(...)`. All authorization sites must pass `<Enum>::Case->value`.

This decision imposes the following constraints:

- Every module owns one `<Module>Permission` enum, conventionally located
  under `app/Modules/<Module>/Domain/`.
- The string value of each case is the wire-format name; cases must use the
  conventional `<module>.<action>` shape (e.g. `'ping.view'`).
- Adding or renaming a permission is a code change, not a database migration.
  The reconciler seeder
  ([`PermissionsSeeder`](../../apps/backend/database/seeders/PermissionsSeeder.php))
  upserts new cases and deletes orphaned rows on each run.
- The `Role` enum at `app/Authorization/Roles/Role.php` does **not** implement
  `Permission` — roles are aggregated permissions, not the unit of
  authorization. The marker only applies to atomic permissions.

## Consequences

**Positive:**

- Compile-time safety against permission-name typos. PHPStan catches the
  string before it hits production.
- Renaming a case is an IDE rename refactor across the entire codebase.
- The seeder uses pure reflection (no per-module registration) — discovering
  every enum implementing `Permission` and reconciling. Adding a permission
  is one line of PHP.
- Tests can introspect the enum to drive parameterized authorization tests.

**Negative:**

- One extra file per module (the enum). For modules with one permission this
  feels like overhead; for modules with several it pays for itself
  immediately.
- Developers transitioning from raw-string Spatie codebases need to learn the
  pattern. The PHPStan rule provides a fast feedback loop.

**Neutral:**

- The seeder runs on every deploy and on test setup. For a project with
  hundreds of permissions the reflective discovery walk is still O(n) over
  module files; it has not shown up in profiling.
- Permissions are added by editing the enum, not by writing migrations. This
  is a workflow change for teams used to permission migrations, not a loss of
  capability.

## Alternatives Considered

1. **Const-class registry.** A single `Permissions` class with `public const
PING_VIEW = 'ping.view'` cases. Rejected because it centralizes permission
   ownership outside the bounded module — every new module would have to edit
   a shared class.
2. **PHPStan rule that verifies strings against a registry array.** Rejected
   because it requires a runtime-registered list (which still drifts) or a
   manually curated array (which still drifts). The enum carries the
   constraint in the type system itself.
3. **Spatie's built-in `Permission::create()` per migration.** Rejected
   because it scatters permission definitions across migrations, makes
   renaming a multi-step operation, and provides no mechanism for orphan
   removal.

## References

- [Phase 2 decision log row 5.](../superpowers/specs/2026-05-05-eurostrip-scaffold-phase-2-decisions.md)
- [Original spec §5.6 — Spatie packages.](../superpowers/specs/2026-05-02-eurostrip-scaffold-design.md)
- [`docs/architecture/auth.md`](../architecture/auth.md) §5 (permission contract) and §6 (call-sites).
- CLAUDE.md hard rule #3 — no raw permission strings.
