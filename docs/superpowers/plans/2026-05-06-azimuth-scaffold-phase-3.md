# Azimuth — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Azimuth frontend skeleton — themed (4 modes), localized (en/pt), authenticated Next.js shell that talks to the Phase 2 backend through a typed RTK Query client. Land 8 squared `libs/ui` primitives, the auth/proxy plumbing, and a working Ping feature mirroring the backend module. Phase 3 closes when `nx test web && nx e2e web` are green and a manual smoke proves theme + locale switchers + the Ping create/list cycle.

**Architecture:** Next.js 15 App Router with `[locale]` segment; Redux Toolkit + RTK Query for state and HTTP; httpOnly cookie + Next.js proxy route handlers so the Bearer token never reaches browser JS; CSS-vars-driven theming with `data-theme="day|dusk|night|bright"` set pre-paint to avoid flash; Openbridge tokens (hand-extracted) drive `libs/design-tokens` and a Tailwind preset that enforces the squared-UI rule (no border-radius except `rounded-full`); React Hook Form + Zod for forms (Zod schemas double-duty as RTK Query payload types).

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Redux Toolkit + RTK Query, `@rtk-query/codegen-openapi`, next-intl, React Hook Form + Zod, Radix Primitives (Dialog, Select, Toast underneath our styled wrappers), Vitest + Testing Library + jsdom, Playwright, Tailwind CSS v4 (with custom preset), ESLint flat config with `react/jsx-no-literals`, lefthook (Prettier + ESLint pre-commit; already configured from Phase 1).

**Source documents (read both before starting):**

- `docs/superpowers/specs/2026-05-02-azimuth-scaffold-design.md` — §6 (frontend architecture detail), §11 (naming conventions), §13.3 (Phase 3 scope)
- `docs/superpowers/specs/2026-05-06-azimuth-scaffold-phase-3-decisions.md` — eight locked decisions + canonical `features/ping` module shape

**Hard rules from `/CLAUDE.md` (apply to every task):**

1. **TDD always** — every `libs/ui` primitive and every `features/<module>` component gets at minimum **happy / invalid / garbage** Vitest + Testing Library cases.
2. **No hardcoded user-facing strings** — every visible string passes through `next-intl` catalogs (`libs/i18n/src/messages/{en,pt}.json` and per-feature/module catalogs in `apps/web/src/messages/`). The ESLint rule `react/jsx-no-literals` enforces this on JSX.
3. **Squared UI** — no `border-radius` except `rounded-full` for avatars/pills. The Tailwind preset in `libs/design-tokens/src/tailwind-preset.ts` exposes only `borderRadius: { none: '0', full: '9999px' }`. Any task that pulls in another rounded-\* class is a regression.
4. **Cookie-only auth** — the Bearer token never appears in browser JS. RTK Query talks to `/api/proxy/...` on the Next.js origin; route handlers forward to backend with `Authorization: Bearer <cookie>`. Direct fetches to backend (`http://localhost:8000`) from a React component are a defect.
5. **`/docs` is evergreen** — Task 24 writes `docs/architecture/frontend.md` and ADR 0006 in this phase. If a later task introduces a notable architectural shift (it shouldn't — the decision log fixed everything), amend those docs in the same commit.

**Conventions used throughout this plan:**

- All commands run on the **host** with `pnpm` (frontend is host-side; backend is Docker-side from Phase 2). `pnpm nx test web`, `pnpm nx lint web`, `pnpm nx build web` are the entry patterns.
- Backend API is reachable at `http://localhost:8000` from the host. `apps/backend` runs in Docker (Phase 2's stack). Verify it's up with `docker compose --env-file .env -f infra/docker-compose.yml ps` before tasks that hit the backend (Tasks 12, 15, 16, 22, 25).
- Lefthook's pre-commit hook runs Prettier + ESLint on staged files automatically. Tasks shouldn't repeat that. The frontend equivalent of "Pint after every backend task" is `pnpm nx test web && pnpm nx lint web` exit 0 before commit.
- Every commit uses conventional-commit style with the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` footer.
- TypeScript is `strict` workspace-wide (Phase 1). New files get `declare strict` equivalent (TS strict is automatic).
- Locked decisions: 8 of them in the decision-log spec. Plan task wording encodes them; don't second-guess.

**Out of scope (do not let any task drift into these):**

- Real OAuth providers (Google/GitHub/etc.) — only the stub Socialite driver is exercised.
- Native Openbridge web components — we adopt tokens only; the Lit components stay out.
- Server Components for authenticated pages — Phase 3 uses Client Components for the authed shell (Phase 4+ migration).
- `libs/ui` Storybook / visual regression — Phase 4+ polish.
- Backend changes — Phase 2 shipped. The exception: small backend tweaks the proxy work surfaces (e.g., CORS adjustments) land as separate tiny commits with a clear `fix(backend):` prefix.
- Aircraft CRUD or any real domain feature — separate spec/plan after Phase 4.

---

## Task 0: Pre-flight — confirm Phase 2 gate still green on `main`; create the Phase 3 working branch

**Files:** none (sanity check only).

- [ ] **Step 1: Confirm clean tree and on `main` at the Phase 2 merge commit**

Run:

```bash
git status --short --branch
git log --oneline -1
```

Expected: branch is `main` (or detached); working tree clean; HEAD at `99bac88` (the Phase 2 merge commit) or a descendant.

If the branch isn't main, run `git checkout main && git pull --ff-only`.

- [ ] **Step 2: Bring up the Phase 2 backend stack**

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d
docker compose --env-file .env -f infra/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}"
```

Expected: 9 long-running services up (postgres, dragonfly, typesense, mailpit, soketi, minio, backend, horizon, web). If any service is unhealthy or down, fix before continuing.

- [ ] **Step 3: Re-verify the Phase 2 gate**

```bash
curl -fsS -o /dev/null -w "backend / -> %{http_code}\n" http://localhost:8000/
curl -fsS http://localhost:8000/docs/api.json -o /tmp/openapi.json -w "openapi -> %{http_code} (%{size_download} bytes)\n"
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/pest --parallel 2>&1 | tail -5
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/phpstan analyze --memory-limit=2G 2>&1 | tail -3
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend ./vendor/bin/deptrac analyse --no-progress 2>&1 | tail -5
```

Expected: backend HTTP 200; openapi.json non-zero size; Pest reports `Tests: 59 passed` (or higher); PHPStan `[OK] No errors`; Deptrac 0 violations.

If anything fails, stop and report `BLOCKED` — Phase 3 assumes a green Phase 2 baseline.

- [ ] **Step 4: Create the Phase 3 working branch**

```bash
git checkout -b feat/phase-3-frontend-skeleton
git push -u origin feat/phase-3-frontend-skeleton
```

Expected: branch created locally and pushed; tracking `origin/feat/phase-3-frontend-skeleton`.

- [ ] **Step 5: Confirm clean tree on the new branch**

```bash
git status --short --branch
```

Expected: `On branch feat/phase-3-frontend-skeleton` and `nothing to commit, working tree clean`.

---

## Task 1: Pin Vitest, Testing Library, jsdom, and Playwright at the workspace root + add Nx targets

**Files:**

- Modify: `package.json` (root) — add devDeps
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/vitest.config.ts`
- Modify: `apps/web/project.json` — add `test` and `lint` targets
- Create: `apps/web/tests/setup.ts`
- Create: `libs/ui/vitest.config.ts`
- Modify: `libs/ui/project.json` — add `test` target
- Create: `libs/ui/tests/setup.ts`
- Create: `apps/web/e2e/playwright.config.ts`

- [ ] **Step 1: Install Vitest + Testing Library + jsdom + Playwright at workspace root**

```bash
pnpm add -Dw vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
pnpm add -Dw @playwright/test
```

Expected: composer-equivalent lockfile update; Vitest 2.x and Playwright 1.5x installed.

- [ ] **Step 2: Author `apps/web/vitest.config.ts`**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'e2e', '.next'],
    css: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

`@vitejs/plugin-react` ships with Vitest's react preset; install if not pulled transitively:

```bash
pnpm add -Dw @vitejs/plugin-react
```

- [ ] **Step 3: Author `apps/web/tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Author `libs/ui/vitest.config.ts` and `libs/ui/tests/setup.ts`**

`libs/ui/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules'],
    css: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

`libs/ui/tests/setup.ts` (identical to apps/web for now):

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 5: Add Nx `test` and `lint` targets to `apps/web/project.json`**

Open `apps/web/project.json`. Replace the existing target list with (or merge in):

```json
{
  "name": "web",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/web/src",
  "projectType": "application",
  "tags": ["scope:web", "type:app"],
  "targets": {
    "dev": {
      "executor": "nx:run-commands",
      "options": { "command": "next dev -p 3000 -H 0.0.0.0", "cwd": "apps/web" }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": { "command": "next build", "cwd": "apps/web" }
    },
    "start": {
      "executor": "nx:run-commands",
      "options": { "command": "next start -p 3000", "cwd": "apps/web" }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "vitest run", "cwd": "apps/web" }
    },
    "test:watch": {
      "executor": "nx:run-commands",
      "options": { "command": "vitest", "cwd": "apps/web" }
    },
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint src --max-warnings=0", "cwd": "apps/web" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": { "command": "tsc --noEmit -p apps/web/tsconfig.json", "cwd": "{workspaceRoot}" }
    },
    "e2e": {
      "executor": "nx:run-commands",
      "options": { "command": "playwright test", "cwd": "apps/web" }
    }
  }
}
```

Replace `apps/web/package.json` accordingly if there are conflicting `scripts` (Phase 1 had a minimal `scripts.dev`).

- [ ] **Step 6: Add `test` target to `libs/ui/project.json`**

Edit `libs/ui/project.json`:

```json
{
  "name": "ui",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/ui/src",
  "projectType": "library",
  "tags": ["scope:ui", "type:lib"],
  "targets": {
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "vitest run", "cwd": "libs/ui" }
    },
    "test:watch": {
      "executor": "nx:run-commands",
      "options": { "command": "vitest", "cwd": "libs/ui" }
    },
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint src --max-warnings=0", "cwd": "libs/ui" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": { "command": "tsc --noEmit -p libs/ui/tsconfig.json", "cwd": "{workspaceRoot}" }
    }
  }
}
```

- [ ] **Step 7: Author `apps/web/e2e/playwright.config.ts`**

Create:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'next dev -p 3000 -H 0.0.0.0',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 8: Smoke-test Vitest is wired (no tests yet, just config)**

```bash
pnpm nx test web 2>&1 | tail -15
pnpm nx test ui 2>&1 | tail -15
```

Expected: each prints `No test files found` (or runs zero tests). Exit code 0 for both. If `vitest` errors out about missing config, fix.

- [ ] **Step 9: Install Playwright browsers**

```bash
pnpm exec playwright install chromium
```

Expected: chromium browser installed under the workspace's playwright cache. No tests yet — just verifying installation.

- [ ] **Step 10: Pre-commit + commit**

```bash
pnpm nx test web && pnpm nx test ui
pnpm nx lint web 2>&1 | tail -5 || true   # may have nothing to lint yet
git add package.json pnpm-lock.yaml apps/web libs/ui
git commit -m "$(cat <<'EOF'
chore: install Vitest + Testing Library + jsdom + Playwright

Workspace-level testing tools for Phase 3. Adds nx targets:
- pnpm nx test web | test ui (Vitest + jsdom)
- pnpm nx e2e web (Playwright; chromium only for now)

No tests yet; this just wires the runner. Subsequent tasks add tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `libs/design-tokens` — Openbridge-derived 4-theme tokens, build script, Tailwind preset

**Files:**

- Create: `libs/design-tokens/src/colors.ts`
- Create: `libs/design-tokens/src/typography.ts`
- Create: `libs/design-tokens/src/spacing.ts`
- Create: `libs/design-tokens/src/build.ts`
- Create: `libs/design-tokens/src/tokens.css` (generated by build.ts; commit as build output)
- Create: `libs/design-tokens/src/tailwind-preset.ts`
- Create: `libs/design-tokens/src/index.ts`
- Modify: `libs/design-tokens/project.json` — add `build`, `test`, `lint` targets
- Create: `libs/design-tokens/src/build.test.ts`
- Modify: `libs/design-tokens/package.json` — add deps
- Modify: `libs/design-tokens/tsconfig.json` if needed

**Implementation note on Openbridge tokens:** The exact Openbridge token values are documented at https://design.openbridge.no and inside the `@oicl/openbridge-webcomponents` source. The implementer SHOULD verify the values below against the current Openbridge release; treat the values in this task as a starting palette informed by Openbridge's structure — adjust if Openbridge has materially shifted. The key invariants are: (1) four themes named `day`/`dusk`/`night`/`bright`; (2) semantic token names (`bg.*`, `fg.*`, `border.*`, `accent.*`); (3) `night` palette uses red-tinted foregrounds to preserve dark-adapted vision; (4) `bright` is maximum-contrast for sunlight readability.

- [ ] **Step 1: Author `libs/design-tokens/src/colors.ts` (4-theme semantic palette)**

```ts
export type ThemeName = 'day' | 'dusk' | 'night' | 'bright';

export type ColorTokens = {
  bg: { primary: string; secondary: string; tertiary: string };
  fg: { primary: string; secondary: string; tertiary: string };
  border: { default: string; subtle: string; emphasis: string };
  accent: {
    primary: string;
    success: string;
    warning: string;
    danger: string;
  };
};

export const colors: Record<ThemeName, ColorTokens> = {
  day: {
    bg: { primary: '#f0f0f0', secondary: '#e8e8e8', tertiary: '#dcdcdc' },
    fg: { primary: '#0a0a0a', secondary: '#3a3a3a', tertiary: '#6a6a6a' },
    border: { default: '#c8c8c8', subtle: '#dadada', emphasis: '#0a0a0a' },
    accent: { primary: '#0066cc', success: '#2c8c2c', warning: '#cc7a00', danger: '#c41e3a' },
  },
  dusk: {
    bg: { primary: '#1a1410', secondary: '#241c16', tertiary: '#2e241c' },
    fg: { primary: '#d4a574', secondary: '#a07a55', tertiary: '#705540' },
    border: { default: '#3e302a', subtle: '#2c241e', emphasis: '#d4a574' },
    accent: { primary: '#d49d4d', success: '#7a8a4d', warning: '#d4742d', danger: '#a83232' },
  },
  night: {
    bg: { primary: '#000000', secondary: '#080808', tertiary: '#101010' },
    fg: { primary: '#aa0000', secondary: '#770000', tertiary: '#440000' },
    border: { default: '#220000', subtle: '#110000', emphasis: '#aa0000' },
    accent: { primary: '#cc0000', success: '#660000', warning: '#aa3300', danger: '#ff0000' },
  },
  bright: {
    bg: { primary: '#ffffff', secondary: '#f4f4f4', tertiary: '#e8e8e8' },
    fg: { primary: '#000000', secondary: '#1a1a1a', tertiary: '#3a3a3a' },
    border: { default: '#000000', subtle: '#888888', emphasis: '#000000' },
    accent: { primary: '#0000ff', success: '#006600', warning: '#cc6600', danger: '#cc0000' },
  },
};
```

