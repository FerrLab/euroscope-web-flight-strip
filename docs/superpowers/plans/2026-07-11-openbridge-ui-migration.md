# OpenBridge UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom `@eurostrip/ui` component library with OpenBridge (`@oicl/openbridge-webcomponents` + `@oicl/openbridge-webcomponents-react`) across all 13 files in `apps/web` that import it, then delete `libs/ui`.

**Architecture:** OpenBridge ships Lit web components with auto-generated React wrappers (`@lit/react`). Each of the 13 consuming files swaps its `@eurostrip/ui` import for the equivalent `Obc*` component(s), one-for-one, following the mapping in the design spec. `Modal` and `Toast` have zero call sites today and are dropped, not migrated. `Select` maps directly to `ObcDropdownButton` (no wrapper needed). Every OpenBridge component renders into an open Shadow DOM, so existing Testing Library queries need `shadow-dom-testing-library`'s shadow-piercing variants.

**Tech Stack:** Next.js 15, React 19 (verify exact version in `apps/web/package.json` at Task 1), `@oicl/openbridge-webcomponents` + `@oicl/openbridge-webcomponents-react` (Lit-based, v1.0.0), `@lit/react`, Vitest + `@testing-library/react` + `shadow-dom-testing-library`.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-07-11-openbridge-ui-migration-design.md` — read it once before starting; it has the full component mapping table and rationale.
- **Theme names are exact:** `bright`, `day`, `dusk`, `night` — these already exist in `ThemeProvider`/`set-theme-pre-paint.ts` and must not change.
- **OpenBridge setup requirements:** CSS import `@oicl/openbridge-webcomponents/dist/openbridge.css`; `data-obc-theme` attribute on `<html>` mirroring the existing `data-theme` value; Noto Sans font available.
- **`ObcButton` has no `type` prop** — it cannot be `type="submit"`. Every form currently relying on `<Button type="submit">`'s native submit semantics (`RecordPingForm.tsx`, `CommandComposer.tsx`, `StructuredComposer.tsx`) needs a `formRef` + `onClick={() => formRef.current?.requestSubmit()}` so both button-click and Enter-key submission keep working.
- **`ObcSequenceLoadingSpinner` has no accessible-label prop** — every usage must be wrapped in the same `role="status" aria-live="polite" aria-label={label}` pattern the current `Spinner` component uses internally (see Task 1 file map).
- **Shadow DOM:** every `Obc*` component renders into an open shadow root. Standard `@testing-library/react` queries (`getByRole`, `getByLabelText`) do not pierce shadow boundaries. `shadow-dom-testing-library` extends the query set with piercing variants — import its setup once (Task 1), then use its queries (documented per-task below) anywhere a query would otherwise fail to find shadow content.
- **`ObcDropdownButton` renders a native `<select>` internally** (per its own docs, "for keyboard and screen reader support") — `getByRole('combobox')`/`getByRole('option')` still apply, but only reachable through shadow-piercing queries since that `<select>` lives inside the component's shadow root.
- **i18n hard rule (CLAUDE.md #6):** every user-facing string still routes through `useTranslations()`. This migration changes component library, not copy — do not touch any existing translation key or message JSON file.
- **Squared UI hard rule (CLAUDE.md #9):** OpenBridge is squared by default; no new `rounded-*` classes should be introduced anywhere in this migration.
- **TDD hard rule (CLAUDE.md #1):** every task updates its file's existing test suite to pass against real rendered OpenBridge output — never delete a test to make it pass; adapt the query.
- **Frontend commands run host-side** (not Docker): full suite `pnpm nx test web`; one file `pnpm -C apps/web exec vitest run <path>`; lint `pnpm nx lint web`; typecheck `pnpm nx typecheck web`; e2e `pnpm nx e2e web`.
- **Conventional commits**, one commit per task.

## File Map

```text
apps/web/
├── package.json                                    (T1 — add deps)
├── tests/setup.ts                                   (T1 — shadow-dom-testing-library)
├── src/app/layout.tsx                                (T1 — CSS + font + data-obc-theme)
├── src/shared/theme/
│   ├── ThemeProvider.tsx                            (T1 — data-obc-theme on change, verify exact file first)
│   ├── set-theme-pre-paint.ts                       (T1 — data-obc-theme in the inline script)
│   ├── ThemeSwitcher.tsx + .test.tsx                (T2)
├── src/shared/i18n/LocaleSwitcher.tsx + .test.tsx    (T2)
├── src/features/gateway/components/
│   ├── TokenPanel.tsx + .test.tsx                   (T3)
│   ├── MessageFeed.tsx + .test.tsx                  (T4)
│   ├── CommandComposer.tsx + .test.tsx              (T5)
│   ├── StructuredComposer.tsx + .test.tsx           (T6)
│   ├── ConsoleClient.tsx (no test file today)       (T7)
├── src/features/ping/components/
│   ├── PingList.tsx + .test.tsx                     (T8)
│   ├── RecordPingForm.tsx + .test.tsx                (T8)
├── src/app/[locale]/
│   ├── login/page.tsx (no test file today)          (T9)
│   ├── dashboard/page.tsx (no test file today)      (T9)
│   ├── ping/page.tsx (no test file today)           (T9)
│   ├── token/page.tsx (no test file today)          (T9)
└── e2e/{login-and-ping,gateway-console}.spec.ts      (T10 — verify only)

libs/ui/                                              (T10 — delete)
```

---

### Task 1: Install OpenBridge, wire CSS/font/theme, add shadow-DOM test support

**Files:**

- Modify: `apps/web/package.json`
- Modify: `apps/web/tests/setup.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/shared/theme/set-theme-pre-paint.ts`
- Modify: `apps/web/src/shared/theme/ThemeProvider.tsx`
- Test: `apps/web/src/shared/theme/set-theme-pre-paint.test.ts` (create if it doesn't already exist — check first)

**Interfaces:**

- Consumes: nothing (first task).
- Produces: `@oicl/openbridge-webcomponents` + `@oicl/openbridge-webcomponents-react` + `shadow-dom-testing-library` installed and importable from every later task's files. `document.documentElement.dataset.obcTheme` kept in sync with `document.documentElement.dataset.theme` at both the pre-paint and `ThemeProvider` call sites — later tasks depend on OpenBridge's CSS actually applying, which requires this attribute to be set.

- [ ] **Step 1: Read the two theme files to get their exact current content**

```bash
cat apps/web/src/shared/theme/set-theme-pre-paint.ts
cat apps/web/src/shared/theme/ThemeProvider.tsx
cat apps/web/src/app/layout.tsx
```

(Already known: `set-theme-pre-paint.ts` sets `document.documentElement.dataset.theme = theme` inside an inline script string. `ThemeProvider.tsx` was not read during planning — read it now and locate wherever it applies the theme, e.g. `document.documentElement.dataset.theme = theme` inside a `useEffect` or setter function.)

- [ ] **Step 2: Install packages**

```bash
pnpm --filter @eurostrip/web add @oicl/openbridge-webcomponents @oicl/openbridge-webcomponents-react
pnpm --filter @eurostrip/web add -D shadow-dom-testing-library
```

Run: `cat apps/web/package.json | grep openbridge`
Expected: both `@oicl/openbridge-webcomponents` and `@oicl/openbridge-webcomponents-react` listed under `dependencies`, `shadow-dom-testing-library` under `devDependencies`.

- [ ] **Step 3: Verify shadow-dom-testing-library's own setup instructions**

```bash
cat node_modules/shadow-dom-testing-library/README.md | head -80
```

Its documented setup (as of the version installed) typically requires importing `'shadow-dom-testing-library/extend-expect'` and re-exporting queries from `shadow-dom-testing-library`'s own `screen`/`within` instead of `@testing-library/react`'s. **Read this output before writing Step 4** — do not guess the API from this plan text; the actual package README at install time is the source of truth. Confirm: (a) whether it needs a Vitest/Jest matcher-extension import in `tests/setup.ts`, (b) whether later tasks import `screen`/`within`/query helpers from `shadow-dom-testing-library` instead of `@testing-library/react`, and (c) the exact names of the shadow-piercing query functions (commonly patterns like `getByShadowRole`, `getByShadowLabelText`, or a `screen` object with the same query names transparently piercing shadow roots — confirm which).

- [ ] **Step 4: Update `apps/web/tests/setup.ts` per the README's actual instructions**

Add whatever import/setup the README specifies (do not fabricate — use Step 3's findings). At minimum this file's existing content (JSDOM polyfills, `Request` patch, `afterEach(cleanup)`) must remain untouched — only add to it.

- [ ] **Step 5: Wire the CSS import, font, and `data-obc-theme` into `layout.tsx`**

Add near the top of `apps/web/src/app/layout.tsx` (alongside existing imports):

```tsx
import '@oicl/openbridge-webcomponents/dist/openbridge.css';
```

If `apps/web/src/app/layout.tsx` already loads a font via `next/font`, add Noto Sans the same way (e.g. `next/font/google`'s `Noto_Sans`) rather than introducing a `<link>` tag; if it currently uses no `next/font` loader at all, add one:

```tsx
import { Noto_Sans } from 'next/font/google';

