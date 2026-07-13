# OpenBridge UI Migration — Design

**Date:** 2026-07-11
**Status:** Approved
**Scope:** Replace the custom `@eurostrip/ui` design system with OpenBridge
(`@oicl/openbridge-webcomponents` + `@oicl/openbridge-webcomponents-react`)
across the entire `apps/web` frontend.

## 1. Purpose

EuroStrip's frontend currently uses a small hand-built component library at
`libs/ui/` (Button, Input, Select, Card, Table, Modal, Toast, Spinner),
consumed by 13 files across login, dashboard, ping, theme/locale switching,
and the gateway token/console pages. OpenBridge
([storybook](https://openbridge-jip-storybook.web.app),
[GitHub](https://github.com/Ocean-Industries-Concept-Lab/openbridge-webcomponents))
is a maritime/industrial-bridge design system — squared, high-contrast,
day/dusk/night/bright themed — that matches this project's existing
"Squared UI" house rule and, notably, already uses the exact four theme
names (`day`, `dusk`, `night`, `bright`) this app's `ThemeProvider` already
implements.

This migration replaces `libs/ui` wholesale with direct OpenBridge component
usage at every call site, then deletes `libs/ui`.

## 2. Licensing (accepted risk, recorded for the record)

OpenBridge v1.0.0 (released April 2026) uses a **time-delayed copyleft**
license: each release is **AGPL-3.0** for its first 6 months, then
automatically converts to **Apache 2.0**. v1.0.0 is AGPL until
approximately **October 2026**; project donors get immediate Apache 2.0
access. The team has decided to proceed under AGPL now. This is a decision
worth revisiting — either by pinning to the Apache-2.0-converted version
once available (~Oct 2026) or by donor access — but is out of scope for
this migration's implementation work.

## 3. Component mapping

| `@eurostrip/ui` export    | OpenBridge replacement                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                  | `ObcButton`                                              | Direct.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Input`                   | `ObcTextInputField` / `ObcNumberInputField`              | Numeric fields (StructuredComposer's altitude/heading/etc.) use the number variant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Card`                    | `ObcCard`                                                | Direct.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Table`                   | `ObcTable` + `ObcTableHeaderItem`                        | Direct.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Modal`                   | **Dropped, not migrated**                                | Confirmed zero call sites (`grep -rn "Modal\b" apps/web/src` outside tests returns nothing) — dead code today, same as Toast. `ObcModalWindow` exists if a real need arises later.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Spinner`                 | `ObcSequenceLoadingSpinner`                              | Direct component, but it has **no accessible-label prop** (unlike our `Spinner`, which requires `label`) — every call site must wrap it with the same `role="status" aria-live="polite" aria-label={label}` pattern our current `Spinner` uses internally, since OpenBridge doesn't provide that itself.                                                                                                                                                                                                                                                                                                         |
| `Select`                  | `ObcDropdownButton` **directly** — no composition needed | Corrected during implementation research: `ObcDropdownButton` already _is_ a complete single-select (`options: {value,label}[]`, `value`, `disabled`, `fullWidth`, fires `dropdown-change`/`change` with `{value,label}`). `ObcCommandMenu` (originally proposed for this slot) is unrelated — it's a bridge command-handover toggle ("in command" / "no command"), not a dropdown, and is not used anywhere in this migration. §5 below covers the thin prop-shape wrapper needed only because our current call sites pass `onValueChange: (value: string) => void`, not the raw `dropdown-change` CustomEvent. |
| `Toast` / `ToastProvider` | **Dropped, not migrated**                                | Confirmed zero call sites and not mounted in any layout — dead code today. If a real need arises later, `ObcNotificationFloatingItem` is the closest primitive; out of scope here.                                                                                                                                                                                                                                                                                                                                                                                                                               |

`libs/design-tokens` and the existing Tailwind config are **not** touched by
this migration — they continue to cover page layout, spacing, and the
handful of semantic utility classes (e.g. `text-accent-danger` on inline
error text) that live outside any OpenBridge component's own styling.

## 4. Setup

- Add `@oicl/openbridge-webcomponents` and
  `@oicl/openbridge-webcomponents-react` as dependencies of `apps/web`
  (Node 22, already satisfies the library's v20+ requirement).
- Import `@oicl/openbridge-webcomponents/dist/openbridge.css` once, in
  `apps/web/src/app/layout.tsx`.
- Ensure **Noto Sans** is available (OpenBridge's stated font requirement)
  — add via `next/font` or a `<link>`, matching however the app currently
  loads its base font (check `apps/web/src/app/layout.tsx` /
  `globals.css` first; follow the existing pattern rather than introducing
  a second font-loading mechanism).
- Theme wiring: `apps/web/src/shared/theme/set-theme-pre-paint.ts` and
  `ThemeProvider` already drive `document.documentElement.dataset.theme`
  with exactly `day`/`dusk`/`night`/`bright`. Add `data-obc-theme` as a
  second attribute set to the same value at the same two call sites (the
  pre-paint script and wherever `ThemeProvider` applies the theme on
  change) — OpenBridge's CSS keys off `data-obc-theme` specifically, our
  own CSS keys off `data-theme`; both stay in sync from one source of
  truth (the `theme` state), no new state needed.

## 5. `ObcDropdownButton` usage (no wrapper component)

No shared Select component is needed — `ObcDropdownButton` is used directly
at all 4 call sites (Theme switcher, Locale switcher, StructuredComposer's
action select, its ground-state select). Each call site adapts our existing
`(value: string) => void` callback shape to the component's
`onChange={(e: ObcDropdownButtonChangeEvent) => onValueChange(e.detail.value)}`
event shape inline — this is a one-line adapter per call site, not enough
duplication to justify a shared wrapper (YAGNI). `ObcDropdownButton` has no
`placeholder` prop; when no `value` is set it defaults to showing the first
option's label, so callers needing placeholder-like behavior prepend a
placeholder entry to their `options` array or rely on always having a
sensible default `value` (verify per call site during implementation —
the 4 current callers all have a natural default value already, e.g.
`theme` defaults to `'day'`).

## 6. Testing — Shadow DOM

OpenBridge ships Lit web components; every one renders into an **open
Shadow DOM**. Standard `@testing-library/react` queries (`getByRole`,
`getByLabelText`, etc.) only search light DOM and will not find content
inside a shadow root.

- Add `shadow-dom-testing-library` as a dev dependency of `apps/web`;
  it extends Testing Library's query set with shadow-root-piercing
  variants.
- Update `apps/web/tests/setup.ts` to register/import it per its documented
  setup (verify the package's own setup instructions at implementation
  time — do not guess the API).
- Every one of the ~13 migrated files' existing test suites gets
  re-verified against real rendered output as part of that file's
  migration task, not assumed to keep passing unchanged. Some queries may
  keep working if OpenBridge forwards `role`/`aria-*` attributes to the
  host element (common Lit pattern); others need the shadow-piercing
  query variants.

## 7. Rollout order

Bottom-up, so nothing is left importing a component that doesn't exist yet:

1. Install packages, wire CSS + font + `data-obc-theme`, add
   `shadow-dom-testing-library`.
2. Migrate the 4 `ObcDropdownButton` consumers: `ThemeSwitcher.tsx`,
   `LocaleSwitcher.tsx`, and the two selects inside
   `StructuredComposer.tsx`.
3. Migrate the remaining gateway feature files (leaf components first,
   inward-out): `MessageFeed.tsx`, `CommandComposer.tsx`,
   `ConsoleClient.tsx`, `TokenPanel.tsx`.
4. Migrate `PingList.tsx`, `RecordPingForm.tsx`.
5. Migrate the four page shells: `login/page.tsx`, `dashboard/page.tsx`,
   `ping/page.tsx`, `token/page.tsx` (console page renders
   `ConsoleClient`, already covered in step 3).
6. Confirm no remaining `@eurostrip/ui` imports (`grep -rl "@eurostrip/ui"
apps/web/src`), delete `libs/ui/` and its `@eurostrip/ui` workspace
   reference from `apps/web/package.json` and `tsconfig.base.json`'s path
   mapping (or wherever the workspace alias is declared — verify at
   implementation time).
7. Re-run the full web suite, lint, typecheck, and the e2e suite
   (`login-and-ping.spec.ts` and `gateway-console.spec.ts`) — both exercise
   UI this migration touches end to end.

## 8. Out of scope

- Any change to `libs/design-tokens` or the Tailwind config.
- Reintroducing a Toast/notification pattern (dropped, unused).
- Revisiting the AGPL licensing decision (§2) — recorded, not resolved,
  here.
- Backend changes — this is a frontend-only migration.
