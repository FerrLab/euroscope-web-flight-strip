# EuroStrip Scaffold — Phase 1: Workspace + Docker Bring-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the empty `eurostrip/` repository into an Nx monorepo where `git clone && docker compose up` lands a running, empty, but correctly-wired full-stack environment (Laravel on FrankenPHP/Octane + Next.js + Postgres/PostGIS + Dragonfly + Typesense + Soketi + MinIO + Mailpit), with lint/typecheck CI green.

**Architecture:** Single Nx 20 monorepo at the repo root. `apps/web` is a Next.js 15 app and `apps/backend` is a Laravel 13 app exposed to Nx via `nx:run-commands` targets that shell into Docker. `libs/{design-tokens,ui,api-client,i18n}` are stub TS libraries created now to lock the public surface in (filled later in Phase 3). All services run from a single `infra/docker-compose.yml`. CI runs only lint + typecheck in Phase 1; full test/E2E jobs come in later phases.

**Tech Stack:** pnpm 9, Node 22, Nx 20, TypeScript 5.6 strict, Next.js 15 (App Router), Laravel 13 / PHP 8.3 / Composer 2.7+, FrankenPHP, Pint, ESLint flat config, Prettier, Lefthook, GitHub Actions, Docker Compose, Postgres+PostGIS, Dragonfly, Typesense, Soketi, MinIO, Mailpit.

**Spec:** `docs/superpowers/specs/2026-05-02-eurostrip-scaffold-design.md` §13.1.

**Prerequisites on the dev host:**

- macOS or Linux
- Node 22 (`nvm install 22 && nvm use 22`)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker Desktop (or `colima`/`orbstack`) with Docker Compose v2
- PHP 8.3 + Composer 2.7+ on host (Herd ships this on macOS) — needed once for the initial `composer create-project` in Task 5
- `git` configured

---

## File Structure

Files created during Phase 1, grouped by responsibility.

**Repo root — workspace orchestration:**

- `package.json` — root pnpm workspace root, Nx + tooling devDeps
- `pnpm-workspace.yaml` — workspace package globs
- `nx.json` — Nx configuration (default base, target defaults, plugins)
- `tsconfig.base.json` — shared TS strict compiler options + path aliases
- `.nvmrc` — Node 22 pin
- `.gitignore` — extended to cover Node, PHP, Docker, IDE, env files
- `.prettierrc.json`, `.prettierignore`
- `eslint.config.mjs` — flat config root
- `lefthook.yml` — git hooks
- `CLAUDE.md` — repo-wide collab rules
- `README.md` — index pointing at `/docs`

**`apps/web/` — Next.js app (Task 4):**

- `apps/web/package.json`, `apps/web/project.json`
- `apps/web/next.config.mjs`, `apps/web/tsconfig.json`
- `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`
- `apps/web/.eslintrc.cjs` deferred — flat config inherits from root

**`apps/backend/` — Laravel app (Tasks 5-7):**

- entire fresh Laravel 13 install via `composer create-project`
- `apps/backend/project.json` — Nx run-commands targets
- `apps/backend/pint.json` — Pint config

**`libs/` — shared TS libs (Task 3):**

- `libs/design-tokens/{package.json,project.json,tsconfig.json,src/index.ts}`
- `libs/ui/{package.json,project.json,tsconfig.json,src/index.ts}`
- `libs/api-client/{package.json,project.json,tsconfig.json,src/index.ts}`
- `libs/i18n/{package.json,project.json,tsconfig.json,src/index.ts}`

**`infra/` — Docker stack (Tasks 8-10):**

- `infra/docker/frankenphp.Dockerfile`
- `infra/docker/postgres-init.sql`
- `infra/docker/minio-init.sh`
- `infra/docker-compose.yml`
- `infra/docker-compose.ci.yml` (CI override; bind-mounts stripped)
- `.env.example` (root)

**`.github/workflows/` — CI (Task 12):**

- `.github/workflows/ci.yml`

**`docs/` — internal docs seed (Task 13):**

- `docs/README.md`
- `docs/runbooks/local-dev.md`
- `docs/adr/0001-nx-with-laravel-via-run-commands.md`

---

### Task 1: Initialize repo root, pnpm workspace, Nx workspace skeleton

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `nx.json`
- Create: `tsconfig.base.json`
- Create: `.nvmrc`
- Create: `README.md`
- Modify: `.gitignore` (extend existing — keep `.idea/` and `.claude/settings.local.json` lines, append rest)

- [ ] **Step 1.1: Pin Node version**

Create `.nvmrc`:

```text
22
```

- [ ] **Step 1.2: Create `package.json` root**

```json
{
  "name": "eurostrip",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.12.3",
  "engines": {
    "node": ">=22 <23",
    "pnpm": ">=9 <10"
  },
  "scripts": {
    "lint": "nx run-many --target=lint --all",
    "typecheck": "nx run-many --target=typecheck --all",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "devDependencies": {
    "@types/node": "^22.9.0",
    "eslint": "^9.14.0",
    "@eslint/js": "^9.14.0",
    "typescript-eslint": "^8.13.0",
    "nx": "^20.1.0",
    "prettier": "^3.3.3",
    "typescript": "^5.6.3",
    "lefthook": "^1.8.4"
  }
}
```

- [ ] **Step 1.3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'libs/*'
```

- [ ] **Step 1.4: Create `nx.json`**

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)",
      "!{projectRoot}/tsconfig.spec.json",
      "!{projectRoot}/jest.config.[jt]s",
      "!{projectRoot}/.eslintrc.json"
    ],
    "sharedGlobals": [
      "{workspaceRoot}/tsconfig.base.json",
      "{workspaceRoot}/eslint.config.mjs",
      "{workspaceRoot}/.prettierrc.json"
    ]
  },
  "targetDefaults": {
    "build": { "cache": true, "dependsOn": ["^build"], "inputs": ["production", "^production"] },
    "lint": { "cache": true, "inputs": ["default", "{workspaceRoot}/eslint.config.mjs"] },
    "typecheck": { "cache": true, "inputs": ["default"] },
    "test": { "cache": true, "inputs": ["default", "^production"] }
  },
  "defaultBase": "main",
  "parallel": 4
}
```

- [ ] **Step 1.5: Create `tsconfig.base.json`**

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "rootDir": ".",
    "sourceMap": true,
    "declaration": false,
    "moduleResolution": "bundler",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "importHelpers": true,
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "skipDefaultLibCheck": true,
    "baseUrl": ".",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "paths": {
      "@eurostrip/design-tokens": ["libs/design-tokens/src/index.ts"],
      "@eurostrip/ui": ["libs/ui/src/index.ts"],
      "@eurostrip/api-client": ["libs/api-client/src/index.ts"],
      "@eurostrip/i18n": ["libs/i18n/src/index.ts"]
    }
  },
  "exclude": ["node_modules", "tmp"]
}
```

- [ ] **Step 1.6: Extend `.gitignore`**

Replace the existing `.gitignore` (currently has `.idea/` and `.claude/settings.local.json`) with:

```gitignore
# IDE
.idea/
.vscode/
*.swp
.DS_Store