const notoSans = Noto_Sans({ subsets: ['latin'], display: 'swap' });
```

and apply `notoSans.className` on the root `<html>` or `<body>` element, matching whatever pattern the file already uses for its existing className (read the file's current JSX return before editing — do not guess the surrounding markup).

- [ ] **Step 6: Set `data-obc-theme` alongside `data-theme`**

In `set-theme-pre-paint.ts`, wherever the inline script currently does `document.documentElement.dataset.theme = theme;`, add immediately after it:

```js
document.documentElement.dataset.obcTheme = theme;
```

In `ThemeProvider.tsx`, wherever it currently sets `document.documentElement.dataset.theme = theme` (found in Step 1), add the same line immediately after:

```ts
document.documentElement.dataset.obcTheme = theme;
```

- [ ] **Step 7: Write a test asserting both attributes are set together**

If `set-theme-pre-paint.test.ts` doesn't already exist, create it:

```ts
import { describe, it, expect } from 'vitest';
import { setThemePrePaint } from './set-theme-pre-paint';

describe('setThemePrePaint', () => {
  it('sets both data-theme and data-obc-theme from the cookie (happy)', () => {
    document.cookie = 'eurostrip_theme=night';
    // eslint-disable-next-line no-new-func -- exercising the generated inline script exactly as the browser would
    new Function(setThemePrePaint())();
    expect(document.documentElement.dataset.theme).toBe('night');
    expect(document.documentElement.dataset.obcTheme).toBe('night');
    document.cookie = 'eurostrip_theme=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('falls back both attributes to day for an invalid cookie value (garbage)', () => {
    document.cookie = 'eurostrip_theme=purple';
    // eslint-disable-next-line no-new-func
    new Function(setThemePrePaint())();
    expect(document.documentElement.dataset.theme).toBe('day');
    expect(document.documentElement.dataset.obcTheme).toBe('day');
    document.cookie = 'eurostrip_theme=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });
});
```

If the test file already exists with different test names, add these two cases to it instead of replacing existing ones.

- [ ] **Step 8: Run the new/updated test**

Run: `pnpm -C apps/web exec vitest run src/shared/theme/set-theme-pre-paint.test.ts`
Expected: PASS (2 tests, or however many including pre-existing ones)

- [ ] **Step 9: Typecheck and lint**

Run: `pnpm nx typecheck web`
Expected: PASS

Run: `pnpm nx lint web`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/web/package.json apps/web/tests/setup.ts apps/web/src/app/layout.tsx apps/web/src/shared/theme/set-theme-pre-paint.ts apps/web/src/shared/theme/set-theme-pre-paint.test.ts apps/web/src/shared/theme/ThemeProvider.tsx
git commit -m "chore(web): install OpenBridge, wire CSS/font/theme, add shadow-DOM test support"
```

---

### Task 2: Migrate ThemeSwitcher and LocaleSwitcher to `ObcDropdownButton`

**Files:**

- Modify: `apps/web/src/shared/theme/ThemeSwitcher.tsx`
- Modify: `apps/web/src/shared/theme/ThemeSwitcher.test.tsx`
- Modify: `apps/web/src/shared/i18n/LocaleSwitcher.tsx`
- Modify: `apps/web/src/shared/i18n/LocaleSwitcher.test.tsx`

**Interfaces:**

- Consumes: `ObcDropdownButton` from `@oicl/openbridge-webcomponents-react` (import path: `@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button`), whose React props are `options: {value: string; label: string; level?: number}[]`, `value?: string`, `disabled?: boolean`, `fullWidth?: boolean`, and the event prop `onDropdownChange: (e: CustomEvent<{value: string; label: string}>) => void` (or `onChange`, same event — use `onDropdownChange` for clarity since a bare `onChange` name shadows the native DOM event naming convention). Shadow-piercing test queries from Task 1 (exact function names confirmed there).
- Produces: nothing new consumed by later tasks — these two files have no other importers.

- [ ] **Step 1: Update the failing tests first**

Replace `apps/web/src/shared/theme/ThemeSwitcher.test.tsx` in full:

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
    expect(document.documentElement.dataset.obcTheme).toBe('night');
  });

  it('starts at the cookie theme (initialTheme prop)', () => {
    render(wrap('dusk', <ThemeSwitcher />));
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument();
  });

  it('rejects invalid initialTheme as garbage (garbage → falls back to day)', () => {
    render(wrap('purple', <ThemeSwitcher />));
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument();
  });
});
```

If the shadow-piercing setup from Task 1 means `getByRole`/`findByRole` from `@testing-library/react` no longer find content inside `obc-dropdown-button`'s shadow root, replace every `screen.getByRole`/`screen.findByRole` call above with the shadow-piercing equivalent Task 1's Step 3 identified (e.g. if the library exposes its own `screen` object, `import { screen } from 'shadow-dom-testing-library'` in place of the `@testing-library/react` one, keeping every other line unchanged — `getByRole`/`findByRole` calls stay the same since `ObcDropdownButton` renders a real native `<select>`/`<option>` internally, so `role="combobox"`/`role="option"` still applies, just reached through a shadow-piercing traversal).

Apply the identical treatment to `apps/web/src/shared/i18n/LocaleSwitcher.test.tsx` — its structure and query patterns are the same shape, only the messages/labels differ; keep every existing test case, only adjust the query import if Task 1 requires it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web exec vitest run src/shared/theme/ThemeSwitcher.test.tsx src/shared/i18n/LocaleSwitcher.test.tsx`
Expected: FAIL — `ThemeSwitcher`/`LocaleSwitcher` still render the old `Select`, and/or the shadow-piercing query import doesn't yet resolve against the still-Radix-based markup.