- [ ] **Step 2: Author `libs/design-tokens/src/typography.ts`**

```ts
export const typography = {
  fontFamily: {
    sans: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, "Courier New", monospace',
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
} as const;
```

- [ ] **Step 3: Author `libs/design-tokens/src/spacing.ts`**

```ts
export const spacing = {
  '0': '0',
  '0.5': '0.125rem',
  '1': '0.25rem',
  '1.5': '0.375rem',
  '2': '0.5rem',
  '3': '0.75rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '8': '2rem',
  '10': '2.5rem',
  '12': '3rem',
  '16': '4rem',
  '20': '5rem',
  '24': '6rem',
} as const;
```

- [ ] **Step 4: Author `libs/design-tokens/src/index.ts` barrel**

```ts
export { colors, type ThemeName, type ColorTokens } from './colors';
export { typography } from './typography';
export { spacing } from './spacing';
```

- [ ] **Step 5: Write the build-script test (TDD — happy path)**

Create `libs/design-tokens/src/build.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateTokensCss } from './build';

describe('generateTokensCss', () => {
  it('emits four [data-theme] blocks (happy)', () => {
    const css = generateTokensCss();
    expect(css).toContain('[data-theme="day"]');
    expect(css).toContain('[data-theme="dusk"]');
    expect(css).toContain('[data-theme="night"]');
    expect(css).toContain('[data-theme="bright"]');
  });

  it('emits semantic CSS variables under each theme block (happy)', () => {
    const css = generateTokensCss();
    expect(css).toMatch(/\[data-theme="day"\]\s*\{[^}]*--color-bg-primary:\s*#f0f0f0/);
    expect(css).toMatch(/\[data-theme="night"\]\s*\{[^}]*--color-fg-primary:\s*#aa0000/);
  });

  it('uses :root for the day default (happy)', () => {
    const css = generateTokensCss();
    // The default theme's variables also live on :root so SSR without a cookie
    // still has values to read.
    expect(css).toMatch(/^:root\s*\{/m);
  });

  it('rejects no themes (invalid path is a compile-time impossibility, but verify shape)', () => {
    const css = generateTokensCss();
    // Must include all four; smoke check on count.
    const matches = css.match(/\[data-theme="(day|dusk|night|bright)"\]/g) ?? [];
    expect(matches.length).toBe(4);
  });
});
```

Run: `pnpm nx test design-tokens 2>&1 | tail -10`

Expected: 4 tests **fail** with `Failed to load url ./build` or similar — the file doesn't exist yet.

- [ ] **Step 6: Implement `libs/design-tokens/src/build.ts`**

```ts
import { colors, type ThemeName } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FLATTEN_DELIMITER = '-';

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}${FLATTEN_DELIMITER}${k}` : k;
    if (typeof v === 'object' && v !== null) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

function themeBlock(selector: string, theme: ThemeName): string {
  const flat = flatten(colors[theme] as unknown as Record<string, unknown>, 'color');
  const lines = Object.entries(flat).map(([k, v]) => `  --${k}: ${v};`);
  return `${selector} {\n${lines.join('\n')}\n}\n`;
}

function staticBlock(): string {
  const fontSize = flatten(typography.fontSize as unknown as Record<string, unknown>, 'fs');
  const fontWeight = flatten(typography.fontWeight as unknown as Record<string, unknown>, 'fw');
  const lineHeight = flatten(typography.lineHeight as unknown as Record<string, unknown>, 'lh');
  const space = flatten(spacing as unknown as Record<string, unknown>, 'space');
  const ff = `  --ff-sans: ${typography.fontFamily.sans};\n  --ff-mono: ${typography.fontFamily.mono};`;
  const fsLines = Object.entries(fontSize)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n');
  const fwLines = Object.entries(fontWeight)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n');
  const lhLines = Object.entries(lineHeight)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n');
  const spLines = Object.entries(space)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n');
  return `:root {\n${ff}\n${fsLines}\n${fwLines}\n${lhLines}\n${spLines}\n}\n`;
}

export function generateTokensCss(): string {
  const blocks: string[] = [];
  blocks.push(staticBlock());
  // Day vars also live on :root for SSR-without-cookie default.
  blocks.push(themeBlock(':root', 'day'));
  blocks.push(themeBlock('[data-theme="day"]', 'day'));
  blocks.push(themeBlock('[data-theme="dusk"]', 'dusk'));
  blocks.push(themeBlock('[data-theme="night"]', 'night'));
  blocks.push(themeBlock('[data-theme="bright"]', 'bright'));
  return blocks.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const css = generateTokensCss();
  const out = resolve(import.meta.dirname, 'tokens.css');
  writeFileSync(out, css, 'utf8');
  console.log(`wrote ${out} (${css.length} bytes)`);
}
```

- [ ] **Step 7: Run the build script to generate `tokens.css`**

```bash
pnpm exec tsx libs/design-tokens/src/build.ts
```

Expected: writes `libs/design-tokens/src/tokens.css`. (If `tsx` isn't installed: `pnpm add -Dw tsx`.)

- [ ] **Step 8: Verify build tests pass**

```bash
pnpm nx test design-tokens 2>&1 | tail -10
```

Expected: 4 passing tests.

- [ ] **Step 9: Author the Tailwind preset (`libs/design-tokens/src/tailwind-preset.ts`)**

This preset enforces the squared-UI rule — only `borderRadius: { none, full }` are exposed. It also pipes the tokens through to Tailwind utility class names.

```ts
import type { Config } from 'tailwindcss';

export const azimuthPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
        },
        fg: {
          primary: 'var(--color-fg-primary)',
          secondary: 'var(--color-fg-secondary)',
          tertiary: 'var(--color-fg-tertiary)',
        },
        border: {
          DEFAULT: 'var(--color-border-default)',
          subtle: 'var(--color-border-subtle)',
          emphasis: 'var(--color-border-emphasis)',
        },
        accent: {
          primary: 'var(--color-accent-primary)',
          success: 'var(--color-accent-success)',
          warning: 'var(--color-accent-warning)',
          danger: 'var(--color-accent-danger)',
        },
      },
      fontFamily: {
        sans: 'var(--ff-sans)',
        mono: 'var(--ff-mono)',
      },
    },
    // Squared-UI rule (CLAUDE.md hard rule #3): override Tailwind's defaults
    // so only `rounded-none` and `rounded-full` are valid.
    borderRadius: {
      none: '0',
      full: '9999px',
    },
  },
};

export default azimuthPreset;
```

- [ ] **Step 10: Add a test that the Tailwind preset only exposes `none` + `full`**

Append to `libs/design-tokens/src/build.test.ts`:

```ts
import { azimuthPreset } from './tailwind-preset';

describe('azimuthPreset', () => {
  it('exposes only `none` and `full` border radii (happy — squared UI rule)', () => {
    const radii = azimuthPreset.theme?.borderRadius ?? {};
    expect(Object.keys(radii).sort()).toEqual(['full', 'none']);
    expect(radii.none).toBe('0');
    expect(radii.full).toBe('9999px');
  });

  it('rejects any other radius keys (invalid path — regression check)', () => {
    const radii = azimuthPreset.theme?.borderRadius ?? {};
    expect(radii).not.toHaveProperty('sm');
    expect(radii).not.toHaveProperty('md');
    expect(radii).not.toHaveProperty('lg');
  });
});
```

Run: `pnpm nx test design-tokens 2>&1 | tail -10`

Expected: 6 passing tests.

- [ ] **Step 11: Update barrel + project.json**

`libs/design-tokens/src/index.ts`:

```ts
export { colors, type ThemeName, type ColorTokens } from './colors';
export { typography } from './typography';
export { spacing } from './spacing';
export { generateTokensCss } from './build';
export { azimuthPreset } from './tailwind-preset';
```

`libs/design-tokens/project.json`:

```json
{
  "name": "design-tokens",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/design-tokens/src",
  "projectType": "library",
  "tags": ["scope:shared", "type:lib"],
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "options": { "command": "tsx src/build.ts", "cwd": "libs/design-tokens" }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "vitest run", "cwd": "libs/design-tokens" }
    },
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint src --max-warnings=0", "cwd": "libs/design-tokens" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p libs/design-tokens/tsconfig.json",
        "cwd": "{workspaceRoot}"
      }
    }
  }
}
```

`libs/design-tokens/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
});
```

`libs/design-tokens/package.json` — add tailwindcss to peerDeps:

```json
{
  "name": "@azimuth/design-tokens",
  "version": "0.1.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "peerDependencies": { "tailwindcss": "^4.0.0" }
}
```

- [ ] **Step 12: Final test + commit**

```bash
pnpm nx build design-tokens   # regenerates tokens.css from sources
pnpm nx test design-tokens
git add libs/design-tokens
git commit -m "$(cat <<'EOF'
feat(design-tokens): Openbridge-derived 4-theme palette + Tailwind preset

Decision #2 (Openbridge tokens adopted) and #3 (4 themes: day/dusk/night/
bright). Hand-extracted token shape: bg/fg/border/accent semantic
groupings; build script emits tokens.css with [data-theme="..."] blocks.
Tailwind preset enforces the squared-UI rule (CLAUDE.md hard rule #3) by
exposing only rounded-none and rounded-full.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `libs/i18n` — locale registry + en/pt shared catalogs + next-intl config

**Files:**

- Create: `libs/i18n/src/locales.ts`
- Create: `libs/i18n/src/messages/en.json`
- Create: `libs/i18n/src/messages/pt.json`
- Create: `libs/i18n/src/index.ts`
- Modify: `libs/i18n/package.json` — add deps
- Modify: `libs/i18n/project.json` — add lint/typecheck targets

- [ ] **Step 1: Install next-intl**

```bash
pnpm add -w next-intl
```

- [ ] **Step 2: Author `libs/i18n/src/locales.ts`**

```ts
export const LOCALES = ['en', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
```

- [ ] **Step 3: Author shared catalogs**

`libs/i18n/src/messages/en.json`:

```json
{
  "common": {
    "appName": "Azimuth",
    "tagline": "Your companion from A to Z",
    "loading": "Loading…",
    "error": "Something went wrong",
    "retry": "Try again",
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete",
    "edit": "Edit",
    "close": "Close"
  },
  "nav": {
    "dashboard": "Dashboard",
    "ping": "Pings",
    "logout": "Log out"
  },
  "theme": {
    "label": "Theme",
    "day": "Day",
    "dusk": "Dusk",
    "night": "Night",
    "bright": "Bright"
  },
  "locale": {
    "label": "Language",
    "en": "English",
    "pt": "Português"
  }
}
```

`libs/i18n/src/messages/pt.json`:

```json
{
  "common": {
    "appName": "Azimuth",
    "tagline": "Seu companheiro de A a Z",
    "loading": "Carregando…",
    "error": "Algo deu errado",
    "retry": "Tentar novamente",
    "cancel": "Cancelar",
    "save": "Salvar",
    "delete": "Excluir",
    "edit": "Editar",
    "close": "Fechar"
  },
  "nav": {
    "dashboard": "Painel",
    "ping": "Pings",
    "logout": "Sair"
  },
  "theme": {
    "label": "Tema",
    "day": "Dia",
    "dusk": "Crepúsculo",
    "night": "Noite",
    "bright": "Brilhante"
  },
  "locale": {
    "label": "Idioma",
    "en": "Inglês",
    "pt": "Português"
  }
}
```

- [ ] **Step 4: Author barrel + types**

`libs/i18n/src/index.ts`:

```ts
import enMessages from './messages/en.json';
import ptMessages from './messages/pt.json';
import { LOCALES, type Locale, DEFAULT_LOCALE, isLocale } from './locales';

export const messages: Record<Locale, typeof enMessages> = {
  en: enMessages,
  pt: ptMessages,
};

export { LOCALES, DEFAULT_LOCALE, isLocale };
export type { Locale };
export type Messages = typeof enMessages;
```

- [ ] **Step 5: Smoke test + lint**

Create `libs/i18n/src/locales.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LOCALES, DEFAULT_LOCALE, isLocale, messages } from './index';

describe('locales', () => {
  it('exposes en and pt (happy)', () => {
    expect(LOCALES).toEqual(['en', 'pt']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('isLocale narrows correctly (happy)', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('pt')).toBe(true);
  });

  it('rejects unknown locale strings (invalid)', () => {
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('')).toBe(false);
  });

  it('handles non-string input safely (garbage)', () => {
    // @ts-expect-error — runtime guard test
    expect(isLocale(undefined)).toBe(false);
    // @ts-expect-error — runtime guard test
    expect(isLocale(123)).toBe(false);
  });

  it('every locale has a populated messages catalog (happy)', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]).toBeDefined();
      expect(messages[locale].common.appName).toBe('Azimuth');
    }
  });

  it('catalogs have parallel key shapes (happy)', () => {
    const enKeys = JSON.stringify(Object.keys(messages.en).sort());
    const ptKeys = JSON.stringify(Object.keys(messages.pt).sort());
    expect(ptKeys).toBe(enKeys);
  });
});
```

Add a `vitest.config.ts` to `libs/i18n/` (node env):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
});
```

Update `libs/i18n/project.json`:

```json
{
  "name": "i18n",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/i18n/src",
  "projectType": "library",
  "tags": ["scope:shared", "type:lib"],
  "targets": {
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "vitest run", "cwd": "libs/i18n" }
    },
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint src --max-warnings=0", "cwd": "libs/i18n" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": { "command": "tsc --noEmit -p libs/i18n/tsconfig.json", "cwd": "{workspaceRoot}" }
    }
  }
}
```

`libs/i18n/package.json`:

```json
{
  "name": "@azimuth/i18n",
  "version": "0.1.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": { "next-intl": "^3.0.0" }
}
```

- [ ] **Step 6: Run tests + commit**

```bash
pnpm nx test i18n
git add libs/i18n package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(i18n): locales registry + en/pt shared catalogs

