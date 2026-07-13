# EuroStrip — Phase 2 Scope-Validation & Decision Log

**Date:** 2026-05-05
**Status:** Approved (pending written-spec review)
**Author:** Brainstormed with Kewyn Ferreira
**Parent spec:** `docs/superpowers/specs/2026-05-02-eurostrip-scaffold-design.md` §13.2
**Predecessor handoff:** `docs/runbooks/phase-2-handoff.md`

---

## 1. Purpose

This is a **delta document**, not a fresh design. The original scaffold spec already covers Phase 2 in §13.2; this addendum:

1. Confirms scope hasn't drifted since 2026-05-02.
2. Locks the seven decisions surfaced during the brainstorming pass.
3. Pins the canonical module shape (Ping) so the implementation plan can reference it without re-deriving it from §5.

Implementation plan-writing must consume **both** documents: §13.2 for scope, this file for decisions.

---

## 2. Confirmed scope (no drift)

Phase 2 §13.2 stands as-is with one substitution and zero deletions:

- **Substitution:** Pest replaces PHPUnit as Phase 2 task #1. Laravel 13 ships PHPUnit 12 by default; converting tests later costs more than starting on Pest.
- All other deliverables remain in scope: every Laravel package from §5.6 (Octane on FrankenPHP, Horizon, Passport, Pennant, Precognition, Cashier migrations only, Echo + pusher-php-server, Scout + Typesense, Socialite + stub driver, Filament at `/admin`, Scramble at `/docs/api`, Spatie browsershot/translatable/data, spatie/laravel-permission v7), the `app/Cqrs` namespace + bus + middleware pipeline, the `app/Modules/Ping` module across Domain/Application/Infrastructure/Presentation, PHPStan/Larastan level 8 + Deptrac with the four-layer ruleset + the custom raw-permission-string rule, ADRs 0002–0005 + 0007, architecture docs `cqrs.md` / `auth.md` / `data-stores.md`, and the `test-backend` CI job.

---

## 3. Decision log

| # | Decision | Locked choice | Rationale |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1 | Test runner | **Pest** (migrate from PHPUnit in Phase 2 task #1) | Spec calls for Pest; later migration costs more |
| 2 | GitHub remote rename (`FerrLab/vector` → `FerrLab/eurostrip`) | **Defer** until Phase 2 is on a feature branch | Cosmetic; one-shot rename when branch is up |
| 3 | Phase 1 deviations in spec | **Patch §13.1** (done in commit `923bcc1`) | Cold readers shouldn't be misled |
| 4 | Phase 3 parallelism | **Strict serial** for now; revisit at Phase 2 task ~20 (after Ping HTTP routes are live) | Phase 2 already has 25+ tasks; CQRS contracts touch foundation; interleaving risks rework |
| 5 | Permission contract shape | **Marker interface**: `interface Permission` in `App\Authorization\Contracts`, every module's enum `implements Permission` (e.g., `enum PingPermission: string implements Permission { case View = 'ping.view'; ... }`) | Type system carries the constraint; PHPStan rule only needs to forbid raw strings in `Gate::*`/`policy()` calls |
| 6 | Bus middleware ordering | **Logging → Metrics → Authorize → Validate → Transaction** (spec order; Authorize before Validate) | Don't reveal schema knowledge to unauthorized callers; defense-in-depth; revisit if perf ever bites |
| 7 | Stub Socialite identity | **Per-request fixture user**: stub driver accepts `?identity=<email>` query param; defaults to `stub-user@eurostrip.local` when absent; upserts on each call | Unlocks multi-role testing (admin vs regular) without test-only branches in production code |

---

## 4. Canonical module shape (Ping, as the template every future module copies)