- [ ] **Step 3: Migrate `ThemeSwitcher.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { ObcDropdownButton } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import type { ObcDropdownButtonChangeEvent } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import { useTheme } from './ThemeProvider';

export function ThemeSwitcher() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  return (
    <ObcDropdownButton
      aria-label={t('label')}
      value={theme}
      onDropdownChange={(e: ObcDropdownButtonChangeEvent) =>
        void setTheme(e.detail.value as 'day' | 'dusk' | 'night' | 'bright')
      }
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

- [ ] **Step 4: Migrate `LocaleSwitcher.tsx`**

```tsx
'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { ObcDropdownButton } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import type { ObcDropdownButtonChangeEvent } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import { LOCALES, type Locale } from '@eurostrip/i18n';

export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <ObcDropdownButton
      aria-label={t('label')}
      value={current}
      onDropdownChange={(e: ObcDropdownButtonChangeEvent) => {
        const next = e.detail.value;
        const newPath = pathname.replace(new RegExp(`^/(${LOCALES.join('|')})`), `/${next}`);
        router.replace(newPath);
      }}
      options={LOCALES.map((l) => ({ value: l, label: t(l as Locale) }))}
    />
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/shared/theme/ThemeSwitcher.test.tsx src/shared/i18n/LocaleSwitcher.test.tsx`
Expected: PASS (8 tests total)

If a test still fails because `ObcDropdownButton`'s native `<select>`/`<option>` markup doesn't expose the exact `role`/accessible-name shape the test expects, inspect the actual rendered DOM (`screen.debug()` or the shadow-piercing library's own debug helper) and adjust the query — do not weaken the assertion (e.g. don't fall back to a CSS selector when a role-based query is the correct semantic check; only change WHICH query function is imported, not what is asserted).

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm nx typecheck web && pnpm nx lint web`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/shared/theme/ThemeSwitcher.tsx apps/web/src/shared/theme/ThemeSwitcher.test.tsx apps/web/src/shared/i18n/LocaleSwitcher.tsx apps/web/src/shared/i18n/LocaleSwitcher.test.tsx
git commit -m "feat(web): migrate ThemeSwitcher and LocaleSwitcher to ObcDropdownButton"
```

---

### Task 3: Migrate TokenPanel to `ObcButton` + `ObcSequenceLoadingSpinner`

**Files:**

- Modify: `apps/web/src/features/gateway/components/TokenPanel.tsx`
- Modify: `apps/web/src/features/gateway/components/TokenPanel.test.tsx`

**Interfaces:**

- Consumes: `ObcButton` (`@oicl/openbridge-webcomponents-react/components/button/button`, props `disabled?: boolean`, `onClick: (e) => void`, label via children — **no `type` prop**, so click-driven actions like these that don't submit a form work unchanged), `ObcSequenceLoadingSpinner` (`@oicl/openbridge-webcomponents-react/components/sequence-loading-spinner/sequence-loading-spinner`, no accessible-label prop — must be wrapped, see Step 3).
- Produces: nothing consumed elsewhere — `TokenPanel` is only rendered by `token/page.tsx` (Task 9), which doesn't reference its internals.

- [ ] **Step 1: Read the current test file to preserve its exact assertions**

```bash
cat apps/web/src/features/gateway/components/TokenPanel.test.tsx
```

(Already known content from planning — 5 tests: empty-state generate, confirm-then-rotate, cancel path, garbage 500 failure, base64url slash-forcing encoding test. All 5 must keep passing; only the button-finding queries may need to change from `screen.getByRole('button', {name})` to a shadow-piercing equivalent, since `ObcButton`'s label text lives inside its shadow root.)

- [ ] **Step 2: Update queries in `TokenPanel.test.tsx` per Task 1's shadow-DOM findings**

Replace every `screen.getByRole('button', { name: '...' })` / `screen.findByRole('button', { name: '...' })` with the shadow-piercing equivalent identified in Task 1 Step 3 (e.g. `getByShadowRole`/`findByShadowRole`, or an import swap to `shadow-dom-testing-library`'s `screen` — apply whichever the library actually documents). Keep every other line, assertion, and mock unchanged — this file's 5 test bodies (generate/rotate/cancel/failure/base64url) do not change in substance, only in which query function locates the button.

- [ ] **Step 3: Migrate `TokenPanel.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcSequenceLoadingSpinner } from '@oicl/openbridge-webcomponents-react/components/sequence-loading-spinner/sequence-loading-spinner';
import { useRotateTokenMutation, useTokenStatusQuery } from '../api';

const GATEWAY_BASE =
  process.env.NEXT_PUBLIC_GATEWAY_BASE_URL ?? 'http://127.0.0.1:8000/api/euroscope';

