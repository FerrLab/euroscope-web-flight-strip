# Frontend Architecture

EuroStrip's frontend is a Next.js 15 App Router application that talks to the
Laravel backend through a Next.js-side proxy. State and HTTP live in Redux
Toolkit; styling rides on a four-theme Openbridge-derived design-token system;
and authentication is carried in an httpOnly cookie that the browser never
reads. This document is the canonical reference for adding new modules. For the
locked decisions see [ADR 0006](../adr/0006-frontend-stack-and-cookie-auth.md)
and the
[Phase 3 decision log](../superpowers/specs/2026-05-06-eurostrip-scaffold-phase-3-decisions.md).

## 1. Overview

The runtime stack:

- **Next.js 15** with the App Router and a top-level `[locale]` segment
  (`/en/...`, `/pt/...`). Locale prefixing is enforced by
  [`apps/web/src/middleware.ts`](../../apps/web/src/middleware.ts), and
  per-request message catalogs are merged in
  [`apps/web/src/shared/i18n/request.ts`](../../apps/web/src/shared/i18n/request.ts).
- **Redux Toolkit + RTK Query** for both client state and HTTP. The single
  `baseApi` lives in `libs/api-client`; feature modules call
  `baseApi.injectEndpoints(...)` to graft on their typed endpoints. The store
  factory is in
  [`apps/web/src/shared/store/index.ts`](../../apps/web/src/shared/store/index.ts).
- **Cookie auth + Next.js proxy.** Login mints an httpOnly cookie via a
  Next.js route handler; every API call from the browser hits
  `/api/proxy/[...path]` on the Next.js origin, which forwards to the Laravel
  backend with `Authorization: Bearer <cookie>`. The Bearer token never reaches
  browser JavaScript. See ADR 0006 §Decision and
  [`apps/web/src/app/api/proxy/[...path]/route.ts`](../../apps/web/src/app/api/proxy/[...path]/route.ts).
- **Openbridge tokens.** `libs/design-tokens` ships a TypeScript token graph
  (colors, typography, spacing) plus a built `tokens.css` whose CSS custom
  properties are scoped under `[data-theme="day|dusk|night|bright"]`. The
  Tailwind preset reads those vars and forbids `border-radius` everywhere
  except `rounded-full`.
- **Vitest + React Testing Library** for component and lib tests; **Playwright**
  for cross-feature happy-path E2E. The `e2e/login-and-ping.spec.ts` smoke is
  the only Playwright spec at the close of Phase 3.

The "what" lives in `apps/web/`; the reusable surface lives in the three
`libs/*` packages described next. Anything that two features will eventually
need belongs in a `libs/*` package, not in `apps/web/src/shared/`. UI
primitives are not one of those shared things: `apps/web` imports OpenBridge
web components (`@oicl/openbridge-webcomponents-react`) directly wherever a
button, input, or dropdown is needed, rather than wrapping them in a local
component library — see §7 for how a feature composes them.

## 2. The three libs

The libs are deliberately small and orthogonal. Each is a real Nx project with
its own `project.json`, `package.json`, `vitest.config.ts`, and tests.

### `libs/design-tokens`

- **Path:** [`libs/design-tokens/`](../../libs/design-tokens/)
- **Source:**
  - [`src/colors.ts`](../../libs/design-tokens/src/colors.ts) — semantic color
    tokens (`bg.primary`, `fg.primary`, `border.default`, `accent.*`, status
    colors) with one entry per Openbridge mode (day/dusk/night/bright), values
    hand-extracted from `@oicl/openbridge-webcomponents`.
  - [`src/typography.ts`](../../libs/design-tokens/src/typography.ts) — font
    stack, sizes, line-heights, weights.
  - [`src/spacing.ts`](../../libs/design-tokens/src/spacing.ts) — 4-px scale
    aligned with Openbridge.
  - [`src/build.ts`](../../libs/design-tokens/src/build.ts) — turns the TS
    token graph into a single `tokens.css` with one block per
    `[data-theme="..."]` selector.
  - [`src/tokens.css`](../../libs/design-tokens/src/tokens.css) — generated
    output; committed so app builds don't depend on the build step running
    in-tree.
  - [`src/tailwind-preset.ts`](../../libs/design-tokens/src/tailwind-preset.ts)
    — exposes the tokens as Tailwind theme entries, sets `borderRadius` to
    `{ none: '0', full: '9999px' }` and nothing else, and registers
    convenience utilities like `bg-bg-primary` / `text-fg-primary`.
