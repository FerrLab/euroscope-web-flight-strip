# Azimuth — Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Phase 4 — polish + docs + runbooks + a CQRS simplification — so the scaffold is reviewable as a finished artifact: any contributor (or fresh Claude session) can open the repo cold, follow `docs/runbooks/local-dev.md`, get a running stack, and know how to add a feature without asking a question.

**Architecture:** Two architectural changes layered onto the existing scaffold: (1) a `docs-build` CI job (markdownlint-cli2 + `@redocly/cli lint` + a custom Node route-coverage script) so docs and the OpenAPI spec stay healthy on every PR; (2) the Application layer simplifies from three-file Command/Query/Handler/UseCase to two-file Command/Query/Handler — pure CQRS, with the Handler holding the business logic directly. ADR 0002 is superseded by a new ADR 0008. Eleven new doc files cover the §10 docs structure plus an `inspecting-soketi.md` curl runbook (soketi-ui dashboard out of scope per the decision log). CLAUDE.md is rewritten as a complete onboarding contract.

**Tech Stack:** markdownlint-cli2 v0.x, `@redocly/cli` v1.x, Node 22 (route-coverage script), GitHub Actions, Mermaid (system diagram + ERD in `architecture/overview.md`), all existing Phase 1–3 stack.

**Source documents (read all before starting):**

- `docs/superpowers/specs/2026-05-02-azimuth-scaffold-design.md` — §10 (docs structure), §11 (naming conventions), §12 (canonical 12-step workflow), §13.4 (Phase 4 scope)
- `docs/superpowers/specs/2026-05-07-azimuth-scaffold-phase-4-decisions.md` — six locked decisions, pre-flight hygiene already on `main`, pure-CQRS impact in §12

**Hard rules from `/CLAUDE.md` (apply to every task):**

1. **TDD always** — every code-touching task that writes tests gets at minimum **happy / invalid / garbage** cases. Pure-CQRS task assertions migrate from existing UseCase tests.
2. **No hardcoded user-facing strings** — `react/jsx-no-literals` enforces this on JSX; the convention also applies to backend Filament labels and notification copy.
3. **Squared UI** — no border-radius except `rounded-full`. Already enforced by the Tailwind preset; no changes needed in Phase 4.
4. **Cookie-only auth** — Bearer token never leaves the backend. The pure-CQRS refactor doesn't touch the bus middleware (Authorize → Validate → Transaction).
5. **`/docs` is evergreen** — every task that adds or changes a doc updates the `docs/README.md` index in the same commit.

**Pre-flight hygiene already on `main` (do NOT redo):**

- `7cb45c3` — host-side `next dev` binds to localhost (no more `0.0.0.0` redirect URL leak)
- `fa46da7` — docker-compose `web` service profile-gated (`compose-web`); `AZIMUTH_BACKEND_URL=http://backend:8000`
- `8ca6003` — route handlers default `BACKEND_URL` to `127.0.0.1:8000` (sidesteps Node IPv6-preferred resolution)
- `e9c4df9` — `apps/web/.env.local.example` documenting `host.docker.internal:8000` for WSL2
- `2af4ed2` — `AppServiceProvider::boot()` chmod's Passport keys to 600/660 every Octane worker boot
- `0d6d906` — `infra/docker-compose.yml` typesense-dashboard service at port 8109
- `a83fbcd`, `c3d1b15` — Phase 4 decision-log spec

**Conventions used throughout this plan:**

- All backend commands run inside Docker: `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend <cmd>` (or wrapped Nx targets).
- All frontend commands run host-side: `pnpm nx <target> web` (the host-side dev server binds localhost only).
- Compose `up -d` only starts the 8 backend services (web is profile-gated).
- Every commit uses conventional-commit style with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Lefthook auto-runs Prettier + ESLint + Pint on staged files; tasks shouldn't repeat that.
- Plan corrections are normal — Phases 2 and 3 averaged ~10–15% of steps needing real-time fixes. Subagents fixing them inline (and reporting in concerns) is the right pattern.

**Out of scope (don't let any task drift into):** Aircraft CRUD, Storybook, i18n drift checks, theme visual regression, PR/issue templates, conventional-commits hook, soketi-ui (`inspecting-soketi.md` runbook covers curl recipes instead).

---

## Task 0: Pre-flight — confirm Phase 3 merged + create Phase 4 branch

**Files:** none (sanity check only).

- [ ] **Step 1: Confirm clean tree, on `main`, at the Phase 4 spec commit**

```bash
git status --short --branch
git log --oneline -3
```

Expected: branch is `main` (or descendant); working tree clean except possible local-only `apps/backend/storage/passport/` and `apps/web/test-results/`; HEAD at `c3d1b15` or descendant.

If on a different branch, run `git checkout main && git pull --ff-only`.

- [ ] **Step 2: Bring up the backend stack**

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d
docker compose --env-file .env -f infra/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}"
```

Expected: 8 long-running services up (postgres, dragonfly, typesense, typesense-dashboard, mailpit, soketi, minio, backend, horizon — note web is now profile-gated).

If horizon is NOT up after the merge, run `docker compose --env-file .env -f infra/docker-compose.yml up -d horizon`. If typesense-dashboard isn't up, same fix.

- [ ] **Step 3: Re-verify Phase 3 gate locally**

```bash
curl -fsS -o /dev/null -w "backend / -> %{http_code}\n" http://localhost:8000/
curl -fsS -o /dev/null -w "typesense /health -> %{http_code}\n" http://localhost:8108/health
curl -fsS -o /dev/null -w "typesense-dashboard -> %{http_code}\n" http://localhost:8109/
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest --parallel 2>&1 | tail -5
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/phpstan analyze --memory-limit=2G 2>&1 | tail -3
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/deptrac analyse --no-progress 2>&1 | tail -5
pnpm nx run-many --target=test --projects=design-tokens,i18n,ui,api-client,web 2>&1 | tail -5
```

Expected: backend HTTP 200; typesense /health returns `{"ok":true}`; typesense-dashboard 200; Pest 59+ passing; PHPStan `[OK] No errors`; Deptrac 0 violations; frontend test suite green.

If anything fails, stop and report `BLOCKED`.

- [ ] **Step 4: Create the Phase 4 working branch**

```bash
git checkout -b feat/phase-4-polish-and-docs
git push -u origin feat/phase-4-polish-and-docs
```

- [ ] **Step 5: Confirm clean tree on the new branch**

```bash
git status --short --branch
```

Expected: `On branch feat/phase-4-polish-and-docs` and `nothing to commit` (modulo the two known local-only directories).

---

## Task 1: CI `test-backend` Typesense flake — pin a healthcheck so `up --wait` succeeds

**Background:** Phase 3 gate verification surfaced that `infra/docker-compose.ci.yml`'s `typesense` service exits during `docker compose up -d --wait` because the image lacks `wget`/`curl`/`nc` and Compose can't probe HTTP. This blocks the `e2e` CI job's `needs:` chain. Phase 4 fixes it by giving Typesense a healthcheck Compose can satisfy.

**Reference:** Typesense's official Docker docs (https://typesense.org/docs/guide/install-typesense.html#docker) recommend a TCP-based check. Real-world example from `typesense/typesense-docker-images`: open a TCP socket via Bash's `/dev/tcp` from a busybox sidecar — but `typesense:29.1`'s sh lacks `/dev/tcp`. Pragmatic alternative used in many production stacks: pin the healthcheck to the host-readable HTTP probe via a different image strategy, OR set `start_period` long enough that Typesense responds on the open port without `--wait` failing.

**Decision:** Add a `start_period` to the typesense CI service so Compose accepts the container as healthy after a fixed delay (the container is functionally ready in <2s, but `--wait` requires a passing healthcheck OR no healthcheck + Health unknown). The simplest fix: drop `--wait` from the workflow and add an explicit `wait-for-it` step that probes `http://typesense:8108/health` from a sidecar.

**Files:**

- Modify: `infra/docker-compose.ci.yml`
- Modify: `.github/workflows/ci.yml` — replace `--wait` with explicit health probe in the e2e + test-backend jobs

- [ ] **Step 1: Update `infra/docker-compose.ci.yml` typesense service**

Replace the typesense service block with one that uses a busybox-based wait pattern. Since the image itself can't self-probe, we don't add a healthcheck — we change the workflow to do an external probe.

Minimal change to `infra/docker-compose.ci.yml`:

```yaml
typesense:
  image: typesense/typesense:29.1
  command: ['--data-dir=/data', '--api-key=ci', '--enable-cors']
  # No in-container healthcheck (image ships without wget/curl/nc and its sh
  # lacks /dev/tcp). Workflow probes /health externally before running tests.
```

Confirm there's no existing `healthcheck:` block. If there is, remove it.

- [ ] **Step 2: Update `.github/workflows/ci.yml` to wait on Typesense explicitly**

Find the `test-backend` and `e2e` jobs. Replace the `docker compose ... up -d --wait` step with:

```yaml
- name: Boot CI stack (no --wait; Typesense lacks self-probe)
  run: docker compose -f infra/docker-compose.ci.yml up -d
- name: Wait for backend, postgres, dragonfly, typesense
  run: |
    set -e
    # Backend (Octane on FrankenPHP)
    for i in $(seq 1 60); do
      if curl -fsS -o /dev/null http://localhost:8000/; then echo "backend ready"; break; fi
      sleep 2
    done
    # Postgres
    for i in $(seq 1 30); do
      if docker compose -f infra/docker-compose.ci.yml exec -T postgres pg_isready -U azimuth -d azimuth; then break; fi
      sleep 2
    done
    # Dragonfly
    for i in $(seq 1 30); do
      if docker compose -f infra/docker-compose.ci.yml exec -T dragonfly redis-cli ping | grep -q PONG; then break; fi
      sleep 2
    done
    # Typesense (host probe)
    for i in $(seq 1 30); do
      if curl -fsS http://localhost:8108/health | grep -q '"ok":true'; then echo "typesense ready"; break; fi
      sleep 2
    done
```

Apply the same pattern to BOTH `test-backend` and `e2e` jobs (replace each `up -d --wait` step).

- [ ] **Step 3: Smoke-test locally**

```bash
docker compose -f infra/docker-compose.ci.yml down -v 2>/dev/null || true
docker compose -f infra/docker-compose.ci.yml up -d
sleep 10
for svc in backend postgres dragonfly typesense; do
  docker compose -f infra/docker-compose.ci.yml ps "$svc" --format "{{.Name}}: {{.Status}}"
done
curl -fsS http://localhost:8108/health
docker compose -f infra/docker-compose.ci.yml down -v
```

Expected: all four services running; typesense `/health` returns `{"ok":true}`.

- [ ] **Step 4: Commit**

```bash
git add infra/docker-compose.ci.yml .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: replace docker compose --wait with explicit health probes

`--wait` requires every service to declare a healthcheck OR be running.
typesense:29.1 ships without wget/curl/nc and its sh lacks /dev/tcp,
so an in-container healthcheck isn't possible — and `--wait` hangs
indefinitely. Replace with curl-based host probes for backend (HTTP),
postgres (pg_isready), dragonfly (redis-cli ping), and typesense
(/health). Unblocks the e2e CI job's needs-chain dependency on
test-backend.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `.markdownlint-cli2.yaml` — workspace-wide markdown lint config

**Files:**

- Create: `.markdownlint-cli2.yaml`
- Modify: `package.json` (root) — add `markdownlint-cli2` dev dep + `lint:docs` script
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Install markdownlint-cli2**

```bash
pnpm add -Dw markdownlint-cli2
```

- [ ] **Step 2: Author `.markdownlint-cli2.yaml`**

````yaml
config:
  default: true

  # MD013 (line length): noisy with long URLs in docs and pre-formatted code.
  MD013: false

  # MD024 (no duplicate headings): allow duplicate headings under different parents
  # (e.g., "## Step 1" inside multiple Task N sections of plan files).
  MD024:
    siblings_only: true

  # MD033 (no inline HTML): allow specific tags used for advanced rendering
  # (Mermaid blocks render via fenced ```mermaid; details/summary used in some runbooks).
  MD033:
    allowed_elements: [details, summary, sub, sup, br]

  # MD034 (no bare URLs): allow bare URLs in tables and prose; angle-bracket wrapping
  # would fight Markdown table column alignment.
  MD034: false

  # MD040 (fenced-code language): require all fenced code blocks to declare a language.
  MD040: true

  # MD041 (first-line h1): docs always start with H1, but ADRs use front-matter style
  # in some communities; we use H1 universally so this stays on.
  MD041: true

  # MD046 (code block style): enforce fenced (``` triple-backtick) over indented.
  MD046:
    style: fenced

