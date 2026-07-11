# Adding a locale

This runbook walks you through adding a new locale end-to-end —
shared catalogs, per-feature catalogs, backend `lang/`, locale
negotiation, and tests. Worked example: `es` (Spanish).

## Pre-flight

- Pick a [BCP-47 language tag](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry).
  Use the shortest correct form (`es`, not `es-ES`, unless the locale
  is region-distinguished from another we already have).
- Have native-speaker review available — machine translations are
  _fine to seed_ but should be marked TODO in the catalog so CI can
  flag untranslated strings before they ship.
- Confirm the locale is a real product target. Adding a locale doubles
  per-feature catalog count for that scope; we don't add speculative
  locales.

## The steps

### 1. Add the tag to `LOCALES`

Edit `libs/i18n/src/locales.ts` — this is the single source of truth
that the middleware, `getRequestConfig`, and (eventually) backend
negotiation all read:

```ts
export const LOCALES = ['en', 'pt', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
```

Don't change `DEFAULT_LOCALE` unless that is the actual goal — it is
the fallback for unknown `Accept-Language` headers and missing keys.

### 2. Translate the shared frontend catalogs

The shared catalogs live in `libs/i18n/src/messages/<locale>.json` and
hold cross-cutting strings (errors, common labels). For each existing
file, create the new-locale counterpart:

```bash
cp libs/i18n/src/messages/en.json libs/i18n/src/messages/es.json
```

Translate every value. JSON has no comments, so mark machine-translated
or untranslated entries with a sentinel prefix that CI greps for:

```json
{
  "common.cancel": "Cancelar",
  "common.save": "___TODO___ Save"
}
```

### 3. Translate per-feature frontend catalogs

Per-feature catalogs live in `apps/web/src/messages/<scope>.<locale>.json`
(e.g. `auth.en.json`, `ping.pt.json`). For every `*.en.json` you must
add the matching new-locale file:

```bash
for f in apps/web/src/messages/*.en.json; do
  cp "$f" "${f%en.json}es.json"
done
```

Then wire them into the merge in `apps/web/src/i18n/request.ts`:

```ts
import authEn from '@/messages/auth.en.json';
import authEs from '@/messages/auth.es.json';
import authPt from '@/messages/auth.pt.json';
import pingEn from '@/messages/ping.en.json';
import pingEs from '@/messages/ping.es.json';
import pingPt from '@/messages/ping.pt.json';

const PER_FEATURE: Record<string, Record<string, unknown>> = {
  en: { ...authEn, ...pingEn },
  es: { ...authEs, ...pingEs },
  pt: { ...authPt, ...pingPt },
};
```

The `getRequestConfig` callback already reads from `PER_FEATURE[locale]`
— no further wiring once you add the entry above.

### 4. Backend `lang/`

Copy the English directory to seed:

```bash
cp -r apps/backend/lang/en apps/backend/lang/es
```

Translate every PHP catalog inside — today that is `ping.php`, but
expect `auth.php`, `validation.php`, `passwords.php`, and
`pagination.php` once Laravel's stock catalogs are vendored. New
modules add their own files (e.g. `aircraft.php`); each one needs an
`es` translation when the locale ships.

### 5. Confirm the backend fallback

`apps/backend/config/app.php` defines:

```php
'locale' => env('APP_LOCALE', 'en'),
'fallback_locale' => env('APP_FALLBACK_LOCALE', 'en'),
```

Leave the fallback as `en` — it is the safety net for any key missing
from `es`. Override per-environment via `.env` only if the deployment
target genuinely needs a different default.

### 6. Translatable model fields (if you have seeded data)

If a module already uses Spatie translatable, extend its seeders so the
new locale has data:

```php
$aircraft->setTranslation('description', 'es', 'Texto en español');
$aircraft->save();
```

Existing rows without a translation fall back per Spatie's rules — no
data migration needed, but the UI will surface the fallback locale
until rows are backfilled.

### 7. Test locale negotiation

With the stack up (`docs/runbooks/local-dev.md`):

```bash
curl -I -H 'Accept-Language: es' http://localhost:3000/
# expect: 307 Location: /es
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/es/dashboard
# expect: 200
```

The middleware (`apps/web/src/middleware.ts`) handles the redirect via
`localePrefix: 'always'`. If you get a 404, the locale is missing from
`LOCALES`.

### 8. Run the suites

```bash
pnpm nx test i18n           2>&1 | tail -5
pnpm nx test web            2>&1 | tail -5
docker compose --env-file .env -f infra/docker-compose.yml \
  exec -T backend ./vendor/bin/pest 2>&1 | tail -5
```

`libs/i18n/src/locales.test.ts` asserts the shape of `LOCALES`; update
it if it hard-codes the array length.

### 9. Update the docs

Add a one-line bullet to the "Locales" section of
[`../conventions/i18n.md`](../conventions/i18n.md). If you discovered
something non-obvious (plural rules, RTL, regional split), add a note
to "Common gotchas" below in _this_ file.

### 10. Open the PR

Title: `feat(i18n): add es locale`. Tag a native-speaker reviewer for
the catalog files. CI must be green — the sentinel-grep job will flag
any `___TODO___` left behind.

## Common gotchas

- **ICU plural rules.** Spanish has only `one` and `other`, same as
  English — no work needed. Polish (`pl`) has `one`/`few`/`many`/`other`,
  Arabic (`ar`) has six categories. Audit every `{count, plural, ...}`
  message when adding non-Indo-European locales.
- **RTL.** Arabic (`ar`) and Hebrew (`he`) require `dir="rtl"` on the
  active locale's `<html>`. The current layout doesn't toggle this —
  flag for Phase 5+ before adding an RTL locale.
- **Date and number formatting.** next-intl reads from the locale tag,
  so basic `<FormattedDate>` and `<FormattedNumber>` work out of the
  box. Regional currency variation (`es-MX` peso vs. `es-AR` peso) means
  splitting the locale or passing an explicit `currency` per call.
- **Backend locale negotiation.** Laravel does not auto-detect locale
  from `Accept-Language` — a middleware reads it explicitly. Confirm
  your new locale is recognized there once that middleware lands.
- **Filament admin.** Filament ships its own translations for stock UI
  (`vendor/filament/filament/resources/lang`). For locales Filament
  doesn't ship, you'll see English chrome around translated content
  until you publish and translate the vendor files.
- **Scramble / OpenAPI descriptions.** API docs at `/docs/api` render
  whatever language the backend annotations use — usually English. The
  generated `openapi.json` flowing into `libs/api-client` is _not_ a
  translation surface; do not localize controller descriptions.
- **next-intl key collisions.** Per-feature catalogs are spread into
  the shared catalog in `request.ts`. If a feature scope key clashes
  with a shared key, the per-feature value wins for that locale only,
  which is brittle. Keep per-feature keys namespaced (`auth.signIn`,
  not `signIn`) so the merge never silently overrides.

## When to _split_ an existing locale

If `es` exists and you need to add `es-MX`, do not duplicate the
catalog wholesale. Add `es-MX` to `LOCALES`, create _delta_ catalogs
with only the keys that differ (currency labels, regional terms), and
extend `request.ts` to merge `es` first then `es-MX` on top. This
keeps drift between regional variants observable.

## See also

- [`../conventions/i18n.md`](../conventions/i18n.md) — i18n conventions
  and ESLint rules
- [next-intl docs](https://next-intl.dev)
- [Laravel localization](https://laravel.com/docs/13.x/localization)
- [BCP-47 registry](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry)