- **Exports:** `colors`, `typography`, `spacing`, `tailwindPreset`, plus the
  `tokens.css` file path for app-side CSS imports.
- **Consumers:** `apps/web` (imports `tokens.css` once from `globals.css`;
  imports the Tailwind preset from `tailwind.config.ts`). The squared-UI rule
  (no `border-radius` except `rounded-full`) is enforced here at the Tailwind
  config level, on top of OpenBridge's own design system — not by a custom
  Radix-based wrapper library.

### `libs/api-client`

- **Path:** [`libs/api-client/`](../../libs/api-client/)
- **Source:**
  - [`codegen.config.ts`](../../libs/api-client/codegen.config.ts) — config
    for `@rtk-query/codegen-openapi`. Input is the snapshot at
    `apps/backend/openapi.json`; output is `src/generated.ts`. The
    snapshot-based input is deliberate: CI is deterministic and doesn't
    depend on the backend being live at codegen time. A separate Nx target
    refreshes the snapshot on demand against a running backend.
  - [`src/baseApi.ts`](../../libs/api-client/src/baseApi.ts) — the single
    `createApi` root configured with `fetchBaseQuery({ baseUrl: '/api/proxy/api' })`,
    plus `tagTypes` shared across features. Feature modules import `baseApi`
    and call `baseApi.injectEndpoints(...)`.
  - [`src/generated.ts`](../../libs/api-client/src/generated.ts) — committed,
    machine-generated TS types and tag-typed endpoints from the backend's
    OpenAPI doc.
- **Exports:** `baseApi` and the regenerated typed hooks (e.g.
  `useListPingsQuery`, `useRecordPingMutation`).
- **Consumers:** `apps/web/src/shared/store/index.ts` registers `baseApi` in
  the Redux store; feature `api.ts` files inject endpoints onto it.

### `libs/i18n`

- **Path:** [`libs/i18n/`](../../libs/i18n/)
- **Source:**
  - [`src/locales.ts`](../../libs/i18n/src/locales.ts) — `LOCALES = ['en', 'pt'] as const`,
    `DEFAULT_LOCALE = 'en'`, and a `Locale` TS type. Single source of truth.
  - [`src/messages/en.json`](../../libs/i18n/src/messages/en.json),
    [`src/messages/pt.json`](../../libs/i18n/src/messages/pt.json) — shared
    catalogs (auth, theme, locale, common buttons, error toasts). Per-feature
    catalogs live next to the feature in `apps/web/src/features/<module>/messages/`
    and are merged at request time.
  - [`src/index.ts`](../../libs/i18n/src/index.ts) — barrel.
- **Exports:** `LOCALES`, `DEFAULT_LOCALE`, `Locale`, and `loadSharedMessages(locale)`.
- **Consumers:** the Next.js middleware (locale detection),
  `shared/i18n/request.ts` (catalog merging), `LocaleSwitcher`, and any
  feature that needs a typed `Locale`.

## 3. App Router shape

The locale-prefixed segment owns all user-facing pages; locale-agnostic
plumbing (the root `<html>` shell, route handlers under `app/api/`) sits at the
top level.

