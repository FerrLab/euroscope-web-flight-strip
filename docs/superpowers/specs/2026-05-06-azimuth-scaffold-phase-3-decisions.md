# Azimuth — Phase 3 Scope-Validation & Decision Log

**Date:** 2026-05-06
**Status:** Approved (pending written-spec review)
**Author:** Brainstormed with Kewyn Ferreira
**Parent spec:** `docs/superpowers/specs/2026-05-02-azimuth-scaffold-design.md` §13.3
**Predecessor decision log:** `docs/superpowers/specs/2026-05-05-azimuth-scaffold-phase-2-decisions.md`

---

## 1. Purpose

This is a **delta document**, not a fresh design. The original scaffold spec already covers Phase 3 in §13.3; this addendum:

1. Confirms Phase 3 scope holds with one reinterpretation (themes are Openbridge's 4 native modes, not the spec's loose "light/dark/HC").
2. Locks the eight decisions surfaced during the brainstorming pass.
3. Pins the canonical frontend module shape (`features/ping`) so the implementation plan can reference it without re-deriving it from §6.

Implementation plan-writing must consume **both** documents: §13.3 for scope, this file for decisions.

---

## 2. Confirmed scope

Phase 3 §13.3 stands as-is with one reinterpretation:

- **Theme palette reinterpreted:** spec said "light/dark/HC palettes from Openbridge"; Openbridge's actual native palette is **day / dusk / night / bright** (4 modes — the maritime norm). These map directly to GA cockpit conditions and replace the spec's loose 3-mode listing. CSS vars switch via `data-theme="day|dusk|night|bright"` on `<html>` per the existing plan.
- All other deliverables remain in scope: `libs/{design-tokens,ui,api-client,i18n}`; Next.js 15 App Router with `[locale]` segment; Redux Toolkit + RTK Query with cookie-aware auth; auth flow `/login` → "Continue with Stub" → backend Socialite-stub → cookie-set Next.js route handler → `/dashboard`; `features/ping` mirroring backend Ping module; ESLint `react/jsx-no-literals` on user-facing JSX; Playwright E2E covering login → dashboard → create ping → list → theme switch → locale switch; CI extended with `test-frontend` and `e2e` jobs; `docs/architecture/frontend.md` + ADR 0006.

---

## 3. Decision log

| #   | Decision                    | Locked choice                                                                                                                                                                                                       | Rationale                                                                                                                                                    |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Branch strategy             | **Phase 2 PR #1 merged** (commit `99bac88`); Phase 3 branches off updated `main`                                                                                                                                    | Clean history; no rebase complexity; Phase 2 code immediately available                                                                                      |
| 2   | "Openbridge" interpretation | **Real Konsberg/MMC design system** (Ocean Industries Concept Lab, Apache 2.0 after a 6-month AGPL window). Adopt tokens + icons; build React primitives styled with Openbridge tokens                              | Web components in React carry friction (events, refs, SSR); tokens are the high-leverage adoption that's framework-agnostic                                  |
| 3   | Theme palette               | **Day / Dusk / Night / Bright** (Openbridge native, 4 modes); replaces spec's loose "light/dark/HC" listing                                                                                                         | Maps directly to GA cockpit conditions; Openbridge already designed and tuned for these 4 lighting environments                                              |
| 4   | Component library approach  | **Build in-house** in `libs/ui`, styled with Openbridge tokens. **Radix Primitives** for headless behavior on Modal/Select/Toast (focus traps, keyboard nav, ARIA). Plain HTML+styles for Button/Input/Card/Spinner | shadcn/ui or Mantine would fight Openbridge's design language; Radix is headless so it composes cleanly without imposing visual style                        |
| 5   | OpenAPI → RTK Query codegen | **`@rtk-query/codegen-openapi`** (official)                                                                                                                                                                         | Canonical RTK Query path; turns Phase 2's `openapi.json` into typed `injectedEndpoints` automatically; no hand-written endpoint boilerplate                  |
| 6   | Auth token transport        | **httpOnly cookie + full Next.js proxy.** Bearer token never reaches browser JS; RTK Query talks to `/api/*` on Next.js origin; Next.js route handlers forward to backend with the Bearer header                    | Most secure (XSS cannot exfiltrate the token); avoids CORS dance; future-proof for SSR-of-authed-pages in Phase 4+. ~5 ms Next.js hop per call is negligible |
| 7   | Form library                | **React Hook Form + Zod**                                                                                                                                                                                           | Dominant React form pattern; Zod schemas double-duty for form validation + RTK Query payload typing; team familiarity                                        |
| 8   | Component test runner       | **Vitest**                                                                                                                                                                                                          | Vite-native, fast cold start, first-class Next.js 15 support, Jest-compatible API; aligns with Pest 4's parallel/terse ethos on the backend                  |