globs:
  - '**/*.md'

ignores:
  - 'node_modules/**'
  - 'apps/backend/vendor/**'
  - 'apps/backend/storage/**'
  - '.next/**'
  - 'apps/web/.next/**'
  - 'apps/web/test-results/**'
````

- [ ] **Step 3: Add a root `package.json` script**

Edit root `package.json` to add a `scripts` block (or extend the existing one):

```json
{
  "scripts": {
    "lint:docs": "markdownlint-cli2"
  }
}
```

- [ ] **Step 4: Smoke test**

```bash
pnpm lint:docs 2>&1 | tail -20
```

Expected: lint passes (no errors) OR reports a manageable list of fixes — Phase 2 + 3 docs were authored without lint discipline. Auto-fix what's safe:

```bash
pnpm exec markdownlint-cli2 --fix
```

Then re-run `pnpm lint:docs`. Iterate until clean. If specific files have intractable violations, add narrower ignores or use inline `<!-- markdownlint-disable MDxxx -->` comments — but prefer fixing the source.

- [ ] **Step 5: Commit**

```bash
git add .markdownlint-cli2.yaml package.json pnpm-lock.yaml docs/ apps/ libs/ CLAUDE.md README.md 2>/dev/null
git commit -m "$(cat <<'EOF'
chore(docs): add markdownlint-cli2 config + auto-fix existing docs

Workspace-wide markdownlint-cli2 config disables MD013 (line length —
URLs and code blocks fight it), allows specific HTML elements via MD033,
and enforces MD040 (fenced code language) + MD046 (fenced over indented).
Auto-fix sweep applied to existing docs from Phases 1-3.

`pnpm lint:docs` is the new entry point.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Redocly OpenAPI lint + custom route-coverage script

**Files:**

- Create: `.redocly.yaml`
- Create: `scripts/check-route-coverage.mjs`
- Modify: `package.json` (root) — add `@redocly/cli` dev dep; `lint:openapi` and `check:route-coverage` scripts

- [ ] **Step 1: Install Redocly CLI**

```bash
pnpm add -Dw @redocly/cli
```

- [ ] **Step 2: Author `.redocly.yaml`**

Reference: Redocly's official ruleset at https://redocly.com/docs/cli/rules. Use the `recommended` ruleset (not `recommended-strict`) — the strict variant rejects valid-but-style-flagged constructs that Scramble emits.

```yaml
extends:
  - recommended

rules:
  # Scramble emits operationIds in camelCase; Redocly's default style allows it.
  operation-operationId: warn
  operation-operationId-unique: error

  # Scramble doesn't always emit operation summaries on every endpoint; treat as warn.
  operation-summary: warn

  # Tags are populated from controller class names; require uniqueness but allow free naming.
  tag-description: off
```

- [ ] **Step 3: Author `scripts/check-route-coverage.mjs`**

```js
#!/usr/bin/env node
/**
 * Asserts every Laravel API route (`api.php` group) is documented in the
 * OpenAPI snapshot at apps/backend/openapi.json. Runs in CI's docs-build job.
 *
 * Reads:
 *   - apps/backend/openapi.json (Scramble export, snapshot at build time)
 *   - php artisan route:list --json --path=api/ (live from running container)
 *
 * Excludes routes that are intentionally undocumented:
 *   - /api/oauth/* (Passport-internal)
 *   - /api/_debugbar/* (Laravel Debugbar dev-only)
 *   - HEAD shadows of GET routes (Laravel auto-registers them)
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const OPENAPI_PATH = 'apps/backend/openapi.json';
const EXCLUDED_PREFIXES = ['api/oauth/', 'api/_debugbar/'];

function getLaravelRoutes() {
  const out = execSync(
    'docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan route:list --json',
    { encoding: 'utf8' },
  );
  const all = JSON.parse(out);
  return all
    .filter((r) => r.uri.startsWith('api/'))
    .filter((r) => !EXCLUDED_PREFIXES.some((p) => r.uri.startsWith(p)))
    .filter((r) => r.method !== 'HEAD')
    .map((r) => ({ method: r.method.toLowerCase(), path: '/' + r.uri.replace(/^api\//, '') }));
}

function getOpenApiOperations() {
  const spec = JSON.parse(readFileSync(OPENAPI_PATH, 'utf8'));
  const ops = [];
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const method of Object.keys(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        ops.push({ method, path });
      }
    }
  }
  return ops;
}

function main() {
  const laravel = getLaravelRoutes();
  const openapi = getOpenApiOperations();
  const openapiSet = new Set(openapi.map((o) => `${o.method} ${o.path}`));

  const missing = laravel.filter((r) => !openapiSet.has(`${r.method} ${r.path}`));

  if (missing.length === 0) {
    console.log(`✓ Route coverage OK — ${laravel.length} routes, all documented in OpenAPI.`);
    process.exit(0);
  }

  console.error(`✗ Route coverage FAILED — ${missing.length} undocumented routes:`);
  for (const r of missing) {
    console.error(`  ${r.method.toUpperCase().padEnd(6)} /api${r.path}`);
  }
  console.error('');
  console.error(
    'Fix: annotate the controller(s) with Scramble docblocks, then refresh the OpenAPI snapshot:',
  );
  console.error('  pnpm nx run api-client:refresh');
  process.exit(1);
}

main();
```

Make it executable on Unix (no-op on Windows but harmless):

```bash
chmod +x scripts/check-route-coverage.mjs 2>/dev/null || true
```

- [ ] **Step 4: Add scripts to root `package.json`**

```json
{
  "scripts": {
    "lint:docs": "markdownlint-cli2",
    "lint:openapi": "redocly lint apps/backend/openapi.json",
    "check:route-coverage": "node scripts/check-route-coverage.mjs"
  }
}
```

- [ ] **Step 5: Smoke test all three locally**

```bash
pnpm lint:docs 2>&1 | tail -5
pnpm lint:openapi 2>&1 | tail -10
pnpm check:route-coverage 2>&1 | tail -5
```

Expected:

- `lint:docs` exits 0
- `lint:openapi` exits 0 OR reports `warn`-level findings (Scramble's output is valid; warns are fine)
- `check:route-coverage` reports "Route coverage OK — N routes, all documented in OpenAPI"

If `check:route-coverage` reports undocumented routes, refresh the snapshot first:

```bash
pnpm nx run api-client:refresh
```

Then re-run.

- [ ] **Step 6: Commit**

```bash
git add .redocly.yaml scripts/check-route-coverage.mjs package.json pnpm-lock.yaml apps/backend/openapi.json
git commit -m "$(cat <<'EOF'
chore(docs): add Redocly OpenAPI lint + custom route-coverage script

Decision #3: docs-build CI gates on three checks. This adds the latter
two:
- @redocly/cli lint with recommended ruleset (warn-level for operation
  summary/operationId since Scramble doesn't always emit them)
- scripts/check-route-coverage.mjs intersects php artisan route:list
  --json with apps/backend/openapi.json paths; fails if any /api/* route
  is missing from the OpenAPI snapshot. Excludes Passport-internal and
  Laravel Debugbar routes.

`pnpm lint:openapi` and `pnpm check:route-coverage` are the entry points.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: CI `docs-build` job — wire all three checks into GitHub Actions

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Append `docs-build` job**

In `.github/workflows/ci.yml`, after the existing jobs:

```yaml
docs-build:
  runs-on: ubuntu-latest
  # No `needs:` — runs in parallel with backend/frontend test jobs.
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22 }
    - name: Enable Corepack
      run: corepack enable
    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: markdownlint-cli2
      run: pnpm lint:docs

    - name: Redocly OpenAPI lint
      run: pnpm lint:openapi

    - name: Boot backend stack (route-coverage needs `php artisan route:list`)
      run: docker compose -f infra/docker-compose.ci.yml up -d
    - name: Wait for backend
      run: |
        for i in $(seq 1 60); do
          if curl -fsS -o /dev/null http://localhost:8000/; then break; fi
          sleep 2
        done

    - name: Refresh OpenAPI snapshot from running backend
      run: |
        curl -fsS http://localhost:8000/docs/api.json -o apps/backend/openapi.json
    - name: Route coverage
      run: pnpm check:route-coverage

    - name: Assert OpenAPI snapshot in repo matches live
      run: |
        if ! git diff --exit-code apps/backend/openapi.json; then
          echo "::error::apps/backend/openapi.json is stale. Refresh it locally with `pnpm nx run api-client:refresh` and commit."
          exit 1
        fi
```

(The last step catches PRs that change controllers without refreshing the snapshot — common drift source.)

- [ ] **Step 2: Smoke-test the workflow YAML locally**

```bash
# Validate YAML parses (using Node's yaml package or actionlint if available)
node -e "
const yaml = require('yaml');
const fs = require('fs');
const doc = yaml.parse(fs.readFileSync('.github/workflows/ci.yml', 'utf8'));
const jobs = Object.keys(doc.jobs);
console.log('jobs:', jobs.join(', '));
if (!jobs.includes('docs-build')) { console.error('docs-build missing'); process.exit(1); }
"
```

Expected: prints all jobs including `docs-build`.

(If `yaml` package isn't installed at root: `pnpm add -Dw yaml` — or skip the smoke test and trust the CI run.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: add docs-build job (markdownlint + Redocly + route-coverage)

Decision #5: docs-build runs in parallel with backend/frontend test
jobs (no `needs:` dependency). Three gates:
- pnpm lint:docs (markdownlint-cli2)
- pnpm lint:openapi (@redocly/cli)
- pnpm check:route-coverage (custom script intersecting Laravel routes
  with the OpenAPI snapshot)

Plus a snapshot-staleness check that refreshes apps/backend/openapi.json
from the live backend and fails if it drifts from the committed file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Pure CQRS — Step A (drop UseCase contracts)

**Files:**

- Delete: `apps/backend/app/Cqrs/CommandUseCase.php`
- Delete: `apps/backend/app/Cqrs/QueryUseCase.php`
- Modify: `apps/backend/tests/Unit/Cqrs/ContractsTest.php` — drop the UseCase assertions

- [ ] **Step 1: Update `ContractsTest.php`**

Open `apps/backend/tests/Unit/Cqrs/ContractsTest.php`. Find the test that asserts `UseCase markers exist for both sides`. Delete that test entirely. Also remove the imports at the top:

```php
// REMOVE:
use App\Cqrs\CommandUseCase;
use App\Cqrs\QueryUseCase;
```

After the edit, the test file should have 3 tests instead of 4 (Command marker, Query marker, CommandHandler+QueryHandler require handle()).

- [ ] **Step 2: Delete the marker interface files**

```bash
rm apps/backend/app/Cqrs/CommandUseCase.php
rm apps/backend/app/Cqrs/QueryUseCase.php
```

- [ ] **Step 3: Run the contract test to confirm green**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest --parallel --filter=ContractsTest 2>&1 | tail -10
```

Expected: 3 passing tests.

- [ ] **Step 4: Run PHPStan to catch any leftover references**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/phpstan analyze --memory-limit=2G 2>&1 | tail -5
```

Expected: `[OK] No errors`. If PHPStan flags any reference to `CommandUseCase` or `QueryUseCase` outside the deleted files, fix in this commit.

- [ ] **Step 5: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend/app/Cqrs apps/backend/tests/Unit/Cqrs
git commit -m "$(cat <<'EOF'
refactor(cqrs): drop CommandUseCase + QueryUseCase marker interfaces

Decision #6 step A. Pure CQRS collapses Application from three files to
two; the marker interfaces signaling "framework-free UseCase" are no
longer needed because the Handler now holds business logic directly.

Tasks 6 + 7 collapse the Ping module's UseCases into Handlers; ADR 0008
(Task 8) documents the supersession of ADR 0002.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Pure CQRS — Step B (collapse RecordPing)

**Files:**

- Delete: `apps/backend/app/Modules/Ping/Application/Commands/RecordPingUseCase.php`
- Delete: `apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingUseCaseTest.php`
- Modify: `apps/backend/app/Modules/Ping/Application/Commands/RecordPingHandler.php` — absorb UseCase logic
- Modify: `apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingHandlerTest.php` — absorb UseCase test cases

- [ ] **Step 1: Read the existing UseCase + Handler to know what to merge**

```bash
cat apps/backend/app/Modules/Ping/Application/Commands/RecordPingUseCase.php
cat apps/backend/app/Modules/Ping/Application/Commands/RecordPingHandler.php
```

The UseCase has signature roughly: `__construct(private PingRepository $repository) {}` and `execute(int $userId, PingNote $note): Ping`. The Handler currently delegates: `__construct(private RecordPingUseCase $useCase)` and `handle(Command $command): Ping` calls `$this->useCase->execute(...)`.

- [ ] **Step 2: Rewrite `RecordPingHandler.php` to absorb the UseCase**

Replace `apps/backend/app/Modules/Ping/Application/Commands/RecordPingHandler.php` with:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Commands;

use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use App\Modules\Ping\Domain\PingRepository;
use DateTimeImmutable;
use InvalidArgumentException;
use Symfony\Component\Uid\Ulid;

class RecordPingHandler implements CommandHandler
{
    public function __construct(private PingRepository $repository) {}

    public function handle(Command $command): Ping
    {
        if (! $command instanceof RecordPingCommand) {
            throw new InvalidArgumentException(
                sprintf('%s expects RecordPingCommand, got %s', self::class, $command::class),
            );
        }

        $ping = new Ping(
            id: (string) new Ulid(),
            userId: $command->userId,
            note: new PingNote($command->note),
            createdAt: new DateTimeImmutable(),
        );

        $this->repository->save($ping);
        return $ping;
    }
}
```

The Handler now:

1. Takes the repository directly (no UseCase intermediate).
2. Performs the type-narrow assertion (since `handle(Command)` is the contract signature but we need `RecordPingCommand`-specific fields).
3. Holds the business logic (mint ULID, build domain entity, persist).

- [ ] **Step 3: Update the Handler test**

Read the existing test to understand what it covers:

```bash
cat apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingHandlerTest.php
cat apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingUseCaseTest.php
```

The Handler test currently has 1 test case (Command → UseCase translation). The UseCase test has 3 (happy/invalid/garbage). After the refactor, all 4 cases live in the Handler test.

Replace `apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingHandlerTest.php` with:

```php
<?php

declare(strict_types=1);

use App\Modules\Ping\Application\Commands\RecordPingCommand;
use App\Modules\Ping\Application\Commands\RecordPingHandler;
use Tests\Support\Modules\Ping\InMemoryPingRepository;

it('records a ping for a user (happy)', function (): void {
    $repo = new InMemoryPingRepository();
    $handler = new RecordPingHandler($repo);

    $cmd = new RecordPingCommand(userId: 7, note: ['en' => 'hi']);
    $ping = $handler->handle($cmd);

    expect($ping->userId)->toBe(7);
    expect($repo->saved)->toHaveCount(1);
    expect($repo->saved[$ping->id]->note->forLocale('en'))->toBe('hi');
});

it('rejects userId < 1 (invalid)', function (): void {
    $handler = new RecordPingHandler(new InMemoryPingRepository());
    $cmd = new RecordPingCommand(userId: 0, note: ['en' => 'x']);

    expect(fn () => $handler->handle($cmd))->toThrow(InvalidArgumentException::class);
});

it('rejects empty note as invalid (invalid)', function (): void {
    $handler = new RecordPingHandler(new InMemoryPingRepository());
    $cmd = new RecordPingCommand(userId: 1, note: []);

    expect(fn () => $handler->handle($cmd))->toThrow(InvalidArgumentException::class);
});

it('rejects garbage Command type (garbage)', function (): void {
    $handler = new RecordPingHandler(new InMemoryPingRepository());

    // Pass a different Command implementation; Handler must reject.
    $bogus = new class extends \Spatie\LaravelData\Data implements \App\Cqrs\Command {
        public function __construct(public string $note = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
```

(`InvalidArgumentException` is thrown by both `Ping::__construct` for `userId < 1` and by `PingNote::__construct` for empty translations — those tests cover the domain invariants. The "garbage Command type" test covers the Handler's own runtime guard.)

- [ ] **Step 4: Delete the UseCase + UseCase test**

```bash
rm apps/backend/app/Modules/Ping/Application/Commands/RecordPingUseCase.php
rm apps/backend/tests/Unit/Modules/Ping/Application/Commands/RecordPingUseCaseTest.php
```

- [ ] **Step 5: Run tests**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest --parallel --filter=RecordPing 2>&1 | tail -10
```

Expected: 4 passing tests (the 4 from the rewritten Handler test).

- [ ] **Step 6: Run full suite + PHPStan**

```bash
pnpm nx test backend 2>&1 | tail -5
pnpm nx analyze backend 2>&1 | tail -3
```

Expected: All previously-passing tests still pass (the count drops by 3 because `RecordPingUseCaseTest` had 3 cases and the new merged shape has 4 in `RecordPingHandlerTest` — net change matches expectations). PHPStan clean.

- [ ] **Step 7: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
refactor(ping): collapse RecordPingUseCase into RecordPingHandler

Decision #6 step B. Handler now holds the business logic directly:
constructor takes PingRepository; handle() builds the domain entity and
persists. No UseCase intermediate. Test cases merged: happy/invalid/
garbage from the old UseCase test now live in RecordPingHandlerTest,
plus a new "rejects garbage Command type" case for the Handler's
runtime guard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Pure CQRS — Step C (collapse ListPings + create new HandlerTest)

**Files:**

- Delete: `apps/backend/app/Modules/Ping/Application/Queries/ListPingsUseCase.php`
- Delete: `apps/backend/tests/Unit/Modules/Ping/Application/Queries/ListPingsUseCaseTest.php`
- Modify: `apps/backend/app/Modules/Ping/Application/Queries/ListPingsHandler.php` — absorb UseCase logic
- Create: `apps/backend/tests/Unit/Modules/Ping/Application/Queries/ListPingsHandlerTest.php` — new (didn't exist; UseCase test pulled the weight in Phase 2)

- [ ] **Step 1: Rewrite `ListPingsHandler.php`**

Replace `apps/backend/app/Modules/Ping/Application/Queries/ListPingsHandler.php` with:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Queries;

use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use App\Modules\Ping\Domain\PingRepository;
use InvalidArgumentException;

class ListPingsHandler implements QueryHandler
{
    private const MAX_LIMIT = 500;

    public function __construct(private PingRepository $repository) {}

    /** @return array<int, \App\Modules\Ping\Domain\Ping> */
    public function handle(Query $query): array
    {
        if (! $query instanceof ListPingsQuery) {
            throw new InvalidArgumentException(
                sprintf('%s expects ListPingsQuery, got %s', self::class, $query::class),
            );
        }

        if ($query->limit < 1) {
            throw new InvalidArgumentException('limit must be >= 1');
        }
        if ($query->limit > self::MAX_LIMIT) {
            throw new InvalidArgumentException('limit exceeds MAX_LIMIT='.self::MAX_LIMIT);
        }

        return $this->repository->recentForUser($query->userId, $query->limit);
    }
}
```

- [ ] **Step 2: Create `ListPingsHandlerTest.php`**

```php
<?php