```text
apps/web/src/
├── app/
│   ├── layout.tsx                          # locale-agnostic <html> shell
│   ├── globals.css                         # imports libs/design-tokens/src/tokens.css + Tailwind
│   ├── [locale]/
│   │   ├── layout.tsx                      # ReduxProvider + NextIntlClientProvider + ThemeProvider + Toast root
│   │   ├── page.tsx                        # marketing landing → "Sign in" CTA
│   │   ├── login/page.tsx                  # "Continue with Stub" button → /api/auth/stub-redirect
│   │   ├── dashboard/page.tsx              # authed shell with theme + locale switchers
│   │   └── ping/page.tsx                   # PingList + RecordPingForm composition
│   └── api/
│       ├── auth/
│       │   ├── stub-redirect/route.ts      # GET → 302 backend /auth/socialite/stub/redirect
│       │   ├── stub-callback/route.ts      # GET ?code=... → exchanges, mints httpOnly cookie, 302 /dashboard
│       │   └── logout/route.ts             # POST → clears cookie, 302 /login
│       ├── proxy/[...path]/route.ts        # generic forwarder; reads cookie, attaches Authorization header
│       └── theme/route.ts                  # POST → persists eurostrip_theme cookie
├── middleware.ts                           # next-intl locale prefixing + auth-page redirects
├── shared/
│   ├── auth/cookie.ts                      # cookie name, get/set/clear helpers (server-only)
│   ├── store/{index,hooks,ReduxProvider}.ts(x)
│   ├── theme/{ThemeProvider,ThemeSwitcher,set-theme-pre-paint}.ts(x)
│   └── i18n/{LocaleSwitcher,request}.ts(x)
└── features/
    └── ping/
        ├── schema.ts
        ├── api.ts
        └── components/{PingList,RecordPingForm}.tsx
```

The `[locale]/layout.tsx` is where Client-Component boundaries are crossed.
It imports `set-theme-pre-paint.ts` as a `<script>`-inlined string so the
theme attribute is applied before first paint (no flash); then it mounts
`<ReduxProvider>`, `<NextIntlClientProvider>`, `<ThemeProvider>`, and a
Toast-root portal. Pages below it can be Client Components freely.

`shared/i18n/request.ts` runs on every request: it loads the shared catalog
from `libs/i18n` for the active locale, then deep-merges any per-feature
catalogs the page needs. This keeps the per-page bundle lean while letting
every feature own its strings.

## 4. The four-theme system

Phase 3 reinterprets the original spec's "light/dark/HC" as Openbridge's four
native modes — **day**, **dusk**, **night**, **bright** — because those are
the lighting conditions our domain (general-aviation cockpits, derived from
the maritime norm) actually inhabits.

The mechanism is intentionally boring:

1. **CSS variables in one file.**
   [`libs/design-tokens/src/tokens.css`](../../libs/design-tokens/src/tokens.css)
   declares each semantic token (`--azm-bg-primary`, `--azm-fg-primary`, etc.)
   inside four selector blocks: `[data-theme="day"]`, `[data-theme="dusk"]`,
   `[data-theme="night"]`, `[data-theme="bright"]`. There is no JS theme
   object; theme switching is a single attribute swap.
2. **Tailwind reads the vars.** The preset maps utility class names like
   `bg-bg-primary` to `var(--azm-bg-primary)`. Components stay
   theme-agnostic — they use the same classes regardless of which mode is
   active.
3. **Pre-paint inline script.**
   [`shared/theme/set-theme-pre-paint.ts`](../../apps/web/src/shared/theme/set-theme-pre-paint.ts)
   is a stringified IIFE that the root layout injects as
   `<script dangerouslySetInnerHTML={...}>` before any React mounts. It reads
   the `eurostrip_theme` cookie, validates it against the four allowed values,
   and sets `document.documentElement.dataset.theme` synchronously. No flash
   on first paint; SSR sees the same attribute the client picked because the
   cookie was on the request.
4. **Persistence via cookie.**
   [`shared/theme/ThemeSwitcher.tsx`](../../apps/web/src/shared/theme/ThemeSwitcher.tsx)
   posts to `/api/theme/route.ts`, which writes a non-httpOnly
   `eurostrip_theme` cookie (`SameSite=Lax`, ~1 year). The cookie is readable
   by the pre-paint script and by `ThemeProvider`, which keeps React state
   in sync for the switcher UI itself.
5. **No client-only theme state.** Because the source of truth is the cookie
   and the DOM attribute, every server render and every client navigation
   produces the same theme without coordination.

## 5. Cookie auth and the Next.js proxy

Decision #6 in the Phase 3 decision log locks two things together: the Bearer
token lives only in an httpOnly cookie, and the browser only ever talks to
Next.js. Everything that touches the backend goes through a route handler
under `app/api/`.

The login round-trip:

1. User clicks **Continue with Stub** on `/[locale]/login`. The button is a
   plain link to `/api/auth/stub-redirect`.