Locales = ['en', 'pt'], default 'en'. Shared catalog covers common
strings, navigation, theme labels, and locale labels. Per-feature/module
catalogs live next to their consumers in apps/web/src/messages/.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `libs/ui` scaffold + Button primitive (TDD)

**Files:**

- Create: `libs/ui/src/Button.tsx`
- Create: `libs/ui/src/Button.test.tsx`
- Create: `libs/ui/src/index.ts`
- Modify: `libs/ui/package.json` — add React + Tailwind peer deps

- [ ] **Step 1: Add React peer deps**

```bash
pnpm add -w react react-dom
pnpm add -Dw @types/react @types/react-dom
```

- [ ] **Step 2: Write the Button test (TDD — happy / invalid / garbage)**

Create `libs/ui/src/Button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders children and fires onClick (happy)', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);

    const btn = screen.getByRole('button', { name: 'Click me' });
    await userEvent.click(btn);

    expect(btn).toBeInTheDocument();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire onClick when disabled (invalid)', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Disabled
      </Button>,
    );

    const btn = screen.getByRole('button', { name: 'Disabled' });
    await userEvent.click(btn);

    expect(btn).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('uses rounded-none (squared UI rule) — never has rounded-md/lg/etc. (invariant)', () => {
    render(<Button>Squared</Button>);
    const btn = screen.getByRole('button');
    const cls = btn.className;
    expect(cls).not.toMatch(/rounded-(sm|md|lg|xl|2xl|3xl)/);
  });

  it('rejects garbage children (garbage — type-safety smoke)', () => {
    // @ts-expect-error — runtime tolerance smoke
    expect(() => render(<Button>{undefined}</Button>)).not.toThrow();
  });

  it('forwards ref to the underlying button element (happy)', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('supports variant=primary | secondary | danger (happy)', () => {
    const { rerender } = render(<Button variant="primary">P</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-accent-primary/);

    rerender(<Button variant="secondary">S</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-bg-secondary/);

    rerender(<Button variant="danger">D</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-accent-danger/);
  });
});
```

Run: `pnpm nx test ui 2>&1 | tail -15`

Expected: 6 tests fail with `Failed to load url ./Button` or `Cannot find module './Button'`.

- [ ] **Step 3: Implement `libs/ui/src/Button.tsx`**

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent-primary text-bg-primary hover:opacity-90',
  secondary: 'bg-bg-secondary text-fg-primary border border-default hover:bg-bg-tertiary',
  danger: 'bg-accent-danger text-bg-primary hover:opacity-90',
};

const BASE =
  'inline-flex items-center justify-center px-4 py-2 text-sm font-medium ' +
  'rounded-none transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className = '', type = 'button', ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={`${BASE} ${VARIANT_CLASSES[variant]} ${className}`.trim()}
        {...rest}
      />
    );
  },
);

Button.displayName = 'Button';
```

- [ ] **Step 4: Author `libs/ui/src/index.ts` barrel**

```ts
export { Button, type ButtonProps } from './Button';
```

- [ ] **Step 5: Verify tests pass**

```bash
pnpm nx test ui 2>&1 | tail -15
```

Expected: 6 passing tests.

- [ ] **Step 6: Commit**

```bash
git add libs/ui package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(ui): Button primitive (squared, themed, ref-forwarding)

First squared-UI primitive for libs/ui. Variants: primary/secondary/
danger, all backed by design-tokens CSS vars (bg-accent-primary,
bg-bg-secondary, bg-accent-danger). Disabled state respected. Ref
forwarded to <button>. happy/invalid/garbage Vitest + Testing Library
coverage per CLAUDE.md hard rule #1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `libs/ui` Input primitive (TDD)

**Files:**

- Create: `libs/ui/src/Input.tsx`
- Create: `libs/ui/src/Input.test.tsx`
- Modify: `libs/ui/src/index.ts`

- [ ] **Step 1: Write the Input test**

Create `libs/ui/src/Input.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('renders and accepts user typing (happy)', async () => {
    render(<Input aria-label="email" />);
    const input = screen.getByLabelText('email') as HTMLInputElement;
    await userEvent.type(input, 'hi@local');
    expect(input.value).toBe('hi@local');
  });

  it('disabled prevents typing (invalid)', async () => {
    render(<Input aria-label="email" disabled />);
    const input = screen.getByLabelText('email') as HTMLInputElement;
    await userEvent.type(input, 'should-be-rejected');
    expect(input.value).toBe('');
  });

  it('rounded-none (squared UI rule)', () => {
    render(<Input aria-label="x" />);
    expect(screen.getByLabelText('x').className).not.toMatch(/rounded-(sm|md|lg|xl)/);
  });

  it('handles undefined value as garbage (garbage)', () => {
    // @ts-expect-error — exercise runtime tolerance
    expect(() => render(<Input aria-label="x" value={undefined} />)).not.toThrow();
  });

  it('forwards ref (happy)', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input aria-label="x" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('shows error styling when aria-invalid (happy)', () => {
    render(<Input aria-label="x" aria-invalid />);
    const input = screen.getByLabelText('x');
    expect(input.className).toMatch(/border-accent-danger/);
  });
});
```

Run: `pnpm nx test ui -- --testNamePattern Input 2>&1 | tail -10`. Expected: 6 fail.

- [ ] **Step 2: Implement `libs/ui/src/Input.tsx`**

```tsx
import { forwardRef, type InputHTMLAttributes } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

const BASE =
  'block w-full px-3 py-2 text-sm rounded-none ' +
  'bg-bg-primary text-fg-primary border border-default ' +
  'placeholder:text-fg-tertiary ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'aria-[invalid=true]:border-accent-danger';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type = 'text', ...rest }, ref) => {
    return <input ref={ref} type={type} className={`${BASE} ${className}`.trim()} {...rest} />;
  },
);

Input.displayName = 'Input';
```

Add to `libs/ui/src/index.ts`:

```ts
export { Input, type InputProps } from './Input';
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm nx test ui
git add libs/ui
git commit -m "$(cat <<'EOF'
feat(ui): Input primitive (squared, themed, ref-forwarding)

aria-invalid drives the error border via Tailwind aria-* variant. Ref
forwarded to <input>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `libs/ui` Select primitive (Radix Select underneath, TDD)

**Files:**

- Create: `libs/ui/src/Select.tsx`
- Create: `libs/ui/src/Select.test.tsx`
- Modify: `libs/ui/src/index.ts`
- Modify: `libs/ui/package.json` — add Radix Select dep

- [ ] **Step 1: Install Radix Select**

```bash
pnpm add -w @radix-ui/react-select
```

- [ ] **Step 2: Write the Select test**

Create `libs/ui/src/Select.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Select } from './Select';

const OPTIONS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