# Claude local settings (per-developer overrides)
.claude/settings.local.json

# Node
node_modules/
.pnpm-store/
.pnpm-debug.log*
.next/
out/
dist/
build/
coverage/

# Nx
.nx/cache
.nx/workspace-data

# PHP
apps/backend/vendor/
apps/backend/storage/framework/cache/data/*
apps/backend/storage/framework/sessions/*
apps/backend/storage/framework/testing/*
apps/backend/storage/framework/views/*
apps/backend/storage/logs/*
apps/backend/storage/oauth-private.key
apps/backend/storage/oauth-public.key
apps/backend/bootstrap/cache/*.php
!apps/backend/storage/framework/cache/data/.gitkeep
!apps/backend/storage/framework/sessions/.gitkeep
!apps/backend/storage/framework/testing/.gitkeep
!apps/backend/storage/framework/views/.gitkeep
!apps/backend/storage/logs/.gitkeep
!apps/backend/bootstrap/cache/.gitkeep

# Env
.env
.env.local
.env.*.local
apps/backend/.env
apps/web/.env

# Docker
infra/docker/.data/
```

- [ ] **Step 1.7: Create `README.md`**

```markdown
# EuroStrip

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
```

- [ ] **Step 1.8: Install workspace dependencies**

Run from the repo root:

```bash
corepack enable
corepack prepare pnpm@9.12.3 --activate
pnpm install
```

Expected: `pnpm install` succeeds; `node_modules/` and `pnpm-lock.yaml` are created at root.

- [ ] **Step 1.9: Verify Nx is wired**

Run:

```bash
pnpm nx --version
```

Expected: prints a version like `20.1.x`.

- [ ] **Step 1.10: Commit**

```bash
git add .nvmrc package.json pnpm-workspace.yaml pnpm-lock.yaml nx.json tsconfig.base.json README.md .gitignore
git commit -m "chore: initialize pnpm + Nx workspace skeleton"
```

---

### Task 2: Configure root TypeScript strict, ESLint flat config, Prettier

**Files:**

- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.editorconfig`

- [ ] **Step 2.1: Create `.prettierrc.json`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 2.2: Create `.prettierignore`**

```text
node_modules
.pnpm-store
.next
out
dist
build
coverage
.nx
apps/backend/vendor
apps/backend/storage
apps/backend/bootstrap/cache
pnpm-lock.yaml
```

- [ ] **Step 2.3: Create `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.{php,blade.php}]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 2.4: Create `eslint.config.mjs` (flat config)**

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.pnpm-store/**',
      '.next/**',
      'out/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.nx/**',
      'apps/backend/**',
      '**/*.config.{js,mjs,cjs}',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
```

- [ ] **Step 2.5: Verify ESLint runs cleanly on the (currently empty) workspace**

Run:

```bash
pnpm exec eslint . --max-warnings=0
```

Expected: exits 0 with no output (nothing to lint yet — flat config ignores everything outside future TS files).

- [ ] **Step 2.6: Verify Prettier runs cleanly**

Run:

```bash
pnpm exec prettier --check .
```

Expected: prints `All matched files use Prettier code style!` or similar success message. If it complains about specific files, run `pnpm exec prettier --write .` and re-check.

- [ ] **Step 2.7: Commit**

```bash
git add eslint.config.mjs .prettierrc.json .prettierignore .editorconfig
git commit -m "chore: add ESLint flat config, Prettier, EditorConfig at workspace root"
```

---

### Task 3: Scaffold the four shared libs with stubs and project.json files

**Files (per lib — repeat the same shape for `design-tokens`, `ui`, `api-client`, `i18n`):**

- Create: `libs/<name>/package.json`
- Create: `libs/<name>/project.json`
- Create: `libs/<name>/tsconfig.json`
- Create: `libs/<name>/src/index.ts`
- Create: `libs/<name>/README.md`

- [ ] **Step 3.1: Create `libs/design-tokens/package.json`**

```json
{
  "name": "@eurostrip/design-tokens",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

- [ ] **Step 3.2: Create `libs/design-tokens/project.json`**

```json
{
  "name": "design-tokens",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/design-tokens/src",
  "projectType": "library",
  "tags": ["scope:shared", "type:tokens"],
  "targets": {
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint libs/design-tokens", "cwd": "{workspaceRoot}" }
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

- [ ] **Step 3.3: Create `libs/design-tokens/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../dist/libs/design-tokens",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3.4: Create `libs/design-tokens/src/index.ts` (stub)**

```typescript
export const placeholder = 'design-tokens-stub' as const;
```

- [ ] **Step 3.5: Create `libs/design-tokens/README.md`**

```markdown
# @eurostrip/design-tokens

Openbridge-derived color palettes (light, dark, high-contrast) and shared design tokens. Filled in Phase 3.
```

- [ ] **Step 3.6: Repeat 3.1–3.5 for `libs/ui`**

`package.json`:

```json
{
  "name": "@eurostrip/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

`project.json`:

```json
{
  "name": "ui",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/ui/src",
  "projectType": "library",
  "tags": ["scope:frontend", "type:ui"],
  "targets": {
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint libs/ui", "cwd": "{workspaceRoot}" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": { "command": "tsc --noEmit -p libs/ui/tsconfig.json", "cwd": "{workspaceRoot}" }
    }
  }
}
```

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../dist/libs/ui",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

`src/index.ts`:

```typescript
export const placeholder = 'ui-stub' as const;
```

`README.md`:

```markdown
# @eurostrip/ui

Squared, themed React component primitives. Filled in Phase 3.
```

- [ ] **Step 3.7: Repeat 3.1–3.5 for `libs/api-client`**

`package.json`:

```json
{
  "name": "@eurostrip/api-client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

`project.json`:

```json
{
  "name": "api-client",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/api-client/src",
  "projectType": "library",
  "tags": ["scope:shared", "type:client"],
  "targets": {
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint libs/api-client", "cwd": "{workspaceRoot}" }
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

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../dist/libs/api-client",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

`src/index.ts`:

```typescript
export const placeholder = 'api-client-stub' as const;
```

`README.md`:

```markdown
# @eurostrip/api-client

Typed TS client for the backend, generated from Scramble's OpenAPI document. Generation script added in Phase 2 / Phase 3.
```

- [ ] **Step 3.8: Repeat 3.1–3.5 for `libs/i18n`**

`package.json`:

```json
{
  "name": "@eurostrip/i18n",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

`project.json`:

```json
{
  "name": "i18n",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/i18n/src",
  "projectType": "library",
  "tags": ["scope:shared", "type:i18n"],
  "targets": {
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint libs/i18n", "cwd": "{workspaceRoot}" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": { "command": "tsc --noEmit -p libs/i18n/tsconfig.json", "cwd": "{workspaceRoot}" }
    }
  }
}
```

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../dist/libs/i18n",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.json"]
}
```

`src/index.ts`:

```typescript
export const placeholder = 'i18n-stub' as const;
```

`README.md`:

```markdown
# @eurostrip/i18n