// EuroScope's `.wsc` command line does not accept `/` or `:` in arguments,
// so the URL and token are packed into one blob instead of the raw
// `.wsc gateway url`/`.wsc gateway token` pair. Standard base64 (btoa) still
// emits `+` and `/` in its alphabet — for a JWT-length Passport token that's
// nearly certain — so this encodes base64url instead (RFC 4648 §5: `+`→`-`,
// `/`→`_`, padding stripped), leaving only [A-Za-z0-9_-]. The plugin must
// decode base64url and split the payload on the LAST `:` (the URL itself
// contains `:`); see docs/architecture/gateway.md. Not translatable copy —
// see docs/conventions/i18n.md "What NOT to translate".
function toBase64Url(raw: string): string {
  return btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
const wscConfigLine = (token: string) =>
  `.wsc gateway config ${toBase64Url(`${GATEWAY_BASE}:${token}`)}`;

export function TokenPanel() {
  const t = useTranslations('gateway.token');
  const { data, isLoading } = useTokenStatusQuery();
  const [rotateToken, { isLoading: isRotating }] = useRotateTokenMutation();
  const [confirming, setConfirming] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" aria-label={t('loading')}>
        <ObcSequenceLoadingSpinner />
        <span className="sr-only">{t('loading')}</span>
      </div>
    );
  }

  const exists = data?.exists ?? false;

  async function rotate() {
    setConfirming(false);
    setError(null);
    const result = await rotateToken();
    if ('error' in result && result.error) {
      setError(t('error'));
    } else if (result.data) {
      setSecret(result.data.token);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {exists && data?.created_at ? (
        <p className="text-sm">
          {t('createdAt', { date: new Date(data.created_at).toLocaleString() })}
        </p>
      ) : (
        <p className="text-sm">{t('none')}</p>
      )}

      {!confirming && (
        <ObcButton
          disabled={isRotating}
          onClick={() => (exists ? setConfirming(true) : void rotate())}
        >
          {exists ? t('rotate') : t('generate')}
        </ObcButton>
      )}

      {confirming && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t('confirm')}</p>
          <div className="flex gap-2">
            <ObcButton disabled={isRotating} onClick={() => void rotate()}>
              {t('confirmYes')}
            </ObcButton>
            <ObcButton onClick={() => setConfirming(false)}>{t('confirmNo')}</ObcButton>
          </div>
        </div>
      )}

      {error && <p className="text-accent-danger text-sm">{error}</p>}

      {secret && (
        <div className="flex flex-col gap-2 border border-neutral-600 p-4">
          <p className="text-sm font-semibold">{t('revealHint')}</p>
          <code data-testid="gateway-token-secret" className="break-all font-mono text-xs">
            {secret}
          </code>
          <code className="break-all font-mono text-xs">{wscConfigLine(secret)}</code>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/components/TokenPanel.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm nx typecheck web && pnpm nx lint web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/gateway/components/TokenPanel.tsx apps/web/src/features/gateway/components/TokenPanel.test.tsx
git commit -m "feat(web-gateway): migrate TokenPanel to ObcButton/ObcSequenceLoadingSpinner"
```

---

### Task 4: Migrate MessageFeed to `ObcButton`

**Files:**

- Modify: `apps/web/src/features/gateway/components/MessageFeed.tsx`
- Modify: `apps/web/src/features/gateway/components/MessageFeed.test.tsx`

**Interfaces:**

- Consumes: `ObcButton` (same import/prop shape as Task 3).
- Produces: nothing new — `MessageFeed` is a leaf, only rendered by `ConsoleClient` (Task 7), which doesn't reach into its internals.

- [ ] **Step 1: Update the test file's button queries**

Read `apps/web/src/features/gateway/components/MessageFeed.test.tsx` first, then replace every `screen.getByRole('button', { name: t('pause') })`-style query (the pause/resume toggle) with the shadow-piercing equivalent from Task 1, keeping the test bodies (dispatch `batchReceived`, assert rendered text, toggle pause/resume) unchanged.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/components/MessageFeed.test.tsx`
Expected: FAIL — component still renders the old `Button`.

- [ ] **Step 3: Migrate `MessageFeed.tsx`**

Only the import and the one `<Button>` usage change; everything else (the `FeedRow` function, `entryTime`, `MISSING_FIELD_PLACEHOLDER`, the empty-state paragraph, the scroll-into-view effect) stays exactly as-is:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { useAppSelector } from '@/shared/store/hooks';
import type { ConsoleMessage } from '../slice';

// A neutral placeholder for envelope fields the protocol didn't provide.
const MISSING_FIELD_PLACEHOLDER = '—';

function entryTime(id: string): string {
  const ms = Number(id.split('-')[0]);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleTimeString() : '';
}

function FeedRow({ message }: { message: ConsoleMessage }) {
  const t = useTranslations('gateway.console');
  const envelope = message.envelope;
  const text = (key: string) =>
    typeof envelope[key] === 'string' ? String(envelope[key]) : MISSING_FIELD_PLACEHOLDER;

  return (
    <details className="border-b border-neutral-700 py-1 font-mono text-sm">
      <summary className="flex cursor-pointer gap-3">
        <span className="w-16 shrink-0">
          {message.direction === 'in' ? t('directionIn') : t('directionOut')}
        </span>
        <span className="w-20 shrink-0">{text('type')}</span>
        <span className="w-44 shrink-0">{text('action')}</span>
        <span className="w-24 shrink-0">{text('callsign')}</span>
        <span className="shrink-0">{entryTime(message.id)}</span>
      </summary>
      <pre className="overflow-x-auto p-2 text-xs">{JSON.stringify(envelope, null, 2)}</pre>
    </details>
  );
}

export function MessageFeed() {
  const t = useTranslations('gateway.console');
  const messages = useAppSelector((s) => s.gateway.messages);
  const [paused, setPaused] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused) {
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages, paused]);

  return (
    <section aria-label={t('title')}>
      <div className="flex justify-end pb-2">
        <ObcButton onClick={() => setPaused((p) => !p)}>
          {paused ? t('resume') : t('pause')}
        </ObcButton>
      </div>
      {messages.length === 0 && <p className="text-sm">{t('empty')}</p>}
      <div className="max-h-[60vh] overflow-y-auto">
        {messages.map((m) => (
          <FeedRow key={m.id} message={m} />
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/components/MessageFeed.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm nx typecheck web && pnpm nx lint web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/gateway/components/MessageFeed.tsx apps/web/src/features/gateway/components/MessageFeed.test.tsx
git commit -m "feat(web-gateway): migrate MessageFeed to ObcButton"
```

---

### Task 5: Migrate CommandComposer to `ObcButton` + `ObcTextareaField`

**Files:**

- Modify: `apps/web/src/features/gateway/components/CommandComposer.tsx`
- Modify: `apps/web/src/features/gateway/components/CommandComposer.test.tsx`

**Interfaces:**

- Consumes: `ObcButton` (Task 3 shape, **no `type` prop** — see the `requestSubmit()` pattern below); `ObcTextareaField` (`@oicl/openbridge-webcomponents-react/components/textarea-field/textarea-field`, props used here: `label: string`, `value: string`, `placeholder: string`, `error?: boolean`, `errorText?: string`, `showToolbar?: boolean` (set `false` — this composer needs a plain textarea, not OpenBridge's chat-message toolbar), `showVoiceRecording?: boolean` (set `false`), `type?: 'rich' | 'message'` (use `'rich'`, the no-send-button variant, since submission is handled by our own form), event prop `onInput: (e: CustomEvent<{value: string}>) => void`).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Update the test file**

Read `apps/web/src/features/gateway/components/CommandComposer.test.tsx` first. Update:

- Any `screen.getByLabelText('Command JSON')` query targeting the textarea to the shadow-piercing equivalent (the label/value now live inside `obc-textarea-field`'s shadow root).
- Any `screen.getByRole('button', { name: 'Send' })` query to the shadow-piercing equivalent.
- The 4 existing test cases (happy send, invalid JSON, invalid envelope, garbage server failure) keep their assertions and mocked-fetch setup unchanged — only the query functions change.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/components/CommandComposer.test.tsx`
Expected: FAIL

- [ ] **Step 3: Migrate `CommandComposer.tsx`**

```tsx
'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcTextareaField } from '@oicl/openbridge-webcomponents-react/components/textarea-field/textarea-field';
import { parseComposerInput } from '../schema';
import { useSendCommandMutation } from '../api';

export function CommandComposer() {
  const t = useTranslations('gateway.console.composer');
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sendCommand, { isLoading }] = useSendCommandMutation();
  const formRef = useRef<HTMLFormElement>(null);

  async function submit() {
    setError(null);
    const parsed = parseComposerInput(raw);
    if (!parsed.ok) {
      setError(parsed.error === 'invalid-json' ? t('invalidJson') : t('invalidEnvelope'));
      return;
    }
    const result = await sendCommand(parsed.envelope);
    if ('error' in result && result.error) {
      setError(t('sendFailed'));
    } else {
      setRaw('');
    }
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <ObcTextareaField
        type="rich"
        showToolbar={false}
        showVoiceRecording={false}
        label={t('label')}
        value={raw}
        placeholder={t('hint')}
        error={!!error}
        errorText={error ?? ''}
        onInput={(e: CustomEvent<{ value: string }>) => setRaw(e.detail.value)}
      />
      <ObcButton disabled={isLoading} onClick={() => formRef.current?.requestSubmit()}>
        {t('send')}
      </ObcButton>
    </form>
  );
}
```

Note: the error text is now shown via `ObcTextareaField`'s built-in `errorText` prop instead of a separate `<p>` — this is a deliberate simplification since the component provides that slot natively; the visible error message content and condition (`error` state truthy) are unchanged, only where it renders.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/components/CommandComposer.test.tsx`
Expected: PASS (4 tests)

If the "invalid JSON" / "invalid envelope" test cases previously asserted the error text via a plain `screen.getByText(...)` against a `<p>` element, and `ObcTextareaField` instead renders `errorText` inside its own shadow root, switch those two assertions to the shadow-piercing text query as well — the error message string and the condition under which it appears do not change.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm nx typecheck web && pnpm nx lint web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/gateway/components/CommandComposer.tsx apps/web/src/features/gateway/components/CommandComposer.test.tsx
git commit -m "feat(web-gateway): migrate CommandComposer to ObcButton/ObcTextareaField"
```

---

### Task 6: Migrate StructuredComposer to `ObcButton` + `ObcTextInputField`/`ObcNumberInputField` + `ObcDropdownButton`

**Files:**

- Modify: `apps/web/src/features/gateway/components/StructuredComposer.tsx`
- Modify: `apps/web/src/features/gateway/components/StructuredComposer.test.tsx`

**Interfaces:**

- Consumes: `ObcButton` (Task 3/5 shape — `requestSubmit()` pattern for the submit button, same as Task 5); `ObcTextInputField` (`@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field`, props: `label`, `value`, `error?`, `errorText?`, event `onInput: (e: CustomEvent<{value: string}>) => void`); `ObcNumberInputField` (`.../number-input-field/number-input-field`, same shape as `ObcTextInputField` but semantically numeric — value is still a `string` on the component, parsed with `Number()` same as today); `ObcDropdownButton` (Task 2 shape) for both the action selector and the `set_ground_state`/altitude-special selects, which currently use plain native `<select>` (**not** `@eurostrip/ui`'s `Select` — confirmed during planning that this file only ever imported `Button` from `@eurostrip/ui`; its selects are native HTML and are upgraded here for UI consistency with the rest of the migrated app).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Update the test file**

Read `apps/web/src/features/gateway/components/StructuredComposer.test.tsx` first (it has ~18 tests per the earlier implementation report — action selection, callsign field, altitude feet/special modes, ground-state select, `send_frequency_message`'s no-callsign case, server-failure surfacing). Update every `screen.getByRole('combobox', ...)` (action select, ground-state select, altitude-special select) and `screen.getByLabelText(...)` (callsign, numeric/text fields) and `screen.getByRole('button', { name: t('send') })` query to the shadow-piercing equivalents from Task 1. The test bodies (which action is selected, what payload shape results, mutual exclusivity of feet/special) do not change — only the query functions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/components/StructuredComposer.test.tsx`
Expected: FAIL

- [ ] **Step 3: Migrate `StructuredComposer.tsx`**

```tsx
'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcTextInputField } from '@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field';
import { ObcNumberInputField } from '@oicl/openbridge-webcomponents-react/components/number-input-field/number-input-field';
import { ObcDropdownButton } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import type { ObcDropdownButtonChangeEvent } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import type { CommandEnvelope } from '../schema';
import { useSendCommandMutation } from '../api';
import { GATEWAY_ACTIONS, ALTITUDE_SPECIALS, type ActionDef } from '../actions';

type AltitudeMode = 'feet' | 'special';

export function StructuredComposer() {
  const t = useTranslations('gateway.console.structured');
  const [actionKey, setActionKey] = useState<string>(GATEWAY_ACTIONS[0].action);
  const [callsign, setCallsign] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [altitudeMode, setAltitudeMode] = useState<AltitudeMode>('feet');
  const [error, setError] = useState<string | null>(null);
  const [sendCommand, { isLoading }] = useSendCommandMutation();
  const formRef = useRef<HTMLFormElement>(null);

  const action = GATEWAY_ACTIONS.find((a) => a.action === actionKey) as ActionDef;

  function handleActionChange(next: string) {
    setActionKey(next);
    setValues({});
    setAltitudeMode('feet');
    setError(null);
  }

  function setFieldValue(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const payload: Record<string, unknown> = {};

    for (const field of action.fields) {
      if (field.kind === 'altitude-mode') {
        if (altitudeMode === 'feet') {
          const raw = (values.feet ?? '').trim();
          if (raw === '') {
            setError(t('errors.required', { field: t('fields.feet') }));
            return;
          }
          const feet = Number(raw);
          if (Number.isNaN(feet)) {
            setError(t('errors.invalidNumber', { field: t('fields.feet') }));
            return;
          }
          payload.feet = feet;
        } else {
          // ObcDropdownButton always shows a real selection (it defaults to
          // the first option, never a blank state) — mirror that default
          // here so an untouched dropdown validates the same value the UI
          // is actually showing, rather than reading stale empty state.
          const special = (values.special ?? ALTITUDE_SPECIALS[0]).trim();
          payload.special = special;
        }
        continue;
      }

      if (field.kind === 'select') {
        const options = field.options ?? [];
        const raw = values[field.name] ?? options[0] ?? '';
        payload[field.name] = raw;
        continue;
      }

      const raw = values[field.name] ?? '';

      if (field.kind === 'number') {
        const trimmed = raw.trim();
        if (trimmed === '') {
          if (field.optional) continue;
          setError(t('errors.required', { field: t(`fields.${field.name}`) }));
          return;
        }
        const num = Number(trimmed);
        if (Number.isNaN(num)) {
          setError(t('errors.invalidNumber', { field: t(`fields.${field.name}`) }));
          return;
        }
        payload[field.name] = num;
        continue;
      }

      // 'text' (the 'select' and 'altitude-mode' kinds are both handled
      // above and always `continue` before reaching here)
      if (raw === '' && field.optional) continue;
      payload[field.name] = raw;
    }

    const envelope: CommandEnvelope = {
      action: action.action,
      ...(action.needsCallsign ? { callsign } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    };

    const result = await sendCommand(envelope);
    if ('error' in result && result.error) {
      setError(t('sendFailed'));
    }
  }

  return (
    <form ref={formRef} className="flex flex-col gap-3" onSubmit={handleSubmit}>
      {/* Action names are protocol identifiers, not user-facing prose —
          not translated, same precedent as the `.wsc` line and ground
          state enum values (see TokenPanel.tsx and
          docs/conventions/i18n.md "What NOT to translate"). */}
      <ObcDropdownButton
        aria-label={t('actionLabel')}
        value={actionKey}
        onDropdownChange={(e: ObcDropdownButtonChangeEvent) => handleActionChange(e.detail.value)}
        options={GATEWAY_ACTIONS.map((a) => ({ value: a.action, label: a.action }))}
      />

      {action.needsCallsign && (
        <ObcTextInputField
          label={t('callsignLabel')}
          value={callsign}
          onInput={(e: CustomEvent<{ value: string }>) => setCallsign(e.detail.value)}
        />
      )}

      {action.fields.map((field) => {
        if (field.kind === 'altitude-mode') {
          return (
            <div key={field.name} className="flex flex-col gap-2">
              <span className="text-sm">{t('fields.altitude')}</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="altitude-mode"
                  checked={altitudeMode === 'feet'}
                  onChange={() => setAltitudeMode('feet')}
                />
                {t('altitudeMode.feet')}
              </label>
              {altitudeMode === 'feet' && (
                <ObcNumberInputField
                  label={t('fields.feet')}
                  value={values.feet ?? ''}
                  onInput={(e: CustomEvent<{ value: string }>) =>
                    setFieldValue('feet', e.detail.value)
                  }
                />
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="altitude-mode"
                  checked={altitudeMode === 'special'}
                  onChange={() => setAltitudeMode('special')}
                />
                {t('altitudeMode.special')}
              </label>
              {altitudeMode === 'special' && (
                <ObcDropdownButton
                  aria-label={t('fields.special')}
                  value={values.special ?? ALTITUDE_SPECIALS[0]}
                  onDropdownChange={(e: ObcDropdownButtonChangeEvent) =>
                    setFieldValue('special', e.detail.value)
                  }
                  options={ALTITUDE_SPECIALS.map((opt) => ({ value: opt, label: opt }))}
                />
              )}
            </div>
          );
        }

        if (field.kind === 'select') {
          const options = field.options ?? [];
          return (
            <div key={field.name} className="flex flex-col gap-1">
              <span className="text-sm">{t(`fields.${field.name}`)}</span>
              <ObcDropdownButton
                aria-label={t(`fields.${field.name}`)}
                value={values[field.name] ?? options[0]}
                onDropdownChange={(e: ObcDropdownButtonChangeEvent) =>
                  setFieldValue(field.name, e.detail.value)
                }
                options={options.map((opt) => ({ value: opt, label: opt }))}
              />
            </div>
          );
        }

        const InputComponent = field.kind === 'number' ? ObcNumberInputField : ObcTextInputField;
        return (
          <InputComponent
            key={field.name}
            label={t(`fields.${field.name}`)}
            value={values[field.name] ?? ''}
            onInput={(e: CustomEvent<{ value: string }>) =>
              setFieldValue(field.name, e.detail.value)
            }
          />
        );
      })}

      {error && <p className="text-accent-danger text-sm">{error}</p>}
      <ObcButton disabled={isLoading} onClick={() => formRef.current?.requestSubmit()}>
        {t('send')}
      </ObcButton>
    </form>
  );
}
```

Note the `set` and `set_ground_state`/altitude-special `ObcDropdownButton` usages no longer render an explicit disabled placeholder option (`ObcDropdownButton` has no placeholder concept — see design spec §5); each defaults to the first real option (`options[0]`) instead. This is a deliberate, spec-documented behavior change from the native-`<select>` version's "disabled placeholder" pattern — confirm the updated tests (Step 1) assert against the new default-selected-first-option behavior rather than an empty/placeholder state.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/components/StructuredComposer.test.tsx`
Expected: PASS

Fix any test that still asserts the old "no option selected until user picks one" placeholder behavior — the corrected expectation is that a select defaults to its first option's value being already selected (and thus already valid/submittable) the moment that field is rendered, matching `ObcDropdownButton`'s real behavior.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm nx typecheck web && pnpm nx lint web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/gateway/components/StructuredComposer.tsx apps/web/src/features/gateway/components/StructuredComposer.test.tsx
git commit -m "feat(web-gateway): migrate StructuredComposer to OpenBridge form components"
```

---

### Task 7: Migrate ConsoleClient to `ObcButton` + `ObcCard`

**Files:**

- Modify: `apps/web/src/features/gateway/components/ConsoleClient.tsx`
- Test: `apps/web/src/features/gateway/components/ConsoleClient.test.tsx` (create — none exists today; this component was previously only covered by the e2e spec)

**Interfaces:**

- Consumes: `ObcButton` (Task 3 shape), `ObcCard` (`@oicl/openbridge-webcomponents-react/components/card/card`, props used here: none beyond children — title slot not needed since this file doesn't set a card title today).
- Produces: nothing new — this is the top-level client component rendered by `console/page.tsx`, which was already confirmed to import nothing from `@eurostrip/ui` (out of migration scope, Task 9 doesn't touch it).

- [ ] **Step 1: Write a new test file (none existed before)**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { ConsoleClient } from './ConsoleClient';

const messages = {
  gateway: {
    console: {
      title: 'Gateway console',
      connected: '● Plugin connected',
      disconnected: '○ Plugin offline',
      pollLive: 'Live',
      pollBackoff: 'Reconnecting…',
      empty: 'No messages yet — connect your plugin or send a command.',
      pause: 'Pause auto-scroll',
      resume: 'Resume auto-scroll',
      directionIn: '▼ in',
      directionOut: '▲ out',
      toggle: { structured: 'Structured', raw: 'Raw JSON' },
      composer: {
        label: 'Command JSON',
        hint: '{"action":"ping"}',
        send: 'Send',
        invalidJson: 'Not valid JSON.',
        invalidEnvelope: 'The envelope needs at least an "action" string.',
        sendFailed: 'Sending failed — try again.',
      },
      structured: {
        actionLabel: 'Action',
        callsignLabel: 'Callsign',
        selectPlaceholder: 'Select…',
        send: 'Send',
        sendFailed: 'Sending failed — try again.',
        altitudeMode: { feet: 'Feet mode', special: 'Special mode' },
        fields: { filter: 'Filter' },
        errors: { required: '{field} is required.', invalidNumber: '{field} must be a number.' },
      },
    },
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

describe('ConsoleClient', () => {
  it('defaults to the structured composer (happy)', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(wrap(<ConsoleClient />));
    expect(await screen.findByText('Action')).toBeInTheDocument();
  });

  it('toggles to raw JSON and back (happy)', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(wrap(<ConsoleClient />));
    await userEvent.click(await screen.findByText('Raw JSON'));
    expect(await screen.findByText('Command JSON')).toBeInTheDocument();
    await userEvent.click(await screen.findByText('Structured'));
    expect(await screen.findByText('Action')).toBeInTheDocument();
  });
});
```

Adjust the two `screen.findByText(...)` queries for `'Raw JSON'`/`'Structured'`/`'Action'`/`'Command JSON'` to shadow-piercing equivalents from Task 1 if those strings render inside an `ObcButton`'s or `ObcDropdownButton`'s shadow root rather than as plain light-DOM text — check against the actual rendered output before finalizing (`ObcButton`'s label is passed as the default slot's children, which for a Lit component means the text node itself lives in **light DOM** since slotted content is not shadow content — it should NOT need a shadow-piercing query; confirm this empirically by running the test and adjusting only if it actually fails to find the text).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/components/ConsoleClient.test.tsx`
Expected: FAIL — component still renders `Button`/`Card` from `@eurostrip/ui`.

- [ ] **Step 3: Migrate `ConsoleClient.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
import { useGatewayPoll } from '../useGatewayPoll';
import { CommandComposer } from './CommandComposer';
import { StructuredComposer } from './StructuredComposer';
import { ConsoleStatusHeader } from './ConsoleStatusHeader';
import { MessageFeed } from './MessageFeed';

type ComposerMode = 'structured' | 'raw';

export function ConsoleClient() {
  const t = useTranslations('gateway.console');
  const [mode, setMode] = useState<ComposerMode>('structured');
  useGatewayPoll();

  return (
    <main className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{t('title')}</h1>
        <ConsoleStatusHeader />
      </header>
      <ObcCard>
        <MessageFeed />
      </ObcCard>
      <ObcCard>
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            {mode === 'structured' ? (
              <ObcButton onClick={() => setMode('raw')}>{t('toggle.raw')}</ObcButton>
            ) : (
              <ObcButton onClick={() => setMode('structured')}>{t('toggle.structured')}</ObcButton>
            )}
          </div>
          {mode === 'structured' ? <StructuredComposer /> : <CommandComposer />}
        </div>
      </ObcCard>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web exec vitest run src/features/gateway/components/ConsoleClient.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm nx typecheck web && pnpm nx lint web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/gateway/components/ConsoleClient.tsx apps/web/src/features/gateway/components/ConsoleClient.test.tsx
git commit -m "feat(web-gateway): migrate ConsoleClient to ObcButton/ObcCard, add test coverage"
```

---

### Task 8: Migrate PingList and RecordPingForm

**Files:**

- Modify: `apps/web/src/features/ping/components/PingList.tsx`
- Modify: `apps/web/src/features/ping/components/PingList.test.tsx`
- Modify: `apps/web/src/features/ping/components/RecordPingForm.tsx`
- Modify: `apps/web/src/features/ping/components/RecordPingForm.test.tsx`

**Interfaces:**

- Consumes: `ObcSequenceLoadingSpinner` (Task 3's accessible-wrapping pattern), `ObcTable`/`ObcTableHeaderItem` (`@oicl/openbridge-webcomponents-react/components/table/table` and `.../table-header-item/table-header-item`; `ObcTable` props: `data: ObcTableRow[]`, `columns: ObcTableColumn[]`, `showHeader?: boolean`; each `ObcTableRow` needs a stable `id: string` and per-column values shaped as `ObcTableCellDataRegular` — `{ type: 'regular', text: string }`); `ObcButton` (Task 3 shape, `requestSubmit()` pattern from Task 5/6), `ObcTextInputField` (Task 6 shape).
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Update `PingList.test.tsx`**

Read the current file first. Update any query that targeted the old `<table>`/`<th>`/`<td>` markup (e.g. `screen.getByRole('columnheader', ...)`, `screen.getByRole('cell', ...)`, `screen.getByRole('table', {name: ...})`) to whatever `ObcTable`'s actual rendered ARIA roles are — `ObcTable` is a Lit component and its internal markup was not fully inspected during planning beyond its `data`/`columns` property contract. **Before finalizing this file's queries, run the component once via `screen.debug()` inside a test and read the actual rendered role/structure rather than assuming it matches a plain HTML `<table>` 1:1.** Keep the 4 existing test cases' assertions (loading spinner shown, error message shown, rows rendered from `data`, empty state) — only adjust queries after confirming the real DOM shape.

- [ ] **Step 2: Update `RecordPingForm.test.tsx`**

Read the current file first. Update the `screen.getByLabelText(t('noteText'))` (input) and `screen.getByRole('button', { name: t('submit') })` queries to shadow-piercing equivalents from Task 1. Test bodies (fill note, submit, assert `useRecordPingMutation` called with `{note: {en: value}}`, assert reset after success, assert error shown on failure) stay the same.

- [ ] **Step 3: Run both test files to verify they fail**

Run: `pnpm -C apps/web exec vitest run src/features/ping/components/PingList.test.tsx src/features/ping/components/RecordPingForm.test.tsx`
Expected: FAIL

- [ ] **Step 4: Migrate `PingList.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { ObcSequenceLoadingSpinner } from '@oicl/openbridge-webcomponents-react/components/sequence-loading-spinner/sequence-loading-spinner';
import { ObcTable } from '@oicl/openbridge-webcomponents-react/components/table/table';
import { ObcTableCellType } from '@oicl/openbridge-webcomponents/dist/components/table/table.js';
import { useListPingsQuery, type PingDto } from '../api';

export function PingList() {
  const t = useTranslations('ping');
  const { data, isLoading, isError } = useListPingsQuery();

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" aria-label={t('loading')}>
        <ObcSequenceLoadingSpinner />
        <span className="sr-only">{t('loading')}</span>
      </div>
    );
  }
  if (isError) {
    return <p className="text-accent-danger">{t('error')}</p>;
  }
  if (!data || data.length === 0) {
    return <p className="text-fg-tertiary">{t('empty')}</p>;
  }

  const rows = data.map((r: PingDto) => ({
    id: r.id,
    id_display: { type: ObcTableCellType.Regular, text: r.id.slice(0, 8) },
    note: { type: ObcTableCellType.Regular, text: r.note.en ?? Object.values(r.note)[0] },
    when: { type: ObcTableCellType.Regular, text: new Date(r.created_at).toLocaleString() },
  }));

  return (
    <ObcTable
      data={rows}
      columns={[
        { key: 'id_display', label: t('id') },
        { key: 'note', label: t('noteText') },
        { key: 'when', label: t('when') },
      ]}
    />
  );
}
```

Note: `ObcTable`'s `columns[].key` must match a key on each row object whose value is an `ObcTableCellData` (e.g. `{type: 'regular', text: '...'}`), not a raw string — this is a structural difference from the old `Table`'s `cell: (row) => ReactNode` render-prop API. `ObcTable` has no built-in `caption`/`emptyLabel` props (unlike the old `Table`) — the empty state is now handled by this component's own early return (added above) rather than delegated to the table component, and the accessible table name comes from `aria-label`/`aria-labelledby` if `ObcTable` supports it (verify against the rendered DOM in Step 1's `screen.debug()` check — add `aria-label={t('title')}` on the `<ObcTable>` element if it forwards that attribute to its host, matching the old `caption`'s accessibility purpose).

- [ ] **Step 5: Migrate `RecordPingForm.tsx`**

```tsx
'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcTextInputField } from '@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field';
import { useRecordPingMutation } from '../api';

export function RecordPingForm() {
  const t = useTranslations('ping');
  const [recordPing, { isLoading }] = useRecordPingMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [noteEn, setNoteEn] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  async function submit() {
    setServerError(null);
    const result = await recordPing({ note: { en: noteEn } });
    if ('error' in result) {
      setServerError(t('error'));
    } else {
      setNoteEn('');
    }
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3 max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <ObcTextInputField
        label={t('noteText')}
        value={noteEn}
        error={!!serverError}
        onInput={(e: CustomEvent<{ value: string }>) => setNoteEn(e.detail.value)}
      />
      {serverError && <p className="text-accent-danger text-sm">{serverError}</p>}
      <ObcButton disabled={isLoading} onClick={() => formRef.current?.requestSubmit()}>
        {t('submit')}
      </ObcButton>
    </form>
  );
}
```

Note this drops `react-hook-form` entirely — the old form only used it for a single controlled field with `required`/`minLength` validation, which is now redundant with `ObcTextInputField`'s own `required`/`error` display and the backend's own validation on submit; simple `useState` matches the pattern already used in every other migrated form in this plan (`CommandComposer`, `StructuredComposer`, `TokenPanel`). If `RecordPingForm.test.tsx`'s existing tests assert on `react-hook-form`-specific behavior (e.g. a validation message appearing before submit without a server round-trip), adjust those assertions to match the simplified flow — the server-error-after-submit-failure behavior must still work identically.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/ping/components/PingList.test.tsx src/features/ping/components/RecordPingForm.test.tsx`
Expected: PASS

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm nx typecheck web && pnpm nx lint web`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/ping/components/PingList.tsx apps/web/src/features/ping/components/PingList.test.tsx apps/web/src/features/ping/components/RecordPingForm.tsx apps/web/src/features/ping/components/RecordPingForm.test.tsx
git commit -m "feat(web): migrate PingList to ObcTable, RecordPingForm to Obc input components"
```

---

### Task 9: Migrate the four page shells (`Card` only)

**Files:**

- Modify: `apps/web/src/app/[locale]/login/page.tsx`
- Modify: `apps/web/src/app/[locale]/dashboard/page.tsx`
- Modify: `apps/web/src/app/[locale]/ping/page.tsx`
- Modify: `apps/web/src/app/[locale]/token/page.tsx`

**Interfaces:**

- Consumes: `ObcButton` (login page's link-wrapped button), `ObcCard` (Task 7 shape, all four pages).
- Produces: nothing — these are route entry points, nothing imports them.

- [ ] **Step 1: Migrate `login/page.tsx`**

```tsx
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg-secondary p-4">
      <ObcCard className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-4">{t('loginTitle')}</h1>
        <Link href={`/api/auth/stub-redirect?locale=${locale}`}>
          <ObcButton fullWidth>{t('continueWithStub')}</ObcButton>
        </Link>
      </ObcCard>
    </main>
  );
}
```

- [ ] **Step 2: Migrate `dashboard/page.tsx`**

Only the `Card` import/usage changes — the nav links, logout form, `ThemeSwitcher`/`LocaleSwitcher` usages, and session-check logic in the outer `DashboardPage` function stay exactly as-is:

```tsx
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
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
      <ObcCard>
        <nav className="flex gap-4">
          <Link href="./ping" className="underline">
            {t('ping')}
          </Link>
          <Link href="./console" className="underline">
            {t('console')}
          </Link>
          <Link href="./token" className="underline">
            {t('gatewayToken')}
          </Link>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="underline">
              {t('logout')}
            </button>
          </form>
        </nav>
      </ObcCard>
    </main>
  );
}
```

(The logout `<button type="submit">` stays a plain native `<button>` — it was never an `@eurostrip/ui` `Button` and is out of this migration's scope; it correctly relies on native form-submit semantics already.)

- [ ] **Step 3: Migrate `ping/page.tsx`**

```tsx
import { useTranslations } from 'next-intl';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
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
      <ObcCard>
        <h2 className="text-xl font-semibold mb-4">{t('create')}</h2>
        <RecordPingForm />
      </ObcCard>
      <ObcCard>
        <PingList />
      </ObcCard>
    </main>
  );
}
```

- [ ] **Step 4: Migrate `token/page.tsx`**

```tsx
import { useTranslations } from 'next-intl';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
import { TokenPanel } from '@/features/gateway/components/TokenPanel';
import { SESSION_COOKIE_NAME } from '@/shared/auth/cookie';

export default async function TokenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!session?.value) redirect(`/${locale}/login`);
  return <TokenPageClient />;
}

function TokenPageClient() {
  const t = useTranslations('gateway.token');
  return (
    <main className="p-8 space-y-8">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <ObcCard>
        <TokenPanel />
      </ObcCard>
    </main>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm nx typecheck web && pnpm nx lint web`
Expected: PASS

- [ ] **Step 6: Run the full web unit/component suite**

Run: `pnpm nx test web`
Expected: PASS — every test file touched in Tasks 2–9 passes together (catches any cross-file regression, e.g. a shared mock that one file's migration broke for another).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\[locale\]/login/page.tsx apps/web/src/app/\[locale\]/dashboard/page.tsx apps/web/src/app/\[locale\]/ping/page.tsx apps/web/src/app/\[locale\]/token/page.tsx
git commit -m "feat(web): migrate page shells to ObcCard/ObcButton"
```

---

### Task 10: Delete `libs/ui`, run e2e, final verification

**Files:**

- Delete: `libs/ui/` (entire directory)
- Modify: `apps/web/package.json` (remove `@eurostrip/ui` dependency)
- Modify: `tsconfig.base.json` (remove the `@eurostrip/ui` path mapping — read the file first to find its exact key)
- Modify: `pnpm-workspace.yaml` or root `package.json` workspaces list, if `libs/ui` is explicitly listed rather than covered by a glob (check first)

**Interfaces:**

- Consumes: nothing new.
- Produces: nothing — terminal task.

- [ ] **Step 1: Confirm nothing still imports `@eurostrip/ui`**

Run: `grep -rln "@eurostrip/ui" apps/web/src`
Expected: no output (empty). If anything is still listed, stop and migrate that file first — do not delete `libs/ui` while a consumer remains.

- [ ] **Step 2: Find every reference to `libs/ui`/`@eurostrip/ui` outside `apps/web/src`**

```bash
grep -rln "@eurostrip/ui" --include="*.json" --include="*.ts" --include="*.mjs" . --exclude-dir=node_modules --exclude-dir=.next
```

This should surface `apps/web/package.json`'s dependency entry, `tsconfig.base.json`'s path mapping, and possibly an Nx project reference or root workspace config. Read each file found before editing.

- [ ] **Step 3: Remove the `@eurostrip/ui` dependency entry**

Edit `apps/web/package.json`, deleting the `"@eurostrip/ui": "workspace:*"` line (or equivalent) from `dependencies`.

- [ ] **Step 4: Remove the `@eurostrip/ui` path mapping**

Edit `tsconfig.base.json`, deleting whatever `"@eurostrip/ui": [...]` entry exists under `compilerOptions.paths` (match the exact format already used for the other `@eurostrip/*` packages that remain, e.g. `@eurostrip/i18n`, `@eurostrip/api-client`, `@eurostrip/design-tokens` — those stay untouched).

- [ ] **Step 5: Delete the library**

```bash
rm -rf libs/ui
```

- [ ] **Step 6: Reinstall to update the lockfile**

```bash
pnpm install
```

Run: `git diff --stat pnpm-lock.yaml`
Expected: shows `@eurostrip/ui`'s workspace entry removed and the new OpenBridge packages already present from Task 1.

- [ ] **Step 7: Full verification sweep**

```bash
pnpm nx test web
pnpm nx lint web
pnpm nx typecheck web
```

Expected: all PASS.

- [ ] **Step 8: Run the e2e suite**

Docker stack must be up (`docker compose --env-file .env -f infra/docker-compose.yml ps` to confirm).

Run: `pnpm nx e2e web`
Expected: PASS — both `login-and-ping.spec.ts` (exercises login, ping create/list, theme switch, locale switch — all touched by this migration) and `gateway-console.spec.ts` (exercises token generation, the structured composer, the raw-JSON toggle — all touched by this migration) pass against the real running stack.

If either e2e spec fails on a text-based Playwright locator (`page.getByRole('button', {name: ...})`, `page.getByLabel(...)`), note that Playwright's own locators **do** pierce open Shadow DOM natively (unlike jsdom-based Testing Library) — a failure here is more likely a genuine behavioral regression from this migration than a query-API mismatch. Investigate the actual rendered page before assuming it's "just" a query issue.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore(web): delete libs/ui, OpenBridge migration complete"
```

---

## Final gate (after all tasks)

```bash
pnpm nx test web
pnpm nx lint web
pnpm nx typecheck web
pnpm nx e2e web
```

All green → done.