2. [`/api/auth/stub-redirect/route.ts`](../../apps/web/src/app/api/auth/stub-redirect/route.ts)
   responds with `302 → ${BACKEND_URL}/auth/socialite/stub/redirect`. (For
   real OAuth providers, this is where state/nonce would be set.)
3. The backend's stub Socialite driver echoes back to
   `${WEB_URL}/api/auth/stub-callback?identity=<email>&code=<bearer>` (see
   [ADR 0004](../adr/0004-stub-socialite-per-request-fixture.md)).
4. [`/api/auth/stub-callback/route.ts`](../../apps/web/src/app/api/auth/stub-callback/route.ts)
   exchanges the code with the backend's Passport endpoint, receives the
   Bearer token, sets it as an httpOnly cookie via
   [`shared/auth/cookie.ts`](../../apps/web/src/shared/auth/cookie.ts), and
   `302 → /[locale]/dashboard`.
5. The browser now has the cookie. JS cannot read it.

The data round-trip — what happens when a Client Component calls
`useListPingsQuery()`:

1. RTK Query, configured with `baseUrl: '/api/proxy/api'`, fires a `fetch`
   to `/api/proxy/api/pings`. Browser attaches the cookie.
2. [`/api/proxy/[...path]/route.ts`](../../apps/web/src/app/api/proxy/[...path]/route.ts)
   handles every method. It reads the cookie via `shared/auth/cookie.ts`,
   constructs an outbound request to `${BACKEND_URL}/api/pings` with
   `Authorization: Bearer <cookie>`, and pipes the body and headers through.
3. Laravel authenticates the Bearer, runs the controller, dispatches the
   `ListPingsQuery` through the QueryBus, and returns JSON.
4. The proxy streams the response back; RTK Query parses it; the hook
   re-renders with `data`.

The cost is one Next.js hop (~5 ms locally, similar in deployed environments).
The benefit is that no XSS payload — however clever — can exfiltrate the
Bearer token, because the token lives in cookie storage that JavaScript on
the page cannot see.

The proxy also unblocks future SSR-of-authenticated-pages: a Server Component
can read the same cookie and call the backend with the same header, with no
new auth machinery.

## 6. Redux store layout

The store is small; most state lives inside RTK Query's cache.

```ts
// apps/web/src/shared/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from '@eurostrip/api-client';
import { authSlice } from './slices/auth';

export const makeStore = () =>
  configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      auth: authSlice.reducer,
    },
    middleware: (gDM) => gDM().concat(baseApi.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
```

- **`baseApi`** comes from `libs/api-client`. Feature modules call
  `baseApi.injectEndpoints(...)` from their `api.ts`; nothing about the store
  changes when a new feature is added.
- **`authSlice`** is intentionally minimal: it holds the authenticated
  user's `id`, display name, and locale. The Bearer token is _not_ in Redux
  — only the cookie has it. The slice is hydrated by the dashboard layout
  via a one-shot `useGetMeQuery()` call against the backend `/api/me`
  endpoint, which the proxy can resolve from the cookie alone.
- **`hooks.ts`** exports the typed `useAppDispatch` and `useAppSelector`
  per the standard Redux Toolkit recipe. Components import from there, never
  from `react-redux` directly.
- **`ReduxProvider.tsx`** is a Client Component that creates the store on
  first mount and wraps `children` with `<Provider store={store}>`. It is
  mounted from `[locale]/layout.tsx`.

## 7. Adding a new feature module

Use the `features/ping/` shape as the template. To add a `Aircraft` module
end-to-end on the frontend:

1. **Refresh the API client snapshot.** If the backend added or changed
   endpoints, run `pnpm nx run api-client:snapshot` to regenerate
   `apps/backend/openapi.json`, then `pnpm nx build api-client` to
   regenerate `libs/api-client/src/generated.ts`. Commit both.
2. **Author the Zod schema.** Create
   `apps/web/src/features/aircraft/schema.ts` exporting an
   `aircraftPayloadSchema` (`z.object({ tail: z.string().min(1), ... })`).
   The schema is the source of truth for both React Hook Form validation
   and the typed payload that RTK Query expects.