---

## 4. Canonical frontend module shape (Ping, as the template every future feature copies)

```text
apps/web/src/
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx              # next-intl provider + theme provider; sets <html lang> and data-theme pre-paint
│   │   ├── login/page.tsx          # "Continue with Stub" button → /api/auth/stub-redirect
│   │   ├── dashboard/page.tsx      # authed shell
│   │   └── ping/
│   │       └── page.tsx            # /ping list + create UI
│   ├── api/
│   │   ├── auth/
│   │   │   ├── stub-redirect/route.ts  # GET → 302 backend /auth/socialite/stub/redirect
│   │   │   └── stub-callback/route.ts  # GET ?identity=... → fetches backend callback, sets httpOnly cookie, 302 to /dashboard
│   │   └── proxy/[...path]/route.ts    # GET/POST/etc. — forwards to backend with Authorization: Bearer <cookie>
│   └── layout.tsx                  # root <html> shell (locale-agnostic boilerplate)
├── features/ping/
│   ├── api.ts                      # injectEndpoints (recordPing mutation, listPings query) — RTK Query
│   ├── schema.ts                   # Zod schema for RecordPingPayload (drives RHF + RTK)
│   ├── components/
│   │   ├── PingList.tsx
│   │   └── RecordPingForm.tsx      # RHF + Zod
│   └── tests/                      # *.test.tsx (Vitest + Testing Library)
├── shared/
│   ├── api/
│   │   ├── baseApi.ts              # createApi root → /api/proxy/api
│   │   └── generated.ts            # output of @rtk-query/codegen-openapi
│   ├── store/
│   │   ├── index.ts                # configureStore + middleware (RTK Query)
│   │   ├── slices/auth.ts
│   │   └── hooks.ts                # typed useAppDispatch / useAppSelector
│   ├── theme/
│   │   ├── ThemeProvider.tsx       # reads cookie + sets data-theme; persists user choice
│   │   ├── ThemeSwitcher.tsx       # day/dusk/night/bright cycle
│   │   └── set-theme-pre-paint.ts  # inline <script> string injected pre-paint to avoid theme flash
│   └── i18n/
│       ├── config.ts               # next-intl config; locales=['en','pt']; defaultLocale='en'
│       └── messages.ts             # message loader
└── tests/
    ├── setup.ts                    # Vitest setup, RTL, fetch mocks for /api/proxy/* during component tests
    └── e2e/                        # Playwright specs

libs/
├── design-tokens/
│   └── src/
│       ├── colors.ts                  # mirror Openbridge palette structure (semantic tokens for fg/bg/border/accent across 4 themes)
│       ├── typography.ts              # font stack, sizes, line-heights
│       ├── spacing.ts                 # 4-px scale aligned with Openbridge
│       ├── tokens.css                 # built CSS vars under [data-theme="day"], [data-theme="dusk"], [data-theme="night"], [data-theme="bright"]
│       ├── tailwind-preset.ts         # exposes tokens as Tailwind theme; enforces border-radius=0 except rounded-full
│       └── index.ts                   # barrel
├── ui/
│   ├── src/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx                 # Radix Select underneath
│   │   ├── Card.tsx
│   │   ├── Table.tsx
│   │   ├── Modal.tsx                  # Radix Dialog underneath
│   │   ├── Toast.tsx                  # Radix Toast underneath
│   │   ├── Spinner.tsx
│   │   └── index.ts                   # barrel
│   └── tests/                         # *.test.tsx with happy/invalid/garbage RTL each
├── api-client/
│   ├── codegen.config.ts              # @rtk-query/codegen-openapi config (input: apps/backend/openapi.json or live /docs/api.json)
│   ├── src/
│   │   ├── generated.ts               # generated TypeScript + RTK Query endpoints (committed; regenerated by `pnpm nx build api-client`)
│   │   └── index.ts                   # barrel
│   └── project.json                   # Nx build target invokes codegen
└── i18n/
    ├── src/
    │   ├── locales.ts                 # export const LOCALES = ['en','pt'] as const
    │   └── messages/
    │       ├── en.json                # shared catalog (modules add their own)
    │       └── pt.json
    └── index.ts
```