Locale registry and shared message catalogs (consumed by both `apps/web` via next-intl and `apps/backend` via Laravel `lang/`). Filled in Phase 3.
```

- [ ] **Step 3.9: Verify Nx sees all four libs**

Run:

```bash
pnpm nx show projects
```

Expected: prints (one per line):

```text
api-client
design-tokens
i18n
ui
```

- [ ] **Step 3.10: Verify lint + typecheck pass on all libs**

Run:

```bash
pnpm nx run-many --target=lint --projects=api-client,design-tokens,i18n,ui
pnpm nx run-many --target=typecheck --projects=api-client,design-tokens,i18n,ui
```

Expected: both commands succeed with `Successfully ran target lint for 4 projects` and `Successfully ran target typecheck for 4 projects`.

- [ ] **Step 3.11: Commit**

```bash
git add libs/
git commit -m "feat: scaffold shared libs (design-tokens, ui, api-client, i18n) with stubs"
```

---

### Task 4: Scaffold apps/web (Next.js 15 + App Router + TS strict)

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/project.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`

- [ ] **Step 4.1: Create `apps/web/package.json`**

```json
{
  "name": "@eurostrip/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000 -H 0.0.0.0",
    "build": "next build",
    "start": "next start -p 3000 -H 0.0.0.0",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^15.0.3",
    "react": "^19.0.0-rc-66855b96-20241106",
    "react-dom": "^19.0.0-rc-66855b96-20241106"
  },
  "devDependencies": {
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 4.2: Create `apps/web/project.json`**

```json
{
  "name": "web",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/web/src",
  "projectType": "application",
  "tags": ["scope:frontend", "type:app"],
  "targets": {
    "dev": {
      "executor": "nx:run-commands",
      "options": { "command": "pnpm --filter @eurostrip/web dev", "cwd": "{workspaceRoot}" }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": { "command": "pnpm --filter @eurostrip/web build", "cwd": "{workspaceRoot}" }
    },
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint apps/web/src", "cwd": "{workspaceRoot}" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": { "command": "tsc --noEmit -p apps/web/tsconfig.json", "cwd": "{workspaceRoot}" }
    }
  }
}
```

- [ ] **Step 4.3: Create `apps/web/next.config.mjs`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
```

- [ ] **Step 4.4: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "noEmit": true,
    "incremental": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@eurostrip/design-tokens": ["../../libs/design-tokens/src/index.ts"],
      "@eurostrip/ui": ["../../libs/ui/src/index.ts"],
      "@eurostrip/api-client": ["../../libs/api-client/src/index.ts"],
      "@eurostrip/i18n": ["../../libs/i18n/src/index.ts"]
    }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 4.5: Create `apps/web/next-env.d.ts`**

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 4.6: Create `apps/web/src/app/globals.css`**

```css
:root {
  --bg: #fafafa;
  --fg: #0a0a0a;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

- [ ] **Step 4.7: Create `apps/web/src/app/layout.tsx`**

```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'EuroStrip',
  description: 'General aviation operations platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4.8: Create `apps/web/src/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>EuroStrip</h1>
      <p>Frontend scaffold is alive. Phase 1 — workspace + Docker bring-up.</p>
    </main>
  );
}
```

- [ ] **Step 4.9: Install Next.js dependencies**

Run:

```bash
pnpm install
```

Expected: pnpm installs Next, React, React-DOM, types — `apps/web/node_modules/.pnpm/` populated (via the workspace hoist).

- [ ] **Step 4.10: Verify Next.js typecheck passes**

Run:

```bash
pnpm nx typecheck web
```

Expected: succeeds with `Successfully ran target typecheck for project web`.

- [ ] **Step 4.11: Verify Nx sees web**

Run:

```bash
pnpm nx show projects
```

Expected: now lists `api-client`, `design-tokens`, `i18n`, `ui`, `web`.

- [ ] **Step 4.12: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat: scaffold Next.js 15 web app with App Router + TS strict"
```

---

### Task 5: Scaffold apps/backend (Laravel 13 via composer create-project)

**Files:**

- Create: entire fresh Laravel 13 install at `apps/backend/`
- Modify: `apps/backend/composer.json` (post-install — pin PHP version, set autoload paths)

- [ ] **Step 5.1: Verify PHP + Composer are available on the host**

Run:

```bash
php --version && composer --version
```

Expected: PHP 8.3.x and Composer 2.7+ are reported. If not, install via Herd (macOS) or your platform's package manager before continuing.

- [ ] **Step 5.2: Run `composer create-project` for Laravel 13**

Run from the repo root:

```bash
composer create-project laravel/laravel:^13.0 apps/backend --prefer-dist --no-interaction
```

Expected: composer downloads and installs Laravel 13 into `apps/backend/`. The directory must not pre-exist.

- [ ] **Step 5.3: Verify Laravel installed**

Run:

```bash
ls apps/backend/artisan && cat apps/backend/composer.json | grep '"laravel/framework"'
```

Expected: `apps/backend/artisan` exists; `composer.json` shows `"laravel/framework": "^13.0"`.

- [ ] **Step 5.4: Pin PHP version in `apps/backend/composer.json`**

Open `apps/backend/composer.json`. Locate the `"require"` block and ensure the PHP constraint is `"^8.3"`:

```json
"require": {
    "php": "^8.3",
    "laravel/framework": "^13.0",
    ...
}
```

If composer wrote `"php": "^8.2"`, change it to `"^8.3"` and re-run `composer update --no-scripts` inside `apps/backend/` to refresh the lock.

- [ ] **Step 5.5: Generate the app key**

Run:

```bash
cd apps/backend && php artisan key:generate && cd ../..
```

Expected: prints `Application key set successfully.` and updates `apps/backend/.env`. (Note: `apps/backend/.env` is git-ignored.)

- [ ] **Step 5.6: Verify Laravel boots locally (smoke test on host)**

Run:

```bash
cd apps/backend && php artisan --version && cd ../..
```

Expected: prints `Laravel Framework 13.x.x`.

- [ ] **Step 5.7: Commit**

```bash
git add apps/backend
git commit -m "feat: scaffold fresh Laravel 13 install at apps/backend"
```

---

### Task 6: Wire Nx run-commands targets for apps/backend

**Files:**

- Create: `apps/backend/project.json`

- [ ] **Step 6.1: Create `apps/backend/project.json`**

This file is what makes Nx see the Laravel app. Targets shell into the `backend` Docker container (set up in Tasks 8–9). The targets are deliberately Docker-aware so the same commands work in CI.