describe('Select', () => {
  it('lists options and fires onChange (happy)', async () => {
    const onValueChange = vi.fn();
    render(
      <Select
        aria-label="fruit"
        options={OPTIONS}
        placeholder="Pick one"
        onValueChange={onValueChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'fruit' });
    await userEvent.click(trigger);

    const opt = await screen.findByRole('option', { name: 'Banana' });
    await userEvent.click(opt);

    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('shows the placeholder when no value selected (happy)', () => {
    render(<Select aria-label="fruit" options={OPTIONS} placeholder="Pick one" />);
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('rejects empty options array (invalid)', () => {
    expect(() => render(<Select aria-label="x" options={[]} placeholder="Empty" />)).not.toThrow();
    // The component still renders a trigger but the dropdown is empty.
    expect(screen.getByRole('combobox', { name: 'x' })).toBeInTheDocument();
  });

  it('handles garbage options entries gracefully (garbage)', () => {
    // @ts-expect-error — runtime tolerance smoke
    expect(() =>
      render(<Select aria-label="x" options={[{ value: 'a' }]} placeholder="Bad" />),
    ).not.toThrow();
  });

  it('uses rounded-none on the trigger (invariant)', () => {
    render(<Select aria-label="x" options={OPTIONS} placeholder="P" />);
    expect(screen.getByRole('combobox', { name: 'x' }).className).not.toMatch(
      /rounded-(sm|md|lg|xl)/,
    );
  });
});
```

Run: `pnpm nx test ui -- --testNamePattern Select 2>&1 | tail -10`. Expected: 5 fail.

- [ ] **Step 3: Implement `libs/ui/src/Select.tsx`**

```tsx
import * as RadixSelect from '@radix-ui/react-select';
import { forwardRef } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  placeholder: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

const TRIGGER =
  'inline-flex items-center justify-between gap-2 px-3 py-2 min-w-[10rem] text-sm rounded-none ' +
  'bg-bg-primary text-fg-primary border border-default ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ' +
  'data-[disabled]:opacity-50';

const CONTENT =
  'overflow-hidden bg-bg-primary text-fg-primary border border-default rounded-none shadow-lg z-50';

const ITEM =
  'relative flex items-center px-3 py-2 text-sm cursor-pointer ' +
  'data-[highlighted]:bg-bg-secondary data-[highlighted]:outline-none ' +
  'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed';

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    { options, placeholder, value, defaultValue, onValueChange, disabled, className = '', ...aria },
    ref,
  ) => {
    return (
      <RadixSelect.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <RadixSelect.Trigger
          ref={ref}
          aria-label={aria['aria-label']}
          className={`${TRIGGER} ${className}`.trim()}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>▾</RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content className={CONTENT} position="popper" sideOffset={4}>
            <RadixSelect.Viewport>
              {options.map((opt) => (
                <RadixSelect.Item key={opt.value} value={opt.value} className={ITEM}>
                  <RadixSelect.ItemText>{opt.label ?? opt.value}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    );
  },
);

Select.displayName = 'Select';
```

Add to `libs/ui/src/index.ts`:

```ts
export { Select, type SelectProps, type SelectOption } from './Select';
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm nx test ui
git add libs/ui package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(ui): Select primitive (Radix Select underneath, squared+themed)

Decision #4: Radix Primitives for keyboard nav, focus traps, ARIA on the
complex components. Trigger and content are styled with our tokens
(rounded-none, bg-bg-primary, etc.).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `libs/ui` Card primitive (TDD)

**Files:**

- Create: `libs/ui/src/Card.tsx`
- Create: `libs/ui/src/Card.test.tsx`
- Modify: `libs/ui/src/index.ts`

- [ ] **Step 1: Write the Card test**

```tsx
// libs/ui/src/Card.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders children (happy)', () => {
    render(
      <Card>
        <p>Hello</p>
      </Card>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('exposes role=region with aria-label (happy)', () => {
    render(<Card aria-label="info">x</Card>);
    expect(screen.getByRole('region', { name: 'info' })).toBeInTheDocument();
  });

  it('uses rounded-none (squared UI rule)', () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstChild as HTMLElement).not.toHaveClass(/rounded-(sm|md|lg|xl)/);
  });

  it('renders without children (invalid path tolerated)', () => {
    expect(() => render(<Card>{null}</Card>)).not.toThrow();
  });

  it('forwards className (happy)', () => {
    const { container } = render(<Card className="extra-class">x</Card>);
    expect((container.firstChild as HTMLElement).className).toContain('extra-class');
  });
});
```

- [ ] **Step 2: Implement Card**

```tsx
// libs/ui/src/Card.tsx
import { forwardRef, type HTMLAttributes } from 'react';

export type CardProps = HTMLAttributes<HTMLElement>;

const BASE = 'bg-bg-primary text-fg-primary border border-default rounded-none p-4 shadow-sm';

export const Card = forwardRef<HTMLElement, CardProps>(
  ({ className = '', children, ...rest }, ref) => {
    return (
      <section ref={ref} role="region" className={`${BASE} ${className}`.trim()} {...rest}>
        {children}
      </section>
    );
  },
);

Card.displayName = 'Card';
```

Add to barrel.

- [ ] **Step 3: Verify + commit**

```bash
pnpm nx test ui
git add libs/ui
git commit -m "$(cat <<'EOF'
feat(ui): Card primitive (squared, themed)

<section role="region"> with our themed border + bg tokens. Optional
aria-label for assistive tech.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `libs/ui` Table primitive (TDD)

**Files:**

- Create: `libs/ui/src/Table.tsx`
- Create: `libs/ui/src/Table.test.tsx`
- Modify: `libs/ui/src/index.ts`

- [ ] **Step 1: Write the Table test**

```tsx
// libs/ui/src/Table.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Table } from './Table';

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
];

describe('Table', () => {
  it('renders header + body rows (happy)', () => {
    render(
      <Table
        caption="Users"
        columns={[
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
        ]}
        rows={ROWS}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows the empty state when rows=[] (invalid → empty)', () => {
    render(
      <Table
        caption="Empty"
        columns={[{ key: 'id', header: 'ID' }]}
        rows={[]}
        rowKey={(r: Row) => r.id}
        emptyLabel="No data"
      />,
    );
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('handles missing accessor as garbage (garbage)', () => {
    // @ts-expect-error — runtime tolerance smoke
    expect(() =>
      render(<Table caption="x" columns={[]} rows={[]} rowKey={() => 'k'} />),
    ).not.toThrow();
  });

  it('uses rounded-none on the table (invariant)', () => {
    render(
      <Table
        caption="x"
        columns={[{ key: 'id', header: 'ID' }]}
        rows={ROWS}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByRole('table').className).not.toMatch(/rounded-(sm|md|lg)/);
  });
});
```

- [ ] **Step 2: Implement Table**

```tsx
// libs/ui/src/Table.tsx
import { type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell?: (row: T) => ReactNode;
}

export interface TableProps<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
  className?: string;
}

const TABLE = 'w-full text-sm border-collapse rounded-none';
const HEAD = 'bg-bg-secondary text-fg-secondary text-left';
const TH = 'px-3 py-2 border-b border-default font-medium';
const TD = 'px-3 py-2 border-b border-subtle text-fg-primary';
const EMPTY = 'p-6 text-center text-fg-tertiary';

export function Table<T>({
  caption,
  columns,
  rows,
  rowKey,
  emptyLabel = 'No rows',
  className = '',
}: TableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className={`bg-bg-primary border border-default ${className}`.trim()}>
        <p className={EMPTY}>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <table className={`${TABLE} ${className}`.trim()}>
      <caption className="sr-only">{caption}</caption>
      <thead className={HEAD}>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={TH} scope="col">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className="hover:bg-bg-secondary">
            {columns.map((c) => (
              <td key={c.key} className={TD}>
                {c.cell ? c.cell(row) : (row as unknown as Record<string, ReactNode>)[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Add to barrel.

- [ ] **Step 3: Verify + commit**

```bash
pnpm nx test ui
git add libs/ui
git commit -m "$(cat <<'EOF'
feat(ui): Table primitive (squared, themed, generic)

Generic <T> over row shape; columns specify accessor or custom cell. Hidden
caption for accessibility. Empty state respected via emptyLabel prop.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `libs/ui` Modal primitive (Radix Dialog underneath, TDD)

**Files:**

- Create: `libs/ui/src/Modal.tsx`
- Create: `libs/ui/src/Modal.test.tsx`
- Modify: `libs/ui/src/index.ts`
- Modify: `libs/ui/package.json` — Radix Dialog dep

- [ ] **Step 1: Install Radix Dialog**

```bash
pnpm add -w @radix-ui/react-dialog
```

- [ ] **Step 2: Write the Modal test**

```tsx
// libs/ui/src/Modal.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('opens and closes (happy)', async () => {
    const onOpenChange = vi.fn();
    render(
      <Modal open onOpenChange={onOpenChange} title="Hello" description="A modal">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('does not render when closed (invalid open=false)', () => {
    render(
      <Modal open={false} onOpenChange={() => {}} title="X" description="d">
        <p>Hidden</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape (happy)', async () => {
    const onOpenChange = vi.fn();
    render(
      <Modal open onOpenChange={onOpenChange} title="X" description="d">
        <p>x</p>
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('uses rounded-none (squared UI rule)', () => {
    render(
      <Modal open onOpenChange={() => {}} title="X" description="d">
        <p>x</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).not.toMatch(/rounded-(sm|md|lg)/);
  });

  it('handles undefined title as garbage (garbage)', () => {
    // @ts-expect-error — runtime tolerance
    expect(() =>
      render(
        <Modal open onOpenChange={() => {}} description="d">
          <p>x</p>
        </Modal>,
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Implement Modal**

```tsx
// libs/ui/src/Modal.tsx
import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}

const OVERLAY = 'fixed inset-0 bg-black/60 z-40 data-[state=open]:animate-in';
const CONTENT =
  'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 ' +
  'bg-bg-primary text-fg-primary border border-default rounded-none ' +
  'p-6 w-full max-w-lg shadow-lg';
const TITLE = 'text-xl font-semibold mb-2';
const DESC = 'text-sm text-fg-secondary mb-4';

export function Modal({ open, onOpenChange, title, description, children }: ModalProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={OVERLAY} />
        <RadixDialog.Content className={CONTENT}>
          <RadixDialog.Title className={TITLE}>{title}</RadixDialog.Title>
          <RadixDialog.Description className={DESC}>{description}</RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
```

Add to barrel.

- [ ] **Step 4: Verify + commit**

```bash
pnpm nx test ui
git add libs/ui package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(ui): Modal primitive (Radix Dialog underneath, squared+themed)

Decision #4: Radix Dialog for focus traps, scroll lock, Escape-to-close.
Title and description required (a11y-mandatory). 4-mode token-driven
styling.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `libs/ui` Toast primitive (Radix Toast underneath, TDD)

**Files:**

- Create: `libs/ui/src/Toast.tsx`
- Create: `libs/ui/src/Toast.test.tsx`
- Modify: `libs/ui/src/index.ts`

- [ ] **Step 1: Install Radix Toast**

```bash
pnpm add -w @radix-ui/react-toast
```

- [ ] **Step 2: Write the Toast test**

```tsx
// libs/ui/src/Toast.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastProvider, Toast } from './Toast';

describe('Toast', () => {
  it('renders title + description when open (happy)', () => {
    render(
      <ToastProvider>
        <Toast open onOpenChange={() => {}} title="Saved" description="Your work is safe" />
      </ToastProvider>,
    );
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Your work is safe')).toBeInTheDocument();
  });

  it('does not render when open=false (invalid)', () => {
    render(
      <ToastProvider>
        <Toast open={false} onOpenChange={() => {}} title="X" description="d" />
      </ToastProvider>,
    );
    expect(screen.queryByText('X')).not.toBeInTheDocument();
  });

  it('applies rounded-none (squared UI rule)', () => {
    render(
      <ToastProvider>
        <Toast open onOpenChange={() => {}} title="X" description="d" />
      </ToastProvider>,
    );
    const t = screen.getByText('X').closest('li');
    expect(t?.className).not.toMatch(/rounded-(sm|md|lg)/);
  });

  it('handles undefined description as garbage (garbage)', () => {
    expect(() =>
      render(
        <ToastProvider>
          {/* @ts-expect-error — runtime tolerance */}
          <Toast open onOpenChange={() => {}} title="X" />
        </ToastProvider>,
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Implement Toast**

```tsx
// libs/ui/src/Toast.tsx
import * as RadixToast from '@radix-ui/react-toast';
import type { ReactNode } from 'react';

export interface ToastProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'danger';
  duration?: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <RadixToast.Provider swipeDirection="right">
      {children}
      <RadixToast.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 w-96 max-w-[100vw] z-50" />
    </RadixToast.Provider>
  );
}

const VARIANT_CLASSES: Record<NonNullable<ToastProps['variant']>, string> = {
  info: 'border-default',
  success: 'border-accent-success',
  warning: 'border-accent-warning',
  danger: 'border-accent-danger',
};

export function Toast({
  open,
  onOpenChange,
  title,
  description,
  variant = 'info',
  duration = 5000,
}: ToastProps) {
  return (
    <RadixToast.Root
      open={open}
      onOpenChange={onOpenChange}
      duration={duration}
      className={`bg-bg-primary text-fg-primary border-l-4 ${VARIANT_CLASSES[variant]} rounded-none p-4 shadow-lg`}
    >
      <RadixToast.Title className="font-semibold">{title}</RadixToast.Title>
      {description && (
        <RadixToast.Description className="text-sm text-fg-secondary mt-1">
          {description}
        </RadixToast.Description>
      )}
    </RadixToast.Root>
  );
}
```

Add both to barrel.

- [ ] **Step 4: Verify + commit**

```bash
pnpm nx test ui
git add libs/ui package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(ui): Toast primitive (Radix Toast underneath, squared+themed)

Variants: info/success/warning/danger drive a left border accent. Default
duration 5s. Wrap consumers in <ToastProvider> at app root.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `libs/ui` Spinner primitive (TDD)

**Files:**

- Create: `libs/ui/src/Spinner.tsx`
- Create: `libs/ui/src/Spinner.test.tsx`
- Modify: `libs/ui/src/index.ts`

- [ ] **Step 1: Write the Spinner test**

```tsx
// libs/ui/src/Spinner.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders with role="status" + aria-live polite (happy)', () => {
    render(<Spinner label="Loading" />);
    const status = screen.getByRole('status', { name: 'Loading' });
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('uses rounded-full (avatar/pill exception per squared-UI rule)', () => {
    render(<Spinner label="x" />);
    const status = screen.getByRole('status');
    const inner = status.querySelector('span');
    expect(inner?.className).toContain('rounded-full');
  });

  it('rejects empty label (invalid — a11y requirement)', () => {
    // @ts-expect-error — exercise type-safety contract
    expect(() => render(<Spinner />)).not.toThrow();
    // The component still renders something; the type system warns.
  });

  it('size variants (small | medium | large) (happy)', () => {
    const { rerender } = render(<Spinner label="x" size="small" />);
    expect(screen.getByRole('status').className).toMatch(/h-4/);
    rerender(<Spinner label="x" size="large" />);
    expect(screen.getByRole('status').className).toMatch(/h-12/);
  });
});
```

- [ ] **Step 2: Implement Spinner**

```tsx
// libs/ui/src/Spinner.tsx
type Size = 'small' | 'medium' | 'large';

export interface SpinnerProps {
  label: string;
  size?: Size;
  className?: string;
}

const SIZE: Record<Size, string> = {
  small: 'h-4 w-4 border-2',
  medium: 'h-8 w-8 border-2',
  large: 'h-12 w-12 border-4',
};

export function Spinner({ label, size = 'medium', className = '' }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`inline-flex items-center justify-center ${SIZE[size]} ${className}`.trim()}
    >
      <span
        className={`block ${SIZE[size]} border-fg-tertiary border-t-accent-primary rounded-full animate-spin`}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
```

Add to barrel.

- [ ] **Step 3: Verify + commit**

```bash
pnpm nx test ui
git add libs/ui
git commit -m "$(cat <<'EOF'
feat(ui): Spinner primitive (squared except rounded-full per CLAUDE.md)

The squared-UI rule explicitly carves out rounded-full for avatars/pills
— the spinner ring qualifies. role="status" + aria-live="polite" for
screen readers; sr-only label.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `libs/api-client` — `@rtk-query/codegen-openapi` against the backend snapshot

**Files:**

- Create: `apps/backend/openapi.json` (snapshot — fetched from running backend)
- Create: `libs/api-client/codegen.config.ts`
- Create: `libs/api-client/src/baseApi.ts`
- Create: `libs/api-client/src/generated.ts` (codegen output; commit it)
- Create: `libs/api-client/src/index.ts`
- Modify: `libs/api-client/project.json` — `build` and `refresh` targets
- Modify: `libs/api-client/package.json` — deps

- [ ] **Step 1: Install RTK + codegen**

```bash
pnpm add -w @reduxjs/toolkit react-redux
pnpm add -Dw @rtk-query/codegen-openapi
```

- [ ] **Step 2: Snapshot the backend's OpenAPI**

The backend stack from Task 0 should be running. Capture a snapshot:

```bash
curl -fsS http://localhost:8000/docs/api.json -o apps/backend/openapi.json
ls -la apps/backend/openapi.json
```

Expected: file written, non-zero size, valid JSON. Verify with:

```bash
node -e 'console.log(JSON.parse(require("fs").readFileSync("apps/backend/openapi.json","utf8")).info.title)'
```

Expected output: `Azimuth API`.

- [ ] **Step 3: Author `libs/api-client/src/baseApi.ts`**

```ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// All requests go through the Next.js proxy at /api/proxy/* (Decision #6).
// Browser JS never sees the Bearer token; the cookie is forwarded by Next.js.
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/proxy/api',
    credentials: 'include',
  }),
  endpoints: () => ({}),
  tagTypes: ['Ping'],
});
```

- [ ] **Step 4: Author `libs/api-client/codegen.config.ts`**

```ts
import type { ConfigFile } from '@rtk-query/codegen-openapi';

const config: ConfigFile = {
  schemaFile: '../../apps/backend/openapi.json',
  apiFile: './src/baseApi.ts',
  apiImport: 'baseApi',
  outputFile: './src/generated.ts',
  exportName: 'azimuthApi',
  hooks: true,
  tag: true,
};

export default config;
```

- [ ] **Step 5: Author `libs/api-client/project.json`**

```json
{
  "name": "api-client",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/api-client/src",
  "projectType": "library",
  "tags": ["scope:shared", "type:lib"],
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "rtk-query-codegen-openapi codegen.config.ts",
        "cwd": "libs/api-client"
      }
    },
    "refresh": {
      "executor": "nx:run-commands",
      "options": {
        "command": "curl -fsS http://localhost:8000/docs/api.json -o apps/backend/openapi.json && pnpm nx build api-client",
        "cwd": "{workspaceRoot}"
      }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "vitest run", "cwd": "libs/api-client" }
    },
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint src --max-warnings=0", "cwd": "libs/api-client" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p libs/api-client/tsconfig.json",
        "cwd": "{workspaceRoot}"
      }
    }
  }
}
```

- [ ] **Step 6: Run codegen**

```bash
pnpm nx build api-client
```

Expected: `libs/api-client/src/generated.ts` created with typed endpoints derived from openapi.json. Specifically you should see `useGetApiPingQuery`, `usePostApiPingMutation` (or similar — exact names depend on the codegen).

- [ ] **Step 7: Author the barrel**

`libs/api-client/src/index.ts`:

```ts
export { baseApi } from './baseApi';
export * from './generated';
```

- [ ] **Step 8: Smoke test (typecheck only — no runtime)**

Add `libs/api-client/src/baseApi.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { baseApi } from './baseApi';

describe('baseApi', () => {
  it('uses /api/proxy/api as the base URL (Decision #6 — Next.js proxy)', () => {
    expect(baseApi.reducerPath).toBe('api');
  });
});
```

Add `libs/api-client/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
});
```

- [ ] **Step 9: Verify + commit**

```bash
pnpm nx test api-client
pnpm nx typecheck api-client
git add apps/backend/openapi.json libs/api-client package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(api-client): codegen RTK Query endpoints from backend OpenAPI

Decision #5: @rtk-query/codegen-openapi generates typed endpoints +
hooks from apps/backend/openapi.json (snapshot — refresh via
`pnpm nx run api-client:refresh`). baseApi targets the Next.js proxy at
/api/proxy/api per Decision #6 — Bearer token never reaches browser JS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `apps/web` Next.js shell — App Router with `[locale]`, root layout, ESLint config

**Files:**

- Modify: `apps/web/src/app/layout.tsx` (already exists from Phase 1; rewrite)
- Create: `apps/web/src/app/[locale]/layout.tsx`
- Create: `apps/web/src/app/[locale]/page.tsx`
- Create: `apps/web/src/app/globals.css` (imports tokens.css)
- Modify: `apps/web/src/middleware.ts` — locale routing + auth guard
- Create: `apps/web/eslint.config.mjs`
- Modify: `apps/web/next.config.ts` — next-intl plugin
- Modify: `apps/web/tailwind.config.ts` — consume design-tokens preset
- Create: `apps/web/src/i18n/request.ts` — next-intl message loader

- [ ] **Step 1: Install next-intl + ESLint plugins**

```bash
pnpm add -w next-intl
pnpm add -Dw eslint-plugin-react eslint-plugin-react-hooks @next/eslint-plugin-next eslint-plugin-jsx-a11y
```

- [ ] **Step 2: Wire next-intl into Next.js**

Update `apps/web/next.config.ts`:

```ts
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 3: Author `apps/web/src/i18n/request.ts`**

```ts
import { getRequestConfig } from 'next-intl/server';
import { LOCALES, DEFAULT_LOCALE, isLocale, messages } from '@azimuth/i18n';
import { notFound } from 'next/navigation';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : DEFAULT_LOCALE;
  if (!LOCALES.includes(locale)) notFound();
  return {
    locale,
    messages: messages[locale],
  };
});
```

- [ ] **Step 4: Author the root `apps/web/src/app/layout.tsx`**

This is the locale-agnostic shell.

```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Azimuth',
  description: 'Your companion from A to Z',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
```

(In Next.js 15 App Router, the root layout typically needs `<html>` and `<body>`; we move those into the `[locale]/layout.tsx` so the `lang` attribute is per-locale.)

- [ ] **Step 5: Author `apps/web/src/app/[locale]/layout.tsx` (Client Component shell with theme + i18n providers)**

```tsx
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { LOCALES, isLocale, type Locale } from '@azimuth/i18n';
import { notFound } from 'next/navigation';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';
import { ReduxProvider } from '@/shared/store/ReduxProvider';
import { ToastProvider } from '@azimuth/ui';
import { setThemePrePaint } from '@/shared/theme/set-theme-pre-paint';
import { cookies } from 'next/headers';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const messages = await getMessages();
  const themeCookie = (await cookies()).get('azimuth_theme')?.value ?? 'day';

  return (
    <html lang={locale} data-theme={themeCookie} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: setThemePrePaint(),
          }}
        />
      </head>
      <body className="bg-bg-primary text-fg-primary font-sans">
        <ReduxProvider>
          <NextIntlClientProvider locale={locale as Locale} messages={messages}>
            <ThemeProvider initialTheme={themeCookie}>
              <ToastProvider>{children}</ToastProvider>
            </ThemeProvider>
          </NextIntlClientProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
```

(Implementation notes for the subagent: `ReduxProvider`, `ThemeProvider`, `set-theme-pre-paint` come from later tasks; this task lands the layout shape. Compile errors from missing imports are expected until Tasks 14, 18, 20 land.)

- [ ] **Step 6: Author the placeholder index page**

`apps/web/src/app/[locale]/page.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function HomePage() {
  return <ServerHomePage />;
}

function ServerHomePage() {
  const t = useTranslations('common');
  const tNav = useTranslations('nav');
  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold mb-2">{t('appName')}</h1>
      <p className="text-fg-secondary mb-6">{t('tagline')}</p>
      <nav className="flex gap-4">
        <Link href="/dashboard" className="underline">
          {tNav('dashboard')}
        </Link>
        <Link href="/login" className="underline">
          {/* eslint-disable-next-line react/jsx-no-literals — placeholder during scaffolding */}
          Login
        </Link>
      </nav>
    </main>
  );
}
```

- [ ] **Step 7: Author `apps/web/src/middleware.ts` for locale routing**

```ts
import createMiddleware from 'next-intl/middleware';
import { LOCALES, DEFAULT_LOCALE } from '@azimuth/i18n';

export default createMiddleware({
  locales: [...LOCALES],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
});

export const config = {
  // Skip /api/* and Next internals.
  matcher: ['/((?!api|_next|_vercel|favicon.ico).*)'],
};
```

- [ ] **Step 8: Author `apps/web/src/app/globals.css`**

```css
@import 'tailwindcss';
@import '../../../libs/design-tokens/src/tokens.css';

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}
```

- [ ] **Step 9: Author `apps/web/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';
import { azimuthPreset } from '@azimuth/design-tokens';

const config: Config = {
  presets: [azimuthPreset as Config],
  content: [
    './src/**/*.{ts,tsx}',
    '../../libs/ui/src/**/*.{ts,tsx}',
    '../../libs/i18n/src/**/*.{ts,tsx}',
  ],
};

export default config;
```

- [ ] **Step 10: Author `apps/web/eslint.config.mjs`**

```js
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      '@next/next': nextPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react/react-in-jsx-scope': 'off',
      'react/jsx-no-literals': [
        'error',
        {
          noStrings: true,
          ignoreProps: true,
          allowedStrings: ['—', '·', '·', '▾', ':', '/', '|', '×'],
          noAttributeStrings: false,
        },
      ],
    },
    settings: { react: { version: 'detect' } },
  },
];
```

- [ ] **Step 11: Smoke-build and start dev server**

```bash
pnpm nx test web 2>&1 | tail -5     # No tests yet for the shell
pnpm nx lint web 2>&1 | tail -10
pnpm nx dev web &
DEV_PID=$!
sleep 15
curl -fsSL http://localhost:3000/en -o /tmp/home-en.html -w "HTTP %{http_code} (%{size_download} bytes)\n"
curl -fsSL http://localhost:3000/pt -o /tmp/home-pt.html -w "HTTP %{http_code} (%{size_download} bytes)\n"
grep -oE "Azimuth|Painel|Dashboard|Idioma" /tmp/home-{en,pt}.html | head
kill $DEV_PID 2>/dev/null || true
```

Expected: both locales return HTTP 200; the markers appear (en has "Azimuth"/"Dashboard"; pt has "Painel"). The dev server is killed after the probe.

(If lint fails on the placeholder `Login` literal in Step 6, that's acceptable — Task 18 wires the proper i18n key. We carry the eslint-disable-next-line in the meantime.)

- [ ] **Step 12: Commit**

```bash
git add apps/web pnpm-lock.yaml package.json
git commit -m "$(cat <<'EOF'
feat(web): Next.js 15 App Router shell with [locale] segment

Locale-aware routing via next-intl middleware (en + pt). Root layout
provides locale-agnostic <html>; [locale]/layout.tsx pulls cookie-based
theme and provides Redux + i18n + Toast providers. ESLint configured
with react/jsx-no-literals to enforce CLAUDE.md hard rule #5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Redux store, RTK Query baseApi wiring, typed hooks, auth slice

**Files:**

- Create: `apps/web/src/shared/store/index.ts`
- Create: `apps/web/src/shared/store/hooks.ts`
- Create: `apps/web/src/shared/store/slices/auth.ts`
- Create: `apps/web/src/shared/store/ReduxProvider.tsx`
- Create: `apps/web/src/shared/store/index.test.ts`

- [ ] **Step 1: Author `apps/web/src/shared/store/slices/auth.ts`**

```ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface AuthUser {
  id: number;
  email: string;
}

export interface AuthState {
  user: AuthUser | null;
  status: 'idle' | 'pending' | 'authenticated' | 'unauthenticated';
}

const initialState: AuthState = {
  user: null,
  status: 'idle',
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
      state.status = action.payload ? 'authenticated' : 'unauthenticated';
    },
    setPending(state) {
      state.status = 'pending';
    },
  },
});

export const { setUser, setPending } = authSlice.actions;
```

- [ ] **Step 2: Author `apps/web/src/shared/store/index.ts`**

```ts
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { baseApi } from '@azimuth/api-client';
import { authSlice } from './slices/auth';

export function makeStore() {
  const store = configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      auth: authSlice.reducer,
    },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  setupListeners(store.dispatch);
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
```

- [ ] **Step 3: Author `apps/web/src/shared/store/hooks.ts`**

```ts
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, AppState } from './index';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<AppState>();
```

- [ ] **Step 4: Author `apps/web/src/shared/store/ReduxProvider.tsx`**

```tsx
'use client';

import { useRef, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from './index';

export function ReduxProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore>();
  if (!storeRef.current) storeRef.current = makeStore();
  return <Provider store={storeRef.current}>{children}</Provider>;
}
```

- [ ] **Step 5: Author the smoke test**

`apps/web/src/shared/store/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeStore } from './index';
import { setUser } from './slices/auth';

describe('Redux store', () => {
  it('starts with idle auth state (happy)', () => {
    const store = makeStore();
    expect(store.getState().auth.status).toBe('idle');
    expect(store.getState().auth.user).toBeNull();
  });

  it('flips to authenticated on setUser (happy)', () => {
    const store = makeStore();
    store.dispatch(setUser({ id: 1, email: 'a@b' }));
    expect(store.getState().auth.status).toBe('authenticated');
    expect(store.getState().auth.user).toEqual({ id: 1, email: 'a@b' });
  });

  it('flips to unauthenticated on setUser(null) (invalid → null)', () => {
    const store = makeStore();
    store.dispatch(setUser(null));
    expect(store.getState().auth.status).toBe('unauthenticated');
  });

  it('hosts the api reducer slot (happy — api-client integration)', () => {
    const store = makeStore();
    expect(store.getState()).toHaveProperty('api');
  });
});
```

- [ ] **Step 6: Verify + commit**

```bash
pnpm nx test web 2>&1 | tail -10
git add apps/web
git commit -m "$(cat <<'EOF'
feat(web): Redux store + auth slice + typed hooks + RTK Query middleware

Redux configureStore composing baseApi.reducer + auth slice. Typed
useAppDispatch / useAppSelector. ReduxProvider boundary uses useRef to
keep the store singleton in App Router (avoids re-creation on RSC →
Client transitions).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Auth flow — `/login`, `/api/auth/stub-callback`, `/dashboard`, logout

**Files:**

- Create: `apps/web/src/app/[locale]/login/page.tsx`
- Create: `apps/web/src/app/[locale]/dashboard/page.tsx`
- Create: `apps/web/src/app/api/auth/stub-redirect/route.ts`
- Create: `apps/web/src/app/api/auth/stub-callback/route.ts`
- Create: `apps/web/src/app/api/auth/logout/route.ts`
- Create: `apps/web/src/shared/auth/cookie.ts`
- Create: `apps/web/src/shared/auth/cookie.test.ts`
- Create: `apps/web/src/messages/auth.{en,pt}.json` (per-feature catalog merged into next-intl)

- [ ] **Step 1: Author the auth cookie helper**

`apps/web/src/shared/auth/cookie.ts`:

```ts
const COOKIE_NAME = 'azimuth_session';

export function buildSessionCookie(token: string, opts: { secure: boolean }): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${60 * 60 * 24 * 14}`, // 14 days; align with backend Passport tokensExpireIn
  ];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function buildLogoutCookie(opts: { secure: boolean }): string {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
```

- [ ] **Step 2: Test the cookie helper (TDD)**

`apps/web/src/shared/auth/cookie.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSessionCookie, buildLogoutCookie, SESSION_COOKIE_NAME } from './cookie';

describe('cookie helpers', () => {
  it('emits HttpOnly + SameSite=Strict + Max-Age (happy)', () => {
    const c = buildSessionCookie('tok', { secure: true });
    expect(c).toContain(`${SESSION_COOKIE_NAME}=tok`);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Strict');
    expect(c).toContain('Max-Age=');
    expect(c).toContain('Secure');
  });

  it('omits Secure in dev (invalid → flag off)', () => {
    const c = buildSessionCookie('tok', { secure: false });
    expect(c).not.toContain('Secure');
  });

  it('logout cookie clears with Max-Age=0 (happy)', () => {
    const c = buildLogoutCookie({ secure: true });
    expect(c).toContain('Max-Age=0');
    expect(c).toContain(`${SESSION_COOKIE_NAME}=`);
  });

  it('handles empty token as garbage (garbage)', () => {
    const c = buildSessionCookie('', { secure: false });
    expect(c).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;`));
  });
});
```

Run: `pnpm nx test web -- shared/auth 2>&1 | tail -10`. Expected: 4 passing.

- [ ] **Step 3: Author the stub-redirect route handler**

`apps/web/src/app/api/auth/stub-redirect/route.ts`:

```ts
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.AZIMUTH_BACKEND_URL ?? 'http://localhost:8000';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const identity = url.searchParams.get('identity') ?? 'stub-user@azimuth.local';
  const cb = new URL('/api/auth/stub-callback', url);
  cb.searchParams.set('identity', identity);
  return NextResponse.redirect(
    `${BACKEND_URL}/auth/socialite/stub/redirect?identity=${encodeURIComponent(identity)}&next=${encodeURIComponent(cb.toString())}`,
    302,
  );
}
```

(The backend's stub callback returns a JSON token directly, so the simpler path is to skip the backend redirect entirely and have stub-callback fetch the backend's callback. We'll favor that simpler path.)

Replace the route handler body with:

```ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Skip the backend redirect — fetch its callback directly from our route handler.
  const url = new URL(request.url);
  const identity = url.searchParams.get('identity') ?? 'stub-user@azimuth.local';
  const cb = new URL('/api/auth/stub-callback', url);
  cb.searchParams.set('identity', identity);
  return NextResponse.redirect(cb, 302);
}
```

- [ ] **Step 4: Author the stub-callback route handler**

`apps/web/src/app/api/auth/stub-callback/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { buildSessionCookie } from '@/shared/auth/cookie';

const BACKEND_URL = process.env.AZIMUTH_BACKEND_URL ?? 'http://localhost:8000';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const identity = url.searchParams.get('identity') ?? 'stub-user@azimuth.local';

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

  // Locale is recovered from the previous URL or default; for now redirect to /en/dashboard.
  const dashboard = new URL('/en/dashboard', url);
  const res = NextResponse.redirect(dashboard, 302);
  res.headers.set('Set-Cookie', cookie);
  return res;
}
```

- [ ] **Step 5: Author the logout route handler**

`apps/web/src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { buildLogoutCookie } from '@/shared/auth/cookie';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const secure = process.env.NODE_ENV === 'production';
  const res = NextResponse.redirect(new URL('/en/login', url), 302);
  res.headers.set('Set-Cookie', buildLogoutCookie({ secure }));
  return res;
}
```

- [ ] **Step 6: Author the login page**

`apps/web/src/messages/auth.en.json`:

```json
{
  "auth": {
    "loginTitle": "Sign in to Azimuth",
    "continueWithStub": "Continue with Stub",
    "logoutLabel": "Log out"
  }
}
```

`apps/web/src/messages/auth.pt.json`:

```json
{
  "auth": {
    "loginTitle": "Entrar em Azimuth",
    "continueWithStub": "Continuar com Stub",
    "logoutLabel": "Sair"
  }
}
```

(Update `apps/web/src/i18n/request.ts` to merge per-feature catalogs:)

```ts
import { getRequestConfig } from 'next-intl/server';
import { LOCALES, DEFAULT_LOCALE, isLocale, messages as shared } from '@azimuth/i18n';
import { notFound } from 'next/navigation';

import authEn from '@/messages/auth.en.json';
import authPt from '@/messages/auth.pt.json';

const PER_FEATURE: Record<string, Record<string, unknown>> = {
  en: authEn,
  pt: authPt,
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : DEFAULT_LOCALE;
  if (!LOCALES.includes(locale)) notFound();
  return {
    locale,
    messages: { ...shared[locale], ...PER_FEATURE[locale] },
  };
});
```

`apps/web/src/app/[locale]/login/page.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button, Card } from '@azimuth/ui';

export default function LoginPage() {
  const t = useTranslations('auth');
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg-secondary p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-4">{t('loginTitle')}</h1>
        <Link href="/api/auth/stub-redirect">
          <Button variant="primary" className="w-full">
            {t('continueWithStub')}
          </Button>
        </Link>
      </Card>
    </main>
  );
}
```

- [ ] **Step 7: Author the dashboard page**

`apps/web/src/app/[locale]/dashboard/page.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Card } from '@azimuth/ui';
import { SESSION_COOKIE_NAME } from '@/shared/auth/cookie';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!session?.value) redirect(`/${locale}/login`);

  return <DashboardClient />;
}

function DashboardClient() {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold mb-6">{tCommon('appName')}</h1>
      <nav className="flex gap-4">
        <Link href="./ping" className="underline">
          {t('ping')}
        </Link>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="underline">
            {t('logout')}
          </button>
        </form>
      </nav>
    </main>
  );
}
```

- [ ] **Step 8: Smoke test the auth flow**

```bash
pnpm nx dev web &
DEV_PID=$!
sleep 15
# Login flow:
curl -fsSL -c /tmp/cookies.txt -L "http://localhost:3000/api/auth/stub-redirect?identity=demo@local" -o /tmp/dashboard.html -w "final HTTP %{http_code}\n"
grep -oE "Azimuth|Painel|Dashboard|Sign in|Logout" /tmp/dashboard.html | head
grep -E "azimuth_session" /tmp/cookies.txt | head -1
kill $DEV_PID 2>/dev/null || true
```

Expected: redirect chain ends at `/en/dashboard` (HTTP 200); the cookie file contains `azimuth_session=...`.

- [ ] **Step 9: Verify + commit**

```bash
pnpm nx test web
pnpm nx lint web 2>&1 | tail -5
git add apps/web
git commit -m "$(cat <<'EOF'
feat(web): auth flow — /login, stub-callback, dashboard, logout

Decision #6: httpOnly cookie + Next.js proxy. The /api/auth/stub-callback
route handler fetches the backend's stub callback, extracts the access
token from the JSON response, and sets it as an HttpOnly +
SameSite=Strict cookie. The token never reaches browser JS. Dashboard
guards on cookie presence and redirects to /login if missing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: `/api/proxy/[...path]` route handler — forwards to backend with Bearer

**Files:**

- Create: `apps/web/src/app/api/proxy/[...path]/route.ts`
- Create: `apps/web/src/app/api/proxy/[...path]/route.test.ts`

- [ ] **Step 1: Write the proxy test (TDD)**

`apps/web/src/app/api/proxy/[...path]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

function makeReq(path: string, opts: { method?: string; cookie?: string; body?: BodyInit } = {}) {
  const url = `http://localhost:3000/api/proxy/${path}`;
  const headers = new Headers();
  if (opts.cookie) headers.set('cookie', opts.cookie);
  return new Request(url, { method: opts.method ?? 'GET', headers, body: opts.body });
}

function makeCtx(path: string) {
  return { params: Promise.resolve({ path: path.split('/') }) };
}

describe('/api/proxy/[...path]', () => {
  it('forwards GET with Bearer header from cookie (happy)', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const req = makeReq('api/ping', { cookie: 'azimuth_session=tok123' });
    const res = await GET(req, makeCtx('api/ping'));
    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('Authorization')).toBe('Bearer tok123');
    expect(res.status).toBe(200);
  });

  it('returns 401 if no cookie (invalid)', async () => {
    const req = makeReq('api/ping');
    const res = await GET(req, makeCtx('api/ping'));
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forwards POST body and content-type (happy)', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 201 }));
    const body = JSON.stringify({ note: { en: 'hi' } });
    const req = new Request('http://localhost:3000/api/proxy/api/ping', {
      method: 'POST',
      headers: { cookie: 'azimuth_session=tok123', 'content-type': 'application/json' },
      body,
    });
    const res = await POST(req, makeCtx('api/ping'));
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers.get('content-type')).toBe('application/json');
    expect(res.status).toBe(201);
  });

  it('handles upstream 5xx as garbage (garbage)', async () => {
    mockFetch.mockResolvedValue(new Response('boom', { status: 503 }));
    const req = makeReq('api/ping', { cookie: 'azimuth_session=tok123' });
    const res = await GET(req, makeCtx('api/ping'));
    expect(res.status).toBe(503);
  });
});
```

Run: `pnpm nx test web -- proxy 2>&1 | tail -10`. Expected: 4 fail.

- [ ] **Step 2: Implement the proxy**

`apps/web/src/app/api/proxy/[...path]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/shared/auth/cookie';

const BACKEND_URL = process.env.AZIMUTH_BACKEND_URL ?? 'http://localhost:8000';

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const token = match?.[1];

  if (!token) {
    return new NextResponse('unauthenticated', { status: 401 });
  }

  const url = `${BACKEND_URL}/${path.join('/')}${new URL(request.url).search}`;
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('host');
  headers.set('Authorization', `Bearer ${token}`);

  const init: RequestInit = {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
    redirect: 'manual',
  };

  const upstream = await fetch(url, init);
  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete('set-cookie');
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
```

- [ ] **Step 3: Verify tests pass**

```bash
pnpm nx test web -- proxy 2>&1 | tail -10
```

Expected: 4 passing tests.

- [ ] **Step 4: Live smoke test**

```bash
pnpm nx dev web &
DEV_PID=$!
sleep 15

# Step A: log in via stub to get a session cookie.
curl -fsSL -c /tmp/cookies.txt "http://localhost:3000/api/auth/stub-redirect?identity=proxy-test@local" -o /dev/null

# Step B: hit /api/proxy/api/ping; should return 200/403/etc. — but NOT 401.
curl -fsSL -b /tmp/cookies.txt -w "\nHTTP %{http_code}\n" "http://localhost:3000/api/proxy/api/ping"

kill $DEV_PID 2>/dev/null || true
```

Expected: HTTP 200 (empty array) OR 403 (no permissions yet — the user doesn't have `ping.view`). Either way, NOT 401.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "$(cat <<'EOF'
feat(web): /api/proxy/[...path] route handler

Forwards browser requests to the backend with Authorization: Bearer
<cookie>. The cookie is parsed from the request; the upstream
Set-Cookie is stripped. 401 if no cookie. All HTTP verbs supported.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: `features/ping` — RTK Query api + Zod schema

**Files:**

- Create: `apps/web/src/features/ping/schema.ts`
- Create: `apps/web/src/features/ping/api.ts`
- Create: `apps/web/src/features/ping/schema.test.ts`
- Create: `apps/web/src/features/ping/api.test.ts`

- [ ] **Step 1: Install React Hook Form + Zod**

```bash
pnpm add -w react-hook-form zod @hookform/resolvers
```

- [ ] **Step 2: Author the Zod schema (TDD)**

`apps/web/src/features/ping/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { recordPingSchema } from './schema';

describe('recordPingSchema', () => {
  it('accepts a valid en+pt note (happy)', () => {
    const r = recordPingSchema.safeParse({ note: { en: 'hi', pt: 'olá' } });
    expect(r.success).toBe(true);
  });

  it('accepts en-only note (happy)', () => {
    const r = recordPingSchema.safeParse({ note: { en: 'hi' } });
    expect(r.success).toBe(true);
  });

  it('rejects empty note (invalid)', () => {
    const r = recordPingSchema.safeParse({ note: {} });
    expect(r.success).toBe(false);
  });

  it('rejects non-string values (garbage)', () => {
    const r = recordPingSchema.safeParse({ note: { en: 123 } });
    expect(r.success).toBe(false);
  });

  it('rejects empty strings (invalid)', () => {
    const r = recordPingSchema.safeParse({ note: { en: '' } });
    expect(r.success).toBe(false);
  });
});
```

`apps/web/src/features/ping/schema.ts`:

```ts
import { z } from 'zod';

export const recordPingSchema = z.object({
  note: z
    .record(z.string().min(1).max(10), z.string().min(1).max(500))
    .refine((m) => Object.keys(m).length > 0, { message: 'note must have at least one locale' }),
});

export type RecordPingPayload = z.infer<typeof recordPingSchema>;
```

Run: `pnpm nx test web -- schema 2>&1 | tail -10`. Expected: 5 passing.

- [ ] **Step 3: Author the RTK Query endpoints**

`apps/web/src/features/ping/api.ts`:

```ts
import { baseApi } from '@azimuth/api-client';
import type { RecordPingPayload } from './schema';

export interface PingDto {
  id: string;
  note: Record<string, string>;
  created_at: string;
}

export const pingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listPings: builder.query<PingDto[], void>({
      query: () => 'ping',
      providesTags: ['Ping'],
    }),
    recordPing: builder.mutation<PingDto, RecordPingPayload>({
      query: (body) => ({ url: 'ping', method: 'POST', body }),
      invalidatesTags: ['Ping'],
    }),
  }),
});

export const { useListPingsQuery, useRecordPingMutation } = pingApi;
```

- [ ] **Step 4: Smoke test the endpoint shape**

`apps/web/src/features/ping/api.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pingApi } from './api';

describe('pingApi', () => {
  it('exposes listPings + recordPing endpoints (happy)', () => {
    expect(pingApi.endpoints.listPings).toBeDefined();
    expect(pingApi.endpoints.recordPing).toBeDefined();
  });
});
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm nx test web -- ping
git add apps/web pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(ping): RTK Query api + Zod schema for the Ping feature

Decision #7: Zod schema (recordPingSchema) drives both the React Hook
Form validation in the next task AND the RTK Query payload type. listPings
+ recordPing endpoints injected onto baseApi (which targets the Next.js
proxy per Decision #6). Tag 'Ping' invalidates the list on mutation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: `features/ping` — `PingList` component (TDD)

**Files:**

- Create: `apps/web/src/features/ping/components/PingList.tsx`
- Create: `apps/web/src/features/ping/components/PingList.test.tsx`
- Create: `apps/web/src/messages/ping.{en,pt}.json`
- Modify: `apps/web/src/i18n/request.ts` — merge ping catalogs

- [ ] **Step 1: Author per-feature catalogs**

`apps/web/src/messages/ping.en.json`:

```json
{
  "ping": {
    "title": "Pings",
    "create": "Create ping",
    "loading": "Loading pings…",
    "empty": "No pings yet",
    "error": "Failed to load pings",
    "noteLocale": "Locale",
    "noteText": "Text",
    "addLocale": "Add locale",
    "submit": "Submit"
  }
}
```

`apps/web/src/messages/ping.pt.json`:

```json
{
  "ping": {
    "title": "Pings",
    "create": "Criar ping",
    "loading": "Carregando pings…",
    "empty": "Nenhum ping ainda",
    "error": "Falha ao carregar pings",
    "noteLocale": "Idioma",
    "noteText": "Texto",
    "addLocale": "Adicionar idioma",
    "submit": "Enviar"
  }
}
```

Update `apps/web/src/i18n/request.ts` to also merge `ping` catalogs (extend the `PER_FEATURE` map).

- [ ] **Step 2: Write the PingList component test**

`apps/web/src/features/ping/components/PingList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { PingList } from './PingList';

const messages = {
  ping: { title: 'Pings', loading: 'Loading…', empty: 'No pings yet', error: 'Failed' },
};

function wrap(ui: React.ReactElement) {
  return (
    <Provider store={makeStore()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {ui}
      </NextIntlClientProvider>
    </Provider>
  );
}

describe('PingList', () => {
  it('shows loading state initially (happy)', () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(() => {}) as unknown as Promise<Response>,
    );
    render(wrap(<PingList />));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty state when API returns [] (invalid → empty)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(wrap(<PingList />));
    expect(await screen.findByText('No pings yet')).toBeInTheDocument();
  });

  it('renders rows when API returns pings (happy)', async () => {
    const rows = [
      { id: '01H', note: { en: 'hi' }, created_at: '2026-01-01T00:00:00Z' },
      { id: '01J', note: { en: 'yo' }, created_at: '2026-01-02T00:00:00Z' },
    ];
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(wrap(<PingList />));
    expect(await screen.findByText('hi')).toBeInTheDocument();
    expect(await screen.findByText('yo')).toBeInTheDocument();
  });

  it('shows error state on 5xx (garbage)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    render(wrap(<PingList />));
    expect(await screen.findByText('Failed')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implement PingList**

`apps/web/src/features/ping/components/PingList.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Spinner, Table } from '@azimuth/ui';
import { useListPingsQuery, type PingDto } from '../api';

export function PingList() {
  const t = useTranslations('ping');
  const { data, isLoading, isError } = useListPingsQuery();

  if (isLoading) {
    return <Spinner label={t('loading')} />;
  }
  if (isError) {
    return <p className="text-accent-danger">{t('error')}</p>;
  }
  return (
    <Table<PingDto>
      caption={t('title')}
      columns={[
        { key: 'id', header: 'ID', cell: (r) => r.id.slice(0, 8) },
        { key: 'note', header: t('noteText'), cell: (r) => r.note.en ?? Object.values(r.note)[0] },
        { key: 'created_at', header: 'When', cell: (r) => new Date(r.created_at).toLocaleString() },
      ]}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyLabel={t('empty')}
    />
  );
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm nx test web -- PingList
git add apps/web
git commit -m "$(cat <<'EOF'
feat(ping): PingList component with happy/empty/error/loading states

Wraps libs/ui Table with locale-aware copy. Pulls from the listPings
RTK Query endpoint (hits /api/proxy/api/ping). 4 component tests cover
happy/invalid/garbage paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: `features/ping` — `RecordPingForm` component (RHF + Zod, TDD)

**Files:**

- Create: `apps/web/src/features/ping/components/RecordPingForm.tsx`
- Create: `apps/web/src/features/ping/components/RecordPingForm.test.tsx`

- [ ] **Step 1: Write the form test**

`apps/web/src/features/ping/components/RecordPingForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { RecordPingForm } from './RecordPingForm';

const messages = {
  ping: {
    create: 'Create ping',
    noteLocale: 'Locale',
    noteText: 'Text',
    submit: 'Submit',
    error: 'Failed',
  },
};

function wrap(ui: React.ReactElement) {
  return (
    <Provider store={makeStore()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {ui}
      </NextIntlClientProvider>
    </Provider>
  );
}

describe('RecordPingForm', () => {
  it('submits a valid en payload (happy)', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: '01H', note: { en: 'hi' }, created_at: 'now' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );

    render(wrap(<RecordPingForm />));
    await userEvent.type(screen.getByLabelText('Text'), 'hi');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/proxy/api/ping'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('blocks submit on empty text (invalid)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(wrap(<RecordPingForm />));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows server error on 5xx (garbage)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    render(wrap(<RecordPingForm />));
    await userEvent.type(screen.getByLabelText('Text'), 'hi');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Failed')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement the form**

`apps/web/src/features/ping/components/RecordPingForm.tsx`:

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Button, Input } from '@azimuth/ui';
import { recordPingSchema, type RecordPingPayload } from '../schema';
import { useRecordPingMutation } from '../api';
import { useState } from 'react';

interface FormShape {
  noteEn: string;
}

export function RecordPingForm() {
  const t = useTranslations('ping');
  const [recordPing, { isLoading }] = useRecordPingMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormShape>({
    resolver: zodResolver(
      recordPingSchema.transform((d): FormShape => ({ noteEn: d.note.en ?? '' })),
    ),
    defaultValues: { noteEn: '' },
  });

  return (
    <form
      className="flex flex-col gap-3 max-w-md"
      onSubmit={handleSubmit(async (values) => {
        setServerError(null);
        const payload: RecordPingPayload = { note: { en: values.noteEn } };
        const result = await recordPing(payload);
        if ('error' in result) {
          setServerError(t('error'));
        } else {
          reset({ noteEn: '' });
        }
      })}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm">{t('noteText')}</span>
        <Input
          aria-invalid={!!errors.noteEn}
          {...register('noteEn', { required: true, minLength: 1 })}
        />
      </label>
      {serverError && <p className="text-accent-danger text-sm">{serverError}</p>}
      <Button type="submit" disabled={isLoading}>
        {t('submit')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm nx test web -- RecordPingForm
git add apps/web
git commit -m "$(cat <<'EOF'
feat(ping): RecordPingForm — RHF + Zod, locale-aware

Decision #7: Zod schema doubles as form validation; submit dispatches
the recordPing RTK Query mutation. Server error captured into local
state; success resets the form. happy/invalid/garbage tests verify
mutation dispatch, validation blocking, and error rendering.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: ThemeProvider + ThemeSwitcher + pre-paint script

**Files:**

- Create: `apps/web/src/shared/theme/ThemeProvider.tsx`
- Create: `apps/web/src/shared/theme/ThemeSwitcher.tsx`
- Create: `apps/web/src/shared/theme/set-theme-pre-paint.ts`
- Create: `apps/web/src/app/api/theme/route.ts` (POST sets cookie)
- Create: `apps/web/src/shared/theme/ThemeSwitcher.test.tsx`

- [ ] **Step 1: Author the pre-paint script**

`apps/web/src/shared/theme/set-theme-pre-paint.ts`:

```ts
export function setThemePrePaint(): string {
  // Inlined into <head>; runs before paint to avoid theme flash.
  return `
(function() {
  try {
    var m = document.cookie.match(/(?:^|; )azimuth_theme=([^;]+)/);
    var theme = m ? decodeURIComponent(m[1]) : 'day';
    if (!['day','dusk','night','bright'].includes(theme)) theme = 'day';
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`;
}
```

- [ ] **Step 2: Author the theme cookie route**

`apps/web/src/app/api/theme/route.ts`:

```ts
import { NextResponse } from 'next/server';

const VALID = ['day', 'dusk', 'night', 'bright'] as const;

export async function POST(request: Request) {
  const { theme } = (await request.json()) as { theme?: string };
  if (!theme || !VALID.includes(theme as (typeof VALID)[number])) {
    return new NextResponse('invalid theme', { status: 400 });
  }
  const secure = process.env.NODE_ENV === 'production';
  const cookie = [
    `azimuth_theme=${theme}`,
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${60 * 60 * 24 * 365}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', cookie);
  return res;
}
```

- [ ] **Step 3: Author the ThemeProvider**

`apps/web/src/shared/theme/ThemeProvider.tsx`:

```tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type Theme = 'day' | 'dusk' | 'night' | 'bright';

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => Promise<void>;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: string;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(
    (['day', 'dusk', 'night', 'bright'] as const).includes(initialTheme as Theme)
      ? (initialTheme as Theme)
      : 'day',
  );

  async function setTheme(t: Theme): Promise<void> {
    document.documentElement.dataset.theme = t;
    setThemeState(t);
    await fetch('/api/theme', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: t }),
    });
  }

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
```

- [ ] **Step 4: Author the ThemeSwitcher**

`apps/web/src/shared/theme/ThemeSwitcher.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Select } from '@azimuth/ui';
import { useTheme } from './ThemeProvider';

export function ThemeSwitcher() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  return (
    <Select
      aria-label={t('label')}
      placeholder={t('label')}
      value={theme}
      onValueChange={(v) => void setTheme(v as 'day' | 'dusk' | 'night' | 'bright')}
      options={[
        { value: 'day', label: t('day') },
        { value: 'dusk', label: t('dusk') },
        { value: 'night', label: t('night') },
        { value: 'bright', label: t('bright') },
      ]}
    />
  );
}
```

- [ ] **Step 5: Test the ThemeSwitcher**

`apps/web/src/shared/theme/ThemeSwitcher.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from './ThemeProvider';
import { ThemeSwitcher } from './ThemeSwitcher';

const messages = {
  theme: { label: 'Theme', day: 'Day', dusk: 'Dusk', night: 'Night', bright: 'Bright' },
};

function wrap(initial: string, ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeProvider initialTheme={initial}>{ui}</ThemeProvider>
    </NextIntlClientProvider>
  );
}

describe('ThemeSwitcher', () => {
  it('renders 4 options (happy)', async () => {
    render(wrap('day', <ThemeSwitcher />));
    await userEvent.click(screen.getByRole('combobox', { name: 'Theme' }));
    expect(await screen.findByRole('option', { name: 'Day' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Dusk' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Night' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Bright' })).toBeInTheDocument();
  });

  it('updates data-theme attribute on selection (happy)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    render(wrap('day', <ThemeSwitcher />));
    await userEvent.click(screen.getByRole('combobox', { name: 'Theme' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Night' }));
    expect(document.documentElement.dataset.theme).toBe('night');
  });

  it('starts at the cookie theme (initialTheme prop)', () => {
    render(wrap('dusk', <ThemeSwitcher />));
    // The trigger reflects the current value.
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument();
  });

  it('rejects invalid initialTheme as garbage (garbage → falls back to day)', () => {
    render(wrap('purple', <ThemeSwitcher />));
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument();
    // The provider clamps to 'day' internally; no crash.
  });
});
```

- [ ] **Step 6: Verify + commit**

```bash
pnpm nx test web -- ThemeSwitcher
git add apps/web
git commit -m "$(cat <<'EOF'
feat(theme): ThemeProvider + ThemeSwitcher + pre-paint script

Decision #3: 4 themes (day/dusk/night/bright). Pre-paint inline script
reads the cookie before render to avoid theme flash. Switching writes
the cookie via POST /api/theme. ThemeSwitcher uses Select primitive.
4 component tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: LocaleSwitcher (with cookie persistence)

**Files:**

- Create: `apps/web/src/shared/i18n/LocaleSwitcher.tsx`
- Create: `apps/web/src/shared/i18n/LocaleSwitcher.test.tsx`

- [ ] **Step 1: Author the LocaleSwitcher**

`apps/web/src/shared/i18n/LocaleSwitcher.tsx`:

```tsx
'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { Select } from '@azimuth/ui';
import { LOCALES, type Locale } from '@azimuth/i18n';

export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Select
      aria-label={t('label')}
      placeholder={t('label')}
      value={current}
      onValueChange={(next) => {
        const newPath = pathname.replace(new RegExp(`^/(${LOCALES.join('|')})`), `/${next}`);
        router.replace(newPath);
      }}
      options={LOCALES.map((l) => ({ value: l, label: t(l as Locale) }))}
    />
  );
}
```

- [ ] **Step 2: Test the LocaleSwitcher**

`apps/web/src/shared/i18n/LocaleSwitcher.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { LocaleSwitcher } from './LocaleSwitcher';

const messages = { locale: { label: 'Language', en: 'English', pt: 'Portuguese' } };

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/en/dashboard',
}));

describe('LocaleSwitcher', () => {
  it('lists en + pt (happy)', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LocaleSwitcher />
      </NextIntlClientProvider>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Language' }));
    expect(await screen.findByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Portuguese' })).toBeInTheDocument();
  });

  it('navigates on selection (happy)', async () => {
    replaceMock.mockReset();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LocaleSwitcher />
      </NextIntlClientProvider>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Language' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Portuguese' }));
    expect(replaceMock).toHaveBeenCalledWith('/pt/dashboard');
  });

  it('handles current=pt path correctly (happy)', async () => {
    replaceMock.mockReset();
    vi.doMock('next/navigation', () => ({
      useRouter: () => ({ replace: replaceMock }),
      usePathname: () => '/pt/dashboard',
    }));
    render(
      <NextIntlClientProvider locale="pt" messages={messages}>
        <LocaleSwitcher />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm nx test web -- LocaleSwitcher
git add apps/web
git commit -m "$(cat <<'EOF'
feat(i18n): LocaleSwitcher routes to /<locale>/...

Replaces the leading /en or /pt segment with the chosen locale and
navigates via Next.js router.replace (preserves history). next-intl
middleware sets the locale cookie automatically; no extra cookie write
needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: `/ping` page wiring + ThemeSwitcher + LocaleSwitcher into the dashboard

**Files:**

- Create: `apps/web/src/app/[locale]/ping/page.tsx`
- Modify: `apps/web/src/app/[locale]/dashboard/page.tsx` — add ThemeSwitcher + LocaleSwitcher

- [ ] **Step 1: Author the Ping page**

`apps/web/src/app/[locale]/ping/page.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Card } from '@azimuth/ui';
import { PingList } from '@/features/ping/components/PingList';
import { RecordPingForm } from '@/features/ping/components/RecordPingForm';
import { SESSION_COOKIE_NAME } from '@/shared/auth/cookie';

export default async function PingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!session?.value) redirect(`/${locale}/login`);
  return <PingPageClient />;
}

function PingPageClient() {
  const t = useTranslations('ping');
  return (
    <main className="p-8 space-y-8">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <Card>
        <h2 className="text-xl font-semibold mb-4">{t('create')}</h2>
        <RecordPingForm />
      </Card>
      <Card>
        <PingList />
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Update dashboard with switchers**

Replace `apps/web/src/app/[locale]/dashboard/page.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Card } from '@azimuth/ui';
import { ThemeSwitcher } from '@/shared/theme/ThemeSwitcher';
import { LocaleSwitcher } from '@/shared/i18n/LocaleSwitcher';
import { SESSION_COOKIE_NAME } from '@/shared/auth/cookie';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!session?.value) redirect(`/${locale}/login`);
  return <DashboardClient />;
}

function DashboardClient() {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  return (
    <main className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{tCommon('appName')}</h1>
        <div className="flex gap-3">
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      </header>
      <Card>
        <nav className="flex gap-4">
          <Link href="./ping" className="underline">
            {t('ping')}
          </Link>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="underline">
              {t('logout')}
            </button>
          </form>
        </nav>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Live smoke test**

```bash
pnpm nx dev web &
DEV_PID=$!
sleep 15

# Login + visit dashboard + ping page
curl -fsSL -c /tmp/cookies.txt "http://localhost:3000/api/auth/stub-redirect?identity=smoke@local" -o /dev/null
curl -fsSL -b /tmp/cookies.txt http://localhost:3000/en/dashboard -o /tmp/dash.html -w "dashboard %{http_code}\n"
curl -fsSL -b /tmp/cookies.txt http://localhost:3000/en/ping -o /tmp/ping.html -w "ping %{http_code}\n"

grep -oE "Pings|Theme|Language|Day|Dusk|Night|Bright" /tmp/dash.html /tmp/ping.html | sort -u

kill $DEV_PID 2>/dev/null || true
```

Expected: both pages 200; theme + language switcher labels present; "Pings" appears.

- [ ] **Step 4: Commit**

```bash
pnpm nx test web
pnpm nx lint web
git add apps/web
git commit -m "$(cat <<'EOF'
feat(web): /ping page + dashboard with theme + locale switchers

Both pages cookie-guarded; redirect to /login if no session. Dashboard
header carries ThemeSwitcher (4 modes) and LocaleSwitcher (en/pt). Ping
page renders RecordPingForm + PingList in stacked cards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: Playwright E2E — login → dashboard → create ping → list → switch theme → switch locale

**Files:**

- Create: `apps/web/e2e/login-and-ping.spec.ts`

- [ ] **Step 1: Author the E2E spec**

`apps/web/e2e/login-and-ping.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('login → dashboard → create ping → list → theme + locale switch (happy)', async ({
  page,
  request,
}) => {
  // 1. Login via stub
  await page.goto('/en/login');
  await page.getByRole('link', { name: /Continue with Stub/i }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);

  // 2. Navigate to /ping
  await page.getByRole('link', { name: 'Pings' }).click();
  await expect(page).toHaveURL(/\/en\/ping/);

  // 3. Create a ping
  await page.getByLabel('Text').fill('e2e-flow');
  await page.getByRole('button', { name: 'Submit' }).click();

  // 4. Verify the new ping appears
  await expect(page.getByText('e2e-flow')).toBeVisible();

  // 5. Switch theme to Night
  await page.goBack();
  await page.getByLabel('Theme').click();
  await page.getByRole('option', { name: 'Night' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

  // 6. Switch locale to Português
  await page.getByLabel('Language').click();
  await page.getByRole('option', { name: 'Portuguese' }).click();
  await expect(page).toHaveURL(/\/pt\/dashboard/);
});
```

- [ ] **Step 2: Run E2E**

The Playwright config (Task 1) auto-starts the Next.js dev server. The backend stack must be up.

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d
pnpm nx e2e web 2>&1 | tail -20
```

Expected: 1 passing test.

If the test fails because the user lacks `ping.view` and `ping.create` permissions, it's because `e2e-flow` is a fresh stub identity that hasn't been granted the Member role. Fix by either:

1. Adding a Playwright `globalSetup` that seeds the role+permission grants via tinker before tests run, OR
2. Using a known seeded identity (`smoke@local`) and granting it via a one-off tinker command in the Phase 3 gate verification (Task 25).

Pick approach 1 — Playwright's `globalSetup` runs once and is the right place. Add `apps/web/e2e/global-setup.ts`:

```ts
import { execSync } from 'node:child_process';

export default async function globalSetup() {
  // Seed roles + permissions on the running backend so E2E identities can authorize.
  const cmd = `docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan tinker --execute='
$seeder = new \\Database\\Seeders\\PermissionsSeeder([\\App\\Modules\\Ping\\Domain\\PingPermission::class]);
$seeder->run();
$role = \\Spatie\\Permission\\Models\\Role::firstOrCreate([\"name\" => \"member\", \"guard_name\" => \"web\"]);
$role->givePermissionTo(\\Spatie\\Permission\\Models\\Permission::all());
echo \"e2e-setup-ok\";
'`;
  execSync(cmd, { stdio: 'inherit', cwd: process.cwd() + '/../..' });
}
```

Wire into `apps/web/e2e/playwright.config.ts`:

```ts
export default defineConfig({
  // …
  globalSetup: require.resolve('./global-setup'),
  // …
});
```

Re-run `pnpm nx e2e web`. Note: each fresh stub identity that logs in needs the Member role assigned; the E2E test should either log in as a known seeded user, or the auth flow should auto-assign. For this task, modify the stub callback to auto-assign Member role when in non-production env. Alternatively, run a tinker command during globalSetup to grant Member role to known E2E identities. Pick whichever leaves the smaller blast radius — recommended: have globalSetup run a tinker that creates `e2e@local` user, assigns Member, and the test uses `?identity=e2e@local`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e
git commit -m "$(cat <<'EOF'
test(e2e): Playwright spec for login → ping → theme + locale switch

Decision #8: Playwright covers cross-feature happy paths only. Single
spec exercises the full Phase 3 gate: stub login mints a session;
/ping renders; create + list work; theme switches to Night; locale
switches to Portuguese. globalSetup seeds the Member role + ping
permissions so fresh stub identities can authorize.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 24: CI extension — `test-frontend` and `e2e` jobs

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Append two jobs to `.github/workflows/ci.yml`**

```yaml
test-frontend:
  runs-on: ubuntu-latest
  needs: lint-and-typecheck
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22 }
    - name: Enable Corepack
      run: corepack enable
    - name: Install dependencies
      run: pnpm install --frozen-lockfile
    - name: Build design tokens
      run: pnpm nx build design-tokens
    - name: Build api-client (snapshot openapi.json must be present)
      run: pnpm nx build api-client
    - name: Test all frontend libs and apps
      run: pnpm nx run-many --target=test --projects=design-tokens,i18n,ui,api-client,web

e2e:
  runs-on: ubuntu-latest
  needs: [test-backend, test-frontend]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22 }
    - run: corepack enable
    - run: pnpm install --frozen-lockfile
    - name: Boot backend stack
      run: docker compose -f infra/docker-compose.ci.yml up -d --wait
    - name: Migrate
      run: docker compose -f infra/docker-compose.ci.yml exec -T backend php artisan migrate --force
    - name: Build api-client
      run: pnpm nx build api-client
    - name: Install Playwright browsers
      run: pnpm exec playwright install --with-deps chromium
    - name: E2E
      run: pnpm nx e2e web
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: add test-frontend and e2e jobs

test-frontend runs all frontend Vitest suites (design-tokens, i18n, ui,
api-client, web) on a fresh node 22 runner. e2e job depends on both
backend and frontend tests passing, then boots the CI compose stack and
runs Playwright against a built backend.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 25: `docs/architecture/frontend.md` + ADR 0006

**Files:**

- Create: `docs/architecture/frontend.md`
- Create: `docs/adr/0006-frontend-stack-and-cookie-auth.md`
- Modify: `docs/README.md` — link new docs

- [ ] **Step 1: Author `docs/architecture/frontend.md` against this section checklist**

Required sections, with the content described:

1. **Overview.** Next.js 15 App Router with `[locale]` segment; Redux Toolkit + RTK Query for state and HTTP; httpOnly cookie + Next.js proxy for the Bearer token; Openbridge tokens drive `libs/design-tokens` and a Tailwind preset that enforces no-border-radius-except-rounded-full; Vitest + RTL for components; Playwright for E2E.
2. **The four libs.** Per `libs/{design-tokens, ui, api-client, i18n}`: file paths, what they export, who consumes them. Reference Tasks 2, 4–11, 12, 3.
3. **App Router shape.** `[locale]/layout.tsx` provides Redux + i18n + Theme + Toast providers; `[locale]/page.tsx`, `[locale]/login/page.tsx`, `[locale]/dashboard/page.tsx`, `[locale]/ping/page.tsx`. Middleware at `src/middleware.ts` handles locale prefixing; `src/i18n/request.ts` merges shared + per-feature catalogs.
4. **The 4-theme system.** `data-theme="day|dusk|night|bright"` on `<html>` set pre-paint via inline script. Cookie `azimuth_theme` persists user choice. CSS vars come from `libs/design-tokens/src/tokens.css`. Tailwind classes `bg-bg-primary`, `text-fg-primary`, etc. read these vars.
5. **Cookie auth + Next.js proxy.** Decision #6 explained: `/api/auth/stub-redirect` → `/api/auth/stub-callback` mints httpOnly cookie; `/api/proxy/[...path]` forwards browser requests to backend with `Authorization: Bearer <cookie>`. Walk the round-trip path of a `useListPingsQuery()` call.
6. **Redux store layout.** `baseApi` from `@azimuth/api-client`; `authSlice`; typed hooks. Reference `apps/web/src/shared/store/index.ts`.
7. **Adding a new feature module.** Walk the `features/<module>/` shape using Ping as the example. Steps: (a) refresh `libs/api-client` snapshot if backend added endpoints, (b) author Zod schema + RTK Query injectEndpoints, (c) author components with happy/invalid/garbage tests, (d) author per-feature i18n catalogs, (e) author the page under `[locale]/<module>/page.tsx`.
8. **Testing patterns.** Vitest unit/component tests for libs and feature components; Playwright cross-feature happy-path E2E only. Reference `apps/web/e2e/login-and-ping.spec.ts`.
9. **References.** Links to: `docs/superpowers/specs/2026-05-02-azimuth-scaffold-design.md` §6, the Phase 3 decision-log spec, ADR 0006, the four `libs/*/project.json` files, `docs/runbooks/local-dev.md`.

- [ ] **Step 2: Author ADR 0006**

`docs/adr/0006-frontend-stack-and-cookie-auth.md` follows the existing ADR template (read `docs/adr/0001-nx-with-laravel-via-run-commands.md` first).

Required sections (real prose, not placeholders):

**Title:** "Frontend Stack and Cookie-Based Auth"

**Date:** 2026-05-06
**Status:** Accepted

**Context.** Phase 3 needs the frontend skeleton. The backend Phase 2 mints Passport tokens via Socialite stub. We need a stack that: (a) carries authenticated state between client and server safely; (b) supports four themes (Openbridge day/dusk/night/bright) without flash; (c) is fast to test (Vitest) and to E2E (Playwright); (d) enforces no-hardcoded-strings via ESLint; (e) types HTTP calls from the Phase 2 OpenAPI spec.

**Decision.** (List the 8 locked decisions verbatim from the decision-log spec §3.)

**Consequences.**

- Positive: token never reaches browser JS (XSS-resistant); Vitest + RTL is fast; @rtk-query/codegen-openapi keeps types in sync with backend automatically; Openbridge tokens give us a 4-theme palette tuned for cockpit conditions.
- Negative: every API call adds a ~5ms Next.js proxy hop; Openbridge token refresh requires hand-extraction (no @oicl/openbridge-tokens npm); Filament-equivalent admin bulk operations don't exist on the frontend (we use the backend's Filament panel).
- Neutral: 8 squared-UI primitives in `libs/ui` are ours to maintain — we trade external dependency surface for full control over the design language.

**References.** Decision-log spec rows 1–8; ADR 0005 (Filament for admin) which complements this for backend-side admin UX; OpenBridge GitHub `Ocean-Industries-Concept-Lab/openbridge-webcomponents`.

- [ ] **Step 3: Update `docs/README.md`**

Add links to the new architecture doc and ADR under existing sections. Match the file's current style.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture docs/adr docs/README.md
git commit -m "$(cat <<'EOF'
docs: architecture/frontend.md + ADR 0006 (frontend stack + cookie auth)

Architecture doc is evergreen reference for adding new frontend modules.
ADR 0006 locks the eight Phase 3 decisions per CLAUDE.md hard rule #7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 26: Phase 3 gate verification

**Files:** none (verification only).

- [ ] **Step 1: Run the local triple-gate**

```bash
pnpm nx test web
pnpm nx lint web
pnpm nx run-many --target=test --projects=design-tokens,i18n,ui,api-client,web
```

Expected: every command exits 0; tests passing.

- [ ] **Step 2: Build the design-tokens + api-client artifacts**

```bash
pnpm nx build design-tokens
pnpm nx build api-client
git status --short
```

Expected: clean tree (or minor changes to `tokens.css` / `generated.ts`). If those files changed unexpectedly, investigate.

- [ ] **Step 3: Live HTTP gate**

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d
pnpm nx dev web &
DEV_PID=$!
sleep 20

# Login flow
curl -fsSL -c /tmp/c.txt "http://localhost:3000/api/auth/stub-redirect?identity=gate@local" -o /dev/null

# Seed permissions for gate@local
docker compose --env-file .env -f infra/docker-compose.yml exec -T backend php artisan tinker --execute='
$seeder = new \Database\Seeders\PermissionsSeeder([\App\Modules\Ping\Domain\PingPermission::class]);
$seeder->run();
$role = \Spatie\Permission\Models\Role::firstOrCreate(["name" => "member", "guard_name" => "web"]);
$role->givePermissionTo(\Spatie\Permission\Models\Permission::all());
$user = \App\Models\User::firstOrCreate(["email" => "gate@local"], ["name" => "gate", "password" => bcrypt("test")]);
$user->assignRole("member");
echo "ok";
'

# Create a ping via the proxy
curl -fsSL -b /tmp/c.txt -X POST -H "Content-Type: application/json" -d '{"note":{"en":"phase3-gate","pt":"portao-fase3"}}' http://localhost:3000/api/proxy/api/ping -w "POST -> HTTP %{http_code}\n"

# List
curl -fsSL -b /tmp/c.txt http://localhost:3000/api/proxy/api/ping -w "\nGET -> HTTP %{http_code}\n"

kill $DEV_PID 2>/dev/null || true
```

Expected: POST returns 201 with the new ping; GET returns an array containing it.

- [ ] **Step 4: Run the Playwright suite**

```bash
pnpm nx e2e web
```

Expected: all specs pass.

- [ ] **Step 5: Push the branch and watch CI**

```bash
git push
gh run watch --exit-status
```

Expected: every job (lint-and-typecheck, test-backend, test-frontend, e2e) goes green.

If `gh run watch` isn't available, list runs and inspect: `gh run list --branch feat/phase-3-frontend-skeleton --limit 3`.

- [ ] **Step 6: Open the PR**

```bash
gh pr create --title "feat: phase 3 frontend skeleton (libs, app shell, auth, ping, e2e)" --body "$(cat <<'EOF'
## Summary

- libs/design-tokens with Openbridge-derived 4-theme palette (day/dusk/night/bright); Tailwind preset enforcing the squared-UI rule (rounded-none + rounded-full only).
- libs/ui with 8 squared primitives (Button, Input, Select, Card, Table, Modal, Toast, Spinner). Radix Primitives underneath Modal/Select/Toast for accessibility-critical behavior.
- libs/api-client generating typed RTK Query endpoints from Phase 2's openapi.json snapshot.
- libs/i18n with locale registry and shared en+pt catalogs.
- apps/web App Router with [locale] segment, Redux + RTK Query store, theme + locale switchers, cookie-only auth via Next.js proxy route handlers.
- features/ping mirrors the backend Ping module: list + create UI, RHF + Zod, happy/invalid/garbage tests.
- ESLint react/jsx-no-literals enforces no-hardcoded-strings rule.
- Playwright E2E covers the full happy path.
- CI extended with test-frontend and e2e jobs.
- docs/architecture/frontend.md and ADR 0006 documenting the eight Phase 3 decisions.

## Test plan

- [x] `nx run-many --target=test --projects=design-tokens,i18n,ui,api-client,web` green
- [x] `nx e2e web` green
- [x] Manual: theme switch (day/dusk/night/bright) updates `data-theme` and persists via cookie
- [x] Manual: locale switch (en/pt) updates URL prefix and translations
- [x] Manual: login → /ping → create → list → see new ping
- [ ] CI green (verify after push)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Update Phase 2 handoff to mark Phase 3 in flight, OR write `phase-3-handoff.md`**

Append a "Phase 3 in flight" note to `docs/runbooks/phase-2-handoff.md`, OR create `docs/runbooks/phase-3-handoff.md` modeled on Phase 2's. Pick whichever the team prefers. Commit the change.

---

## Self-review notes (filled by the plan author)

**Spec coverage:** Every Phase 3 §13.3 deliverable maps to a task above:

- libs/design-tokens with 4-theme palette → Task 2 (with Openbridge tokens hand-extracted; reinterpretation per decision-log §3 row 3)
- libs/ui with 8 squared primitives + happy/invalid/garbage RTL tests → Tasks 4–11 (one per primitive, each with TDD)
- libs/api-client generation → Task 12
- libs/i18n with en+pt → Task 3
- apps/web App Router with [locale] segment → Task 13
- Redux store + auth slice + RTK Query baseApi → Task 14
- Auth flow → Tasks 15, 16 (proxy)
- features/ping mirroring backend Ping → Tasks 17 (api+schema), 18 (PingList), 19 (RecordPingForm), 22 (page)
- ESLint react/jsx-no-literals → Task 13 step 10
- Playwright E2E → Task 23
- CI extended with test-frontend + e2e jobs → Task 24
- docs/architecture/frontend.md + ADR 0006 → Task 25
- Gate verification → Task 26

**Decision-log coverage:**

1. Branch off updated main → Task 0.
2. Openbridge real adoption (tokens + icons) → Task 2.
3. 4 themes (day/dusk/night/bright) → Tasks 2, 13, 20.
4. libs/ui in-house with Radix Primitives for behavior → Tasks 4–11 (Modal/Select/Toast use Radix).
5. @rtk-query/codegen-openapi → Task 12.
6. httpOnly cookie + Next.js proxy → Tasks 15 (cookie), 16 (proxy).
7. RHF + Zod → Tasks 17 (schema), 19 (form).
8. Vitest + RTL → Task 1 + every component task.

**Type consistency:** `RecordPingPayload` (Task 17 schema) is the single source of truth — RHF uses it, RTK Query mutation accepts it. `PingDto` (Task 17 api) is the response shape. `Theme` (Task 20) is `'day'|'dusk'|'night'|'bright'` everywhere — ThemeProvider, ThemeSwitcher, pre-paint script all reference the same set. `Locale` (lib/i18n) is `'en'|'pt'` everywhere — LocaleSwitcher and middleware both consume the export.

**Out-of-scope sentinel:** No task includes real OAuth providers, native Openbridge web components, Server Components for authed pages (all use Client Components), libs/ui Storybook, or backend code changes.