**Test discipline (per CLAUDE.md hard rule #1):** every `libs/ui` primitive gets at minimum **happy / invalid / garbage** Vitest + Testing Library cases. Every `features/<module>` component the same. Playwright covers cross-feature happy paths only (theme switch, locale switch, login → ping flow).

---

## 5. Implementation details deferred to plan

These are intentionally _not_ locked here — the plan will resolve them with the conventional choice unless something surprising surfaces:

- **Style Dictionary or hand-rolled token build:** the `libs/design-tokens` build script that turns the TypeScript token modules into a single `tokens.css` with all 4 theme blocks. Either Style Dictionary (more standard) or a 30-line custom script (less dependency surface). Plan picks one.
- **Token extraction from `@oicl/openbridge-webcomponents`:** whether to consume the package as a build-time dependency and pull tokens from it, or hand-extract token values once and ship them in our repo. Hand-extract is safer (no transitive dep on Lit at runtime); plan locks the values.
- **MSW vs. raw fetch mocks for component tests:** RTK Query in component tests benefits from a real fetch mock. MSW is the standard but heavy. Plan picks one.
- **Cookie name and attributes:** `azimuth_session` vs `__Host-azimuth-session`; `SameSite=Strict` vs `Lax`; `Secure` flag (always on in prod, conditional in dev). Plan picks one set.
- **Theme persistence mechanism:** server cookie (set by Next.js route handler) so SSR sees the same theme + no flash, vs. client localStorage. Plan picks server cookie to align with the auth-cookie pattern.
- **OpenAPI input source for codegen:** consume committed `apps/backend/openapi.json` (snapshot, deterministic) vs. live fetch of `http://localhost:8000/docs/api.json` (always-current, requires backend running at codegen time). Plan picks the snapshot for CI determinism, with a Nx target that refreshes the snapshot on demand.

---

## 6. Gate (verbatim from §13.3)

`nx test web && nx e2e web` green; manual smoke confirms theme switcher (day/dusk/night/bright), locale switcher (en/pt), and full Ping create/list cycle work end-to-end.

---

## 7. Out of scope for Phase 3 (recorded so the plan doesn't sprawl)

- Real domain features (Aircraft CRUD and beyond) — separate spec/plan after Phase 4 lands.
- Backend changes — Phase 2 shipped; Phase 3 is frontend-only. The exception: bug fixes surfaced by Phase 3 integration (e.g., CORS tweaks if the proxy approach surfaces issues), which land as small separate commits.
- Real OAuth providers (Google/GitHub) — only the stub Socialite driver is exercised; real providers are post-scaffold.
- Native Openbridge web components — we adopt tokens only; the Lit components stay out.
- Server Components for authed pages — Phase 3 uses Client Components for the authenticated shell to keep the RTK Query story consistent. Server Component adoption is Phase 4+.
- `libs/ui` Storybook — Vitest + RTL alone covers the test discipline; visual regression / Storybook is Phase 4+ polish.

---

## 8. Open questions for plan-writing

None blocking. The eight decisions above + §13.3 + §6 (frontend architecture) fully constrain the plan. If new ambiguity surfaces during plan-writing, escalate by amending this document rather than embedding decisions in the plan.

---

## 9. References

- Original spec: `docs/superpowers/specs/2026-05-02-azimuth-scaffold-design.md` (§6 frontend architecture, §11 naming, §13.3 Phase 3)
- Phase 2 decision log: `docs/superpowers/specs/2026-05-05-azimuth-scaffold-phase-2-decisions.md`
- CLAUDE.md hard rules: `/CLAUDE.md`
- Phase 2 PR (merged): `https://github.com/FerrLab/azimuth/pull/1`, merge commit `99bac88`
- Openbridge: https://www.openbridge.no/, GitHub `Ocean-Industries-Concept-Lab/openbridge-webcomponents`, npm `@oicl/openbridge-webcomponents-react` (Apache 2.0 / AGPL-with-window)
