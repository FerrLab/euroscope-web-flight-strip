# EuroStrip — Phase 4 Scope-Validation & Decision Log

**Date:** 2026-05-07
**Status:** Approved (pending written-spec review)
**Author:** Brainstormed with Kewyn Ferreira
**Parent spec:** `docs/superpowers/specs/2026-05-02-eurostrip-scaffold-design.md` §13.4
**Predecessor decision logs:** `docs/superpowers/specs/2026-05-05-eurostrip-scaffold-phase-2-decisions.md`, `docs/superpowers/specs/2026-05-06-eurostrip-scaffold-phase-3-decisions.md`

---

## 1. Purpose

This is a **delta document**, not a fresh design. The original scaffold spec already covers Phase 4 in §13.4 + §10 (docs structure) + §12 (canonical workflow); this addendum:

1. Confirms Phase 4 scope holds with two substantive expansions (Phase 3 hygiene items in scope; pure-CQRS refactor that drops the UseCase layer).
2. Locks the **six** decisions surfaced during the brainstorming pass.
3. Records the five pre-flight hygiene commits already on `main` so the plan doesn't accidentally re-do them.

Implementation plan-writing must consume **all** documents: §13.4 + §10 + §12 for scope, this file for decisions.

---

## 2. Confirmed scope

Phase 4 §13.4 stands with **two substantive expansions** and zero deletions:

- **Expansion 1:** All five Phase 3 hygiene items are in scope (decision #2). The original §13.4 was docs-only.
- **Expansion 2:** Pure-CQRS refactor — drop the UseCase layer; Application becomes Command + Handler only (decision #6). Touches `app/Cqrs/` contracts, the Ping module's `Application/{Commands,Queries}`, their tests, the architecture doc, and adds ADR 0008 superseding ADR 0002.
- All §13.4 deliverables remain in scope: every `/docs` page from §10, `docs/runbooks/adding-a-feature.md` (the canonical 12-step workflow per §12), `docs/conventions/{tdd,solid,naming,i18n}.md`, `docs/architecture/overview.md` with Mermaid system diagram + ERD, finalized `CLAUDE.md`, `docs/runbooks/repo-tour.md`, CI `docs-build` job (markdownlint + OpenAPI validation + route-coverage assertion), one green CI run on `main`.

---

## 3. Decision log

| # | Decision | Locked choice | Rationale |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Branch strategy | **Phase 3 PR #2 merged** (commit `fc21a4a`); Phase 4 branches off updated `main` after the five pre-flight hygiene commits land | Clean history; mirrors Phases 2→3 pattern |
| 2 | Phase 3 hygiene scope | **All five items in scope:** CI Typesense flake; locale-aware stub callback; Filament v3→v4 sweep; live Typesense smoke test; PUSHER\_\* env in compose | Phase 4's gate ("repo runs cold without asking a question") demands a finished feel; deferring leaks rough edges into the first real feature |
| 3 | docs-build CI tooling | **markdownlint-cli2 + `@redocly/cli lint` + custom route-coverage script (Node, ~50 lines)** | Redocly catches schema-spec mismatches and OpenAPI 3.x style regressions; markdownlint-cli2 is the de facto fast linter; route-coverage is custom (no off-the-shelf tool exists) |
| 4 | CLAUDE.md "finalized" | **Full rewrite** treating Phase 1's version as a draft; new file is the onboarding contract for any agent or human contributor opening the repo cold | Forward-references in Phase 1's CLAUDE.md ("see X (added in Phase 4)") have decayed into noise; cleaner to rewrite around the now-existing docs |
| 5 | docs-build CI ordering | **First** (after preflight + Typesense fix) — every subsequent doc commit gets linted from day 1 | ESLint react/jsx-no-literals lesson from Phase 3: tooling that surfaces issues early is cheaper than a sweep at the end; markdownlint has auto-fix |
| 6 | CQRS shape | **Pure CQRS — collapse UseCase into Handler.** Application layer becomes Command + Handler only. Drop `App\Cqrs\CommandUseCase` + `QueryUseCase`. ADR 0002 → Superseded by new ADR 0008 | Three-layer split was elegant on paper but ceremonial in execution (3 files + 3 tests per command); pure CQRS halves the per-feature cost while preserving framework-free Domain, testable Handler with in-memory repos, and the Authorize→Validate→Transaction middleware pipeline |

---

## 4. Pre-flight hygiene already on `main` (do NOT re-do in plan)

Five fixes landed on `main` during brainstorming as the user surfaced live-environment issues. The plan should **acknowledge** these but not redo them:

| Commit | Description |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7cb45c3` | `fix(web)`: bind `next dev` to localhost (Phase 3 Task 23 fixed only Playwright's webServer; missed the host-side dev/start scripts) |
| `fa46da7` | `fix(infra)`: docker-compose `web` service moved behind `compose-web` profile + `EUROSTRIP_BACKEND_URL=http://backend:8000` env so server-side fetch works inside the container |
| `8ca6003` | `fix(web)`: route handlers default `BACKEND_URL` to `127.0.0.1:8000` (sidesteps Node IPv6-preferred resolution under WSL2 / Docker Desktop) |
| `e9c4df9` | `docs(web)`: `apps/web/.env.local.example` documenting `host.docker.internal:8000` for WSL2 dev shells |
| `2af4ed2` | `fix(backend)`: `AppServiceProvider::boot()` chmod's Passport keys to 600/660 every worker boot (defensive against Docker Desktop on Windows occasionally losing Linux perms across volume restores) |

**Plan should reference these as "already done"** — the locale-aware stub callback (decision #2 item 2), live Typesense smoke test (item 4), and PUSHER\_\* env propagation (item 5) are still open and need plan tasks. The Passport-key chmod story is now belt-and-suspenders: entrypoint sets perms on container start; `AppServiceProvider::boot()` re-applies them on every Octane worker boot. The latter is load-bearing on Docker Desktop on Windows where the former alone isn't always durable.

---

## 5. Phase 3 hygiene items broken out (decision #2)

The five items, ordered by priority for plan task placement:

1. **CI test-backend Typesense flake** (Highest priority — blocks `e2e` CI job dependency chain). Plan tasks should fix this FIRST (after preflight) so the CI baseline is unblocked before the docs-build job lands.
2. **Locale-aware stub callback.** Currently `apps/web/src/app/api/auth/stub-callback/route.ts` hardcodes `/en/dashboard` redirect; pt-locale users land on en pages. Read locale from request referer (or accept-language header), default to `en` if absent, redirect to `/<locale>/dashboard`.
3. **Filament v3 → v4 sweep.** Phase 2 noted Filament v3 doesn't support Laravel 13; Phase 3 Task 21 adapted PingResource to v4 inline. Audit other Filament integrations for v3-shaped code (check `app/Providers/Filament/AdminPanelProvider.php` for any deprecated v3 calls; verify resource discovery configuration).
4. **Live Typesense smoke test.** Phase 3 Task 19 set `SCOUT_DRIVER=null` in `phpunit.xml` so tests don't hit Typesense. Add a CI-only test (skipped in unit suite, runs in `test-backend` job) that creates a `PingModel`, asserts it appears in Typesense's index, deletes it. Catches schema mismatches early.
5. **PUSHER\_\* env in compose backend.** Phase 2 Task 8 surfaced that the backend container's compose `environment:` block doesn't list `PUSHER_*` vars; the running container reads `apps/backend/.env` (now populated). Phase 3 didn't exercise live Soketi broadcasting, but Phase 4's gate ("everything works cold") demands it does. Add `PUSHER_APP_ID`, `PUSHER_APP_KEY`, `PUSHER_APP_SECRET`, `PUSHER_HOST`, `PUSHER_PORT`, `PUSHER_SCHEME`, `PUSHER_APP_CLUSTER` to `infra/docker-compose.yml` `backend.environment:` block (similar to how `DB_*` and `REDIS_*` are listed).

---

## 6. Doc deliverables broken out (§10 mapping)

To make plan-writing concrete, the eleven doc files needed:

**Architecture (2 new + 4 existing — verify they reference each other):**

- `docs/architecture/overview.md` (NEW) — 30-line summary + Mermaid system diagram + Mermaid ERD of day-1 schema (`users`, `pings`, Spatie permission tables, Passport client/token tables)
- `docs/architecture/monorepo-layout.md` (NEW) — what each app/lib does, who depends on whom
- (existing) `docs/architecture/cqrs.md` — written Phase 2; verify cross-refs
- (existing) `docs/architecture/auth.md` — written Phase 2; verify cross-refs
- (existing) `docs/architecture/data-stores.md` — written Phase 2; verify cross-refs
- (existing) `docs/architecture/frontend.md` — written Phase 3; verify cross-refs

**Conventions (4 new, directory needs creating):**

- `docs/conventions/tdd.md` — happy/invalid/garbage rule, examples from Ping module
- `docs/conventions/solid.md` — how each principle shows up in the codebase
- `docs/conventions/naming.md` — naming rules verbatim from §11
- `docs/conventions/i18n.md` — message catalog rules, "no hardcoded strings" enforcement

**Runbooks (5 new + 1 existing — verify):**

- `docs/runbooks/adding-a-feature.md` (NEW) — canonical 12-step workflow per §12, with worked example pointing at the Ping module commits
- `docs/runbooks/adding-a-locale.md` (NEW)
- `docs/runbooks/adding-a-socialite-provider.md` (NEW)
- `docs/runbooks/rotating-passport-keys.md` (NEW)
- `docs/runbooks/repo-tour.md` (NEW) — 10-minute walkthrough for a new contributor (or new Claude session)
- (existing) `docs/runbooks/local-dev.md` — written Phase 1; verify it's still accurate

**ADRs (no new ones in Phase 4 by default; only if a decision arises during plan execution).**

---

## 7. CI `docs-build` job

Per decision #3 + #5, the new CI job runs three checks. Plan ordering:

1. **markdownlint-cli2 config** — `.markdownlint-cli2.yaml` at repo root. Disable MD013 (line length — would fight long doc URLs and code blocks); enable MD033 (allow specific inline HTML used by Mermaid blocks); enable MD040 (require code-block language tags). Apply to `docs/**/*.md` + `*.md` + `apps/**/*.md` (exclude `node_modules`, `vendor`, `.next`).
2. **Redocly OpenAPI validation** — `redocly lint apps/backend/openapi.json` with default ruleset. Catches OpenAPI 3.x schema violations and Redocly's recommended best-practices.
3. **Custom route-coverage script** — Node script at `scripts/check-route-coverage.mjs`. Reads Laravel's route list (via `php artisan route:list --json`) and `apps/backend/openapi.json`. Filters to API-prefixed routes. Asserts every API route appears in the OpenAPI paths object. Excludes `/api/oauth/*`, `/api/horizon/*`, `/api/_debugbar/*` (internal). Fails CI with a list of undocumented routes.

CI workflow lands as a new `docs-build` job in `.github/workflows/ci.yml`, no `needs:` dependency (runs in parallel with backend/frontend test jobs).

---

## 8. CLAUDE.md rewrite (decision #4)

The new CLAUDE.md is structured as the onboarding contract:

1. **What is EuroStrip** — one paragraph; tagline; phase status (Phase 4 marks "scaffold complete; ready for first feature").
2. **Stack** — at-a-glance bullets (current Phase 1's section, but updated).
3. **Hard rules** — eight existing rules, each linked to its canonical convention doc.
4. **"Where to look first"** — table mapping common questions to canonical docs (the original brainstorm Q4 option B is now part of decision #4's full rewrite).
5. **Workflow** — the canonical 12-step workflow, summarized with a link to `docs/runbooks/adding-a-feature.md`.
6. **Local dev** — link to `docs/runbooks/local-dev.md`.
7. **What lives where** — current section; updated with the new architecture/convention docs.

All forward-references ("see X (added in Phase 4)") are now resolved into live links.

---

## 9. Implementation details deferred to plan

- **Mermaid diagram specifics for `overview.md`** — exact node/edge layout. Plan can sketch it; final form during execution.
- **ERD specifics for `overview.md`** — which tables to include (users, pings, oauth_clients, oauth_access_tokens, permissions, roles, model_has_roles, role_has_permissions, features, cashier tables) and their relationships.
- **`adding-a-feature.md` worked example** — plan can pick whether to reference the Ping module step-by-step or summarize. Most useful: walk through the actual git commits from Phase 2 Tasks 16–22 + Phase 3 Tasks 17–22.
- **markdownlint disabled-rule list** — plan can enumerate; final config tuned during the lint-once-fix-everything sweep.
- **Filament v3→v4 sweep approach** — plan can grep for `Filament\\Forms\\Form` etc. and audit; depth depends on what surfaces.

---

## 10. Gate (verbatim from §13.4)

"Open the repo cold, follow `docs/runbooks/local-dev.md`, get a running stack and a passing test suite without asking a single question."

Plus:

- `nx run-many --target=test --all` green
- `nx run-many --target=lint --all` green
- `nx run-many --target=typecheck --all` green
- `nx run-many --target=analyze --projects=backend` green (PHPStan)
- `nx run-many --target=deptrac --projects=backend` green
- `nx e2e web` green
- One green CI run on `main` after Phase 4 merges (all jobs: lint-and-typecheck, test-backend, test-frontend, e2e, docs-build).

---

## 11. Out of scope for Phase 4 (recorded so the plan doesn't sprawl)

- **The first real domain feature (Aircraft CRUD)** — separate spec/plan after Phase 4 lands per §14.
- **Storybook for `libs/ui`** — Phase 4+ polish but not in §13.4's deliverable list. Defer to "post-scaffold polish".
- **i18n catalog drift checks** — automated tooling that diffs en vs pt key sets. Could be a doc-build addition, but spec doesn't ask for it. Defer.
- **Visual regression for the 4 themes** — Playwright screenshot diffs across `data-theme` modes. Defer.
- **PR template + issue templates** — useful but spec doesn't require it. Defer to first feature.
- **Conventional commits enforcement** — lefthook commit-msg hook. Defer.
- **soketi-ui or equivalent WebSocket dashboard** — too heavyweight (Laravel app + MySQL or pdo_pgsql patching). `docs/runbooks/local-dev.md` (or a new `inspecting-soketi.md` runbook) gets a curl-based recipe instead: `/usage`, `/apps`, `/channels` endpoints + `Pusher.logToConsole = true` for browser-side event tracing.

---

## 12. Pure-CQRS refactor (decision #6) — concrete impact

The refactor touches a constrained surface that we can enumerate:

**Files dropped:**

- `apps/backend/app/Cqrs/CommandUseCase.php` (marker interface — delete)
- `apps/backend/app/Cqrs/QueryUseCase.php` (marker interface — delete)
- `apps/backend/app/Modules/Ping/Application/Commands/RecordPingUseCase.php` (logic merges into RecordPingHandler)
- `apps/backend/app/Modules/Ping/Application/Queries/ListPingsUseCase.php` (logic merges into ListPingsHandler)
- `apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingUseCaseTest.php` (assertions migrate into RecordPingHandlerTest)
- `apps/backend/tests/Unit/Modules/Ping/Application/Queries/ListPingsUseCaseTest.php` (assertions migrate into a new ListPingsHandlerTest)

**Files modified:**

- `apps/backend/app/Cqrs/ContractsTest.php` — drop assertions referencing `CommandUseCase` / `QueryUseCase`
- `apps/backend/app/Modules/Ping/Application/Commands/RecordPingHandler.php` — absorb the UseCase logic; constructor takes `PingRepository` directly (no UseCase intermediate)
- `apps/backend/app/Modules/Ping/Application/Queries/ListPingsHandler.php` — same shape
- `apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingHandlerTest.php` — absorb the UseCase test cases (happy/invalid/garbage on the business logic, not just the bus adapter)
- `apps/backend/tests/Unit/Modules/Ping/Application/Queries/ListPingsHandlerTest.php` — created (didn't exist; UseCase test pulled the weight in Phase 2)
- `apps/backend/tests/Support/Modules/Ping/InMemoryPingRepository.php` — stays as-is (the test fixture is already framework-free; the Handler now directly uses it)
- `docs/architecture/cqrs.md` — rewrite the "three contracts per side" sections to "two contracts per side"; update the worked example for `RecordPing` to show the Handler holding the business logic; the bus middleware order section is unchanged
- `docs/adr/0002-cqrs-three-layer.md` — change Status to "Superseded by ADR 0008"; preserve original content as historical record
- `docs/adr/0008-pure-cqrs.md` (NEW) — documents the supersession: Context (three-layer was ceremonial), Decision (collapse UseCase into Handler), Consequences (one fewer indirection per feature; Domain stays framework-free; tests merge), References (link to ADR 0002 + Phase 4 decision-log row 6)

**Files unchanged:**

- `apps/backend/app/Cqrs/Command.php`, `Query.php`, `CommandHandler.php`, `QueryHandler.php` — four markers stay
- `apps/backend/app/Cqrs/Bus/*` — bus + middleware pipeline is unaffected
- All Domain layer (`app/Modules/Ping/Domain/*`) — unchanged
- All Infrastructure layer (`app/Modules/Ping/Infrastructure/*`) — unchanged
- All Presentation layer (`app/Modules/Ping/Presentation/*`) — unchanged
- `deptrac.yaml` — the four-layer ruleset (Domain/Application/Infrastructure/Presentation) didn't have a UseCase-specific layer; the Application layer just contains fewer files now
- `phpstan.neon` — no rule changes

**Naming convention update (§11 in original spec):**

- Before: "UseCases: same name + `UseCase` (`RegisterAircraftUseCase`)"
- After: this line gets removed from `docs/conventions/naming.md` (Phase 4 is writing it from scratch); the §11 reference in the original spec stays as historical but the new naming doc is canonical.

This is contained: ~8 file deletions, ~6 file edits, 1 new ADR. The plan task that does this fits in one task with clear sub-steps.

---

## 12. Open questions for plan-writing

None blocking. The five locked decisions + §13.4 + §10 + §12 fully constrain the plan. If new ambiguity surfaces during plan-writing, escalate by amending this document rather than embedding decisions in the plan.

---

## 13. References

- Original spec: `docs/superpowers/specs/2026-05-02-eurostrip-scaffold-design.md` (§10 docs structure, §11 naming, §12 12-step workflow, §13.4 Phase 4)
- Phase 2 decision log: `docs/superpowers/specs/2026-05-05-eurostrip-scaffold-phase-2-decisions.md`
- Phase 3 decision log: `docs/superpowers/specs/2026-05-06-eurostrip-scaffold-phase-3-decisions.md`
- CLAUDE.md hard rules: `/CLAUDE.md` (rewritten in Phase 4 per decision #4)
- Phase 3 progress memory: `~/.claude/projects/.../memory/project_phase_3_progress.md`
- Pre-flight hygiene commits: `7cb45c3`, `fa46da7`, `8ca6003`, `e9c4df9`, `2af4ed2`
- Tooling references: markdownlint-cli2, `@redocly/cli`