declare(strict_types=1);

use App\Modules\Ping\Application\Queries\ListPingsHandler;
use App\Modules\Ping\Application\Queries\ListPingsQuery;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use Tests\Support\Modules\Ping\InMemoryPingRepository;

beforeEach(function (): void {
    $this->repo = new InMemoryPingRepository();
    $this->repo->save(new Ping('a', 1, new PingNote(['en' => 'one']), new DateTimeImmutable()));
    $this->repo->save(new Ping('b', 1, new PingNote(['en' => 'two']), new DateTimeImmutable()));
    $this->repo->save(new Ping('c', 2, new PingNote(['en' => 'three']), new DateTimeImmutable()));
});

it('returns recent pings for a user (happy)', function (): void {
    $handler = new ListPingsHandler($this->repo);
    $result = $handler->handle(new ListPingsQuery(userId: 1, limit: 50));

    expect($result)->toHaveCount(2);
});

it('rejects negative limit (invalid)', function (): void {
    $handler = new ListPingsHandler($this->repo);

    expect(fn () => $handler->handle(new ListPingsQuery(userId: 1, limit: -1)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects limit beyond ceiling (invalid)', function (): void {
    $handler = new ListPingsHandler($this->repo);

    expect(fn () => $handler->handle(new ListPingsQuery(userId: 1, limit: 99999)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects garbage Query type (garbage)', function (): void {
    $handler = new ListPingsHandler($this->repo);

    $bogus = new class extends \Spatie\LaravelData\Data implements \App\Cqrs\Query {};

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
```

- [ ] **Step 3: Delete the UseCase + UseCase test**

```bash
rm apps/backend/app/Modules/Ping/Application/Queries/ListPingsUseCase.php
rm apps/backend/tests/Unit/Modules/Ping/Application/Queries/ListPingsUseCaseTest.php
```

- [ ] **Step 4: Run tests**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest --parallel --filter=ListPings 2>&1 | tail -10
```

Expected: 4 passing tests (the new HandlerTest cases).

- [ ] **Step 5: Run full suite + PHPStan + Deptrac**

```bash
pnpm nx test backend 2>&1 | tail -5
pnpm nx analyze backend 2>&1 | tail -3
pnpm nx deptrac backend 2>&1 | tail -3
```

Expected: all green. Note Deptrac's Application layer now contains fewer files but same dependency surface.

- [ ] **Step 6: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
git commit -m "$(cat <<'EOF'
refactor(ping): collapse ListPingsUseCase into ListPingsHandler

Decision #6 step C. Handler holds the limit-validation + repository
call directly. New ListPingsHandlerTest covers happy/invalid/garbage
(the old UseCase test had 3 cases; new Handler test has 4 — adds the
"rejects garbage Query type" case for the Handler's runtime guard).

Phase 4 pure-CQRS refactor complete. ADR 0008 documents the
supersession of ADR 0002 in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: ADR 0008 (pure CQRS) supersedes ADR 0002 + rewrite `architecture/cqrs.md`

**Files:**

- Modify: `docs/adr/0002-cqrs-three-layer.md` — change Status to "Superseded by ADR 0008"
- Create: `docs/adr/0008-pure-cqrs.md`
- Modify: `docs/architecture/cqrs.md` — rewrite three-layer sections to two-layer
- Modify: `docs/README.md` — link ADR 0008

- [ ] **Step 1: Read the existing ADR 0002 to know what to preserve**

```bash
cat docs/adr/0002-cqrs-three-layer.md
```

- [ ] **Step 2: Mark ADR 0002 as Superseded**

Change the front-matter or status line in `docs/adr/0002-cqrs-three-layer.md` from `**Status:** Accepted` to:

```markdown
**Status:** Superseded by [ADR 0008](./0008-pure-cqrs.md) on 2026-05-07
```

Add a note at the top of the body, just under the Status line:

```markdown
> **Superseded note (2026-05-07):** Phase 4 collapsed the three-layer split into pure CQRS. The Application layer now has Command + Handler only — no separate UseCase. See ADR 0008 for the rationale and impact. The Context, Decision, and original Consequences below are preserved as historical record.
```

Do not delete or edit the original Context/Decision/Consequences body — leave them as historical record.

- [ ] **Step 3: Author ADR 0008**

Reference: ADR template from `joelparkerhenderson/architecture-decision-record` and the existing ADR 0001's shape.

Create `docs/adr/0008-pure-cqrs.md`:

```markdown
# ADR 0008: Pure CQRS — collapse the UseCase layer into the Handler

**Date:** 2026-05-07
**Status:** Accepted (supersedes [ADR 0002](./0002-cqrs-three-layer.md))

## Context

ADR 0002 introduced a three-layer Application split: Command/Query (DTO) → Handler (bus adapter) → UseCase (framework-free business logic). The intent was to keep business logic testable without booting Laravel and to give a clean seam between framework integration and pure logic.

After Phases 2 and 3 shipped (the Ping module exercising the pattern end-to-end), three observations:

1. Each command needed three production files plus three test files. The repetitive cost was real.
2. The Handler's role degraded to a one-line delegate (`return $this->useCase->execute(...)`); it added a layer of indirection without earning its keep.
3. The `framework-free UseCase` guarantee was already provided by Domain (entities, value objects, repository interfaces) — UseCases imported only Domain types and were testable with in-memory repositories. Handlers can do the same.

## Decision

Collapse Command + Handler + UseCase into Command + Handler. The Handler:

- Takes the Domain repository directly via constructor injection (no UseCase intermediate).
- Holds the business logic in its `handle()` method.
- Performs a runtime type assertion on the incoming Command/Query (since `handle(Command|Query)` is the bus contract but Handlers need their concrete type's fields).

The bus middleware pipeline (Logging → Metrics → Authorize → Validate → Transaction for commands; the same minus Transaction for queries) is unchanged. The Permission marker interface contract is unchanged.

The `App\Cqrs\CommandUseCase` and `App\Cqrs\QueryUseCase` marker interfaces are deleted (they no longer signal a meaningful contract).

## Consequences

**Positive:**

- One fewer indirection per feature. Adding a new command goes from 3 files to 2.
- Tests merge: the 3 happy/invalid/garbage UseCase test cases live in the Handler test directly. Plus a new "rejects garbage Command/Query type" case for the Handler's runtime guard.
- Reading a module's Application/ directory is faster — the Handler is the obvious thing to open.

**Negative:**

- The Handler now holds the runtime-type assertion that used to live implicitly in `RecordPingUseCase::execute(int $userId, PingNote $note)` (typed signature). Mitigation: the assertion is one `instanceof` check at the top of `handle()` and is covered by a "rejects garbage Command type" test.
- ADR 0002's "framework-free UseCase" guarantee is now expressed implicitly: the Handler imports only Command/Query, Domain types, and the CommandHandler/QueryHandler contract. Reviewers must enforce this on every new module. PHPStan + Deptrac (four-layer ruleset) catches Application → Framework violations at CI time.

**Neutral:**

- The `naming.md` convention drops the `<Verb><Noun>UseCase` line.
- The `cqrs.md` architecture doc rewrites its "three contracts per side" sections to "two".
- The Permission marker interface decision (decision #5 from Phase 2) is unchanged.

## Alternatives Considered

- **Keep ADR 0002 as-is.** Rejected — the ceremony cost was real and the Handler-as-delegate pattern provided no daily-life value.
- **Make the UseCase optional (Handler may inline OR delegate).** Rejected — convention drift would make every module's Application/ directory ambiguous to reviewers.
- **Split UseCase the other way (UseCase holds business logic; Handler is a registered alias).** Rejected — same ceremony, different shape; doesn't address the cost.

## References

- [ADR 0002: Three-Layer CQRS (Superseded)](./0002-cqrs-three-layer.md)
- Phase 4 decision-log spec, decision #6 + §12 (concrete file impact)
- Implementation commits: `<insert SHAs after Tasks 5–7 land>`
- Bus middleware order: [ADR 0007](./0007-bus-middleware-order.md) — unchanged
```

(After Tasks 5–7 commit, the executing subagent should fill in the actual SHAs in the References section.)

- [ ] **Step 4: Rewrite `docs/architecture/cqrs.md`**

The existing doc (~360 lines) describes three layers. Replace its "The six contracts" section with "The four contracts" (drop CommandUseCase + QueryUseCase). Replace its "Adding a new command end-to-end" worked example to walk through the pure-CQRS shape using the now-current `RecordPingHandler.php`. Update the file paths in the worked example to the post-refactor state.

The middleware pipeline section is unchanged (decision #6 only changed Application internals, not bus internals).

The "Module ServiceProvider conventions" section is unchanged.

The "Testing patterns" section now references `RecordPingHandlerTest` and `ListPingsHandlerTest` only — no UseCase test files.

The "References" section adds ADR 0008.

- [ ] **Step 5: Update `docs/README.md`**

Add an entry for ADR 0008 in the ADR section. Mark ADR 0002 as superseded in the same list.

- [ ] **Step 6: Lint docs + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/adr/0002-cqrs-three-layer.md docs/adr/0008-pure-cqrs.md docs/architecture/cqrs.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: ADR 0008 (pure CQRS) supersedes ADR 0002 + rewrite architecture/cqrs.md

ADR 0008 documents the collapse of the three-layer Application split
into pure CQRS (Command + Handler). ADR 0002 is marked Superseded; its
original body is preserved as historical record.

architecture/cqrs.md rewritten to reflect two-contracts-per-side and
the post-refactor RecordPingHandler / ListPingsHandler examples.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Locale-aware stub callback

**Background:** Phase 3 progress memory flagged that `apps/web/src/app/api/auth/stub-callback/route.ts` hardcodes `/en/dashboard` as the post-login redirect. A user landing on `/pt/login` and clicking "Continue with Stub" gets redirected to `/en/dashboard`, dropping their locale.

**Files:**

- Modify: `apps/web/src/app/api/auth/stub-callback/route.ts`
- Modify: `apps/web/src/app/api/auth/stub-redirect/route.ts` (preserve locale through the round-trip)
- Modify: `apps/web/src/app/[locale]/login/page.tsx` (pass current locale via query)
- Modify: `apps/web/src/app/api/auth/stub-callback/route.test.ts` (if not exists, create) — happy/invalid/garbage cases

- [ ] **Step 1: Read existing route handlers**

```bash
cat apps/web/src/app/api/auth/stub-redirect/route.ts
cat apps/web/src/app/api/auth/stub-callback/route.ts
cat apps/web/src/app/[locale]/login/page.tsx
```

- [ ] **Step 2: Update `stub-redirect/route.ts` to forward `locale` query param**

```ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const identity = url.searchParams.get('identity') ?? 'stub-user@azimuth.local';
  const locale = url.searchParams.get('locale') ?? 'en';
  const cb = new URL('/api/auth/stub-callback', url);
  cb.searchParams.set('identity', identity);
  cb.searchParams.set('locale', locale);
  return NextResponse.redirect(cb, 302);
}
```

- [ ] **Step 3: Update `stub-callback/route.ts` to use the locale**

```ts
import { NextResponse } from 'next/server';
import { buildSessionCookie } from '@/shared/auth/cookie';
import { LOCALES, type Locale } from '@azimuth/i18n';

const BACKEND_URL = process.env.AZIMUTH_BACKEND_URL ?? 'http://127.0.0.1:8000';

function pickLocale(value: string | null): Locale {
  if (value && (LOCALES as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return 'en';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const identity = url.searchParams.get('identity') ?? 'stub-user@azimuth.local';
  const locale = pickLocale(url.searchParams.get('locale'));

  const upstream = await fetch(
    `${BACKEND_URL}/auth/socialite/stub/callback?identity=${encodeURIComponent(identity)}`,
    { headers: { Accept: 'application/json' } },
  );

  if (!upstream.ok) {
    return new NextResponse('upstream auth error', { status: 502 });
  }

  const body = (await upstream.json()) as {
    access_token: string;
    user: { id: number; email: string };
  };
  if (!body.access_token) {
    return new NextResponse('missing token', { status: 502 });
  }

  const secure = process.env.NODE_ENV === 'production';
  const cookie = buildSessionCookie(body.access_token, { secure });

  const dashboard = new URL(`/${locale}/dashboard`, url);
  const res = NextResponse.redirect(dashboard, 302);
  res.headers.set('Set-Cookie', cookie);
  return res;
}
```

- [ ] **Step 4: Update `[locale]/login/page.tsx` to pass the current locale**

```tsx
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { Button, Card } from '@azimuth/ui';

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg-secondary p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-4">{t('loginTitle')}</h1>
        <Link href={`/api/auth/stub-redirect?locale=${locale}`}>
          <Button variant="primary" className="w-full">
            {t('continueWithStub')}
          </Button>
        </Link>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: Create / update test**

If `apps/web/src/app/api/auth/stub-callback/route.test.ts` doesn't exist (Phase 3 didn't add one), create it. If it does, extend it.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

function makeReq(query: string) {
  return new Request(`http://localhost:3000/api/auth/stub-callback${query}`);
}

describe('/api/auth/stub-callback', () => {
  it('redirects to /en/dashboard for default locale (happy)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', user: { id: 1, email: 'a' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await GET(makeReq('?identity=a@b'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/en/dashboard');
  });

  it('honors locale=pt query param (happy)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', user: { id: 1, email: 'a' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await GET(makeReq('?identity=a@b&locale=pt'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/pt/dashboard');
  });

  it('falls back to en for unknown locale (garbage)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', user: { id: 1, email: 'a' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await GET(makeReq('?identity=a@b&locale=fr'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/en/dashboard');
  });

  it('returns 502 when upstream fails (invalid)', async () => {
    mockFetch.mockResolvedValue(new Response('boom', { status: 503 }));
    const res = await GET(makeReq('?identity=a@b'));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 6: Run tests**

```bash
pnpm nx test web 2>&1 | tail -10
```

Expected: 4 new tests passing; full suite green.

- [ ] **Step 7: Lint + commit**

```bash
pnpm nx lint web 2>&1 | tail -3
git add apps/web/src/app/api/auth apps/web/src/app/\[locale\]/login
git commit -m "$(cat <<'EOF'
feat(web): locale-aware stub-callback redirect

Phase 3 hygiene #2: stub-callback now reads `locale` query param,
validates against LOCALES, and redirects to /<locale>/dashboard.
Login page passes the current useLocale() through stub-redirect →
stub-callback. Defaults to /en/dashboard for unknown or missing locale.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Filament v3 → v4 sweep

**Background:** Phase 2 noted Filament v3 doesn't support Laravel 13; Phase 3 Task 21 adapted PingResource to v4 inline. This task audits other Filament integrations for any remaining v3-shaped code.

**Files:**

- Audit: `apps/backend/app/Providers/Filament/AdminPanelProvider.php`
- Audit: any other `apps/backend/app/Filament/**/*.php` files
- Modify whatever needs Filament v4 API updates

- [ ] **Step 1: Grep for v3-shaped Filament usage**

```bash
grep -rn "Filament\\\\Forms\\\\Form\\b" apps/backend/app/ 2>&1 || echo "no Form usage"
grep -rn "Filament\\\\Resources\\\\Resource" apps/backend/app/ 2>&1
grep -rn "discoverResources\|discoverPages\|discoverWidgets" apps/backend/app/ 2>&1
grep -rn "->schema(" apps/backend/app/ 2>&1 | grep -v "test"
```

The Phase 3 Task 21 fix already used Filament v4's `Schema` (not `Form`) and `->components(...)` (not `->schema(...)`) on the Ping resource. Verify no other places use v3 patterns.

- [ ] **Step 2: Read the panel provider**

```bash
cat apps/backend/app/Providers/Filament/AdminPanelProvider.php
```

Look for:

- `->discoverResources(in: ..., for: ...)` calls — verify they target v4 paths.
- `->id('admin')` and `->path('admin')` — fine in v4.
- `->login()` — fine in v4.
- Any `->forms([...])` or `->tables([...])` config — Filament v4 reorganized these into `->plugins([])` and component-level config; verify nothing v3-shaped lingers.

- [ ] **Step 3: Run Filament-related tests**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest --parallel --filter=Filament 2>&1 | tail -10
```

Expected: existing Filament tests (AdminPanelGateTest, PingResourceTest) pass.

- [ ] **Step 4: Live smoke test the admin panel**

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d backend
sleep 5
# Login as admin: assign Admin role to a fresh stub user, then visit /admin
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan tinker --execute='
$role = \Spatie\Permission\Models\Role::firstOrCreate(["name" => "admin", "guard_name" => "web"]);
$role->givePermissionTo(\Spatie\Permission\Models\Permission::all());
$user = \App\Models\User::firstOrCreate(["email" => "admin@local"], ["name" => "admin", "password" => bcrypt("admin")]);
$user->syncRoles(["admin"]);
echo "ok";
'
# Quick HTTP probe
curl -fsSL -o /tmp/admin.html -w "/admin -> %{http_code}\n" http://localhost:8000/admin
grep -oE "Filament|Pings|Modules" /tmp/admin.html | head -5
```

Expected: `/admin` returns 200 or 302 (redirect to login). The HTML markers confirm Filament is rendering.

- [ ] **Step 5: Iterate if any v3 patterns surfaced**

Apply Filament v4 API updates per https://filamentphp.com/docs/4.x/upgrade-guide. Re-run tests + lint after each change.

- [ ] **Step 6: Pint + commit**

```bash
pnpm nx lint:fix backend && pnpm nx lint backend
git add apps/backend
# If no changes were needed, just record the audit:
git diff --staged --quiet && git commit --allow-empty -m "$(cat <<'EOF'
chore(backend): Filament v4 audit — no v3 patterns found

Phase 3 hygiene #3: swept apps/backend/app/Filament/** and
app/Providers/Filament/AdminPanelProvider.php for v3-shaped Form/->schema
usage. Phase 3 Task 21 already adapted PingResource to v4 inline;
nothing else surfaced. AdminPanelGateTest + PingResourceTest still pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)" || git commit -m "$(cat <<'EOF'
fix(backend): Filament v4 sweep — update remaining v3-shaped APIs

Phase 3 hygiene #3: brought lingering Filament code in
app/Providers/Filament/AdminPanelProvider.php and adjacent files to v4
APIs (Schema replaces Form; ->components replaces ->schema).
Tests still green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Live Typesense smoke test

**Background:** Phase 3 set `SCOUT_DRIVER=null` in `phpunit.xml` so unit tests don't hit Typesense. This task adds a CI-only feature test that creates a `PingModel`, asserts it appears in the Typesense index, deletes it.

**Files:**

- Create: `apps/backend/tests/Feature/Modules/Ping/PingScoutSmokeTest.php`
- Modify: `apps/backend/phpunit.xml` — add a `<group name="scout-live">` exclusion (so the test runs only when explicitly included)
- Modify: `.github/workflows/ci.yml` — `test-backend` job runs the scout-live group as an extra step

- [ ] **Step 1: Author the test**

```php
<?php

declare(strict_types=1);

use App\Models\User;
use App\Modules\Ping\Infrastructure\PingModel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class)->group('scout-live');

beforeEach(function (): void {
    config(['scout.driver' => 'typesense']);
    PingModel::removeAllFromSearch();
});

afterEach(function (): void {
    PingModel::removeAllFromSearch();
});

it('round-trips a Ping through Typesense (happy)', function (): void {
    $user = User::factory()->create();
    $ping = PingModel::factory()->create([
        'user_id' => $user->id,
        'note' => ['en' => 'scout-smoke-test', 'pt' => 'teste-scout'],
    ]);

    // Scout pushes asynchronously by default; force the index to flush.
    PingModel::search('scout-smoke-test')->get(); // force initialization

    // Allow up to 3s for indexing to propagate (Typesense is fast but not instant).
    $found = retry(15, function () use ($ping) {
        $results = PingModel::search('scout-smoke-test')->get();
        return $results->contains(fn ($p) => $p->id === $ping->id) ? $results : null;
    }, 200);

    expect($found)->not->toBeNull();
});
```

(`retry()` is Laravel's helper; available globally in tests.)

- [ ] **Step 2: Update `phpunit.xml` to exclude the `scout-live` group by default**

Find the `<phpunit>` root element and add:

```xml
<groups>
  <exclude>
    <group>scout-live</group>
  </exclude>
</groups>
```

This means `pnpm nx test backend` (which runs `pest --parallel`) will skip the live test by default. CI runs it explicitly.

- [ ] **Step 3: Update CI to run the scout-live group**

In `.github/workflows/ci.yml`, find the `test-backend` job. After the existing Pest step, add:

```yaml
- name: Pest (scout-live group, against running Typesense)
  run: |
    docker compose -f infra/docker-compose.ci.yml exec -T backend ./vendor/bin/pest --group=scout-live
```

(The `test-backend` CI compose stack already includes Typesense. The PingScoutSmokeTest gets the live driver because it sets `config(['scout.driver' => 'typesense'])` at the top of its beforeEach.)

- [ ] **Step 4: Run locally**

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest --group=scout-live 2>&1 | tail -10
```

Expected: 1 passing test.

If it fails because Typesense's index doesn't have a schema for `pings`, run the schema setup that Scout's Typesense driver requires (look at `config/scout.php` `model-settings.PingModel` block; Scout creates the collection on first save). The test should work out of the box since the model is `Searchable`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/tests/Feature/Modules/Ping/PingScoutSmokeTest.php apps/backend/phpunit.xml .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
test(scout): live Typesense smoke test (CI-only group)

Phase 3 hygiene #4: PingModel round-trip through Typesense. Tagged
@group scout-live so it's excluded from the default unit/feature suite
(SCOUT_DRIVER=null there). The CI test-backend job runs it explicitly
via `pest --group=scout-live` against the running typesense container.

Catches schema mismatches between PingModel::toSearchableArray and the
config/scout.php typesense.model-settings declaration before they reach
production.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: PUSHER\_\* env in compose backend service

**Background:** Phase 3 progress memory flagged that the backend container's compose `environment:` block doesn't list `PUSHER_*`; the running container only reads `apps/backend/.env`. Phase 4's gate requires "everything works cold" — broadcasting must work without a manual `.env` setup step.

**Files:**

- Modify: `infra/docker-compose.yml` — add `PUSHER_*` env to backend + horizon services
- Modify: `infra/docker-compose.ci.yml` — same env vars (so CI's broadcasting smoke test, if any, sees them)

- [ ] **Step 1: Read existing backend service env**

```bash
grep -n "DB_HOST\|REDIS_HOST\|PUSHER" infra/docker-compose.yml | head -20
```

- [ ] **Step 2: Add PUSHER\_\* + BROADCAST_CONNECTION to backend env in `infra/docker-compose.yml`**

In the `backend:` service's `environment:` block, after the existing Redis vars, add:

```yaml
BROADCAST_CONNECTION: ${BROADCAST_CONNECTION:-pusher}
PUSHER_APP_ID: ${PUSHER_APP_ID:-azimuth-local}
PUSHER_APP_KEY: ${PUSHER_APP_KEY:-azimuth-local-key}
PUSHER_APP_SECRET: ${PUSHER_APP_SECRET:-azimuth-local-secret}
PUSHER_HOST: ${PUSHER_HOST:-soketi}
PUSHER_PORT: ${PUSHER_PORT:-6001}
PUSHER_SCHEME: ${PUSHER_SCHEME:-http}
PUSHER_APP_CLUSTER: ${PUSHER_APP_CLUSTER:-mt1}
```

The `${VAR:-default}` syntax falls back to the default when the variable isn't set in `.env` — keeping cold-start parity.

Apply the same change to the `horizon:` service (it shares the backend image and may emit broadcasts during job processing).

- [ ] **Step 3: Mirror in `infra/docker-compose.ci.yml`**

Add the same env block to the CI compose's backend service.

- [ ] **Step 4: Verify backend can broadcast**

Restart backend, run the existing BroadcastingSmokeTest:

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d --force-recreate backend
sleep 10
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest --filter=BroadcastingSmokeTest 2>&1 | tail -5
```

Expected: 1 passing test.

- [ ] **Step 5: Verify the env actually propagates**

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend printenv | grep -E "PUSHER|BROADCAST"
```

Expected: all 8 vars present with the values from `.env` or the defaults.

- [ ] **Step 6: Commit**

```bash
git add infra/docker-compose.yml infra/docker-compose.ci.yml
git commit -m "$(cat <<'EOF'
fix(infra): propagate PUSHER_* env to backend + horizon containers

Phase 3 hygiene #5: containers were reading these from apps/backend/.env
(populated during Phase 2 Task 8 setup), which broke the cold-start
gate. Promote them to compose with ${VAR:-default} fallbacks so the
container env always carries them — matches the pattern already used
for DB_*, REDIS_*.

CI compose updated with the same defaults so broadcasting tests on the
test-backend job see the same shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `docs/architecture/overview.md` (Mermaid system diagram + ERD)

**Files:**

- Create: `docs/architecture/overview.md`
- Modify: `docs/README.md` — link to the new doc

- [ ] **Step 1: Author `docs/architecture/overview.md`**

The doc has six required sections, in this order:

1. **One-paragraph framing.** What Azimuth is, what the scaffold proves, where to look first.
2. **System diagram.** Mermaid `flowchart` showing: browser → Next.js (apps/web) → /api/proxy → backend (Octane on FrankenPHP) → {Postgres, Dragonfly, Typesense, Soketi, MinIO}. Sidecars: Mailpit, Horizon, Filament admin at /admin, Scramble at /docs/api.
3. **Request lifecycle for `RecordPing`.** Mermaid `sequenceDiagram` showing: browser → /api/proxy → backend route → CommandBus → Logging→Metrics→Authorize→Validate→Transaction → RecordPingHandler → PingRepository → PingModel → DB. Highlights the four layers (Domain, Application, Infrastructure, Presentation).
4. **ERD.** Mermaid `erDiagram` of the day-1 schema: `users`, `pings`, `permissions`, `roles`, `model_has_permissions`, `model_has_roles`, `role_has_permissions`, `oauth_clients`, `oauth_access_tokens`, `oauth_refresh_tokens`, `features`, Cashier tables (commented as unmigrated).
5. **Where to look first.** Table of (question → canonical doc), e.g.:
   - "How do I add a feature?" → `docs/runbooks/adding-a-feature.md`
   - "What runs where?" → `docs/architecture/monorepo-layout.md`
   - "How does auth work?" → `docs/architecture/auth.md`
   - "How are commands handled?" → `docs/architecture/cqrs.md`
6. **References.** Link list to all the architecture docs + ADRs + decision-log specs.

Real prose only — no placeholders. Aim for ~200–250 lines.

The Mermaid blocks use fenced code with `mermaid` language. GitHub renders them inline.

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/architecture/overview.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: architecture/overview.md (system + sequence + ERD diagrams)

Top-level orientation doc. Mermaid system diagram, RecordPing sequence
showing the bus + middleware pipeline, ERD of the day-1 schema, and a
"where to look first" table for new contributors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: `docs/architecture/monorepo-layout.md`

**Files:**

- Create: `docs/architecture/monorepo-layout.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Author the doc**

Required sections:

1. **Why a monorepo.** Two-paragraph framing: shared types between front+back, single CI gate, atomic refactors across apps/libs.
2. **Top-level layout.** Tree:

```text
azimuth/
├── apps/
│   ├── backend/      # Laravel 13 + Octane on FrankenPHP
│   └── web/          # Next.js 15 App Router
├── libs/
│   ├── design-tokens/
│   ├── ui/
│   ├── api-client/
│   └── i18n/
├── infra/            # docker-compose.{yml,ci.yml}, Dockerfile, init scripts
├── scripts/          # Node-based CI helpers (route-coverage, etc.)
├── docs/             # this directory; spec/plan/ADR/architecture/runbooks/conventions
└── .github/workflows/
```

1. **Per-app/lib responsibility table.** Each row: project name, what it owns, who depends on it, how to test it.
2. **Dependency graph.** Mermaid `graph LR`: web → {api-client, ui, design-tokens, i18n}; api-client → backend (via openapi.json snapshot); ui → design-tokens; backend → none.
3. **Workspace plumbing.** pnpm workspaces, Nx targets per project, lefthook pre-commit hooks (Prettier on all stage; ESLint on TS/TSX; Pint on PHP).
4. **References.**

Aim for ~150–200 lines.

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/architecture/monorepo-layout.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: architecture/monorepo-layout.md

Per-project responsibility table + dependency graph + workspace
plumbing. Companion to architecture/overview.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: `docs/conventions/tdd.md`

**Files:**

- Create: `docs/conventions/tdd.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Author the doc**

Required sections:

1. **The rule.** Every UseCase, Handler, and HTTP feature gets at minimum **happy / invalid / garbage** test cases. Quote CLAUDE.md hard rule #1.
2. **Why three paths.** Brief defense:
   - Happy proves the feature works.
   - Invalid proves business rules reject bad-but-shaped input.
   - Garbage proves the type system + runtime guards reject malformed input.
3. **Backend examples.** Three concrete examples from the Ping module:
   - `RecordPingHandlerTest` (post-pure-CQRS state) — happy/invalid/garbage on a Handler that holds business logic.
   - `PingNoteTest` — domain VO invariants.
   - `PingControllerTest` — HTTP feature test with Passport token + Spatie permissions.
4. **Frontend examples.** Three from `apps/web`:
   - `RecordPingFormTest` — RHF + Zod form.
   - `PingListTest` — RTK Query data + loading/empty/error states.
   - `LocaleSwitcherTest` — navigation interaction.
5. **In-memory repository fixture pattern.** Walk through `tests/Support/Modules/Ping/InMemoryPingRepository.php` — why it's in `tests/Support/`, why it's framework-free, how new modules add their own.
6. **Pest, RTL, and Playwright — when to use which.** Table:
   - Pest unit (`tests/Unit/`): pure-domain, in-memory repos, no DB
   - Pest feature (`tests/Feature/`): RefreshDatabase, real DB, Passport tokens
   - Vitest + RTL: React component behavior, mocked fetch
   - Playwright: cross-feature happy paths only (login → ping → switch theme)
7. **Anti-patterns.** What NOT to do: skip the garbage path, mock the database, write tests that don't exercise the contract.
8. **References.**

Aim for ~200–250 lines.

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/conventions/tdd.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: conventions/tdd.md (happy/invalid/garbage rule)

Codifies CLAUDE.md hard rule #1 with concrete examples from the Ping
module on both backend (Pest) and frontend (Vitest + RTL). Documents
when to reach for Pest unit vs Pest feature vs Vitest+RTL vs Playwright.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: `docs/conventions/solid.md`

**Files:**

- Create: `docs/conventions/solid.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Author the doc**

Required sections (one principle per section, with concrete code references):

1. **Single Responsibility.** Each Handler does one thing; each Domain entity is one concept; each component renders one piece of UI. Concrete example: `RecordPingHandler.php` (post-refactor) holds only the "create a ping" logic — no validation rules unrelated to that, no mailers, no broadcasting.
2. **Open/Closed.** Adding a new module doesn't require modifying existing module code. Concrete example: adding `App\Modules\Aircraft\` registers itself via its own `AircraftServiceProvider` — `bootstrap/providers.php` adds one line; no other files touched. The CQRS `HandlerRegistry` is a register-by-bind pattern, not a switch statement.
3. **Liskov Substitution.** `EloquentPingRepository` honors the `PingRepository` contract; tests use `InMemoryPingRepository` with the same contract. Concrete example: the same `RecordPingHandler` works against either, without changes.
4. **Interface Segregation.** The CQRS contracts (`Command`, `Query`, `CommandHandler`, `QueryHandler`) are tiny. The `Permission` marker interface (1 method via `BackedEnum`) is tinier. Concrete example: `RecordPingCommand` doesn't extend a giant base class; it implements just `Command` + extends `Spatie\LaravelData\Data`.
5. **Dependency Inversion.** UseCases (now Handlers) depend on Domain repository interfaces, not Eloquent. The bus depends on `CommandHandler`/`QueryHandler` interfaces, not concrete classes. Concrete example: `PingServiceProvider::register` binds `PingRepository` → `EloquentPingRepository` — the Handler imports only the interface.
6. **How Deptrac enforces this.** The four-layer ruleset (Domain → no framework; Application → Domain only; Infrastructure → all + Framework; Presentation → Application + Framework) is a CI-time guard against SOLID drift. Reference `apps/backend/deptrac.yaml`.
7. **References.**

Aim for ~200 lines.

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/conventions/solid.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: conventions/solid.md

How each SOLID principle shows up in this codebase, with concrete code
references. Closes the loop with Deptrac's four-layer ruleset as the
CI-time enforcement.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: `docs/conventions/naming.md`

**Files:**

- Create: `docs/conventions/naming.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Author the doc**

Reference: spec §11 (naming conventions). The doc reproduces §11 verbatim **with one change**: drop the `<Verb><Noun>UseCase` line per decision #6 (pure CQRS). Add a note explaining the supersession.

Required sections:

1. **Why naming matters.** Two paragraphs: PR readability, code-search-by-suffix, onboarding speed.
2. **Backend (Laravel) naming.**
   - Commands: `<Verb><Noun>Command` (`RegisterAircraftCommand`)
   - Queries: `<Verb><Noun>Query` (`ListAircraftQuery`)
   - Handlers: same name + `Handler` (`RegisterAircraftHandler`)
   - Result Data: `<Verb><Noun>Result` (`RegisterAircraftResult`)
   - Repository interfaces (Domain): `AircraftRepository`
   - Eloquent implementations (Infrastructure): `EloquentAircraftRepository`
   - Permission enum: `<Module>Permission` (`AircraftPermission`); cases use dot notation: `'aircraft.view'`, `'aircraft.create'`
   - Module ServiceProvider: `<Module>ServiceProvider`
   - Filament Resource: `<Module>Resource` (`AircraftResource`)

   Note: ADR 0008 (pure CQRS) removes the per-feature UseCase. The Handler holds business logic directly.

3. **Frontend (Next.js + Redux) naming.**
   - Frontend feature folders: kebab-case (`features/aircraft-list/`)
   - RTK Query endpoints: `<noun>Api` (`aircraftApi`); endpoint methods `list`, `get`, `create`, `update`, `delete`
   - Component files: PascalCase (`AircraftList.tsx`, `RegisterAircraftForm.tsx`)
   - Hooks: `use<Noun>` (`useAircraft`, `useListAircraftQuery`)
   - Zod schemas: `<verb><Noun>Schema` (`registerAircraftSchema`)

4. **i18n keys.** Reference the i18n.md convention; brief summary: feature catalogs at `apps/web/src/messages/<feature>.{en,pt}.json`; dot-notation keys (`feature.action.label`).

5. **Test file naming.** `<ProductionFile>Test.php` (Pest); `<ProductionFile>.test.tsx` (Vitest + RTL); `<flow>.spec.ts` (Playwright).

6. **References.** Link to the original spec §11.

Aim for ~150 lines.

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/conventions/naming.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: conventions/naming.md

Naming rules from spec §11, with the UseCase line dropped per ADR 0008.
Covers backend, frontend, i18n keys, and test files.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: `docs/conventions/i18n.md`

**Files:**

- Create: `docs/conventions/i18n.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Author the doc**

Required sections:

1. **The rule.** Every user-facing string passes through an i18n catalog. CLAUDE.md hard rule #5 quoted.
2. **Where catalogs live.**
   - Shared (`libs/i18n/src/messages/{en,pt}.json`) — common navigation, theme labels, errors.
   - Per-feature (`apps/web/src/messages/<feature>.{en,pt}.json`) — strings specific to one feature.
   - Backend (`apps/backend/lang/{en,pt}/<feature>.php`) — Filament labels, mailer copy, validation messages.
3. **Key naming.** Dot-notation; lowercase; feature-prefixed:
   - `common.appName`
   - `nav.dashboard`
   - `ping.title`
   - `auth.continueWithStub`
4. **How to add a new locale.** Three-step procedure (link to `runbooks/adding-a-locale.md`).
5. **How to add a new feature catalog.**
   - Frontend: create `<feature>.{en,pt}.json` files; merge in `apps/web/src/i18n/request.ts`'s `PER_FEATURE` map.
   - Backend: create `lang/{en,pt}/<feature>.php` files; reference via `__('feature.key')`.
6. **Enforcement.**
   - Frontend: ESLint `react/jsx-no-literals` — fails CI on hardcoded JSX strings.
   - Backend: code review; no automated check.
7. **Anti-patterns.**
   - Hardcoding "OK" / "Cancel" labels in components — even one-word strings go through `t()`.
   - Mixing locale data into business code (e.g., switching on locale in a UseCase).
   - Translating commit messages, log messages, or technical errors — those stay English.
8. **References.**

Aim for ~150 lines.

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/conventions/i18n.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: conventions/i18n.md

Message catalog rules: where they live, how keys are named, how to add
locales/features, and which strings stay English (logs, commits,
technical errors). Links to ESLint react/jsx-no-literals as the
frontend enforcement.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: `docs/runbooks/adding-a-feature.md` (the canonical 12-step workflow)

**Files:**

- Create: `docs/runbooks/adding-a-feature.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Author the doc**

Reference: spec §12 (12-step workflow). The doc walks through the canonical sequence with a worked example anchored on the Ping module's actual git history (post-pure-CQRS).

Required sections:

1. **Overview.** This runbook is the canonical "how a feature gets built" reference. Every new feature follows these 12 steps. Phase 4 brought the runbook into existence after the scaffold was complete; the Ping module is its retroactive worked example.

2. **The 12 steps.** Each step is a numbered subsection with: what to do; which files to create/modify; what to test; what to commit. Steps verbatim from §12 but expanded:
   1. Brainstorm with the user (`superpowers:brainstorming`)
   2. Write the spec to `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md`
   3. Write the plan (`superpowers:writing-plans`)
   4. TDD the Handler — happy/invalid/garbage tests against the Handler with in-memory repos, then implement (post-pure-CQRS: Handler holds business logic; UseCase no longer exists)
   5. Wire bus registration in the module's ServiceProvider
   6. Add the controller / Filament action / console command that builds the Command/Query and dispatches via the bus
   7. Annotate the route for Scramble; refresh OpenAPI snapshot via `pnpm nx run api-client:refresh`
   8. Build the frontend feature — RTK Query endpoint, Zod schema, components
   9. Wire the page under `apps/web/src/app/[locale]/<feature>/page.tsx`
   10. Add per-feature i18n catalogs
   11. Add Playwright E2E for the happy path
   12. Update `/docs` (architecture if any decision; conventions if a new pattern); run `pnpm lint:docs` + `pnpm lint:openapi` + `pnpm check:route-coverage`; open PR

3. **Worked example: the Ping module.** Walk through the actual git commits from Phase 2 + Phase 3 + Phase 4 that built Ping. Reference SHAs. For each step, "we did X here, see commit YYY".

4. **Common pitfalls.**
   - Forgetting to refresh the OpenAPI snapshot after adding routes (route-coverage CI catches it).
   - Hardcoding strings in JSX (`react/jsx-no-literals` catches it).
   - Not assigning the appropriate role to test users (`docs/architecture/auth.md` covers this).
   - Letting permission enum cases drift from the seeder (PHPStan rule + tests catch it).

5. **References.**

Aim for ~250–300 lines.

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/runbooks/adding-a-feature.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: runbooks/adding-a-feature.md (canonical 12-step workflow)

Spec §12 expanded with concrete file paths, a Ping-module worked
example anchored on real git SHAs, and a common-pitfalls section.
Reflects the post-pure-CQRS Handler-holds-logic shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: `docs/runbooks/adding-a-locale.md`

**Files:**

- Create: `docs/runbooks/adding-a-locale.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Author the doc**

Required sections:

1. **Overview.** Adding a third locale (e.g., Spanish, `es`) is a five-touchpoint change. This runbook walks through them.
2. **Files that change.**
   - `libs/i18n/src/locales.ts`: add the new locale to `LOCALES`.
   - `libs/i18n/src/messages/<locale>.json`: create the shared catalog (translate from `en.json`).
   - `apps/web/src/messages/<feature>.<locale>.json`: create a per-feature catalog for each `apps/web/src/messages/<feature>.en.json` that exists.
   - `apps/backend/lang/<locale>/<feature>.php`: create backend catalog parallel to `lang/en/<feature>.php`.
   - `libs/i18n/src/locales.test.ts`: extend the parallel-keys test to cover the new locale.
3. **Worked example: adding `es` (Spanish).** Concrete diff for each file. Include sample translations.
4. **What stays unchanged.** Middleware (`createMiddleware` reads `LOCALES`), router, `next-intl/request.ts` (auto-merge), URL prefixing. The new locale just appears at `/es/...` automatically.
5. **Verification.**
   - `pnpm nx test i18n` — the parallel-keys test should still pass.
   - Manual: `curl /es/dashboard` after login → returns localized HTML.
6. **References.**

Aim for ~120–150 lines.

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/runbooks/adding-a-locale.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: runbooks/adding-a-locale.md

Five-touchpoint procedure for adding a third locale (e.g., 'es'). Lists
exact files, sample diffs, and verification steps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: `docs/runbooks/adding-a-socialite-provider.md`

**Files:**

- Create: `docs/runbooks/adding-a-socialite-provider.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Author the doc**

Required sections:

1. **Overview.** The stub Socialite driver in Phase 2 is a development convenience. Production needs real OAuth providers (Google, GitHub, Microsoft). This runbook walks through adding one, using Google as the example.
2. **Steps for adding Google.**
   - `composer require socialiteproviders/google`
   - Register in `bootstrap/providers.php` if needed (Socialite providers usually auto-discover)
   - Add `services.google` config block to `apps/backend/config/services.php` reading `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` from env
   - Add the env vars to `.env` and `.env.example` (with placeholders for prod values)
   - Author `App\Http\Controllers\Auth\GoogleSocialiteController` (mirroring `SocialiteStubController`; the differences are: real callback handles state validation; redirect URI is the actual `/api/auth/google/callback`)
   - Wire routes in `apps/backend/routes/web.php`: `/auth/socialite/google/{redirect,callback}`
   - Add Next.js mirror at `apps/web/src/app/api/auth/google/{redirect,callback}/route.ts` (same shape as stub-redirect/stub-callback but uses Google)
   - Add the "Continue with Google" button to `apps/web/src/app/[locale]/login/page.tsx`
   - Author Pest feature test: stub Google's HTTP via Http::fake() and verify the round-trip
3. **What stays unchanged.** Passport tokens, the bus middleware, the proxy route handler.
4. **Cookie + token flow.** Same as stub: Next.js callback fetches the backend's callback, extracts the access_token, sets the httpOnly cookie. The Bearer token is opaque to the user; only the email/identity differs.
5. **Common pitfalls.**
   - Mismatched redirect URI between Google's OAuth app config and `GOOGLE_REDIRECT_URI` env var.
   - Forgetting state validation (Socialite handles it but only when called via `Socialite::driver(...)->user()`, not via raw HTTP).
   - Not localizing the "Continue with Google" button label.
6. **References.**

Aim for ~150 lines.

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/runbooks/adding-a-socialite-provider.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: runbooks/adding-a-socialite-provider.md

Walks through adding Google OAuth as an example. Mirrors the stub
controller shape. Backend changes: composer require, services config,
controller, routes. Frontend changes: Next.js route handlers + login
button. Cookie + Passport flow is identical.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: `docs/runbooks/rotating-passport-keys.md`

**Files:**

- Create: `docs/runbooks/rotating-passport-keys.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Author the doc**

Required sections:

1. **When to rotate.** Compromise; scheduled rotation (annual recommended); after a developer leaves the team.
2. **What rotation means.** Generating new RSA keys; all existing access tokens immediately invalidated; users must re-authenticate.
3. **Steps.**
   - Stop the backend container: `docker compose stop backend horizon`
   - Remove the keys: `docker compose run --rm backend rm storage/passport/oauth-private.key storage/passport/oauth-public.key`
   - Restart: `docker compose up -d backend horizon` — entrypoint regenerates keys via `passport:keys --force`
   - `AppServiceProvider::boot()` chmod's them to 600/660 on first request (Phase 4 hygiene)
   - Optional: revoke all existing access tokens explicitly via `passport:purge --revoked --expired`
4. **Verification.**
   - `docker compose exec -T backend ls -la storage/passport/` — confirms new files with recent mtime.
   - Hit `/auth/socialite/stub/callback` — should mint a new token signed by the new key.
   - Old tokens (saved in browser cookies) — try them; should get 401.
5. **Production considerations.**
   - The keys live on the `passport-keys` named volume — survives container recreates.
   - Backups: include the volume in your backup strategy.
   - Multi-instance: all instances must share the same keys; mount the volume from a shared filesystem or sync via a secret manager.
6. **References.**

Aim for ~100–120 lines.

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/runbooks/rotating-passport-keys.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: runbooks/rotating-passport-keys.md

Procedure for invalidating all access tokens by regenerating the OAuth
keypair. Mentions the Phase 4 AppServiceProvider chmod safety net for
Docker Desktop on Windows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: `docs/runbooks/repo-tour.md`

**Files:**

- Create: `docs/runbooks/repo-tour.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Author the doc**

Required sections (a 10-minute walkthrough for a fresh contributor or Claude session):

1. **What is Azimuth.** One paragraph. Link to `architecture/overview.md` for diagrams.
2. **Clone + run (5 minutes).** Reference `runbooks/local-dev.md` for the commands.
3. **Read these four files first.**
   - `CLAUDE.md` — collaboration rules and pointers.
   - `docs/architecture/overview.md` — system diagram + ERD + "where to look first".
   - `docs/runbooks/adding-a-feature.md` — the canonical workflow.
   - `docs/conventions/tdd.md` — testing rules.
4. **Tour the Ping module (3 minutes).** Concrete file walkthrough as a worked example:
   - `app/Modules/Ping/Domain/Ping.php` — entity (framework-free)
   - `app/Modules/Ping/Domain/PingRepository.php` — interface (framework-free)
   - `app/Modules/Ping/Application/Commands/RecordPingCommand.php` — DTO + permission()
   - `app/Modules/Ping/Application/Commands/RecordPingHandler.php` — business logic (post-pure-CQRS)
   - `app/Modules/Ping/Infrastructure/EloquentPingRepository.php` — concrete
   - `app/Modules/Ping/Presentation/Http/PingController.php` — HTTP entry; dispatches via bus
   - `apps/web/src/features/ping/` — frontend mirror
5. **Useful daily commands.**
   - `pnpm nx test backend` / `pnpm nx test web`
   - `pnpm nx lint backend` / `pnpm nx lint web`
   - `pnpm nx analyze backend` / `pnpm nx deptrac backend`
   - `pnpm lint:docs` / `pnpm lint:openapi` / `pnpm check:route-coverage`
   - `pnpm nx e2e web`
6. **Where to look when you're stuck.** Re-references the "Where to look first" table from `architecture/overview.md`.

Aim for ~200 lines. Tightness matters here — this is the doc that gets read once.

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/runbooks/repo-tour.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: runbooks/repo-tour.md (10-minute walkthrough)

The doc a fresh contributor (or fresh Claude session) reads first.
Tours the Ping module file-by-file as the worked example, lists the
daily commands, and points to the four canonical docs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 24: `docs/runbooks/inspecting-soketi.md` (curl recipe; soketi-ui out of scope)

**Files:**

- Create: `docs/runbooks/inspecting-soketi.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Author the doc**

Required sections:

1. **Why no UI.** Phase 4 §11 deferred soketi-ui (Daynnnnn/soketi-ui — Laravel app + MySQL, no published image). Curl-based recipes give the same visibility for ~95% of debugging needs.
2. **Soketi's HTTP debug endpoints.**
   - `http://localhost:9601/usage` — bytes sent/received per app
   - `http://localhost:9601/metrics` — Prometheus-format metrics
   - `http://localhost:9601/apps` — registered apps
   - Production-only: `/channels`, `/users` require app-level auth (signature in query string per Pusher protocol)
3. **Probing channels via the Pusher HTTP API.** Recipe for listing active channels for an app, using the app secret to sign the query:

```bash
APP_ID=azimuth-local
APP_KEY=azimuth-local-key
APP_SECRET=azimuth-local-secret

# List channels
curl -fsS "http://localhost:6001/apps/${APP_ID}/channels" -G \
  --data-urlencode "auth_key=${APP_KEY}" \
  --data-urlencode "auth_timestamp=$(date +%s)" \
  --data-urlencode "auth_version=1.0"
# (Soketi accepts unsigned local requests by default; production requires
# the full HMAC signature per https://pusher.com/docs/channels/library_auth_reference/rest-api)
```

1. **Browser-side inspection.** In the running app, paste into devtools:

```js
Pusher.logToConsole = true;
```

This logs every event through the Pusher JS client. Combined with the dashboard's network tab, gives full visibility into channels, subscribes, broadcast events.

1. **Troubleshooting common issues.**
   - Soketi shows 0 connections: check `BROADCAST_CONNECTION=pusher` in backend; verify `PUSHER_HOST=soketi` not `localhost`.
   - Events not arriving in browser: check `PUSHER_APP_KEY` matches between backend and `apps/web/src/shared/socket.ts`.
   - Healthcheck fails: see Phase 1 deviation note about `127.0.0.1:9601` vs `localhost`.

2. **If you really need a UI.** Path forward documented in Phase 4 §11: build Daynnnnn/soketi-ui with a custom Dockerfile that adds `pdo_pgsql`, point at our Postgres, run migrations on first start. ~50 lines of compose. Deferred until WebSocket debugging becomes a real bottleneck.
3. **References.**

Aim for ~150 lines.

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add docs/runbooks/inspecting-soketi.md docs/README.md
git commit -m "$(cat <<'EOF'
docs: runbooks/inspecting-soketi.md (curl recipes)

Replaces a soketi-ui dashboard for now. Documents Soketi's built-in
HTTP debug endpoints, Pusher.logToConsole for browser-side event
tracing, and common troubleshooting paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 25: CLAUDE.md full rewrite

**Files:**

- Modify: `CLAUDE.md` (full rewrite)

- [ ] **Step 1: Read current CLAUDE.md**

```bash
cat CLAUDE.md
```

The Phase 1 version is ~50 lines with hard rules and forward-references ("see X (added in Phase 4)").

- [ ] **Step 2: Author the new CLAUDE.md**

Replace `CLAUDE.md` entirely with the structure below. Real prose, no placeholders.

```markdown
# Azimuth — Collaboration Rules

> Your companion from A to Z.

This file is loaded automatically into every Claude Code session in this repo. It is the onboarding contract: any agent or human contributor opening the repo cold should leave this page knowing what's here, the rules they have to follow, and where to find anything else.

**Phase status:** Scaffold complete (Phases 1–4 shipped). Ready for the first real domain feature (Aircraft CRUD; specced separately).

## Stack at a glance

- **Monorepo:** Nx 20 over pnpm workspaces; `apps/{backend,web}` + `libs/{design-tokens,ui,api-client,i18n}`.
- **Backend:** Laravel 13 + PHP 8.3 on FrankenPHP/Octane (`apps/backend`). Pure-CQRS Application layer (Command + Handler; ADR 0008). Spatie packages: data, browsershot, translatable, **laravel-permission v7 with PHP-enum permission identifiers (never raw strings; PHPStan rule enforces this)**.
- **Frontend:** Next.js 15 App Router + Redux Toolkit + RTK Query (`apps/web`). 4-theme palette (day/dusk/night/bright) hand-extracted from Openbridge. httpOnly cookie + Next.js proxy auth (Bearer token never reaches browser JS). React Hook Form + Zod for forms.
- **Data stores:** Postgres + PostGIS, Dragonfly (Redis-compatible), Typesense (with dashboard at :8109), Soketi (pusher-compatible WS), MinIO (S3-compatible), Mailpit (dev SMTP).
- **Filament admin:** `/admin` (gated to `Role::Admin`).
- **API docs:** Scramble at `/docs/api`.
- **CI:** GitHub Actions; jobs `lint-and-typecheck`, `test-backend`, `test-frontend`, `e2e`, `docs-build`.

## Hard rules

These are non-negotiable. Each links to its canonical convention doc.

1. **TDD always.** Every feature is test-first. Each suite covers happy / invalid / garbage paths at minimum. → [`docs/conventions/tdd.md`](docs/conventions/tdd.md)
2. **SOLID at every layer.** Domain knows no framework; Handlers hold business logic + bus-adapter concerns (post-pure-CQRS, ADR 0008); Repositories own persistence. Deptrac enforces the four layers at CI time. → [`docs/conventions/solid.md`](docs/conventions/solid.md)
3. **No raw permission strings.** Authorization uses `BackedEnum` cases that implement `App\Authorization\Contracts\Permission`. The PHPStan custom rule (`PreventRawPermissionStrings`) fails CI on `Gate::*` calls with string args. → [`docs/architecture/auth.md`](docs/architecture/auth.md)
4. **Pint runs after every backend task.** `pnpm nx lint:fix backend` is part of "done" for any backend change. Lefthook also runs Pint on staged PHP files in pre-commit.
5. **No hardcoded user-facing strings.** Frontend: all strings pass through next-intl catalogs; ESLint `react/jsx-no-literals` enforces it on JSX. Backend: Laravel `lang/` files for Filament + mailers + validation. → [`docs/conventions/i18n.md`](docs/conventions/i18n.md)
6. **API docs MUST work.** Scramble (`/docs/api`) regenerates on every boot. The CI `docs-build` job runs `redocly lint` on the OpenAPI snapshot and a custom route-coverage check that fails if any `/api/*` route is missing from the spec.
7. **`/docs` is evergreen.** Every architectural change updates the relevant `architecture/*.md`. Significant decisions get an ADR. The `docs-build` CI job markdownlints everything.
8. **Squared UI.** No `border-radius` except `rounded-full` for avatars/pills/spinners (Openbridge convention). The Tailwind preset in `libs/design-tokens/src/tailwind-preset.ts` exposes only `borderRadius: { none: '0', full: '9999px' }`.

## Where to look first

| Question                              | Doc                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| What is this project?                 | [`docs/architecture/overview.md`](docs/architecture/overview.md) (system diagram + ERD)                   |
| How do I run things locally?          | [`docs/runbooks/local-dev.md`](docs/runbooks/local-dev.md)                                                |
| How do I add a feature?               | [`docs/runbooks/adding-a-feature.md`](docs/runbooks/adding-a-feature.md) (the canonical 12-step workflow) |
| What's in each app/lib?               | [`docs/architecture/monorepo-layout.md`](docs/architecture/monorepo-layout.md)                            |
| How does CQRS work here?              | [`docs/architecture/cqrs.md`](docs/architecture/cqrs.md) (post-ADR-0008 pure CQRS)                        |
| How does auth work?                   | [`docs/architecture/auth.md`](docs/architecture/auth.md) (Passport + Socialite stub + Spatie permissions) |
| What are the data stores for?         | [`docs/architecture/data-stores.md`](docs/architecture/data-stores.md)                                    |
| Frontend stack details?               | [`docs/architecture/frontend.md`](docs/architecture/frontend.md)                                          |
| Naming conventions?                   | [`docs/conventions/naming.md`](docs/conventions/naming.md)                                                |
| Adding a locale?                      | [`docs/runbooks/adding-a-locale.md`](docs/runbooks/adding-a-locale.md)                                    |
| Adding a real OAuth provider?         | [`docs/runbooks/adding-a-socialite-provider.md`](docs/runbooks/adding-a-socialite-provider.md)            |
| Rotating Passport keys?               | [`docs/runbooks/rotating-passport-keys.md`](docs/runbooks/rotating-passport-keys.md)                      |
| Inspecting Soketi / WebSocket events? | [`docs/runbooks/inspecting-soketi.md`](docs/runbooks/inspecting-soketi.md)                                |
| Quick repo tour for newcomers?        | [`docs/runbooks/repo-tour.md`](docs/runbooks/repo-tour.md)                                                |

## Workflow

The canonical "how a feature gets built" is in [`docs/runbooks/adding-a-feature.md`](docs/runbooks/adding-a-feature.md). Short version:

1. `superpowers:brainstorming` to design
2. Spec → `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md`
3. `superpowers:writing-plans` to plan
4. `superpowers:subagent-driven-development` to execute
5. TDD Handler → wire bus → Controller / Filament / route → annotate for Scramble → frontend → Playwright → docs → PR

## Local dev

`docker compose --env-file .env -f infra/docker-compose.yml up -d` brings up the 8 backend services. `pnpm nx dev web` runs the Next.js host-side dev server at http://localhost:3000. WSL2 users: copy `apps/web/.env.local.example` to `.env.local` and use `host.docker.internal:8000` as the backend target. Full setup: [`docs/runbooks/local-dev.md`](docs/runbooks/local-dev.md).

## What lives where

- **Specs / plans / decision logs:** `docs/superpowers/specs/`, `docs/superpowers/plans/`
- **Architecture:** `docs/architecture/`
- **ADRs:** `docs/adr/`
- **Conventions:** `docs/conventions/`
- **Runbooks:** `docs/runbooks/`
- **CI:** `.github/workflows/ci.yml`
- **Backend:** `apps/backend/app/{Cqrs,Modules,Authorization,Authentication,Models,Providers,Http}/`
- **Frontend:** `apps/web/src/{app,features,shared}/`
- **Shared libs:** `libs/{design-tokens,ui,api-client,i18n}/`

## When you get stuck

1. Read the relevant doc from "Where to look first" above.
2. Run the smoke tests: `pnpm nx test backend`, `pnpm nx test web`, `pnpm nx e2e web`.
3. Check the analysis tools: `pnpm nx analyze backend` (PHPStan level 8), `pnpm nx deptrac backend` (four-layer ruleset).
4. Read the Ping module — it's the canonical worked example of every pattern: `app/Modules/Ping/` (backend), `apps/web/src/features/ping/` (frontend).
5. The phase-N-progress memories under `~/.claude/projects/<project-id>/memory/` carry session-spanning lessons learned.
```

- [ ] **Step 3: Lint + commit**

```bash
pnpm lint:docs 2>&1 | tail -5
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: rewrite CLAUDE.md as the onboarding contract

Decision #4: Phase 1's CLAUDE.md is treated as a draft. The new file
opens with phase status (scaffold complete), an at-a-glance stack
summary, the 8 hard rules each linked to its canonical convention doc,
a "where to look first" table mapping common questions to the canonical
doc, the 5-step workflow, local dev pointer, and "what lives where" +
"when you get stuck" sections.

All forward-references from the Phase 1 draft ("see X (added in
Phase 4)") are now resolved into live links.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 26: Phase 4 gate verification + PR

**Files:** none (verification only).

- [ ] **Step 1: Run all local gates**

```bash
pnpm nx run-many --target=test --all 2>&1 | tail -10
pnpm nx run-many --target=lint --all 2>&1 | tail -5
pnpm nx run-many --target=typecheck --all 2>&1 | tail -5
pnpm nx analyze backend 2>&1 | tail -3
pnpm nx deptrac backend 2>&1 | tail -3
pnpm nx e2e web 2>&1 | tail -10
pnpm lint:docs 2>&1 | tail -5
pnpm lint:openapi 2>&1 | tail -10
pnpm check:route-coverage 2>&1 | tail -3
```

Expected: every command exits 0.

- [ ] **Step 2: The "cold start" gate**

```bash
# Simulated cold-start: stop everything, bring it up via the runbook
docker compose --env-file .env -f infra/docker-compose.yml down
docker compose --env-file .env -f infra/docker-compose.yml up -d
sleep 30  # allow backend warm-up + key generation
curl -fsS http://localhost:8000/ -o /dev/null -w "backend %{http_code}\n"
curl -fsS http://localhost:8108/health
curl -fsS -o /dev/null -w "typesense-dashboard %{http_code}\n" http://localhost:8109/
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest --parallel 2>&1 | tail -5
```

Expected: backend HTTP 200; typesense `{"ok":true}`; dashboard HTTP 200; Pest 60+ passing (Phase 4 added the scout-live group + new Handler tests).

- [ ] **Step 3: Push the branch and watch CI**

```bash
git push
gh run list --branch feat/phase-4-polish-and-docs --limit 3
```

If CI is in progress, wait briefly. Watch for `lint-and-typecheck`, `test-backend`, `test-frontend`, `e2e`, `docs-build` — all five must go green.

- [ ] **Step 4: Open the PR**

```bash
gh pr create --title "feat: phase 4 polish + docs + pure CQRS + Phase 3 hygiene" --body "$(cat <<'EOF'
## Summary

- All /docs pages from spec §10 completed (architecture overview + monorepo-layout; conventions tdd/solid/naming/i18n; runbooks adding-a-feature/adding-a-locale/adding-a-socialite-provider/rotating-passport-keys/repo-tour/inspecting-soketi).
- CLAUDE.md fully rewritten as the onboarding contract.
- CI docs-build job: markdownlint-cli2 + @redocly/cli + custom route-coverage script.
- Pure CQRS (ADR 0008 supersedes 0002): Application layer drops UseCase; Handler holds business logic. Eight files deleted, six modified, one new ADR.
- Phase 3 hygiene complete: CI Typesense flake fixed; locale-aware stub callback; Filament v3→v4 swept; live Typesense smoke test (CI-only group); PUSHER_* env propagation in compose.

## Test plan

- [x] All local gates green (test, lint, typecheck, analyze, deptrac, e2e, lint:docs, lint:openapi, check:route-coverage)
- [x] Cold-start: `docker compose down && up -d` lands a working stack without intervention
- [x] Manual: opens the repo cold, follows runbooks/local-dev.md, runs all tests — passes without questions
- [ ] CI green (verify after push)

## ADRs

- ADR 0008 (NEW): Pure CQRS — collapse the UseCase layer into the Handler. Supersedes ADR 0002.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Close the loop**

After the PR is merged, write a brief Phase 4 progress memory note at `~/.claude/projects/<project-id>/memory/project_phase_4_progress.md` summarizing:

- Final commit count, test count, doc count
- Any lessons learned (plan corrections, real-world references that paid off)
- Open items going into the post-scaffold work (Aircraft CRUD)

---

## Self-review notes (filled by the plan author)

**Spec coverage:** Every Phase 4 §13.4 deliverable maps to a task above:

- All `/docs` pages from §10 → Tasks 13–24
- `docs/runbooks/adding-a-feature.md` → Task 19
- `docs/conventions/{tdd,solid,naming,i18n}.md` → Tasks 15–18
- `docs/architecture/overview.md` with Mermaid + ERD → Task 13
- `CLAUDE.md` finalized → Task 25
- `docs/runbooks/repo-tour.md` → Task 23
- CI `docs-build` job → Tasks 2 + 3 + 4
- One green CI run on `main` after Phase 4 merges → Task 26

**Decision-log coverage:**

1. Branch off updated main → Task 0
2. All five Phase 3 hygiene items in scope → Tasks 1, 9, 10, 11, 12
3. docs-build CI tooling (markdownlint + Redocly + route-coverage) → Tasks 2, 3, 4
4. CLAUDE.md full rewrite → Task 25
5. docs-build CI job FIRST → Task 4 lands before any of Tasks 13–24
6. Pure CQRS → Tasks 5, 6, 7, 8

**Type consistency:** `RecordPingHandler`, `ListPingsHandler` signatures consistent across Tasks 6, 7, 8, 19. `Locale` type from `@azimuth/i18n` referenced in Tasks 9, 18, 20. `App\Authorization\Contracts\Permission` referenced in Tasks 16, 17, 25 — all consistent. The `BACKEND_URL` default is `http://127.0.0.1:8000` everywhere it's referenced (per pre-flight `8ca6003`).

**Out-of-scope sentinel:** No task includes Aircraft CRUD work, Storybook, i18n drift checks, theme visual regression, PR templates, conventional-commits hooks, or soketi-ui (the `inspecting-soketi.md` runbook covers curl recipes per Task 24).

**Plan-correction expectation:** ~10–15% of plan steps will need real-time fixes during execution per Phases 2 + 3 history. Expected sites: Filament v4 API drift (Task 10), Mermaid syntax quirks in `architecture/overview.md` (Task 13), markdownlint custom-rule edge cases (Task 2). Subagents fix inline + report in concerns.