```text
app/Modules/Ping/
├── Domain/
│   ├── Ping.php                       # entity (framework-free)
│   ├── PingNote.php                   # value object (translatable string)
│   ├── PingRepository.php             # interface
│   └── PingPermission.php             # enum implements Permission (decision #5)
├── Application/
│   ├── Commands/
│   │   ├── RecordPingCommand.php      # spatie/laravel-data
│   │   ├── RecordPingHandler.php      # bus adapter (framework-aware)
│   │   └── RecordPingUseCase.php      # framework-free; one public method
│   └── Queries/
│       ├── ListPingsQuery.php         # spatie/laravel-data
│       ├── ListPingsHandler.php
│       └── ListPingsUseCase.php
├── Infrastructure/
│   ├── EloquentPingRepository.php     # implements Domain\PingRepository
│   ├── PingModel.php                  # Eloquent (translatable, Scout-searchable)
│   ├── PingFactory.php                # Eloquent factory for tests/seeders
│   └── Migrations/
│       └── 2026_05_NN_create_pings_table.php   # required for Ping in Phase 2
└── Presentation/
    ├── Http/
    │   ├── PingController.php         # Scramble-annotated
    │   └── routes.php                 # mounted under /api/ping
    └── Filament/
        └── PingResource.php           # admin CRUD, gated by PingPermission cases
```

**Test layout (mirrors module tree):**

- `tests/Feature/Modules/Ping/` — HTTP, Filament, integration tests
- `tests/Unit/Modules/Ping/` — UseCase, Domain entity, value-object tests

**Test discipline (per CLAUDE.md hard rule #1):** every UseCase, Handler, and HTTP feature gets at minimum **happy / invalid / garbage** Pest test cases. Pure-domain unit tests cover the entity invariants and value-object validation.

---

## 5. Implementation details deferred to plan

These are intentionally _not_ locked here — the plan will resolve them with the conventional choice unless something surprising surfaces:

- **PingNote translatable mechanics.** Likely `spatie/laravel-translatable` on the `PingModel` with the value object holding the per-locale map; revisit if the integration is ugly.
- **Filament admin-role gate mechanism.** Likely Filament's `->authMiddleware()` + a `RolePermission` enum case; the panel's `viewAny` gate calls `auth()->user()->can(AdminPermission::AccessPanel)`.
- **OpenAPI source-of-truth flow to `libs/api-client`.** Phase 2 generates `openapi.json` via Scramble at boot; Phase 3 will add the consumer-side generation script. No Phase 2 work required beyond ensuring `openapi.json` exists and is non-empty.
- **Permission seeder reconciliation algorithm.** The seeder reads every enum `implements Permission`, upserts a `permissions` row per case, and removes orphan rows whose name no longer matches any enum case. Concrete implementation in plan.

---

## 6. Gate (verbatim from §13.2)

`nx test backend && nx analyze backend && nx deptrac backend` all green; `POST /api/ping` (with a Passport token from stub login) records a ping; `GET /api/ping` returns it; `/admin` shows the Ping Filament resource; `/docs/api` renders OpenAPI with the Ping endpoints listed.

---

## 7. Out of scope for Phase 2 (recorded so the plan doesn't sprawl)

- Real domain features (Aircraft CRUD and beyond) — separate spec/plan after Phase 2 lands.
- Frontend work — Phase 3, strictly serial per decision #4.
- Real OAuth provider wiring (Google/GitHub/etc.) — only the stub Socialite driver in Phase 2; real providers come post-scaffold.
- Cashier billing flows — only migrations published in Phase 2; full Stripe wiring is a future feature spec.
- Browsershot rendering pipelines — package installed and registered in Phase 2; usage comes with the first feature that needs PDF/screenshot output.

---

## 8. Open questions for plan-writing

None. The seven decisions above + §13.2 + §11 (naming conventions) fully constrain the plan. If new ambiguity surfaces during plan-writing, escalate by amending this document rather than embedding decisions in the plan.

---

## 9. References

- Original spec: `docs/superpowers/specs/2026-05-02-eurostrip-scaffold-design.md` (§5 backend architecture, §11 naming, §13.2 Phase 2)
- Phase 2 handoff runbook: `docs/runbooks/phase-2-handoff.md`
- CLAUDE.md hard rules: `/CLAUDE.md`
- Phase 1 cross-platform fixes: commit `4b7cbb6`
- Phase 1 deviations spec amendment: commit `923bcc1`