3. **Inject endpoints.**
   `apps/web/src/features/aircraft/api.ts`:

   ```ts
   import { baseApi } from '@eurostrip/api-client';
   import { z } from 'zod';
   import { aircraftPayloadSchema } from './schema';

   export const aircraftApi = baseApi.injectEndpoints({
     endpoints: (build) => ({
       listAircraft: build.query<Aircraft[], void>({ query: () => '/aircraft' }),
       createAircraft: build.mutation<Aircraft, z.infer<typeof aircraftPayloadSchema>>({
         query: (body) => ({ url: '/aircraft', method: 'POST', body }),
         invalidatesTags: ['Aircraft'],
       }),
     }),
   });
   export const { useListAircraftQuery, useCreateAircraftMutation } = aircraftApi;
   ```

4. **Author components.** Put them under `features/aircraft/components/` and
   compose OpenBridge web components directly (`@oicl/openbridge-webcomponents-react`).
   Each component ships with a `*.test.tsx`
   covering happy / invalid / garbage paths (CLAUDE.md hard rule #1). Forms
   wrap React Hook Form's `useForm({ resolver: zodResolver(...) })`.
5. **Author per-feature i18n.** Drop `messages/en.json` and `messages/pt.json`
   under `features/aircraft/`; the merge happens automatically in
   `shared/i18n/request.ts`. ESLint's `react/jsx-no-literals` rule fails the
   build if any user-facing literal text appears in JSX.
6. **Author the page.** `apps/web/src/app/[locale]/aircraft/page.tsx` is a
   Client Component that imports from `features/aircraft/components/` and
   renders inside the dashboard shell.
7. **Run the suite.** `pnpm nx test web` for component tests, `pnpm nx e2e web`
   if the new module added a flow worth covering at the cross-feature level.
   Update `docs/architecture/frontend.md` if the module changes the shape
   itself (CLAUDE.md hard rule #7).

## 8. Testing patterns

Three layers, narrowing from cheap to expensive:

- **Lib tests.** Each `libs/*` package owns its own `*.test.ts(x)` files
  next to the source. Vitest runs them via `pnpm nx test design-tokens`,
  `pnpm nx test api-client`, `pnpm nx test i18n`.
- **Feature component tests.** Live next to feature components in
  `apps/web/src/features/<module>/`. Use `@testing-library/react` and a
  fetch mock for `/api/proxy/...` calls. The Ping module's
  [`features/ping/api.test.ts`](../../apps/web/src/features/ping/api.test.ts)
  is the worked example: it sets up a mock store, fires the `recordPing`
  mutation, asserts the optimistic-update tag invalidation, and exercises
  invalid Zod payloads + garbage server responses.
- **E2E.** Playwright covers cross-feature happy paths only.
  [`apps/web/e2e/login-and-ping.spec.ts`](../../apps/web/e2e/login-and-ping.spec.ts)
  is the close-of-Phase-3 spec: it logs in via the stub, switches theme to
  `night` and back, switches locale to `pt` and back, creates a ping, and
  asserts it appears in the list. New cross-feature flows get one Playwright
  spec each; per-component edge cases stay in Vitest.

## 9. References

- Original scaffold spec — frontend architecture:
  [`docs/superpowers/specs/2026-05-02-eurostrip-scaffold-design.md`](../superpowers/specs/2026-05-02-eurostrip-scaffold-design.md)
  §6.
- Phase 3 decision log:
  [`docs/superpowers/specs/2026-05-06-eurostrip-scaffold-phase-3-decisions.md`](../superpowers/specs/2026-05-06-eurostrip-scaffold-phase-3-decisions.md).
- [ADR 0006 — Frontend Stack and Cookie-Based Auth](../adr/0006-frontend-stack-and-cookie-auth.md).
- Lib project files:
  [`libs/design-tokens/project.json`](../../libs/design-tokens/project.json),
  [`libs/api-client/project.json`](../../libs/api-client/project.json),
  [`libs/i18n/project.json`](../../libs/i18n/project.json).
- Local-dev runbook (how to run the frontend, codegen the API client, and
  exercise the stub login): [`docs/runbooks/local-dev.md`](../runbooks/local-dev.md).
- [ADR 0004 — Stub Socialite per-request fixture](../adr/0004-stub-socialite-per-request-fixture.md)
  for the backend half of the cookie-auth flow.