```json
{
  "name": "backend",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/backend",
  "projectType": "application",
  "tags": ["scope:backend", "type:app"],
  "targets": {
    "serve": {
      "executor": "nx:run-commands",
      "options": {
        "command": "docker compose -f infra/docker-compose.yml up backend",
        "cwd": "{workspaceRoot}"
      }
    },
    "artisan": {
      "executor": "nx:run-commands",
      "options": {
        "command": "docker compose -f infra/docker-compose.yml exec backend php artisan",
        "cwd": "{workspaceRoot}"
      }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": {
        "command": "docker compose -f infra/docker-compose.yml exec -T backend php artisan test --parallel",
        "cwd": "{workspaceRoot}"
      }
    },
    "lint": {
      "executor": "nx:run-commands",
      "options": {
        "command": "docker compose -f infra/docker-compose.yml exec -T backend ./vendor/bin/pint --test",
        "cwd": "{workspaceRoot}"
      }
    },
    "lint:fix": {
      "executor": "nx:run-commands",
      "options": {
        "command": "docker compose -f infra/docker-compose.yml exec -T backend ./vendor/bin/pint",
        "cwd": "{workspaceRoot}"
      }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "echo 'phpstan added in Phase 2; typecheck is a no-op in Phase 1' && exit 0",
        "cwd": "{workspaceRoot}"
      }
    },
    "migrate": {
      "executor": "nx:run-commands",
      "options": {
        "command": "docker compose -f infra/docker-compose.yml exec -T backend php artisan migrate",
        "cwd": "{workspaceRoot}"
      }
    },
    "tinker": {
      "executor": "nx:run-commands",
      "options": {
        "command": "docker compose -f infra/docker-compose.yml exec backend php artisan tinker",
        "cwd": "{workspaceRoot}"
      }
    }
  }
}
```

- [ ] **Step 6.2: Verify Nx sees the backend project**

Run:

```bash
pnpm nx show projects
```

Expected: listed alongside the others — `api-client`, `backend`, `design-tokens`, `i18n`, `ui`, `web`.

- [ ] **Step 6.3: Verify the typecheck no-op target works**

Run:

```bash
pnpm nx typecheck backend
```

Expected: prints the "phpstan added in Phase 2" message and succeeds.

- [ ] **Step 6.4: Commit**

```bash
git add apps/backend/project.json
git commit -m "feat: wire Nx run-commands targets for apps/backend (Docker-aware)"
```

---

### Task 7: Install + configure Laravel Pint

**Files:**

- Modify: `apps/backend/composer.json` (add `laravel/pint` to require-dev)
- Create: `apps/backend/pint.json`

- [ ] **Step 7.1: Add Pint to `apps/backend/composer.json` require-dev**

Run from the repo root:

```bash
cd apps/backend && composer require --dev laravel/pint:"^1.18" --no-interaction && cd ../..
```

Expected: pint added to `apps/backend/composer.json` `require-dev`, `apps/backend/composer.lock` updated, `apps/backend/vendor/bin/pint` exists.

- [ ] **Step 7.2: Create `apps/backend/pint.json`**

```json
{
  "preset": "laravel",
  "rules": {
    "declare_strict_types": true,
    "ordered_imports": { "sort_algorithm": "alpha" },
    "no_unused_imports": true,
    "single_quote": true,
    "blank_line_before_statement": {
      "statements": ["return", "throw", "try"]
    }
  }
}
```

- [ ] **Step 7.3: Run Pint locally on host (sanity check)**

Run:

```bash
cd apps/backend && ./vendor/bin/pint --test && cd ../..
```

Expected: Pint reports the codebase is clean (or auto-fixable). If it fails, run `./vendor/bin/pint` (no `--test`) to apply fixes, then commit those fixes as part of this task.

- [ ] **Step 7.4: Commit**

```bash
git add apps/backend/composer.json apps/backend/composer.lock apps/backend/pint.json apps/backend/app apps/backend/bootstrap apps/backend/config apps/backend/database apps/backend/routes apps/backend/tests
git commit -m "feat: install + configure Laravel Pint with declare_strict_types"
```

If there are no files to add beyond `composer.json`/`composer.lock`/`pint.json` (Pint changes nothing), the commit just covers those three.

---

### Task 8: Author infra/docker/frankenphp.Dockerfile

**Files:**

- Create: `infra/docker/frankenphp.Dockerfile`
- Create: `infra/docker/php.ini`
- Create: `infra/docker/entrypoint.sh`

- [ ] **Step 8.1: Create `infra/docker/frankenphp.Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM dunglas/frankenphp:1-php8.3-alpine AS base

# System deps for PHP extensions + tools
RUN apk add --no-cache \
        bash \
        git \
        unzip \
        icu-dev \
        libpq-dev \
        libzip-dev \
        oniguruma-dev \
        postgresql-client \
        $PHPIZE_DEPS \
    && install-php-extensions \
        intl \
        opcache \
        pcntl \
        pdo_pgsql \
        pgsql \
        redis \
        zip \
        bcmath \
        sockets \
    && rm -rf /var/cache/apk/*

# Composer
COPY --from=composer:2.7 /usr/bin/composer /usr/bin/composer

# PHP ini overrides
COPY infra/docker/php.ini /usr/local/etc/php/conf.d/zz-eurostrip.ini

WORKDIR /app

# Entrypoint
COPY infra/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000 8443 2019

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["php", "artisan", "octane:start", "--server=frankenphp", "--host=0.0.0.0", "--port=8000"]
```

- [ ] **Step 8.2: Create `infra/docker/php.ini`**

```ini
memory_limit = 512M
max_execution_time = 120
post_max_size = 50M
upload_max_filesize = 50M
date.timezone = UTC

opcache.enable = 1
opcache.enable_cli = 1
opcache.jit = tracing
opcache.jit_buffer_size = 128M
opcache.validate_timestamps = 1
opcache.revalidate_freq = 0
```

- [ ] **Step 8.3: Create `infra/docker/entrypoint.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /app

# Install composer deps if vendor is missing or stale
if [ ! -d vendor ] || [ composer.lock -nt vendor/autoload.php ]; then
  composer install --no-interaction --prefer-dist --optimize-autoloader
fi

# Ensure storage dirs exist with correct perms
mkdir -p storage/framework/{cache/data,sessions,testing,views} storage/logs bootstrap/cache
chmod -R 775 storage bootstrap/cache

# Wait for Postgres
echo "Waiting for postgres..."
until pg_isready -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USERNAME:-eurostrip}" >/dev/null 2>&1; do
  sleep 1
done
echo "Postgres is ready"

# Run migrations (idempotent)
php artisan migrate --force --no-interaction || true

# Octane is not installed in Phase 1 — fall back to artisan serve so the gate hits a Laravel response.
# This branch is removed in Phase 2 once Octane is wired.
if ! php artisan list 2>/dev/null | grep -q "octane:start"; then
  exec php artisan serve --host=0.0.0.0 --port=8000
fi

exec "$@"
```

Note: `entrypoint.sh` includes a temporary fallback to `php artisan serve` when Octane is not yet installed (Phase 1 ships core Laravel only). Phase 2 installs Octane, after which the fallback branch is dead code and the `CMD` line in the Dockerfile takes over.

- [ ] **Step 8.4: Make entrypoint executable in git**

Run:

```bash
chmod +x infra/docker/entrypoint.sh
git update-index --chmod=+x infra/docker/entrypoint.sh 2>/dev/null || true
```

- [ ] **Step 8.5: Commit**

```bash
git add infra/docker/frankenphp.Dockerfile infra/docker/php.ini infra/docker/entrypoint.sh
git commit -m "feat: add FrankenPHP Dockerfile, php.ini overrides, entrypoint with deferred Octane handoff"
```

---

### Task 9: Author infra/docker-compose.yml with all services + healthchecks

**Files:**

- Create: `infra/docker-compose.yml`
- Create: `infra/docker/postgres-init.sql`
- Create: `infra/docker/minio-init.sh`
- Create: `infra/docker-compose.ci.yml`

- [ ] **Step 9.1: Create `infra/docker/postgres-init.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

- [ ] **Step 9.2: Create `infra/docker/minio-init.sh`**

```bash
#!/usr/bin/env sh
set -e

until /usr/bin/mc alias set local http://minio:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1; do
  echo "Waiting for MinIO..."
  sleep 1
done

if ! /usr/bin/mc ls local/"${EUROSTRIP_S3_BUCKET}" >/dev/null 2>&1; then
  /usr/bin/mc mb local/"${EUROSTRIP_S3_BUCKET}"
  /usr/bin/mc anonymous set download local/"${EUROSTRIP_S3_BUCKET}"
  echo "Bucket ${EUROSTRIP_S3_BUCKET} created"
else
  echo "Bucket ${EUROSTRIP_S3_BUCKET} already exists"
fi
```

- [ ] **Step 9.3: Create `infra/docker-compose.yml`**

```yaml
name: eurostrip

networks:
  eurostrip:
    driver: bridge

volumes:
  pgdata:
  typesense-data:
  minio-data:
  passport-keys:
  composer-cache:

services:
  backend:
    build:
      context: ..
      dockerfile: infra/docker/frankenphp.Dockerfile
    image: eurostrip-backend:dev
    container_name: eurostrip-backend
    networks: [eurostrip]
    depends_on:
      postgres: { condition: service_healthy }
      dragonfly: { condition: service_healthy }
    ports:
      - '8000:8000'
      - '8443:8443'
      - '2019:2019'
    environment:
      APP_ENV: local
      APP_DEBUG: 'true'
      APP_KEY: ${APP_KEY}
      DB_CONNECTION: pgsql
      DB_HOST: postgres
      DB_PORT: 5432
      DB_DATABASE: ${POSTGRES_DB}
      DB_USERNAME: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      REDIS_HOST: dragonfly
      REDIS_PORT: 6379
      MAIL_MAILER: smtp
      MAIL_HOST: mailpit
      MAIL_PORT: 1025
      OCTANE_WATCH: 'true'
    volumes:
      - ../apps/backend:/app
      - composer-cache:/root/.composer/cache
      - passport-keys:/app/storage/passport
    restart: unless-stopped

  web:
    image: node:22-alpine
    container_name: eurostrip-web
    networks: [eurostrip]
    working_dir: /workspace
    command: sh -c "corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm install --frozen-lockfile && pnpm --filter @eurostrip/web dev"
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_API_URL: http://localhost:8000
    volumes:
      - ..:/workspace
    restart: unless-stopped

  postgres:
    image: postgis/postgis:16-3.4
    container_name: eurostrip-postgres
    networks: [eurostrip]
    ports:
      - '5432:5432'
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/postgres-init.sql:/docker-entrypoint-initdb.d/00-init.sql:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}']
      interval: 5s
      timeout: 3s
      retries: 12

  dragonfly:
    image: docker.dragonflydb.io/dragonflydb/dragonfly:latest
    container_name: eurostrip-dragonfly
    networks: [eurostrip]
    command: ['--logtostderr', '--cluster_mode=emulated']
    ports:
      - '6379:6379'
    ulimits:
      memlock: -1
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 12

  typesense:
    image: typesense/typesense:0.27.0
    container_name: eurostrip-typesense
    networks: [eurostrip]
    command: ['--data-dir=/data', '--api-key=${TYPESENSE_API_KEY}', '--enable-cors']
    ports:
      - '8108:8108'
    volumes:
      - typesense-data:/data
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://localhost:8108/health | grep -q ''"ok":true''']
      interval: 5s
      timeout: 3s
      retries: 12

  soketi:
    image: quay.io/soketi/soketi:latest-16-alpine
    container_name: eurostrip-soketi
    networks: [eurostrip]
    environment:
      SOKETI_DEBUG: '1'
      SOKETI_DEFAULT_APP_ID: ${PUSHER_APP_ID}
      SOKETI_DEFAULT_APP_KEY: ${PUSHER_APP_KEY}
      SOKETI_DEFAULT_APP_SECRET: ${PUSHER_APP_SECRET}
    ports:
      - '6001:6001'
      - '9601:9601'
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://localhost:6001/ready || exit 1']
      interval: 5s
      timeout: 3s
      retries: 12

  minio:
    image: minio/minio:latest
    container_name: eurostrip-minio
    networks: [eurostrip]
    command: ['server', '/data', '--console-address', ':9001']
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    ports:
      - '9000:9000'
      - '9001:9001'
    volumes:
      - minio-data:/data
    healthcheck:
      test: ['CMD-SHELL', 'curl -fsS http://localhost:9000/minio/health/live || exit 1']
      interval: 5s
      timeout: 3s
      retries: 12

  minio-init:
    image: minio/mc:latest
    container_name: eurostrip-minio-init
    networks: [eurostrip]
    depends_on:
      minio: { condition: service_healthy }
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
      EUROSTRIP_S3_BUCKET: ${EUROSTRIP_S3_BUCKET}
    entrypoint: ['/bin/sh', '/etc/minio-init.sh']
    volumes:
      - ./docker/minio-init.sh:/etc/minio-init.sh:ro
    restart: 'no'

  mailpit:
    image: axllent/mailpit:latest
    container_name: eurostrip-mailpit
    networks: [eurostrip]
    ports:
      - '1025:1025'
      - '8025:8025'
    environment:
      MP_MAX_MESSAGES: 5000
      MP_SMTP_AUTH_ACCEPT_ANY: 'true'
      MP_SMTP_AUTH_ALLOW_INSECURE: 'true'

  horizon:
    image: eurostrip-backend:dev
    container_name: eurostrip-horizon
    networks: [eurostrip]
    depends_on:
      backend: { condition: service_started }
    command: ['php', 'artisan', 'horizon']
    environment:
      APP_ENV: local
      APP_KEY: ${APP_KEY}
      DB_CONNECTION: pgsql
      DB_HOST: postgres
      DB_PORT: 5432
      DB_DATABASE: ${POSTGRES_DB}
      DB_USERNAME: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      REDIS_HOST: dragonfly
      REDIS_PORT: 6379
    volumes:
      - ../apps/backend:/app
      - composer-cache:/root/.composer/cache
    restart: unless-stopped
    profiles: ['queue']

  scheduler:
    image: eurostrip-backend:dev
    container_name: eurostrip-scheduler
    networks: [eurostrip]
    depends_on:
      backend: { condition: service_started }
    command: ['php', 'artisan', 'schedule:work']
    environment:
      APP_ENV: local
      APP_KEY: ${APP_KEY}
      DB_CONNECTION: pgsql
      DB_HOST: postgres
      DB_PORT: 5432
      DB_DATABASE: ${POSTGRES_DB}
      DB_USERNAME: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - ../apps/backend:/app
    restart: unless-stopped
    profiles: ['queue']
```

Note on `horizon` and `scheduler`: marked with `profiles: ["queue"]` so they don't start by default in Phase 1 (Horizon isn't installed yet — it's a Phase 2 package). They become default-on in Phase 2.

- [ ] **Step 9.4: Create `infra/docker-compose.ci.yml` (CI override)**

```yaml
name: eurostrip-ci

services:
  backend:
    volumes: !reset []
    environment:
      APP_ENV: testing

  web:
    volumes: !reset []
    command: sh -c "corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm install --frozen-lockfile && pnpm --filter @eurostrip/web build"

  postgres:
    volumes: !override
      - ./docker/postgres-init.sql:/docker-entrypoint-initdb.d/00-init.sql:ro
```

This override strips host bind-mounts so CI uses image contents only and removes the named `pgdata` volume so each CI run starts on a fresh database.

- [ ] **Step 9.5: Commit**

```bash
git add infra/docker-compose.yml infra/docker-compose.ci.yml infra/docker/postgres-init.sql infra/docker/minio-init.sh
git commit -m "feat: add docker-compose stack (10 services) with healthchecks + CI override"
```

---

### Task 10: Author .env.example with safe defaults

**Files:**

- Create: `.env.example` (root)

- [ ] **Step 10.1: Create `.env.example`**

```bash
# ----------------------------------------------------------------------
# EuroStrip — root environment file
# Copy to `.env` (git-ignored) and fill in any per-developer secrets.
# All defaults here are safe for local development only.
# ----------------------------------------------------------------------

# Laravel
APP_ENV=local
APP_DEBUG=true
APP_KEY=base64:CHANGEME-RUN-php-artisan-key-generate-INSIDE-apps-backend
APP_URL=http://localhost:8000
APP_TIMEZONE=UTC

# Postgres / PostGIS
POSTGRES_DB=eurostrip
POSTGRES_USER=eurostrip
POSTGRES_PASSWORD=eurostrip

# Dragonfly (Redis-compatible)
REDIS_PASSWORD=
REDIS_DB=0

# Typesense
TYPESENSE_API_KEY=local-dev-typesense-key
TYPESENSE_HOST=typesense
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http

# Soketi / Pusher-compatible WS
PUSHER_APP_ID=eurostrip-local
PUSHER_APP_KEY=eurostrip-local-key
PUSHER_APP_SECRET=eurostrip-local-secret
PUSHER_HOST=soketi
PUSHER_PORT=6001
PUSHER_SCHEME=http

# MinIO (S3-compatible)
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
EUROSTRIP_S3_BUCKET=eurostrip-dev
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=eurostrip-dev
AWS_ENDPOINT=http://minio:9000
AWS_USE_PATH_STYLE_ENDPOINT=true

# Mail (Mailpit catches everything)
MAIL_MAILER=smtp
MAIL_HOST=mailpit
MAIL_PORT=1025
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_ENCRYPTION=null
MAIL_FROM_ADDRESS=hello@eurostrip.local
MAIL_FROM_NAME="EuroStrip"

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
```

- [ ] **Step 10.2: Generate a real APP_KEY for the developer's local `.env`**

This step is for the developer running through the plan, not for committing. Document it explicitly:

```bash
# DO NOT commit this output. Copy `.env.example` to `.env` first, then:
cd apps/backend && php artisan key:generate --show
# Copy the resulting "base64:..." string into the root .env's APP_KEY
```

- [ ] **Step 10.3: Commit**

```bash
git add .env.example
git commit -m "feat: add .env.example with safe local defaults for the docker stack"
```

---

### Task 11: Install + configure Lefthook (format-on-staged)

**Files:**

- Create: `lefthook.yml`

- [ ] **Step 11.1: Create `lefthook.yml`**

```yaml
pre-commit:
  parallel: true
  commands:
    prettier:
      glob: '*.{js,jsx,ts,tsx,json,md,yaml,yml,css}'
      run: pnpm exec prettier --write {staged_files} && git add {staged_files}
    eslint:
      glob: '{apps/web,libs}/**/*.{ts,tsx}'
      run: pnpm exec eslint --fix {staged_files} && git add {staged_files}
    pint:
      glob: 'apps/backend/**/*.php'
      run: cd apps/backend && ./vendor/bin/pint {staged_files} && cd ../.. && git add {staged_files}
```

- [ ] **Step 11.2: Install Lefthook hooks**

Run:

```bash
pnpm exec lefthook install
```

Expected: prints `sync hooks success` and creates `.git/hooks/pre-commit` (and others). The git-hook script delegates to lefthook.

- [ ] **Step 11.3: Verify Lefthook config parses**

Run:

```bash
pnpm exec lefthook run pre-commit --files README.md
```

Expected: Lefthook executes the `prettier` command on `README.md` (no other commands match the glob) and reports success.

- [ ] **Step 11.4: Commit**

```bash
git add lefthook.yml
git commit -m "chore: install Lefthook with prettier/eslint/pint pre-commit hooks"
```

---

### Task 12: Author CI workflow (.github/workflows/ci.yml — lint-and-typecheck only)

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 12.1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-typecheck:
    name: Lint + Typecheck
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.12.3

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Setup PHP 8.3
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          extensions: intl, pdo_pgsql, pgsql, redis, zip, bcmath, sockets
          tools: composer:v2

      - name: Install Node deps
        run: pnpm install --frozen-lockfile

      - name: Install PHP deps
        working-directory: apps/backend
        run: composer install --prefer-dist --no-progress --no-interaction

      - name: Set Nx SHAs (for affected)
        uses: nrwl/nx-set-shas@v4

      - name: Lint (Nx affected)
        run: pnpm nx affected --target=lint --parallel=4

      - name: Typecheck (Nx affected)
        run: pnpm nx affected --target=typecheck --parallel=4

      - name: Pint (apps/backend)
        working-directory: apps/backend
        run: ./vendor/bin/pint --test
```

- [ ] **Step 12.2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint + typecheck + pint workflow"
```

---

### Task 13: Seed /docs (README, local-dev runbook, ADR 0001)

**Files:**

- Create: `docs/README.md`
- Create: `docs/runbooks/local-dev.md`
- Create: `docs/adr/0001-nx-with-laravel-via-run-commands.md`

- [ ] **Step 13.1: Create `docs/README.md`**

```markdown
# EuroStrip — Internal Documentation

Evergreen reference material for the EuroStrip codebase.

## Sections

- **architecture/** — system design, sequence diagrams, ERDs
- **adr/** — Architecture Decision Records (Context / Decision / Consequences / Alternatives Considered)
- **runbooks/** — task-oriented guides (local dev, adding a feature, rotating keys, etc.)
- **conventions/** — TDD rules, SOLID expression, naming, i18n

For per-feature design specs and implementation plans, see `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Phase 1 status

Phase 1 of the scaffold (workspace + Docker bring-up) seeds:

- This index
- `runbooks/local-dev.md`
- `adr/0001-nx-with-laravel-via-run-commands.md`

The full doc set listed in the scaffold spec (architecture, more ADRs, conventions, more runbooks) lands across Phases 2-4.
```

- [ ] **Step 13.2: Create `docs/runbooks/local-dev.md`**

````markdown
# Local Development Runbook

This guide takes you from a fresh `git clone` to a fully running EuroStrip stack in under five minutes.

## Prerequisites

| Tool | Version | Notes |
| -------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Node | 22 LTS | `nvm install 22 && nvm use 22` |
| pnpm | 9.x | `corepack enable && corepack prepare pnpm@9 --activate` |
| Docker | latest with Compose v2 | Docker Desktop, OrbStack, or Colima |
| PHP | 8.3 | Required only for the initial Laravel install (Task 5 of Phase 1). Herd works on macOS. After that, all PHP runs in Docker. |
| Composer | 2.7+ | Same as PHP — only needed for the initial install. |

## First run

```bash
git clone <repo-url> eurostrip
cd eurostrip
cp .env.example .env

# Generate a Laravel app key into .env (the placeholder in .env.example is not valid)
cd apps/backend && php artisan key:generate --show
# Copy the printed `base64:...` string into the root .env as APP_KEY=...
cd ../..

pnpm install
pnpm exec lefthook install

docker compose -f infra/docker-compose.yml up -d
```
````

Wait until all healthchecks pass:

```bash
docker compose -f infra/docker-compose.yml ps
```

Every service should be `running (healthy)` (or `running` for services without a healthcheck like `backend` itself, `web`, `mailpit`).

## Smoke test

```bash
curl -fsS http://localhost:8000             # Laravel welcome
curl -fsS http://localhost:3000             # Next.js welcome
open http://localhost:8025                  # Mailpit UI
open http://localhost:9001                  # MinIO console (minioadmin / minioadmin)
```

## Service endpoints

| Service | Host port | URL / DSN | Notes |
| ------------------ | ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Backend (Laravel) | 8000 | http://localhost:8000 | Falls back to `artisan serve` until Octane is installed in Phase 2 |
| Frontend (Next.js) | 3000 | http://localhost:3000 | Hot reload via bind-mount |
| Postgres+PostGIS | 5432 | `postgresql://eurostrip:eurostrip@localhost:5432/eurostrip` | |
| Dragonfly (Redis) | 6379 | `redis://localhost:6379` | Wire-compatible with `redis-cli` |
| Typesense | 8108 | http://localhost:8108 | API key in `.env` |
| Soketi (WS) | 6001 / 9601 | ws://localhost:6001, http://localhost:9601 (metrics) | |
| MinIO (S3) | 9000 / 9001 | http://localhost:9000 (S3 API), http://localhost:9001 (console) | |
| Mailpit | 1025 / 8025 | smtp://localhost:1025, http://localhost:8025 (UI) | |

## Common commands

```bash
# Tail backend logs
docker compose -f infra/docker-compose.yml logs -f backend

# Open a shell inside the backend container
docker compose -f infra/docker-compose.yml exec backend sh

# Run an artisan command
pnpm nx artisan backend -- migrate:status

# Run Pint on the backend
pnpm nx lint:fix backend

# Open Tinker
pnpm nx tinker backend

# Stop everything
docker compose -f infra/docker-compose.yml down

# Stop and wipe volumes (full reset — loses DB)
docker compose -f infra/docker-compose.yml down -v
```

## Troubleshooting

**Port already in use** — another process is bound to one of the host ports above. Stop it or change the host-side mapping in `infra/docker-compose.yml`.

**`pg_isready` loop in the backend logs** — Postgres container hasn't healthchecked yet. Wait a few seconds, or check `docker compose ps` to see if `postgres` is actually starting.

**Permission errors on `apps/backend/storage`** — the entrypoint runs `chmod -R 775 storage bootstrap/cache` on every boot. If the host owns these dirs as root, run `sudo chown -R $USER apps/backend/storage apps/backend/bootstrap/cache`.

**Pint disagrees with a teammate's formatting** — Pint is the source of truth. Run `pnpm nx lint:fix backend` to auto-format.

````text

- [ ] **Step 13.3: Create `docs/adr/0001-nx-with-laravel-via-run-commands.md`**

```markdown
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
````

- [ ] **Step 13.4: Commit**

```bash
git add docs/README.md docs/runbooks/local-dev.md docs/adr/0001-nx-with-laravel-via-run-commands.md
git commit -m "docs: seed /docs with index, local-dev runbook, ADR 0001"
```

---

### Task 14: Author root CLAUDE.md

**Files:**

- Create: `CLAUDE.md`

- [ ] **Step 14.1: Create `CLAUDE.md`**

```markdown
# EuroStrip — Collaboration Rules

This file is loaded automatically into every Claude Code session in this repo. It encodes the non-negotiable rules; details live in `docs/`.

## Stack

Nx 20 monorepo. Laravel 13 + Octane/FrankenPHP at `apps/backend/` (CQRS three-layer: Command/Query → Handler → UseCase). Next.js 15 + Redux Toolkit at `apps/web/`. Postgres+PostGIS, Dragonfly (Redis-compatible), Typesense, Soketi, MinIO. Filament admin at `/admin`. Scramble at `/docs/api`. Spatie packages: data, browsershot, translatable, **laravel-permission v7 with PHP-enum permission identifiers (never raw strings)**.

## Hard rules

1. **TDD always.** Every feature is test-first. Each suite covers happy, invalid, and garbage paths at minimum. See `docs/conventions/tdd.md` (added in Phase 4).
2. **SOLID at every layer.** UseCases do one thing; Handlers handle bus-adapter concerns; Repositories handle persistence. Domain depends on no framework. See `docs/conventions/solid.md` (added in Phase 4).
3. **No raw permission strings.** Authorization uses `BackedEnum` cases from each module's `*Permission` enum. PHPStan (added in Phase 2) enforces this.
4. **Pint runs after every backend task.** `pnpm nx lint:fix backend` is part of "done" for any backend change.
5. **No hardcoded user-facing strings.** All user-facing text passes through i18n catalogs (next-intl on the frontend, Laravel `lang/` on the backend). ESLint enforces this on JSX.
6. **API docs MUST work.** Scramble (`/docs/api`) regenerates on every boot; CI fails if any public route is missing. The generated `openapi.json` is the input to `libs/api-client`.
7. **`/docs` is evergreen.** Every architectural change updates the relevant `architecture/*.md`. Significant decisions get an ADR.
8. **Squared UI.** No `border-radius` except `rounded-full` for avatars/pills (Openbridge convention). Tokens enforce this at the Tailwind config level.

## Workflow

The canonical "how a feature gets built" is in `docs/runbooks/adding-a-feature.md` (added in Phase 4). Until that lands, the short version:

1. `superpowers:brainstorming` to design
2. Write spec to `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md`
3. `superpowers:writing-plans` to plan
4. `superpowers:subagent-driven-development` or `superpowers:executing-plans` to execute
5. TDD UseCase → Handler → Controller → Filament → Frontend, in that order
6. Update `/docs`, run Pint, open PR

## Local dev

See `docs/runbooks/local-dev.md`.

## What lives where

- Spec for this scaffold: `docs/superpowers/specs/2026-05-02-eurostrip-scaffold-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-05-02-eurostrip-scaffold-phase-1.md`
- Architecture: `docs/architecture/` (filled in Phases 2–4)
- ADRs: `docs/adr/`
```

- [ ] **Step 14.2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add root CLAUDE.md collaboration rules"
```

---

### Task 15: Bring up the stack and verify the Phase 1 gate

This task has no file edits — it's the verification gate from §13.1 of the spec.

- [ ] **Step 15.1: Copy `.env.example` to `.env` and set a real APP_KEY**

Run:

```bash
cp .env.example .env
cd apps/backend && php artisan key:generate --show
```

Take the printed `base64:...` string and replace the `APP_KEY=...` line in the root `.env` with it. (The placeholder in `.env.example` will not work because Laravel rejects it as malformed.)

Verify:

```bash
grep '^APP_KEY=base64:' .env
```

Expected: prints the line with a real base64 key (length ~52 chars after the prefix).

- [ ] **Step 15.2: Build the backend image**

Run:

```bash
docker compose -f infra/docker-compose.yml build backend
```

Expected: builds successfully. First build may take 3–5 minutes (downloads PHP extensions). Subsequent builds are cached.

- [ ] **Step 15.3: Bring the full stack up**

Run:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Expected: all services start. The `minio-init` container exits 0 after creating the bucket; that's normal.

- [ ] **Step 15.4: Wait for healthchecks and confirm**

Run:

```bash
docker compose -f infra/docker-compose.yml ps
```

Expected: `postgres`, `dragonfly`, `typesense`, `soketi`, `minio` show `(healthy)`. `backend`, `web`, `mailpit` show `running` (no healthcheck declared in Phase 1).

If any service is unhealthy after 60s, dump its logs:

```bash
docker compose -f infra/docker-compose.yml logs <service>
```

Common issues are documented in `docs/runbooks/local-dev.md` Troubleshooting.

- [ ] **Step 15.5: Smoke-test the backend**

Run:

```bash
curl -fsS http://localhost:8000 | head -c 200
```

Expected: HTML beginning with `<!DOCTYPE html>` and containing the string `Laravel` (the default Laravel welcome page). If the response is a connection error, give the backend container another 10–15 seconds — composer install + first migration takes a moment on first boot.

- [ ] **Step 15.6: Smoke-test the frontend**

Run:

```bash
curl -fsS http://localhost:3000 | head -c 400
```

Expected: HTML containing `EuroStrip` and `Frontend scaffold is alive`. The first response is slow because Next.js dev server compiles on demand.

- [ ] **Step 15.7: Smoke-test Postgres has PostGIS**

Run:

```bash
docker compose -f infra/docker-compose.yml exec -T postgres psql -U eurostrip -d eurostrip -c "SELECT PostGIS_Full_Version();"
```

Expected: prints a row containing the PostGIS version (e.g. `POSTGIS="3.4.x" ...`).

- [ ] **Step 15.8: Smoke-test Dragonfly**

Run:

```bash
docker compose -f infra/docker-compose.yml exec -T dragonfly redis-cli ping
```

Expected: `PONG`.

- [ ] **Step 15.9: Smoke-test Typesense**

Run:

```bash
curl -fsS http://localhost:8108/health
```

Expected: `{"ok":true}`.

- [ ] **Step 15.10: Smoke-test MinIO bucket exists**

Run:

```bash
docker compose -f infra/docker-compose.yml run --rm minio-init /bin/sh -c \
  "/usr/bin/mc alias set local http://minio:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD && /usr/bin/mc ls local/\$EUROSTRIP_S3_BUCKET"
```

Expected: command exits 0; lists the (empty) bucket without error.

- [ ] **Step 15.11: Run the full Nx lint + typecheck across the workspace**

Run:

```bash
pnpm nx run-many --target=lint --all
pnpm nx run-many --target=typecheck --all
```

Expected: both report `Successfully ran target lint for N projects` (`N` = 5 — backend's lint is Pint-via-docker which we don't exercise here yet because Pint is checked separately) and `Successfully ran target typecheck for N projects`.

Note: backend's `lint` target shells into Docker via `pnpm nx lint backend`. Test that explicitly:

```bash
pnpm nx lint backend
```

Expected: Pint runs inside the container and reports the codebase is clean.

- [ ] **Step 15.12: Verify Phase 1 gate one more time, end-to-end**

Run all four gate commands from the spec back-to-back:

```bash
docker compose -f infra/docker-compose.yml ps --format 'table {{.Name}}\t{{.Status}}'
pnpm nx run-many --target=lint --all
pnpm nx run-many --target=typecheck --all
curl -fsS -o /dev/null -w 'backend: %{http_code}\n' http://localhost:8000
curl -fsS -o /dev/null -w 'web: %{http_code}\n' http://localhost:3000
```

Expected:

- All services from `docker compose ps` show running/healthy
- Lint and typecheck both green
- `backend: 200` and `web: 200`

If anything fails, debug before moving on. The Phase 2 plan assumes Phase 1's gate is green.

- [ ] **Step 15.13: Tear the stack down cleanly (optional, end of session)**

Run:

```bash
docker compose -f infra/docker-compose.yml down
```

Expected: all containers stopped; volumes preserved (DB state survives).

- [ ] **Step 15.14: Final commit (no code changes — just an empty marker if desired)**

If everything passed, no commit is needed for Task 15 itself. If you made follow-up tweaks during gate verification (env tweaks, healthcheck tuning), commit them now:

```bash
git status                                # confirm what changed
git add <files>
git commit -m "fix: tune Phase 1 healthchecks / env defaults from gate verification"
```

If `git status` is clean, skip the commit and move on.

---

## Phase 1 complete

When all 15 tasks are checked off and the gate in 15.12 is green:

- The repo is an Nx monorepo with `apps/web`, `apps/backend`, and four `libs/*` projects, all visible to `pnpm nx show projects`.
- `docker compose up` brings the full data-plane and both apps online.
- Lint, typecheck, and Pint all pass in the workspace and in CI.
- The collaboration rules (`CLAUDE.md`) and the local-dev runbook are in place.

Next: write the **Phase 2** plan (Backend core — CQRS contracts, all Laravel packages configured, Filament panel, Scramble, the Ping module). Source spec section: §13.2.
